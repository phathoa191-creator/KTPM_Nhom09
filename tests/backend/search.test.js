const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../backend/src/server');
const { createProductsRepository } = require('../../backend/src/products/search');

async function serve(repository, run) {
  const server = createApp({ productsRepository: repository }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await run(async query => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/products${query}`);
      return { status: response.status, body: await response.json() };
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('search accepts partial/mixed-case keywords, empty query and paging', async () => {
  const calls = [];
  await serve({ search: async query => {
    calls.push(query); return { total: 13, products: [{ id: 1, sku: 'TEST-1', name: 'iPhone Test', price: 1000 }] };
  } }, async get => {
    const result = await get('?q=%20iPh%20&page=2&limit=12');
    assert.equal(result.status, 200);
    assert.equal(result.body.totalPages, 2);
    assert.equal(result.body.products[0].sku, 'TEST-1');
    assert.deepEqual(calls[0], { q: 'iPh', page: 2, limit: 12 });
    assert.equal((await get('')).status, 200);
    assert.deepEqual(calls[1], { q: '', page: 1, limit: 12 });
  });
});

test('invalid query never reaches database', async () => {
  await serve({ search: async () => assert.fail('must not query') }, async get => {
    for (const query of ['?q=a&q=b', '?q=' + 'x'.repeat(201), '?page=0', '?page=-1',
      '?page=1000001', '?page=1.5', '?limit=49', '?limit=0', '?limit=x']) {
      assert.equal((await get(query)).status, 400, query);
    }
  });
});

test('empty results are 200; database errors are sanitized 503', async () => {
  await serve({ search: async () => ({ total: 0, products: [] }) }, async get => {
    const result = await get('?q=notfound');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.products, []);
    assert.equal(result.body.totalPages, 0);
  });
  await serve({ search: async () => { throw new Error('private login password host'); } }, async get => {
    const result = await get('');
    assert.equal(result.status, 503);
    assert(!JSON.stringify(result.body).includes('private'));
  });
});

test('SQL binds input, escapes LIKE literals, uses case-insensitive comparison and active records', async () => {
  const parameters = {};
  let statement;
  const request = { input(name, type, value) { parameters[name] = value; return this; },
    query: async text => { statement = text; return { recordsets: [[{ total: 0 }], []] }; } };
  const repository = createProductsRepository(async () => ({ request: () => request }));
  const keyword = "x%' OR 1=1--_[~";
  await repository.search({ q: keyword, page: 2, limit: 12 });
  assert(!statement.includes(keyword));
  assert.equal(parameters.pattern, "%x~%' OR 1=1--~_~[~~%");
  assert.equal(parameters.offset, 12);
  assert.equal(parameters.limit, 12);
  assert(statement.includes('Latin1_General_100_CI_AS'));
  assert(statement.includes('p.IsActive=1 AND c.IsActive=1'));
  assert(statement.includes('OUTER APPLY'));
});
