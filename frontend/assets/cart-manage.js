(() => {
  const find = id => document.querySelector(`[data-testid="${id}"]`);
  const rows = find('cart-item-rows'); if (!rows) return;
  const panel = find('cart-panel'), empty = find('cart-empty'), login = find('cart-login'), feedback = find('page-feedback');
  let generation = 0, busy = false, uncertain = false, controls = [];
  const format = value => {
    const [whole, fraction = '00'] = String(value).split('.');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fraction === '00' ? '' : ',' + fraction) + ' ₫';
  };
  function node(tag, text, testid) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (testid) element.dataset.testid = testid;
    return element;
  }
  function imageUrl(value) {
    try { const url = new URL(value || 'assets/images/demo-phone-01.svg', location.href);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch {}
    return 'assets/images/demo-phone-01.svg';
  }
  function lock() { for (const control of controls) control.disabled = busy || uncertain; }
  async function mutate(item, method, input) {
    if (busy || uncertain) return;
    const quantity = Number(input.value);
    if (method === 'PATCH' && (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)) {
      feedback.textContent = 'Số lượng phải là số nguyên từ 1 đến 99.'; return;
    }
    if (method === 'DELETE' && !window.confirm(`Xóa ${item.name} khỏi giỏ hàng?`)) return;
    const current = generation; busy = true; lock(); feedback.textContent = 'Đang cập nhật giỏ hàng...';
    try {
      const response = await fetch(`/api/cart/items/${item.productId}`, {
        method, credentials: 'same-origin', cache: 'no-store',
        ...(method === 'PATCH' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity }) } : {})
      });
      const data = await response.json(); if (current !== generation) return;
      if (response.ok) { await load(); if (generation === current + 1) feedback.textContent = data.message; }
      else if (response.status === 401) { await load(); }
      else if (response.status >= 500) { uncertain = true; feedback.textContent = 'Chưa xác định kết quả. Hãy tải lại giỏ trước khi thao tác tiếp.'; }
      else { feedback.textContent = data.message || 'Không thể thay đổi giỏ hàng. Vui lòng tải lại giỏ.'; }
    } catch { if (current === generation) { uncertain = true; feedback.textContent = 'Mất kết nối, chưa xác định kết quả. Hãy tải lại giỏ trước khi thao tác tiếp.'; } }
    finally { busy = false; lock(); }
  }
  function row(item) {
    const tr = node('tr', undefined, `cart-item-${item.sku}`); tr.dataset.productId = String(item.productId);
    const cell = node('td'), content = node('div'); content.className = 'cart-product';
    const image = node('img'); image.src = imageUrl(item.imageUrl); image.alt = item.imageAlt || item.name; image.width = 72; image.height = 80;
    image.addEventListener('error', () => { image.src = 'assets/images/demo-phone-01.svg'; }, { once: true });
    const info = node('div'); info.append(node('strong', item.name), node('small', `SKU: ${item.sku}`));
    const states = { available: 'Còn hàng', discontinued: 'Đã ngừng kinh doanh', out_of_stock: 'Đã hết hàng', insufficient_stock: 'Số lượng vượt tồn kho' };
    info.append(node('small', states[item.availability])); content.append(image, info); cell.append(content);
    const quantityCell = node('td'), input = node('input', undefined, `manage-cart-quantity-${item.sku}`);
    input.type = 'number'; input.min = '1'; input.max = '99'; input.step = '1'; input.value = String(item.quantity);
    input.setAttribute('aria-label', `Số lượng ${item.name}`); quantityCell.append(input);
    const actions = node('td'), update = node('button', 'Cập nhật', `manage-cart-update-${item.sku}`), remove = node('button', 'Xóa', `manage-cart-remove-${item.sku}`);
    update.type = 'button'; remove.type = 'button';
    update.addEventListener('click', event => { event.preventDefault(); mutate(item, 'PATCH', input); });
    remove.addEventListener('click', event => { event.preventDefault(); mutate(item, 'DELETE', input); });
    controls.push(input, update, remove); actions.append(update, remove);
    tr.append(cell, node('td', format(item.unitPrice)), quantityCell, node('td', format(item.lineTotal)), actions);
    return tr;
  }
  async function load() {
    const current = ++generation; panel.hidden = true; empty.hidden = true; login.hidden = true;
    rows.replaceChildren(); controls = []; find('cart-total').textContent = ''; find('cart-count').textContent = '';
    feedback.textContent = 'Đang tải giỏ hàng...';
    try {
      const response = await fetch('/api/cart', { credentials: 'same-origin', cache: 'no-store' });
      const cart = await response.json(); if (current !== generation) return;
      if (!response.ok) { login.hidden = response.status !== 401; feedback.textContent = response.status === 401 ? 'Vui lòng đăng nhập để quản lý giỏ hàng.' : 'Không thể tải giỏ hàng. Vui lòng thử lại.'; return; }
      uncertain = false; rows.replaceChildren(...cart.items.map(row)); lock();
      find('cart-total').textContent = `Tổng tiền tạm tính: ${format(cart.total)}`;
      find('cart-count').textContent = `${cart.totalQuantity} sản phẩm`;
      find('cart-warning').hidden = !cart.hasUnavailableItems;
      panel.hidden = !cart.items.length; empty.hidden = Boolean(cart.items.length);
      feedback.textContent = cart.items.length ? 'Đã tải giỏ hàng.' : 'Giỏ hàng của bạn đang trống.';
    } catch { if (current === generation) feedback.textContent = 'Không thể tải giỏ hàng. Vui lòng thử lại.'; }
  }
  document.addEventListener('auth-state-changed', () => { load(); });
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  window.addEventListener('focus', () => { if (!busy) load(); });
  load();
})();
