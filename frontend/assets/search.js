(() => {
  const find = id => document.querySelector(`[data-testid="${id}"]`);
  const form = find('search-form');
  if (!form) return;
  const keyword = find('search-keyword');
  const feedback = find('search-form-feedback');
  const results = find('search-results');
  const empty = find('search-empty');
  const summary = find('search-summary');
  const pagination = find('search-pagination');
  const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
  let request;
  let generation = 0;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function imageUrl(value) {
    const fallback = 'assets/images/demo-phone-01.svg';
    if (typeof value !== 'string' || !value.trim()) return fallback;
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : fallback;
    } catch { return fallback; }
  }
  function card(product) {
    const article = node('article', 'product-card');
    article.dataset.testid = `product-card-${product.sku}`;
    article.dataset.productId = String(product.id);
    article.dataset.sku = product.sku;
    const image = node('img');
    image.src = imageUrl(product.imageUrl);
    image.alt = product.imageAlt || product.name;
    image.width = 480; image.height = 460; image.loading = 'lazy';
    image.addEventListener('error', () => { image.onerror = null; image.src = 'assets/images/demo-phone-01.svg'; }, { once: true });
    const info = node('div', 'product-info');
    const name = node('h3', '', product.name); name.dataset.testid = 'product-name';
    const price = node('p', 'price', currency.format(Number(product.price))); price.dataset.testid = 'product-price';
    info.append(node('span', 'badge', product.category), name,
      node('p', 'specs search-description', product.description || 'Chưa có mô tả sản phẩm.'), price,
      node('p', 'benefit', product.stock > 0 ? `Còn hàng · ${product.stock} sản phẩm` : 'Tạm hết hàng'),
      node('small', 'muted', `Mã sản phẩm: ${product.sku}`));
    const link = node('a', 'product-card-detail-link');
    link.href = `product-detail.html?${new URLSearchParams({ id: product.id })}`;
    link.dataset.testid = `product-detail-${product.sku}`;
    link.setAttribute('aria-label', `Xem chi tiết ${product.name}`);
    link.append(image, info);
    article.replaceChildren(link);
    return article;
  }
  function pageLink(label, page, q, testid) {
    const link = node('a', 'button', label);
    link.dataset.testid = testid;
    link.href = `search.html?${new URLSearchParams({ q, page })}`;
    link.addEventListener('click', event => { event.preventDefault(); load(q, page, true); });
    return link;
  }
  async function load(q, page = 1, updateUrl = false) {
    request?.abort(); request = new AbortController();
    const current = ++generation;
    const signal = request.signal;
    keyword.value = q;
    if (updateUrl) history.pushState(null, '', `search.html?${new URLSearchParams({ q, page })}`);
    form.setAttribute('aria-busy', 'true');
    results.setAttribute('aria-busy', 'true');
    results.replaceChildren(); pagination.replaceChildren();
    empty.hidden = true; summary.textContent = '';
    feedback.textContent = 'Đang tìm sản phẩm...';
    try {
      const response = await fetch(`/api/products?${new URLSearchParams({ q, page, limit: 12 })}`, { signal });
      const data = await response.json();
      if (current !== generation) return;
      if (!response.ok) throw new Error(data.code === 'INVALID_SEARCH' ? data.message : 'Không thể tải sản phẩm lúc này. Vui lòng thử lại sau.');
      results.replaceChildren(...data.products.map(card));
      summary.textContent = `${data.total} sản phẩm${q ? ` cho “${q}”` : ' đang kinh doanh'}`;
      feedback.textContent = data.total ? `Đã tìm thấy ${data.total} sản phẩm.` : 'Không tìm thấy sản phẩm phù hợp.';
      empty.hidden = data.products.length > 0;
      empty.textContent = data.total > 0 ? 'Trang này không có sản phẩm. Hãy tìm lại từ trang đầu.' : 'Không tìm thấy sản phẩm phù hợp. Hãy thử từ khóa khác.';
      if (page > 1) pagination.append(pageLink('← Trang trước', page - 1, q, 'search-prev'));
      if (data.totalPages) pagination.append(node('span', 'muted', `Trang ${page}/${data.totalPages}`));
      if (page < data.totalPages) pagination.append(pageLink('Trang sau →', page + 1, q, 'search-next'));
    } catch (error) {
      if (current !== generation || error.name === 'AbortError') return;
      feedback.textContent = error.message.startsWith('Từ khóa') ? error.message : 'Không thể tải sản phẩm lúc này. Vui lòng thử lại sau.';
    } finally {
      if (current === generation) {
        form.removeAttribute('aria-busy'); results.removeAttribute('aria-busy');
      }
    }
  }
  function fromUrl() {
    const params = new URLSearchParams(location.search);
    const value = Number(params.get('page') || 1);
    load(params.get('q') || '', Number.isSafeInteger(value) && value > 0 ? value : 1);
  }
  form.addEventListener('submit', event => { event.preventDefault(); load(keyword.value.trim(), 1, true); });
  window.addEventListener('popstate', fromUrl);
  fromUrl();
})();
