const { hashPassword } = require('./password');

function validateRegistration(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const text = key => typeof input[key] === 'string' ? input[key].trim() : '';
  const data = { fullname: text('fullname'), addr: text('addr'), uname: text('uname').toLowerCase() };
  const errors = {};
  if (!data.fullname) errors.fullname = 'Vui lòng nhập họ tên.';
  else if (data.fullname.length > 100) errors.fullname = 'Họ tên tối đa 100 ký tự.';
  if (!data.addr) errors.addr = 'Vui lòng nhập địa chỉ.';
  else if (data.addr.length > 500) errors.addr = 'Địa chỉ tối đa 500 ký tự.';
  if (!data.uname) errors.uname = 'Vui lòng nhập email.';
  else if (data.uname.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(data.uname)) errors.uname = 'Email không hợp lệ.';
  if (typeof input.pwd !== 'string' || !input.pwd.length) errors.pwd = 'Vui lòng nhập mật khẩu.';
  else if (input.pwd.length < 8 || input.pwd.length > 1024) errors.pwd = 'Mật khẩu phải từ 8 đến 1024 ký tự.';
  if (typeof input.password_confirm !== 'string' || !input.password_confirm.length) errors.password_confirm = 'Vui lòng xác nhận mật khẩu.';
  else if (input.password_confirm !== input.pwd) errors.password_confirm = 'Mật khẩu xác nhận không trùng khớp.';
  return { data, errors };
}

function isDuplicate(error) {
  return [error?.number, error?.originalError?.info?.number,
    ...(error?.precedingErrors || []).map(e => e.number)].some(n => n === 2601 || n === 2627);
}

function createRegisterHandler({ usersRepository, passwordHasher = hashPassword }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { data, errors } = validateRegistration(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Vui lòng kiểm tra thông tin đăng ký.', errors });
    const conflict = () => res.status(409).json({ code: 'EMAIL_EXISTS', message: 'Email đã được đăng ký.', errors: { uname: 'Email đã được đăng ký.' } });
    try {
      const users = await usersRepository.open();
      if (await users.emailExists(data.uname)) return conflict();
      const passwordHash = await passwordHasher(req.body.pwd);
      await users.insert({ ...data, passwordHash });
      return res.status(201).json({ code: 'REGISTERED', message: 'Đăng ký tài khoản thành công. Bạn có thể đăng nhập.' });
    } catch (error) {
      if (isDuplicate(error)) return conflict();
      return res.status(500).json({ code: 'REGISTRATION_FAILED', message: 'Không thể đăng ký lúc này. Vui lòng thử lại sau.' });
    }
  };
}

module.exports = { validateRegistration, createRegisterHandler };
