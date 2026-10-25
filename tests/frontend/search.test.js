const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../frontend/assets/search.js'), 'utf8');

async function render(response, failure = false) {
  let finished;
  const done = new Promise(resolve => { finished = resolve; });
  class Element {
    constructor(tag) { this.tag = tag; this.dataset = {}; this.attributes = {}; this.children = []; this.textContent = ''; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener() {}
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; if (this === elements['search-results']) finished(); }
  }
  const elements = Object.fromEntries(['search-form', 'search-keyword', 'search-form-feedback', 'search-results',
    'search-empty', 'search-summary', 'search-pagination'].map(id => [id, new Element('div')]));
  let request;
  vm.runInNewContext(source, {
    document: { querySelector: selector => elements[selector.match(/"([^"]+)"/)[1]], createElement: tag => new Element(tag) },
    location: { href: 'http://localhost:3000/search.html?q=phone', search: '?q=phone' },
    history: { pushState() {} }, window: { addEventListener() {} },
    URL, URLSearchParams, AbortController, Intl,
    fetch: async url => {
      request = url;
      if (failure) throw new Error('private network failure');
      return { ok: response.ok !== false, json: async () => response };
    }
  });
  await done;
  return { elements, request };
}

test('search UI renders API records as text, formats prices and rejects unsafe image schemes', async () => {
  const name = '<img src=x onerror=alert(1)>';
  const { elements, request } = await render({ products: [{ id: 42, sku: 'TEST-SKU', name,
    price: 19990000, stock: 2, category: 'Phones', description: 'Test description', imageUrl: 'javascript:alert(1)' }], total: 13, totalPages: 2 });
  assert(request.includes('q=phone'));
  const card = elements['search-results'].children[0];
  assert.equal(card.dataset.testid, 'product-card-TEST-SKU');
  assert.equal(card.dataset.productId, '42');
  const link = card.children[0];
  assert.equal(link.href, 'product-detail.html?id=42');
  assert.equal(link.dataset.testid, 'product-detail-TEST-SKU');
  assert.equal(link.children[0].src, 'assets/images/demo-phone-01.svg');
  assert.equal(link.children[1].children[1].textContent, name);
  assert(link.children[1].children[3].textContent.includes('19.990.000'));
  assert.equal(elements['search-empty'].hidden, true);
  assert.equal(elements['search-pagination'].children[1].dataset.testid, 'search-next');
});

test('search UI distinguishes empty results from API/network errors and clears busy state', async () => {
  const empty = await render({ products: [], total: 0, totalPages: 0 });
  assert.equal(empty.elements['search-empty'].hidden, false);
  assert(empty.elements['search-form-feedback'].textContent.includes('Không tìm thấy'));
  for (const failure of [false, true]) {
    const result = await render({ ok: false, code: 'PRODUCTS_UNAVAILABLE', message: 'private database host' }, failure);
    assert.equal(result.elements['search-results'].children.length, 0);
    assert.equal(result.elements['search-empty'].hidden, true);
    assert(result.elements['search-form-feedback'].textContent.includes('Không thể tải sản phẩm'));
    assert(!result.elements['search-form-feedback'].textContent.includes('private'));
    assert.equal(result.elements['search-results'].attributes['aria-busy'], undefined);
  }
});
