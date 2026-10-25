const message = 'Chức năng đang ở giai đoạn giao diện khung. Chưa gửi API và chưa lưu dữ liệu.';
const registerForm = document.querySelector('[data-testid="register-form"]');
if (registerForm) {
  const feedback = registerForm.querySelector('[data-testid="register-form-feedback"]');
  const submit = registerForm.querySelector('[data-testid="register-submit"]');
  let redirectPending = false;
  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    registerForm.setAttribute('aria-busy', 'true');
    feedback.textContent = 'Đang đăng ký...';
    registerForm.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(registerForm)))
      });
      const result = await response.json();
      const errors = result.errors || {};
      feedback.textContent = Object.values(errors).join(' ') || result.message || 'Không thể đăng ký lúc này.';
      Object.keys(errors).forEach(name => {
        const input = registerForm.elements.namedItem(name);
        if (input) input.setAttribute('aria-invalid', 'true');
      });
      if (response.status === 201) {
        registerForm.reset();
        redirectPending = true;
        setTimeout(() => location.assign('/login.html'), 1000);
      } else {
        registerForm.querySelector('[aria-invalid="true"]')?.focus();
      }
    } catch {
      feedback.textContent = 'Không thể kết nối máy chủ. Vui lòng thử lại.';
    } finally {
      submit.disabled = redirectPending;
      registerForm.removeAttribute('aria-busy');
    }
  });
}
document.querySelectorAll('form[data-skeleton]').forEach(form => {
  form.addEventListener('submit', event => { event.preventDefault(); form.querySelector('[role="status"]').textContent = message; });
});
document.querySelectorAll('button[type="button"]').forEach(button => {
  button.addEventListener('click', () => { document.querySelector('[data-testid="page-feedback"]').textContent = message; });
});
