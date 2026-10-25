const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePatch, createAccountRepository } = require('../../backend/src/account/account');
const { createApp } = require('../../backend/src/server');
const { createSessionStore } = require('../../backend/src/auth/login');
test('account validates partial fields, exact phone CHECK, null clearing and UTF-16 limits', () => {
  assert.deepEqual(validatePatch({ fullName: ' Nguyễn Văn A ', phone: '', address: ' ' }), { fullName: 'Nguyễn Văn A', phone: null, address: null });
  assert.deepEqual(validatePatch({ phone: null }), { phone: null });
  assert.deepEqual(validatePatch({ address: null }), { address: null });
  assert.equal(validatePatch({ fullName: '😀'.repeat(50) }).fullName.length, 100);
  assert.equal(validatePatch({ address: 'a'.repeat(500) }).address.length, 500);
  assert.equal(validatePatch({ phone: '0901234567' }).phone, '0901234567');
  for (const body of [null, [], {}, { fullName: '' }, { fullName: ' \t ' }, { fullName: 1 }, { fullName: '😀'.repeat(51) }, { phone: 901234567 }, { phone: ' 0901234567' }, { phone: '1901234567' }, { phone: '090123456 ' }, { address: 5 }, { address: 'a'.repeat(501) }]) assert.throws(() => validatePatch(body));
  for (const key of ['Id', 'userId', 'email', 'role', 'PasswordHash', 'IsActive', 'UpdatedAt', '__proto__']) assert.throws(() => validatePatch(JSON.parse(`{"${key}":"x","fullName":"A"}`)));
});
test('account repository binds owner/values, uses one UPDATE and returns no match safely', async () => {
  const calls = []; let affected = 1;
  const row = { fullName: 'A', email: 'a@test', phone: null, address: null };
  const repo = createAccountRepository(async () => ({ request() { const params = {}; return {
    input(k,t,v) { params[k] = v; return this; }, async query(text) { calls.push({ text, params }); return { recordset: [row], rowsAffected: [affected] }; }
  }; } }));
  assert.deepEqual(await repo.update(7, { phone: null, address: "x'; DROP TABLE Users;--" }), row);
  assert.equal(calls.length, 1); assert.match(calls[0].text, /WHERE Id=@userId AND IsActive=1/);
  assert.match(calls[0].text, /UpdatedAt=SYSUTCDATETIME\(\)/); assert(!calls[0].text.includes('DROP'));
  assert(!calls[0].text.includes('FullName=@')); assert.equal(calls[0].params.userId, 7); assert.equal(calls[0].params.phone, null);
  affected = 0; assert.equal(await repo.update(7, { fullName: 'A' }), null);
  await repo.read(8); assert.match(calls.at(-1).text, /^SELECT FullName/); assert(!calls.at(-1).text.includes('PasswordHash')); assert.equal(calls.at(-1).params.userId, 8);
});
test('GET/PATCH auth, owner isolation, protected fields, no-store, CSRF, logout and sanitized SQL errors', async () => {
  const sessions = createSessionStore(), cookie = 'cellphones.sid=' + sessions.create(7), other = 'cellphones.sid=' + sessions.create(8);
  let active = true, fail = false; const calls = [];
  const row = id => ({ fullName: 'User '+id, email: id+'@test', phone: null, address: null, PasswordHash: 'secret', role: 'ADMIN' });
  const app = createApp({ sessions, loginRepository: { findById: async id => ({ id, active, role: 'CUSTOMER' }) }, accountRepository: {
    async read(id) { calls.push(['get',id]); if(fail) throw Error('private SQL'); return row(id); },
    async update(id, body) { calls.push(['patch',id,body]); if(fail) throw Error('private SQL'); return row(id); }
  } });
  const server = app.listen(0,'127.0.0.1'); await new Promise(r => server.once('listening',r));
  const call = async (method='GET', body, headers={Cookie:cookie}, path='/api/account') => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { 'Content-Type':'application/json', ...headers }, ...(body === undefined ? {} : {body: JSON.stringify(body)}) });
    assert.equal(r.headers.get('cache-control'),'no-store'); return { status:r.status, body:await r.json() };
  };
  try {
    assert.equal((await call('GET',undefined,{})).status,401);
    assert.equal((await call('PATCH',{fullName:'A'},{})).status,401);
    assert.equal((await call('PATCH',{fullName:'A'},{Cookie:cookie,Origin:'https://evil.test'})).status,403);
    assert.equal(calls.length,0);
    const get = await call('GET',undefined,undefined,'/api/account?userId=999'); assert.equal(get.body.fullName,'User 7'); assert(!JSON.stringify(get.body).includes('secret')); assert(!('role' in get.body));
    assert.equal((await call('GET',undefined,{Cookie:other})).body.fullName,'User 8');
    const before=calls.length;
    for(const body of [{}, {userId:8,fullName:'A'}, {phone:'x',fullName:'A'}, {email:'new@test'}]) assert.equal((await call('PATCH',body)).status,400);
    assert.equal(calls.length,before);
    assert.equal((await call('PATCH',{fullName:' A '})).status,200); assert.deepEqual(calls.at(-1),['patch',7,{fullName:'A'}]);
    fail=true; for(const method of ['GET','PATCH']) { const r=await call(method,method==='PATCH'?{phone:null}:undefined); assert.equal(r.status,503); assert(!JSON.stringify(r.body).includes('private')); }
    fail=false; active=false; assert.equal((await call()).status,401); active=true;
    await call('POST',undefined,{Cookie:other},'/api/auth/logout'); assert.equal((await call('GET',undefined,{Cookie:other})).status,401);
  } finally { await new Promise(r=>server.close(r)); }
});
