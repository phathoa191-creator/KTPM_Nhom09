const { test } = require('node:test');
const assert = require('node:assert/strict');
const sql = require('mssql');
const { createApp } = require('../../backend/src/server'); // Load project .env without exposing credentials.
const { createSessionStore } = require('../../backend/src/auth/login');
const { getPool, closePool } = require('../../backend/src/database/pool');
const { createCartRepository } = require('../../backend/src/cart/cart');

test('real SQL add/increment, UNIQUE, ownership, inventory and rollback with existing synthetic users', {
  skip: process.env.UC07_SQL_INTEGRATION !== '1'
}, async () => {
  let outer, server, began = false, userId, baseline;
  try {
    const pool = await getPool();
    const users = await pool.request().query("SELECT TOP(2) Id AS id FROM dbo.Users WHERE Email LIKE 'selenium-uc01-%@example.test' AND IsActive=1 ORDER BY Id");
    assert.equal(users.recordset.length, 2, 'Requires two existing synthetic users; test never seeds Users');
    userId = users.recordset[0].id;
    const normal = createCartRepository(async () => pool);
    baseline = await normal.read(userId);
    outer = new sql.Transaction(pool); await outer.begin(sql.ISOLATION_LEVEL.SERIALIZABLE); began = true;
    const isolatedPool = { request: () => outer.request() };
    // Each operation uses a savepoint inside the outer test transaction. Never commit test data.
    const repository = createCartRepository(async () => isolatedPool, { transactionFactory: () => ({
      begin: async () => { await outer.request().query('SAVE TRANSACTION uc07_test_operation'); },
      request: () => outer.request(), commit: async () => {},
      rollback: async () => { await outer.request().query('ROLLBACK TRANSACTION uc07_test_operation'); }
    }) });
    const candidates = await outer.request().input('userId', sql.Int, userId).query(`
      SELECT TOP(1) p.Id AS id, p.Stock AS stock FROM dbo.Products p JOIN dbo.Categories c ON c.Id=p.CategoryId
      WHERE p.IsActive=1 AND c.IsActive=1 AND p.Stock BETWEEN 3 AND 90
      AND NOT EXISTS (SELECT 1 FROM dbo.Carts cart JOIN dbo.CartItems i ON i.CartId=cart.Id
        WHERE cart.UserId=@userId AND i.ProductId=p.Id) ORDER BY p.Id`);
    assert(candidates.recordset.length, 'Requires an active stocked product not already in the synthetic cart');
    const product = candidates.recordset[0];
    const otherBefore = await repository.read(users.recordset[1].id);
    const sessions = createSessionStore();
    const cookie = 'cellphones.sid=' + sessions.create(userId);
    server = createApp({ poolProvider: async () => isolatedPool, cartRepository: repository, sessions }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const call = async (route, body, includeCookie = true) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
        method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(includeCookie ? { Cookie: cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await call('/api/cart', undefined, false)).status, 401);
    const first = await call('/api/cart/items', { productId: product.id, quantity: 1, userId: users.recordset[1].id, price: 0 });
    assert.equal(first.status, 200); assert.equal(first.body.quantity, 1);
    const second = await call('/api/cart/items', { productId: product.id, quantity: 2 });
    assert.equal(second.status, 200); assert.equal(second.body.quantity, 3);
    const cart = await repository.read(userId);
    const lines = cart.items.filter(item => item.productId === product.id);
    assert.equal(lines.length, 1); assert.equal(lines[0].quantity, 3);
    const view = await call('/api/cart?userId=' + users.recordset[1].id);
    assert.equal(view.status, 200); assert.deepEqual(view.body, cart);
    assert.deepEqual(await repository.read(users.recordset[1].id), otherBefore);
    await assert.rejects(repository.add(userId, product.id, product.stock), error => error.code === 'INSUFFICIENT_STOCK');
    const hidden = await outer.request().query('SELECT TOP(1) Id AS id FROM dbo.Products WHERE IsActive=0 ORDER BY Id');
    assert(hidden.recordset.length);
    await assert.rejects(repository.add(userId, hidden.recordset[0].id, 1), error => error.code === 'PRODUCT_NOT_AVAILABLE');
    assert.deepEqual(await repository.read(userId), cart, 'Failed adds must preserve cart');
  } finally {
    try {
      if (server) await new Promise(resolve => server.close(resolve));
      if (began) await outer.rollback();
      if (baseline) {
        const after = await createCartRepository(getPool).read(userId);
        assert.deepEqual(after, baseline, 'Outer rollback must restore original cart exactly');
      }
    } finally { await closePool(); }
  }
});
