const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../frontend/assets/cart.js'), 'utf8');

async function setup(body, status = 200) {
  let done;
  const ready = new Promise(resolve => { done = resolve; });
  class Element {
    constructor() { this.children = []; this.dataset = {}; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener() {}
  }
  const elements = Object.fromEntries(['cart-item-rows', 'cart-panel', 'cart-empty', 'page-feedback', 'cart-login',
    'cart-total', 'cart-count', 'cart-warning'].map(id => [id, new Element()]));
  elements['page-feedback'].dataset = new Proxy({}, { set(target, key, value) {
    target[key] = value; if (key === 'state' && value !== 'loading') done(); return true;
  } });
  const listeners = {}, calls = [];
  const response = { status, body };
  vm.runInNewContext(source, {
    document: { querySelector: selector => elements[selector.match(/"([^"]+)"/)[1]], createElement: () => new Element(),
      addEventListener: (event, callback) => { listeners[event] = callback; } },
    window: { addEventListener() {} }, URL, location: { href: 'http://localhost/cart.html' },
    fetch: async (url, options) => { calls.push({ url, options }); return { status: response.status, ok: response.status === 200, json: async () => response.body }; }
  });
  await ready;
  return { elements, calls, response, listeners };
}

test('cart UI renders server amounts exactly, stable row IDs, warning and safe product text', async () => {
  const name = '<img src=x onerror=alert(1)>';
  const ui = await setup({ items: [{ productId: 7, sku: 'TEST-7', name, unitPrice: '0.10', quantity: 3,
    lineTotal: '0.30', availability: 'discontinued', imageUrl: 'javascript:alert(1)' }], total: '9007199254740991.99',
  totalQuantity: 3, hasUnavailableItems: true });
  assert.equal(ui.calls[0].url, '/api/cart'); assert.equal(ui.calls[0].options.credentials, 'same-origin');
  const row = ui.elements['cart-item-rows'].children[0];
  assert.equal(row.dataset.testid, 'cart-item-TEST-7');
  assert.equal(row.children[0].children[0].children[1].children[0].textContent, name);
  assert.equal(row.children[3].textContent, '0,30 ₫');
  assert.equal(ui.elements['cart-total'].textContent, 'Tổng tiền tạm tính: 9.007.199.254.740.991,99 ₫');
  assert.equal(ui.elements['cart-warning'].hidden, false);
  assert.equal(ui.elements['cart-panel'].hidden, false);
  ui.response.status = 401;
  await ui.listeners['auth-state-changed']();
  assert.equal(ui.elements['cart-panel'].hidden, true);
  assert.equal(ui.elements['cart-item-rows'].children.length, 0);
  assert.equal(ui.elements['cart-login'].hidden, false);
});

test('cart UI differentiates empty, unauthenticated and database errors', async () => {
  const empty = await setup({ items: [], total: '0.00', totalQuantity: 0, hasUnavailableItems: false });
  assert.equal(empty.elements['cart-empty'].hidden, false);
  assert.equal(empty.elements['cart-panel'].hidden, true);
  for (const status of [401, 503]) {
    const ui = await setup({}, status);
    assert.equal(ui.elements['cart-panel'].hidden, true);
    assert.equal(ui.elements['cart-empty'].hidden, true);
    assert.equal(ui.elements['page-feedback'].dataset.state, status === 401 ? 'auth-required' : 'error');
  }
});
