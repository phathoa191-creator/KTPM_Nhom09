const { test } = require('node:test');
const assert = require('node:assert/strict');
const { argon2 } = require('node:crypto');
const { promisify } = require('node:util');
const { createApp } = require('../../backend/src/server');
const { hashPassword } = require('../../backend/src/auth/password');
const { createUsersRepository, assertRegistrationSchema } = require('../../backend/src/auth/users');

const valid = { fullname: ' Nguyễn Văn Test ', addr: ' 123 Đường Kiểm Thử ',
  uname: ' UC01@EXAMPLE.TEST ', pwd: 'Test-only-123!', password_confirm: 'Test-only-123!' };

async function withServer(options, run) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(async (body, raw = false) => {
      const response = await fetch(`${base}/api/auth/register`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: raw ? body : JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('register 201 normalizes fields, stores real salted Argon2id, exposes no credentials', async () => {
  const rows = [];
  let checkedEmail;
  const usersRepository = { open: async () => ({
    emailExists: async email => { checkedEmail = email; return false; },
    insert: async row => rows.push(row)
  }) };
  await withServer({ usersRepository }, async post => {
    const response = await post(valid);
    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(response.data).sort(), ['code', 'message']);
    assert(!JSON.stringify(response.data).includes(valid.pwd));
    assert(!JSON.stringify(response.data).includes('argon2'));
  });
  assert.equal(checkedEmail, 'uc01@example.test');
  assert.equal(rows[0].fullname, valid.fullname.trim());
  assert.equal(rows[0].addr, valid.addr.trim());
  assert.deepEqual(Object.keys(rows[0]).sort(), ['addr', 'fullname', 'passwordHash', 'uname']);
  assert.notEqual(rows[0].passwordHash, valid.pwd);
  const parts = rows[0].passwordHash.split('$');
  assert.deepEqual(parts.slice(1, 4), ['argon2id', 'v=19', 'm=65536,t=3,p=1']);
  const key = await promisify(argon2)('argon2id', { message: valid.pwd,
    nonce: Buffer.from(parts[4], 'base64'), memory: 65536, passes: 3, parallelism: 1, tagLength: 32 });
  assert.deepEqual(Buffer.from(parts[5], 'base64'), key);
  assert.notEqual(await hashPassword(valid.pwd), rows[0].passwordHash);
});

test('invalid registration returns 400 before accessing database or hashing', async () => {
  const options = { usersRepository: { open: async () => assert.fail('must not access SQL') },
    passwordHasher: async () => assert.fail('must not hash invalid input') };
  const cases = [ ['fullname', ''], ['fullname', '   '], ['addr', ''], ['addr', '  '],
    ['uname', 'invalid-email'], ['uname', ''], ['pwd', '1234567'], ['pwd', ''],
    ['password_confirm', 'different'], ['password_confirm', ''], ['fullname', 'x'.repeat(101)],
    ['addr', 'x'.repeat(501)], ['uname', 'x'.repeat(250) + '@a.test'], ['pwd', 'x'.repeat(1025)],
    ['fullname', {}], ['pwd', 12345678] ];
  await withServer(options, async post => {
    for (const [field, value] of cases) {
      const result = await post({ ...valid, [field]: value });
      assert.equal(result.status, 400, field);
      assert(result.data.errors[field], field);
      assert(!JSON.stringify(result.data).includes(valid.pwd));
    }
    for (const body of [null, [], {}, 'string']) assert.equal((await post(body)).status, 400);
    assert.equal((await post('{bad json', true)).status, 400);
    assert.equal((await post(JSON.stringify({ value: 'x'.repeat(17000) }), true)).status, 400);
  });
});

test('existing email and SQL UNIQUE races return 409; system failures stay sanitized', async () => {
  for (const scenario of ['exists', '2601', '2627', 'nested', 'system', 'hash', 'open']) {
    let inserts = 0;
    const options = {
      passwordHasher: async () => {
        if (scenario === 'exists') assert.fail('do not hash duplicate');
        if (scenario === 'hash') throw new Error('private password hash failure');
        return 'test-only-hash';
      },
      usersRepository: { open: async () => {
        if (scenario === 'open') throw new Error('private SQL configuration');
        return {
          emailExists: async () => scenario === 'exists',
          insert: async () => {
            inserts++;
            if (scenario === 'nested') throw { originalError: { info: { number: 2627 } } };
            throw Object.assign(new Error('private SQL password hash'), { number: Number(scenario) });
          }
        };
      } }
    };
    await withServer(options, async post => {
      const result = await post(valid);
      assert.equal(result.status, ['exists', '2601', '2627', 'nested'].includes(scenario) ? 409 : 500);
      assert(!JSON.stringify(result.data).includes('private'));
      assert(!JSON.stringify(result.data).includes('test-only-hash'));
    });
    if (['exists', 'hash', 'open'].includes(scenario)) assert.equal(inserts, 0);
  }
});

function metadata() {
  return { recordsets: [
    [{ name: 'FullName', type: 'nvarchar', max_length: 200 },
      { name: 'Address', type: 'nvarchar', max_length: 1000 },
      { name: 'Email', type: 'nvarchar', max_length: 508 },
      { name: 'PasswordHash', type: 'varchar', max_length: 255 }],
    [{ can_select: 1, can_insert: 1 }], [{ name: 'UQ_Users_Email' }]
  ] };
}

test('repository checks schema first and binds every user value as a SQL parameter', async () => {
  const calls = [];
  const pool = { request: () => {
    const parameters = {};
    return {
      input(name, type, value) { parameters[name] = { type, value }; return this; },
      async query(statement) {
        calls.push({ statement, parameters });
        if (statement.includes('sys.columns')) return metadata();
        return { recordset: [] };
      }
    };
  } };
  const users = await createUsersRepository(async () => pool).open();
  const attack = "test'); DROP TABLE dbo.Users;--@example.test";
  assert.equal(await users.emailExists(attack), false);
  await users.insert({ fullname: 'SQL test', addr: 'Test address', uname: attack, passwordHash: 'test-hash' });
  assert.equal(calls.length, 3);
  assert(!calls[1].statement.includes(attack));
  assert(!calls[2].statement.includes(attack));
  assert.equal(calls[1].parameters.email.value, attack);
  assert.equal(calls[2].parameters.email.value, attack);
  assert.equal(calls[2].parameters.addr.value, 'Test address');
  assert.deepEqual(Object.keys(calls[2].parameters).sort(), ['addr', 'email', 'fullname', 'passwordHash']);
});

test('missing address, UNIQUE email or permissions blocks INSERT without migration', async () => {
  for (const scenario of ['address', 'unique', 'select', 'insert', 'metadata']) {
    const result = metadata();
    if (scenario === 'address') result.recordsets[0] = result.recordsets[0].filter(c => c.name !== 'Address');
    if (scenario === 'unique') result.recordsets[2] = [];
    if (scenario === 'select') result.recordsets[1][0].can_select = 0;
    if (scenario === 'insert') result.recordsets[1][0].can_insert = 0;
    if (scenario === 'metadata') result.recordsets[0] = [];
    let queries = 0;
    await assert.rejects(assertRegistrationSchema({ request: () => ({ query: async () => {
      queries++; return result;
    } }) }), { code: 'REGISTRATION_NOT_READY' });
    assert.equal(queries, 1);
  }
});
