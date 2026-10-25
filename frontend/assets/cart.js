(() => {
  const find = id => document.querySelector(`[data-testid="${id}"]`);
  const rows = find('cart-item-rows');
  if (!rows) return;
  const panel = find('cart-panel'), empty = find('cart-empty'), feedback = find('page-feedback');
  const login = find('cart-login');
  let generation = 0;
  const format = amount => {
    const [whole, fraction = '00'] = String(amount).split('.');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fraction === '00' ? '' : ',' + fraction) + ' ₫';
  };
  function node(tag, text, testid) {
    const value = document.createElement(tag);
    if (text !== undefined) value.textContent = text;
    if (testid) value.dataset.testid = testid;
    return value;
  }
  function imageUrl(value) {
    try {
      if (!value) return 'assets/images/demo-phone-01.svg';
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : 'assets/images/demo-phone-01.svg';
    } catch { return 'assets/images/demo-phone-01.svg'; }
  }
  function row(item) {
    const tr = node('tr', undefined, `cart-item-${item.sku}`); tr.dataset.productId = String(item.productId);
    const cell = node('td'), content = node('div'); content.className = 'cart-product';
    const image = node('img'); image.src = imageUrl(item.imageUrl); image.alt = item.imageAlt || item.name;
    image.width = 72; image.height = 80;
    image.addEventListener('error', () => { image.src = 'assets/images/demo-phone-01.svg'; }, { once: true });
    const info = node('div');
    const name = node(item.availability === 'discontinued' ? 'strong' : 'a', item.name, 'cart-item-name');
    if (item.availability !== 'discontinued') name.href = `product-detail.html?id=${item.productId}`;
    const states = { available: 'Còn hàng', out_of_stock: 'Đã hết hàng', insufficient_stock: 'Số lượng trong giỏ vượt tồn kho', discontinued: 'Đã ngừng kinh doanh' };
    const state = node('small', states[item.availability], 'cart-item-status'); state.dataset.state = item.availability;
    info.append(name, node('small', `SKU: ${item.sku}`), state); content.append(image, info); cell.append(content);
    tr.append(cell, node('td', format(item.unitPrice), 'cart-item-price'),
      node('td', String(item.quantity), 'cart-item-quantity'), node('td', format(item.lineTotal), 'cart-item-subtotal'));
    return tr;
  }
  async function load() {
    const current = ++generation;
    panel.hidden = true; empty.hidden = true; login.hidden = true; rows.replaceChildren();
    feedback.textContent = 'Đang tải giỏ hàng...'; feedback.dataset.state = 'loading';
    try {
      const response = await fetch('/api/cart', { credentials: 'same-origin', cache: 'no-store' });
      if (current !== generation) return;
      if (!response.ok) {
        login.hidden = response.status !== 401;
        feedback.textContent = response.status === 401 ? 'Vui lòng đăng nhập để xem giỏ hàng.' : 'Không thể tải giỏ hàng lúc này. Vui lòng thử lại.';
        feedback.dataset.state = response.status === 401 ? 'auth-required' : 'error'; return;
      }
      const cart = await response.json(); if (current !== generation) return;
      rows.replaceChildren(...cart.items.map(row));
      find('cart-total').textContent = `Tổng tiền tạm tính: ${format(cart.total)}`;
      find('cart-count').textContent = `${cart.totalQuantity} sản phẩm`;
      find('cart-warning').hidden = !cart.hasUnavailableItems;
      empty.hidden = cart.items.length !== 0; panel.hidden = cart.items.length === 0;
      feedback.textContent = cart.items.length ? 'Đã tải giỏ hàng.' : 'Giỏ hàng của bạn đang trống.';
      feedback.dataset.state = 'success';
    } catch {
      if (current !== generation) return;
      panel.hidden = true; feedback.textContent = 'Không thể tải giỏ hàng lúc này. Vui lòng thử lại.'; feedback.dataset.state = 'error';
    }
  }
  document.addEventListener('auth-state-changed', load);
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  window.addEventListener('focus', load);
  load();
})();
