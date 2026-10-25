const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../frontend/assets/product-detail.js'), 'utf8');

async function render({ search = '?id=3', status = 200, stock = 0, fail = false, images = [], cartForm = false, cartStatus = 200 } = {}) {
  const elements = {};
  let complete;
  const done = new Promise(resolve => { complete = resolve; });
  class Element {
    constructor() { this.dataset = {}; this.textContent = ''; this.children = []; this.listeners = {}; }
    setAttribute() {}
    removeAttribute() { complete(); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, handler) { this.listeners[name] = handler; }
  }
  for (const name of ['product-detail', 'page-feedback', 'product-name', 'product-price', 'product-category',
    'product-sku', 'product-description', 'product-stock', 'product-availability', 'product-images']) elements[name] = new Element();
  let calls = 0;
  const cartRequests = [];
  if (cartForm) {
    for (const id of ['add-cart-form', 'add-cart-quantity', 'detail-add-to-cart', 'add-cart-form-feedback', 'add-cart-login']) elements[id] = new Element();
    elements['add-cart-quantity'].value = '2';
  }
  vm.runInNewContext(source, {
    document: { querySelector: selector => elements[selector.match(/"([^"]+)"/)[1]], createElement: () => new Element() },
    location: { search, href: 'http://localhost/product-detail.html' }, URL, URLSearchParams, Intl,
    fetch: async (url, options) => {
      if (url === '/api/cart/items') {
        cartRequests.push(options);
        return { ok: cartStatus === 200, status: cartStatus, json: async () => ({ message: 'Cart response' }) };
      }
      calls++; assert.equal(url, '/api/products/3');
      if (fail) throw new Error('private network details');
      return { ok: status === 200, status, json: async () => ({ product: {
        id: 3, name: '<img onerror=alert(1)>', price: 15990000, category: 'Phones', sku: 'DEMO-TEST',
        description: 'Description\nDemo', stock, images
      } }) };
    }
  });
  if (calls) await done;
  return { elements, calls, cartRequests };
}

test('detail renders safe text, price, stock statuses and fallback/all images', async () => {
  for (const stock of [0, 5]) {
    const { elements } = await render({ stock });
    assert.equal(elements['product-detail'].hidden, false);
    assert.equal(elements['product-name'].textContent, '<img onerror=alert(1)>');
    assert(elements['product-price'].textContent.includes('15.990.000'));
    assert.equal(elements['product-availability'].dataset.state, stock ? 'in-stock' : 'out-of-stock');
    assert.equal(elements['product-images'].children[0].src, 'http://localhost/assets/images/demo-phone-01.svg');
  }
  const { elements } = await render({ images: [{ id: 1, url: 'javascript:alert(1)' }, { id: 2, url: '/assets/images/demo-tablet.svg' }] });
  assert.equal(elements['product-images'].children.length, 2);
  assert.equal(elements['product-images'].children[0].src, 'assets/images/demo-phone-01.svg');
  assert.equal(elements['product-images'].children[1].dataset.testid, 'product-image-2');
});

test('detail add form sends only product ID/quantity, handles authentication and disables out-of-stock', async () => {
  for (const cartStatus of [200, 401, 409]) {
    const ui = await render({ stock: 5, cartForm: true, cartStatus });
    await ui.elements['add-cart-form'].listeners.submit({ preventDefault() {} });
    assert.deepEqual(JSON.parse(ui.cartRequests[0].body), { productId: 3, quantity: 2 });
    assert.equal(ui.cartRequests[0].credentials, 'same-origin');
    assert.equal(ui.elements['add-cart-login'].hidden, cartStatus !== 401);
    assert.equal(ui.elements['detail-add-to-cart'].disabled, false);
  }
  const out = await render({ stock: 0, cartForm: true });
  assert.equal(out.elements['detail-add-to-cart'].disabled, true);
});

test('invalid/missing IDs do not fetch; 404/503/network hide detail and show correct feedback', async () => {
  for (const search of ['', '?id=0', '?id=1&id=2', '?id=bad']) {
    const result = await render({ search }); assert.equal(result.calls, 0);
    assert.equal(result.elements['product-detail'].hidden, true);
    assert.equal(result.elements['page-feedback'].dataset.state, 'invalid');
  }
  for (const options of [{ status: 404 }, { status: 503 }, { fail: true }]) {
    const { elements } = await render(options);
    assert.equal(elements['product-detail'].hidden, true);
    assert.equal(elements['page-feedback'].dataset.state, options.status === 404 ? 'not-found' : 'error');
    assert(!elements['page-feedback'].textContent.includes('private'));
  }
});
