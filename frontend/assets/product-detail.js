(() => {
  const find = id => document.querySelector(`[data-testid="${id}"]`);
  const detail = find('product-detail');
  if (!detail) return;
  const feedback = find('page-feedback');
  const fallback = 'assets/images/demo-phone-01.svg';
  function setupCart(product) {
    const form = find('add-cart-form');
    if (!form) return;
    const quantity = find('add-cart-quantity'), button = find('detail-add-to-cart');
    const feedback = find('add-cart-form-feedback'), login = find('add-cart-login');
    quantity.max = String(Math.min(99, product.stock));
    quantity.disabled = product.stock < 1; button.disabled = product.stock < 1;
    if (product.stock < 1) { feedback.textContent = 'Sản phẩm hết hàng, chưa thể thêm vào giỏ.'; feedback.dataset.state = 'error'; }
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (button.disabled) return;
      const count = Number(quantity.value);
      if (!Number.isInteger(count) || count < 1 || count > Math.min(99, product.stock)) {
        feedback.textContent = 'Vui lòng nhập số lượng nguyên trong giới hạn tồn kho, tối đa 99.'; feedback.dataset.state = 'error'; return;
      }
      button.disabled = true; form.setAttribute('aria-busy', 'true'); login.hidden = true;
      feedback.textContent = 'Đang thêm vào giỏ...';
      feedback.dataset.state = 'loading';
      try {
        const response = await fetch('/api/cart/items', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: product.id, quantity: count }) });
        const data = await response.json();
        feedback.textContent = data.message || 'Không thể thêm sản phẩm lúc này.';
        feedback.dataset.state = response.ok ? 'success' : 'error';
        login.hidden = response.status !== 401;
      } catch { feedback.textContent = 'Không thể kết nối máy chủ. Vui lòng thử lại.'; feedback.dataset.state = 'error'; }
      finally { button.disabled = false; form.removeAttribute('aria-busy'); }
    });
  }
  function safeImage(value) {
    try {
      if (typeof value !== 'string' || !value.trim()) return fallback;
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : fallback;
    } catch { return fallback; }
  }
  const ids = new URLSearchParams(location.search).getAll('id');
  detail.hidden = true;
  if (ids.length !== 1 || !/^[1-9]\d*$/.test(ids[0]) || Number(ids[0]) > 2147483647) {
    feedback.textContent = 'Mã sản phẩm không hợp lệ. Vui lòng chọn sản phẩm từ trang tìm kiếm.';
    feedback.dataset.state = 'invalid';
    return;
  }
  async function load() {
    detail.setAttribute('aria-busy', 'true');
    feedback.textContent = 'Đang tải thông tin sản phẩm...';
    feedback.dataset.state = 'loading';
    try {
      const response = await fetch(`/api/products/${ids[0]}`);
      if (!response.ok) {
        feedback.dataset.state = response.status === 404 ? 'not-found' : 'error';
        feedback.textContent = response.status === 404 ? 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh.' : 'Không thể tải thông tin sản phẩm lúc này. Vui lòng thử lại sau.';
        return;
      }
      const { product } = await response.json();
      find('product-name').textContent = product.name;
      find('product-price').textContent = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(product.price));
      find('product-category').textContent = product.category;
      find('product-sku').textContent = product.sku;
      find('product-description').textContent = product.description || 'Chưa có mô tả sản phẩm.';
      find('product-stock').textContent = `Tồn kho: ${product.stock} sản phẩm`;
      const status = find('product-availability');
      status.textContent = product.stock > 0 ? 'Còn hàng' : 'Tạm hết hàng';
      status.dataset.state = product.stock > 0 ? 'in-stock' : 'out-of-stock';
      const gallery = find('product-images');
      const images = product.images.length ? product.images : [{ url: fallback, alt: product.name }];
      gallery.replaceChildren(...images.map((image, index) => {
        const img = document.createElement('img');
        img.src = safeImage(image.url); img.alt = image.alt || product.name;
        img.width = 480; img.height = 460;
        img.dataset.testid = index === 0 ? 'product-image' : `product-image-${image.id || index}`;
        img.addEventListener('error', () => { img.src = fallback; }, { once: true });
        return img;
      }));
      detail.dataset.productId = String(product.id);
      document.title = `${product.name} | CellphoneS Testing Demo`;
      detail.hidden = false;
      setupCart(product);
      feedback.dataset.state = 'success';
      feedback.textContent = 'Đã tải thông tin sản phẩm.';
    } catch {
      detail.hidden = true;
      feedback.dataset.state = 'error';
      feedback.textContent = 'Không thể tải thông tin sản phẩm lúc này. Vui lòng thử lại sau.';
    } finally { detail.removeAttribute('aria-busy'); }
  }
  load();
})();
