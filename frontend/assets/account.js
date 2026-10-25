(() => {
  const find = id => document.querySelector(`[data-testid="${id}"]`);
  const form = find('account-form'); if (!form) return;
  const feedback = find('account-form-feedback'), page = find('page-feedback'), save = find('account-save');
  const inputs = { fullName: find('account-name'), phone: find('account-phone'), address: find('account-address') };
  let generation = 0, busy = false, loaded = false;
  function clear() {
    loaded = false; form.hidden = true; form.reset(); find('account-email').value = '';
    feedback.textContent = ''; save.disabled = true;
    for (const key of Object.keys(inputs)) { find(`account-${key}-error`).textContent = ''; inputs[key].removeAttribute('aria-invalid'); }
  }
  function show(profile) {
    for (const key of Object.keys(inputs)) inputs[key].value = profile[key] ?? '';
    find('account-email').value = profile.email;
    form.hidden = false; loaded = true; save.disabled = busy;
  }
  async function load() {
    const current = ++generation; clear(); page.textContent = 'Đang tải thông tin tài khoản...';
    try {
      const response = await fetch('/api/account', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json(); if (current !== generation) return;
      find('account-login').hidden = response.status !== 401;
      if (!response.ok) { page.textContent = data.message || 'Không thể tải thông tin tài khoản.'; return; }
      show(data); page.textContent = 'Đã tải thông tin tài khoản.';
    } catch { if (current === generation) page.textContent = 'Không thể kết nối máy chủ. Vui lòng tải lại trang.'; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !loaded) return;
    busy = true; save.disabled = true; const current = generation;
    feedback.textContent = 'Đang lưu thông tin...';
    for (const key of Object.keys(inputs)) { find(`account-${key}-error`).textContent = ''; inputs[key].removeAttribute('aria-invalid'); }
    try {
      const response = await fetch('/api/account', { method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]))) });
      const data = await response.json(); if (current !== generation) return;
      if (response.status === 401) { await load(); return; }
      if (!response.ok) {
        feedback.textContent = data.message || 'Không thể lưu thông tin tài khoản.';
        for (const key of Object.keys(inputs)) if (data.errors?.[key]) {
          find(`account-${key}-error`).textContent = data.errors[key]; inputs[key].setAttribute('aria-invalid', 'true');
        }
        return;
      }
      show(data); feedback.textContent = 'Đã lưu thông tin tài khoản.';
      // Auth re-reads the current session, rather than trusting a name from an event payload.
      document.dispatchEvent(new CustomEvent('account-profile-updated'));
    } catch { if (current === generation) feedback.textContent = 'Không thể kết nối máy chủ. Vui lòng thử lại.'; }
    finally { busy = false; save.disabled = !loaded; }
  });
  document.addEventListener('auth-state-changed', () => { load(); });
  window.addEventListener('pageshow', () => { load(); });
  window.addEventListener('focus', () => { load(); });
  load();
})();
