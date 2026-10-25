const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../backend/src/server');
const { hashPassword, verifyPassword } = require('../../backend/src/auth/password');
const { createSessionStore, createLoginRepository } = require('../../backend/src/auth/login');
const hash = hashPassword('Login-test-123!');
const credentials = { uname: 'TEST@EXAMPLE.TEST', pwd: 'Login-test-123!' };
async function fixture(run, options = {}) {
  const user = { id: 42, email: 'test@example.test', fullname: 'Test User', role: 'CUSTOMER', active: true, passwordHash: await hash };
  const repository = { findByEmail: async email => email === user.email ? user : null, findById: async id => id === user.id ? user : null };
  const app = createApp({ loginRepository: repository, ...options });
  app.get('/_test/admin', app.locals.auth.requireAuth, app.locals.auth.requireRole('ADMIN'), (req, res) => res.json({ role: req.user.role }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await run(async (route, body, cookie, headers = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
        method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
    }, user);
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('Argon2id verifies UC-01 PHC hashes; rejects wrong passwords, plaintext and unbounded costs', async () => {
  const encoded = await hash;
  assert(await verifyPassword(encoded, credentials.pwd));
  assert.equal(await verifyPassword(encoded, 'incorrect'), false);
  assert.equal(await verifyPassword('plaintext', 'plaintext'), false);
  assert.equal(await verifyPassword(encoded.replace('m=65536', 'm=999999999'), credentials.pwd), false);
});

test('login, me, rotation, server roles, disabled accounts and logout enforce session lifecycle', async () => {
  await fixture(async (call, user) => {
    assert.equal((await call('/api/auth/me')).body.authenticated, false);
    assert.equal((await call('/_test/admin')).status, 401);
    const login = await call('/api/auth/login', credentials);
    assert.equal(login.status, 200);
    assert(login.cookie.includes('HttpOnly') && login.cookie.includes('SameSite=Strict'));
    assert(!JSON.stringify(login.body).includes('passwordHash') && !JSON.stringify(login.body).includes('argon2'));
    const first = login.cookie.split(';')[0];
    assert.equal((await call('/api/auth/me', undefined, first)).body.user.id, 42);
    assert.equal((await call('/_test/admin', undefined, first)).status, 403);
    user.role = 'ADMIN';
    assert.equal((await call('/_test/admin', undefined, first)).status, 200);
    const rotated = await call('/api/auth/login', credentials, first);
    const second = rotated.cookie.split(';')[0];
    assert.notEqual(first, second);
    assert.equal((await call('/api/auth/me', undefined, first)).body.authenticated, false);
    user.active = false;
    assert.equal((await call('/api/auth/me', undefined, second)).body.authenticated, false);
    user.active = true;
    assert.equal((await call('/api/auth/me', undefined, second)).body.authenticated, false);
    const third = (await call('/api/auth/login', credentials)).cookie.split(';')[0];
    assert.equal((await call('/api/auth/logout', {}, third)).status, 200);
    assert.equal((await call('/api/auth/me', undefined, third)).body.authenticated, false);
  });
});

test('unknown email, wrong password and disabled login share identical response; validation and CSRF', async () => {
  await fixture(async (call, user) => {
    const wrong = await call('/api/auth/login', { ...credentials, pwd: 'incorrect' });
    const absent = await call('/api/auth/login', { ...credentials, uname: 'absent@example.test' });
    user.active = false;
    const inactive = await call('/api/auth/login', credentials);
    for (const result of [wrong, absent, inactive]) { assert.equal(result.status, 401); assert.equal(result.cookie, null); }
    assert.deepEqual(wrong.body, absent.body); assert.deepEqual(wrong.body, inactive.body);
    for (const body of [{}, { uname: '', pwd: '' }, { uname: 'bad', pwd: '123' }, null]) assert.equal((await call('/api/auth/login', body)).status, 400);
    assert.equal((await call('/api/auth/login', credentials, null, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await call('/api/auth/logout', {}, null, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  });
});

test('expired and forged sessions rejected; Secure cookie over trusted loopback HTTPS proxy', async () => {
  let time = 1;
  const store = createSessionStore({ now: () => time, ttl: 10 });
  const token = store.create(42); assert.equal(store.get(token).userId, 42);
  assert.equal(store.get('forged'), null); time = 12; assert.equal(store.get(token), null);
  const previous = process.env.TRUST_PROXY_LOOPBACK;
  process.env.TRUST_PROXY_LOOPBACK = 'true';
  try {
    await fixture(async call => {
      const result = await call('/api/auth/login', credentials, null, { 'X-Forwarded-Proto': 'https' });
      assert.equal(result.status, 200); assert(result.cookie.includes('; Secure'));
    });
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY_LOOPBACK; else process.env.TRUST_PROXY_LOOPBACK = previous;
  }
});

test('SQL errors sanitized and login lookups bind parameters without exposing hashes in session queries', async () => {
  await fixture(async call => {
    const result = await call('/api/auth/login', credentials);
    assert.equal(result.status, 503); assert(!JSON.stringify(result.body).includes('private'));
  }, { loginRepository: { findByEmail: async () => { throw new Error('private SQL login configuration'); } } });
  const calls = [];
  const repository = createLoginRepository(async () => ({ request: () => ({
    input(name, type, value) { calls.push({ name, value }); return this; },
    query: async sql => { calls[calls.length - 1].sql = sql; return { recordset: [] }; }
  }) }));
  const attack = "x' OR 1=1--@example.test";
  await repository.findByEmail(attack); await repository.findById(42);
  assert.equal(calls[0].value, attack); assert(!calls[0].sql.includes(attack));
  assert(calls[0].sql.includes('PasswordHash')); assert(!calls[1].sql.includes('PasswordHash'));
});

test('login rate limit blocks attempt 21 before password verification', async () => {
  let verifies = 0;
  await fixture(async call => {
    for (let attempt = 0; attempt < 20; attempt++) assert.equal((await call('/api/auth/login', credentials)).status, 401);
    assert.equal((await call('/api/auth/login', credentials)).status, 429);
    assert.equal(verifies, 20);
  }, { passwordVerifier: async () => { verifies++; return false; } });
});
