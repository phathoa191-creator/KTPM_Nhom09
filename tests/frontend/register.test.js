const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../frontend/assets/app.js'), 'utf8');

function setup(fetch) {
  const feedback = {}, submit = { disabled: false }, attributes = {};
  const fields = { uname: { setAttribute: (key, value) => { fields.uname[key] = value; } } };
  let listener, resets = 0, focused = false;
  const timers = [], redirects = [];
  const form = {
    addEventListener: (_name, callback) => { listener = callback; },
    querySelector: selector => selector.includes('feedback') ? feedback : selector.includes('submit') ? submit : { focus: () => { focused = true; } },
    querySelectorAll: () => [], elements: { namedItem: name => fields[name] },
    setAttribute: (key, value) => { attributes[key] = value; },
    removeAttribute: key => { delete attributes[key]; }, reset: () => { resets++; }
  };
  vm.runInNewContext(source, {
    document: { querySelector: () => form, querySelectorAll: () => [] }, fetch,
    setTimeout: (callback, delay) => timers.push({ callback, delay }), location: { assign: url => redirects.push(url) },
    FormData: class { *[Symbol.iterator]() { yield* Object.entries({ fullname: 'Test', addr: 'Test address', uname: 'test@example.test', pwd: 'test-password', password_confirm: 'test-password' }); } }
  });
  return { send: () => listener({ preventDefault() {} }), feedback, submit, attributes, fields,
    timers, redirects, get resets() { return resets; }, get focused() { return focused; } };
}

test('registration fetch sends five fields, prevents double submit and resets only on 201', async () => {
  let complete, calls = 0;
  const ui = setup(async (url, options) => {
    calls++;
    assert.equal(url, '/api/auth/register');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(), ['addr', 'fullname', 'password_confirm', 'pwd', 'uname']);
    await new Promise(resolve => { complete = resolve; });
    return { status: 201, json: async () => ({ message: 'Success' }) };
  });
  const pending = ui.send();
  assert.equal(ui.submit.disabled, true);
  await ui.send();
  assert.equal(calls, 1);
  complete(); await pending;
  assert.equal(ui.feedback.textContent, 'Success');
  assert.equal(ui.resets, 1);
  assert.equal(ui.submit.disabled, true);
  assert.equal(ui.redirects.length, 0);
  assert.equal(ui.timers[0].delay, 1000);
  ui.timers[0].callback(); assert.deepEqual(ui.redirects, ['/login.html']);
  assert.equal(ui.attributes['aria-busy'], undefined);
});

test('registration displays field/server/network errors without clearing entered fields', async () => {
  for (const status of [400, 409, 500, 'network']) {
    const ui = setup(async () => {
      if (status === 'network') throw new Error('private network details');
      return { status, json: async () => ({ message: 'Try later',
        ...(status === 500 ? {} : { errors: { uname: 'Invalid email' } }) }) };
    });
    await ui.send();
    assert.equal(ui.resets, 0);
    assert.equal(ui.timers.length, 0); assert.equal(ui.redirects.length, 0);
    assert.equal(ui.submit.disabled, false);
    assert(ui.feedback.textContent);
    assert(!ui.feedback.textContent.includes('private'));
    if (status === 400 || status === 409) {
      assert.equal(ui.fields.uname['aria-invalid'], 'true');
      assert(ui.focused);
    }
  }
});

test('registration HTML preserves Selenium locators and adds address field', () => {
  const html = fs.readFileSync(require.resolve('../../frontend/register.html'), 'utf8');
  for (const id of ['register-form', 'register-name', 'register-address', 'register-email',
    'register-password', 'register-confirm-password', 'register-submit', 'register-form-feedback']) {
    assert.equal((html.match(new RegExp(`data-testid="${id}"`, 'g')) || []).length, 1);
  }
  assert(!html.includes('data-skeleton novalidate'));
  assert(html.includes('Địa chỉ'));
});
