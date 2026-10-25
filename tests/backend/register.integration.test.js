const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const sql = require('mssql');
const { createApp } = require('../../backend/src/server');
const { getPool, closePool } = require('../../backend/src/database/pool');
const { createUsersRepository } = require('../../backend/src/auth/users');

test('real SQL registration, persistence, duplicate and health; rolls back its own test user', {
  skip: process.env.UC01_SQL_INTEGRATION !== '1'
}, async () => {
  const email = `uc01-${randomUUID()}@example.test`;
  let transaction, server, rolledBack = false, began = false;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    transaction.on('rollback', () => { rolledBack = true; });
    await transaction.begin();
    began = true;
    const isolatedPool = { request: () => new sql.Request(transaction) };
    server = createApp({ poolProvider: async () => isolatedPool }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/api/health', '/api/health/db', '/register.html']) {
      assert.equal((await fetch(base + route)).status, 200);
    }
    const payload = { fullname: 'UC01 SQL Test', addr: 'Test address only', uname: email.toUpperCase(),
      pwd: 'Test-only-123!', password_confirm: 'Test-only-123!' };
    const post = () => fetch(base + '/api/auth/register', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const response = await post();
    assert.equal(response.status, 201);
    const body = await response.text();
    assert(!body.includes('argon2') && !body.includes(payload.pwd));
    const rows = await isolatedPool.request().input('email', sql.NVarChar(254), email)
      .query('SELECT FullName, Address, Email, PasswordHash, Role, IsActive FROM dbo.Users WHERE Email=@email');
    assert.equal(rows.recordset.length, 1);
    const row = rows.recordset[0];
    assert.equal(row.FullName, payload.fullname);
    assert.equal(row.Address, payload.addr);
    assert.equal(row.Email, email);
    assert(row.PasswordHash.startsWith('$argon2id$v=19$'));
    assert(row.PasswordHash !== payload.pwd);
    assert.equal(row.Role, 'CUSTOMER');
    assert.equal(row.IsActive, true);
    assert.equal((await post()).status, 409);
    // Exercise the real UNIQUE constraint independently of the application precheck.
    const users = await createUsersRepository(async () => isolatedPool).open();
    await assert.rejects(users.insert({ fullname: payload.fullname, addr: payload.addr,
      uname: email, passwordHash: row.PasswordHash }), error => [2601, 2627].includes(error.number));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      if (began && !rolledBack) await transaction.rollback();
      if (began) {
        const remaining = await (await getPool()).request().input('email', sql.NVarChar(254), email)
          .query('SELECT TOP (1) 1 AS found FROM dbo.Users WHERE Email=@email');
        assert.equal(remaining.recordset.length, 0, 'test user must not persist');
      }
    } finally { await closePool(); }
  }
});
