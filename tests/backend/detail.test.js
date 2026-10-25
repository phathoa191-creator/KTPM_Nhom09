const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../backend/src/server');
const { createProductDetailRepository } = require('../../backend/src/products/detail');

async function serve(repository, run) {
  const server = createApp({ productDetailRepository: repository }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await run(async id => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/products/${encodeURIComponent(id)}`);
      return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('detail returns full product including all images and allows zero stock', async () => {
  for (const stock of [0, 20]) {
    const product = { id: 1, name: 'Test phone', sku: 'TEST', slug: 'test', price: 1000,
      stock, category: 'Phones', description: 'Demo', images: [{ id: 1, url: '/assets/test.svg', alt: 'Demo', sortOrder: 0 }] };
    await serve({ findById: async id => { assert.equal(id, 1); return product; } }, async get => {
      const result = await get('1');
      assert.equal(result.status, 200);
      assert.equal(result.cache, 'no-store');
      assert.deepEqual(result.body, { product });
    });
  }
});

test('invalid IDs never query SQL; missing or inactive uses 404; SQL failures sanitized', async () => {
  await serve({ findById: async () => assert.fail('must not query') }, async get => {
    for (const id of ['0', '-1', '1.2', '2147483648', 'abc', "1 OR 1=1", '01']) assert.equal((await get(id)).status, 400);
  });
  await serve({ findById: async () => null }, async get => {
    const result = await get('999'); assert.equal(result.status, 404);
    assert.equal(result.body.code, 'PRODUCT_NOT_FOUND');
  });
  await serve({ findById: async () => { throw new Error('private host login password'); } }, async get => {
    const result = await get('1'); assert.equal(result.status, 503);
    assert(!JSON.stringify(result.body).includes('private'));
  });
});

test('repository binds ID and filters inactive product/category in both detail and image queries', async () => {
  let statement;
  const repository = createProductDetailRepository(async () => ({ request: () => ({
    input(name, type, value) { assert.equal(name, 'id'); assert.equal(value, 42); return this; },
    async query(text) {
      statement = text;
      return { recordsets: [[{ id: 42 }], [{ id: 9, url: '/test.svg' }]] };
    }
  }) }));
  const product = await repository.findById(42);
  assert.equal(product.images[0].id, 9);
  assert.equal((statement.match(/p.Id=@id AND p.IsActive=1 AND c.IsActive=1/g) || []).length, 2);
  assert(statement.includes('ORDER BY i.SortOrder, i.Id'));
  assert(!statement.includes('42'));
  const missing = createProductDetailRepository(async () => ({ request: () => ({
    input() { return this; }, query: async () => ({ recordsets: [[], []] })
  }) }));
  assert.equal(await missing.findById(42), null);
});
