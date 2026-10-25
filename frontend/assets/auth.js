(() => {
  const find = id => document.querySelector(`[data-testid="${id}"]`);
  const inAdmin = location.pathname.includes('/admin/');
  const prefix = inAdmin ? '../' : '';
  const header = document.querySelector('.header-links');
  let pendingLogout = false;
  let navVersion = 0;
  const loginForm = find('login-form');
  let redirectPending = false;
  const protectedPages = ['/cart.html', '/cart-manage.html', '/checkout.html', '/account.html', '/admin/products.html'];
  function destination(user) {
    const target = new URL(location.href).searchParams.get('returnTo');
    // Exact internal page allowlist excludes login/register, external URLs and URL credentials/query secrets.
    return protectedPages.includes(target) && (target !== '/admin/products.html' || user.role === 'ADMIN') ? target : '/index.html';
  }
  function element(tag, text, testid) {
    const item = document.createElement(tag);
    item.textContent = text; item.dataset.testid = testid;
    return item;
  }
  function updateNav(user) {
    navVersion++;
    document.dispatchEvent?.(new CustomEvent('auth-state-changed', { detail: { authenticated: Boolean(user) } }));
    if (!user && protectedPages.includes(location.pathname)) {
      for (const link of document.querySelectorAll?.('a[href]') || []) {
        const url = new URL(link.href, location.href);
        if (url.origin === new URL(location.href).origin && url.pathname === '/login.html') link.href = '/login.html?returnTo=' + encodeURIComponent(location.pathname);
      }
    }
    if (!header) return;
    for (const link of header.querySelectorAll('a')) {
      if (/\/(login|register)\.html$/.test(new URL(link.href, location.href).pathname)) link.hidden = Boolean(user);
    }
    header.querySelector('[data-testid="auth-session"]')?.remove();
    const session = element('span', '', 'auth-session');
    session.className = 'auth-session';
    if (user) {
      const account = element('a', `${user.fullname} (${user.role})`, 'auth-account');
      account.href = prefix + 'account.html';
      const logout = element('button', 'Đăng xuất', 'auth-logout');
      logout.type = 'button';
      logout.addEventListener('click', async () => {
        if (pendingLogout) return;
        pendingLogout = true; logout.disabled = true;
        try {
          const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
          if (!response.ok) throw new Error();
          updateNav(null);
          const feedback = find('page-feedback') || find('login-form-feedback');
          if (feedback) feedback.textContent = 'Đã đăng xuất.';
        } catch { logout.textContent = 'Thử đăng xuất lại'; logout.disabled = false; }
        finally { pendingLogout = false; }
      });
      session.append(account, logout);
    } else session.textContent = 'Chưa đăng nhập';
    header.append(session);
  }
  async function refresh() {
    const version = navVersion;
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json(); if (version === navVersion) updateNav(data.user);
    } catch {
      if (header && !find('auth-session')) header.append(element('span', 'Chưa thể kiểm tra đăng nhập', 'auth-session'));
    }
  }
  if (loginForm) {
    const submit = find('login-submit'), feedback = find('login-form-feedback');
    loginForm.addEventListener('submit', async event => {
      event.preventDefault(); if (submit.disabled) return;
      submit.disabled = true; loginForm.setAttribute('aria-busy', 'true');
      feedback.textContent = 'Đang đăng nhập...';
      try {
        const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uname: find('login-email').value, pwd: find('login-password').value }) });
        const data = await response.json();
        feedback.textContent = data.message || 'Không thể đăng nhập lúc này.';
        feedback.dataset.state = response.ok ? 'success' : 'error';
        find('login-password').value = '';
        if (response.ok && data.authenticated === true && data.user) {
          const sessionResponse = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
          const session = await sessionResponse.json();
          if (!sessionResponse.ok || session.authenticated !== true || !session.user || session.user.id !== data.user.id) throw new Error('Session unavailable');
          updateNav(session.user);
          redirectPending = true;
          location.assign(destination(session.user));
        } else if (response.ok) {
          feedback.textContent = 'Không thể xác nhận đăng nhập. Vui lòng thử lại.';
          feedback.dataset.state = 'error';
        }
      } catch { feedback.textContent = 'Không thể kết nối máy chủ. Vui lòng thử lại.'; feedback.dataset.state = 'error'; }
      finally { submit.disabled = redirectPending; loginForm.removeAttribute('aria-busy'); }
    });
  }
  window.addEventListener('pageshow', refresh);
  document.addEventListener('account-profile-updated', refresh);
})();
