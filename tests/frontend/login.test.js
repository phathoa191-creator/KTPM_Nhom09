const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../frontend/assets/auth.js'), 'utf8');

function setup(status = 200, networkError = false, role = 'CUSTOMER', returnTo = '', sessionValid = true) {
  class Element {
    constructor() { this.dataset = {}; this.children = []; this.listeners = {}; this.value = ''; }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    setAttribute() {}
    removeAttribute() {}
    append(...items) { this.children.push(...items); }
    querySelectorAll() { return []; }
    querySelector() { return null; }
  }
  const elements = Object.fromEntries(['login-form', 'login-submit', 'login-email', 'login-password',
    'login-form-feedback', 'page-feedback'].map(id => [id, new Element()]));
  const header = new Element(), requests = [], listeners = {}, redirects = [];
  elements['login-email'].value = 'test@example.test'; elements['login-password'].value = 'test-password';
  vm.runInNewContext(source, {
    document: { querySelector: selector => selector === '.header-links' ? header : elements[selector.match(/"([^"]+)"/)[1]], createElement: () => new Element(), addEventListener: (name, handler) => { listeners[name] = handler; } },
    location: { pathname: '/login.html', href: 'http://localhost/login.html' + (returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : ''), assign: url => redirects.push(url) }, URL,
    window: { addEventListener() {} },
    fetch: async (url, options) => {
      requests.push({ url, options }); if (networkError) throw new Error('private network');
      return { ok: status === 200, json: async () => ({ message: status === 200 ? 'Success' : 'Generic failure', authenticated: status === 200 && (url !== '/api/auth/me' || sessionValid),
        user: status === 200 ? { id: 7, fullname: 'Test', role } : null }) };
    }
  });
  return { elements, header, requests, listeners, redirects, submit: () => elements['login-form'].listeners.submit({ preventDefault() {} }) };
}

test('login uses cookie credentials, clears password and updates account/logout controls', async () => {
  const ui = setup(); await ui.submit();
  assert.equal(ui.requests[0].url, '/api/auth/login');
  assert.equal(ui.requests[0].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(ui.requests[0].options.body), { uname: 'test@example.test', pwd: 'test-password' });
  assert.equal(ui.elements['login-password'].value, '');
  assert.equal(ui.elements['login-form-feedback'].dataset.state, 'success');
  const session = ui.header.children[0];
  assert.equal(session.children[0].href, 'account.html');
  assert.equal(session.children[1].dataset.testid, 'auth-logout');
  await session.children[1].listeners.click();
  assert.equal(ui.requests[1].url, '/api/auth/me');
  assert.equal(ui.requests[2].url, '/api/auth/logout');
  assert.deepEqual(ui.redirects, ['/index.html']);
});

test('login displays authentication/network errors and restores submit state', async () => {
  for (const [status, fail] of [[401, false], [503, false], [429, false], [200, true]]) {
    const ui = setup(status, fail); await ui.submit();
    assert.equal(ui.elements['login-form-feedback'].dataset.state, 'error');
    assert.equal(ui.elements['login-submit'].disabled, false);
    assert.equal(ui.redirects.length, 0);
    assert(!ui.elements['login-form-feedback'].textContent.includes('private'));
  }
});

test('CUSTOMER and ADMIN redirect home only after verified session; safe returnTo cannot loop or leave site', async () => {
  for (const role of ['CUSTOMER','ADMIN']) {
    const ui=setup(200,false,role);await ui.submit();assert.deepEqual(ui.redirects,['/index.html']);assert.equal(ui.requests[1].url,'/api/auth/me');
  }
  for (const target of ['https://evil.test','//evil.test','/login.html','/register.html','/account.html?token=secret','/admin/products.html','/\\evil.test']) {
    const ui=setup(200,false,'CUSTOMER',target);await ui.submit();assert.deepEqual(ui.redirects,['/index.html']);
  }
  const back=setup(200,false,'CUSTOMER','/checkout.html');await back.submit();assert.deepEqual(back.redirects,['/checkout.html']);
  const admin=setup(200,false,'ADMIN','/admin/products.html');await admin.submit();assert.deepEqual(admin.redirects,['/admin/products.html']);
  const missing=setup(200,false,'CUSTOMER','',false);await missing.submit();assert.deepEqual(missing.redirects,[]);assert.equal(missing.elements['login-form-feedback'].dataset.state,'error');
});

test('profile save refreshes current auth data and header through auth/me', async () => {
  const ui = setup();
  await ui.listeners['account-profile-updated']();
  assert.equal(ui.requests[0].url, '/api/auth/me');
  assert.equal(ui.requests[0].options.cache, 'no-store');
  assert.equal(ui.header.children.at(-1).children[0].textContent, 'Test (CUSTOMER)');
});
