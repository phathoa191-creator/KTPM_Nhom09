(() => {
  const find = id => document.querySelector(`[data-testid="${id}"]`);
  const form = find('checkout-form'); if (!form) return;
  const panel = find('checkout-panel'), rows = find('checkout-items'), feedback = find('checkout-form-feedback');
  const page = find('page-feedback'), success = find('checkout-success'), submit = find('checkout-submit');
  let version = 0, owner, pending, busy = false, completed = false;
  const storageKey = 'cellphones.checkout.pending';
  const savePending = () => { try { if (pending) sessionStorage.setItem(storageKey, JSON.stringify({ owner, body: pending })); else sessionStorage.removeItem(storageKey); } catch {} };
  const recoverPending = () => { try { const value = JSON.parse(sessionStorage.getItem(storageKey)); return value?.owner === owner && typeof value.body?.requestKey === 'string' ? value.body : undefined; } catch { return undefined; } };
  const format = value => { const [a,b] = String(value).split('.'); return a.replace(/\B(?=(\d{3})+(?!\d))/g,'.') + (b === '00' ? '' : ','+b) + ' ₫'; };
  function clear() {
    panel.hidden = true; form.hidden = true; success.hidden = true; success.textContent = '';
    rows.replaceChildren(); find('cart-total').textContent = ''; feedback.textContent = '';
  }
  async function load() {
    const current = ++version; clear(); submit.disabled = true;
    try {
      const auth = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!auth.ok) throw new Error();
      const session = await auth.json(); if (current !== version) return;
      const nextOwner = session.user?.id;
      if (nextOwner !== owner) { const initial = owner === undefined; owner = nextOwner; pending = initial && owner ? recoverPending() : undefined; if (!pending) savePending(); completed = false; form.reset(); for (const id of ['checkout-recipient','checkout-phone','checkout-address']) find(id).disabled = false; }
      find('checkout-login').hidden = Boolean(owner);
      if (!owner) { page.textContent = 'Vui lòng đăng nhập để đặt hàng.'; return; }
      if (completed) { page.textContent = 'Đơn hàng đã được tạo. Quay lại giỏ để bắt đầu đơn mới.'; return; }
      const response = await fetch('/api/cart', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error();
      const cart = await response.json(); if (current !== version) return;
      for (const item of cart.items) {
        const row = document.createElement('tr'); row.dataset.testid = `cart-item-${item.sku}`;
        for (const value of [item.name,format(item.unitPrice),String(item.quantity),format(item.lineTotal)]) {
          const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        }
        rows.append(row);
      }
      find('cart-total').textContent = 'Tổng tiền tạm tính: ' + format(cart.total);
      panel.hidden = !cart.items.length;
      // An uncertain request can be replayed even after the committed order emptied the cart.
      form.hidden = !cart.items.length && !pending;
      submit.disabled = busy || (!pending && (!cart.items.length || cart.hasUnavailableItems));
      page.textContent = pending ? 'Có yêu cầu chưa xác định kết quả. Thử lại để kiểm tra cùng mã yêu cầu.' :
        !cart.items.length ? 'Giỏ hàng đang trống.' : cart.hasUnavailableItems ? 'Giỏ có sản phẩm không thể đặt. Vui lòng kiểm tra lại.' : 'Vui lòng nhập thông tin nhận hàng.';
    } catch { if (current === version) page.textContent = 'Không thể tải dữ liệu. Vui lòng tải lại trang.'; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || submit.disabled || completed) return;
    if (!pending) {
      const recipientName = find('checkout-recipient').value.trim(), phone = find('checkout-phone').value,
        shippingAddress = find('checkout-address').value.trim();
      if (!recipientName || recipientName.length > 100 || !/^0[0-9]{9}$/.test(phone) || !shippingAddress || shippingAddress.length > 500 || /[\u0000-\u001f\u007f]/u.test(recipientName + shippingAddress)) {
        feedback.textContent = 'Nhập người nhận, địa chỉ hợp lệ và số điện thoại 10 chữ số bắt đầu bằng 0.'; return;
      }
      pending = { requestKey: crypto.randomUUID(), recipientName, phone, shippingAddress }; savePending();
    }
    busy = true; submit.disabled = true; const current = version;
    for (const id of ['checkout-recipient','checkout-phone','checkout-address']) find(id).disabled = true;
    feedback.textContent = 'Đang xác nhận đơn hàng...';
    try {
      const response = await fetch('/api/orders', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending) });
      const data = await response.json(); if (current !== version) return;
      if (response.ok) {
        completed = true; pending = undefined; savePending(); clear(); form.reset();
        success.textContent = `Đặt hàng thành công. Mã đơn: ${data.orderCode}. Tổng tiền: ${format(data.total)}. Thanh toán COD.`;
        success.hidden = false; page.textContent = 'Đã tạo đơn hàng.';
      } else if (response.status === 401) { await load(); }
      else {
        // Keep key/body on any ambiguous server response; edit only after definitive validation/conflict.
        if ([400,403,409].includes(response.status)) { pending = undefined; savePending(); }
        feedback.textContent = data.message || 'Chưa xác định kết quả. Vui lòng thử lại cùng yêu cầu.';
      }
    } catch { if (current === version) feedback.textContent = 'Mất kết nối. Nhấn xác nhận để thử lại cùng mã yêu cầu.'; }
    finally {
      busy = false;
      if (current !== version) await load();
      if (current === version) {
        submit.disabled = completed;
        for (const id of ['checkout-recipient','checkout-phone','checkout-address']) find(id).disabled = Boolean(pending);
      }
    }
  });
  document.addEventListener('auth-state-changed', () => { load(); });
  window.addEventListener('pageshow', () => { load(); });
  window.addEventListener('focus', () => { load(); });
  load();
})();
