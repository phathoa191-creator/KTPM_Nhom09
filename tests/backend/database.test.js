const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPoolManager } = require('../../backend/src/database/pool');
const { buildDatabaseConfig } = require('../../backend/src/config/database');
const { createApp } = require('../../backend/src/server');

test('pool shares concurrent connection, retries failed connect and closes', async () => {
  let connects = 0, closes = 0;
  class Pool extends EventEmitter {
    async connect() { connects++; if (connects === 1) throw new Error('private-driver-error'); }
    async close() { closes++; }
  }
  const manager = createPoolManager({ driver: { ConnectionPool: Pool }, getConfig: () => ({}) });
  await assert.rejects(manager.getPool());
  const [a, b] = await Promise.all([manager.getPool(), manager.getPool()]);
  assert.equal(a, b);
  assert.equal(connects, 2);
  a.emit('error', new Error('private-event'));
  await manager.closePool();
  assert.equal(closes, 2);
  await manager.getPool();
  assert.equal(connects, 3);
  await manager.closePool();
});

test('configuration rejects sa before attempting a connection', () => {
  assert.throws(() => buildDatabaseConfig({ DB_SERVER: 'localhost', DB_PORT: '1433',
    DB_DATABASE: 'CellphoneS_Testing', DB_USER: 'SA', DB_PASSWORD: 'test-only',
    DB_ENCRYPT: 'true', DB_TRUST_SERVER_CERTIFICATE: 'true' }), /không sử dụng sa/);
});

test('health endpoint returns 200 or sanitized 503 and only queries SELECT 1', async () => {
  for (const failure of ['none', 'connect', 'query']) {
    const statements = [];
    const poolProvider = async () => {
      if (failure === 'connect') throw new Error('secret-password private-login');
      return { request: () => ({ query: async text => {
        statements.push(text);
        if (failure === 'query') throw new Error('secret-password private-login');
      } }) };
    };
    const server = createApp({ poolProvider }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health/db`);
      const text = await response.text();
      assert.equal(response.status, failure === 'none' ? 200 : 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-cellphones-backend'), 'db-health-v1');
      assert.notEqual(response.status, 501);
      assert(!text.includes('secret-password') && !text.includes('private-login'));
      assert.deepEqual(statements, failure === 'connect' ? [] : ['SELECT 1 AS connection_ok']);
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
});

test('database health route runs before API fallback; unknown API still returns 501', async () => {
  let queries = 0;
  const app = createApp({ poolProvider: async () => ({ request: () => ({
    query: async text => { assert.equal(text, 'SELECT 1 AS connection_ok'); queries++; }
  }) }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${base}/api/health/db`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).database, 'connected');
    assert.equal(queries, 1);
    const unknown = await fetch(`${base}/api/not-implemented`);
    assert.equal(unknown.status, 501);
    assert.equal((await unknown.json()).code, 'NOT_IMPLEMENTED');
    assert.equal(queries, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
