const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../backend/src/server');
const { createSessionStore } = require('../../backend/src/auth/login');
const { createCartRepository, checkAddition, summarize, CartError } = require('../../backend/src/cart/cart');

test('cart validates resulting quantity, inactive/category status and inventory', () => {
  const product = { active: true, categoryActive: true, stock: 10 };
  assert.equal(checkAddition(product, 2, 3), 5);
  for (const [p, current, count, code] of [
    [null, 0, 1, 'PRODUCT_NOT_AVAILABLE'], [{ ...product, active: false }, 0, 1, 'PRODUCT_NOT_AVAILABLE'],
    [{ ...product, categoryActive: false }, 0, 1, 'PRODUCT_NOT_AVAILABLE'],
    [{ ...product, stock: 0 }, 0, 1, 'OUT_OF_STOCK'], [product, 9, 2, 'INSUFFICIENT_STOCK'],
    [{ ...product, stock: 500 }, 99, 1, 'QUANTITY_LIMIT']
  ]) assert.throws(() => checkAddition(p, current, count), error => error instanceof CartError && error.code === code);
});

test('cart computes exact decimal amounts and exposes availability without deleting rows', () => {
  const base = { quantity: 3, unitPrice: '0.10', active: true, categoryActive: true, stock: 10 };
  const cart = summarize([base, { ...base, quantity: 1, unitPrice: '0.20', stock: 0 },
    { ...base, quantity: 2, unitPrice: '1.01', active: false }, { ...base, quantity: 5, unitPrice: '0.01', stock: 1 }]);
  assert.equal(cart.total, '2.57');
  assert.equal(cart.items[0].lineTotal, '0.30');
  assert.deepEqual(cart.items.map(i => i.availability), ['available', 'out_of_stock', 'discontinued', 'insufficient_stock']);
  assert.equal(cart.hasUnavailableItems, true);
  assert.equal(summarize([]).total, '0.00');
  assert.equal(summarize([{ ...base, unitPrice: '9007199254740991.99', quantity: 2 }]).total, '18014398509481983.98');
});

async function serve(run, overrides = {}) {
  const calls = [], sessions = createSessionStore(), token = sessions.create(7);
  const cookie = 'cellphones.sid=' + token;
  const app = createApp({ sessions,
    loginRepository: { findById: async id => ({ id, active: true, role: 'CUSTOMER' }) },
    cartRepository: {
      read: async id => { calls.push(['read', id]); return summarize([]); },
      add: async (...args) => { calls.push(['add', ...args]); return { quantity: 2, productId: args[1] }; },
      ...overrides
    }
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    await run(async (route, body, authenticated = true, headers = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
        method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json',
          ...(authenticated ? { Cookie: cookie } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    }, calls);
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('cart endpoints require current session; ignore other user IDs and client prices; reject cross-origin writes', async () => {
  await serve(async (call, calls) => {
    assert.equal((await call('/api/cart', undefined, false)).status, 401);
    assert.equal((await call('/api/cart/items', { productId: 1, quantity: 1 }, false)).status, 401);
    assert.equal(calls.length, 0);
    assert.equal((await call('/api/cart?userId=999')).status, 200);
    assert.deepEqual(calls[0], ['read', 7]);
    assert.equal((await call('/api/cart/items', { productId: 1, quantity: 2, userId: 999, price: 0 })).status, 200);
    assert.deepEqual(calls[1], ['add', 7, 1, 2]);
    assert.equal((await call('/api/cart/items', { productId: 1, quantity: 1 }, true, { Origin: 'https://evil.example' })).status, 403);
    for (const body of [{}, null, { productId: '1', quantity: 1 }, { productId: 1, quantity: 0 },
      { productId: 1, quantity: 100 }, { productId: 1, quantity: 1.5 }, { productId: 0, quantity: 1 }]) {
      assert.equal((await call('/api/cart/items', body)).status, 400);
    }
    assert.equal(calls.length, 2);
  });
});

test('cart API maps business conflicts and sanitizes read/write SQL errors', async () => {
  for (const [status, code] of [[404, 'PRODUCT_NOT_AVAILABLE'], [409, 'INSUFFICIENT_STOCK'], [503, 'CART_UNAVAILABLE']]) {
    await serve(async call => {
      const result = await call('/api/cart/items', { productId: 1, quantity: 1 });
      assert.equal(result.status, status); assert.equal(result.body.code, code);
      assert(!JSON.stringify(result.body).includes('private'));
      const read = await call('/api/cart'); assert.equal(read.status, 503);
      assert(!JSON.stringify(read.body).includes('private'));
    }, {
      add: async () => { throw status === 503 ? new Error('private SQL error') : new CartError(status, code, 'Business error'); },
      read: async () => { throw new Error('private SQL error'); }
    });
  }
});

function fakeTransaction({ existing = true, failWrite = false, stock = 10 } = {}) {
  const calls = [], state = { commits: 0, rollbacks: 0 };
  const tx = {
    async begin(level) { state.level = level; },
    async commit() { state.commits++; }, async rollback() { state.rollbacks++; },
    request() {
      const parameters = {};
      return {
        input(name, type, value) { parameters[name] = value; return this; },
        async query(text) {
          calls.push({ text, parameters });
          if (text.includes('SELECT Id AS id FROM dbo.Carts')) return { recordset: existing ? [{ id: 50 }] : [] };
          if (text.includes('FROM dbo.Products')) return { recordset: [{ active: true, categoryActive: true, stock }] };
          if (text.includes('FROM dbo.CartItems')) return { recordset: existing ? [{ id: 60, quantity: 2 }] : [] };
          if (failWrite) throw new Error('private SQL write failed');
          if (text.includes('INSERT INTO dbo.Carts')) return { recordset: [{ id: 50 }] };
          return { recordset: [] };
        }
      };
    }
  };
  return { tx, calls, state };
}

test('add uses SERIALIZABLE range locks, increments one line, creates missing cart, rolls back on failure', async () => {
  for (const existing of [true, false]) {
    const fake = fakeTransaction({ existing });
    const repository = createCartRepository(async () => ({}), { transactionFactory: () => fake.tx });
    const result = await repository.add(7, 12, 3);
    assert.equal(result.quantity, existing ? 5 : 3);
    assert.equal(fake.state.level, require('mssql').ISOLATION_LEVEL.SERIALIZABLE);
    assert.equal(fake.state.commits, 1); assert.equal(fake.state.rollbacks, 0);
    assert(fake.calls[0].text.includes('UPDLOCK,HOLDLOCK'));
    assert.equal(fake.calls[0].parameters.userId, 7);
    assert(fake.calls.some(c => c.text.includes(existing ? 'UPDATE dbo.CartItems' : 'INSERT INTO dbo.CartItems')));
    assert(!fake.calls.some(c => /UPDATE dbo.Products|DELETE|MERGE/.test(c.text)));
  }
  for (const options of [{ failWrite: true }, { stock: 0 }, { stock: 4 }]) {
    const fake = fakeTransaction(options);
    const repository = createCartRepository(async () => ({}), { transactionFactory: () => fake.tx });
    await assert.rejects(repository.add(7, 12, 3));
    assert.equal(fake.state.rollbacks, 1); assert.equal(fake.state.commits, 0);
  }
});

test('read is scoped to session user, does not create cart and binds SQL parameters', async () => {
  let statement;
  const repository = createCartRepository(async () => ({ request: () => ({
    input(name, type, value) { assert.equal(name, 'userId'); assert.equal(value, 7); return this; },
    async query(text) { statement = text; return { recordset: [] }; }
  }) }));
  assert.deepEqual((await repository.read(7)).items, []);
  assert(statement.includes('WHERE cart.UserId=@userId'));
  assert(!/INSERT|UPDATE|DELETE/.test(statement));
});
