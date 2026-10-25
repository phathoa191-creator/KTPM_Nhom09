const express = require('express');
const sql = require('mssql');
class AccountError extends Error {
  constructor(errors) { super('Thông tin tài khoản không hợp lệ.'); this.errors = errors; }
}
function validatePatch(body) {
  const errors = {}, values = {};
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) {
    throw new AccountError({ form: 'Vui lòng gửi ít nhất một trường cần cập nhật.' });
  }
  for (const key of Object.keys(body)) {
    const value = body[key];
    if (!['fullName', 'phone', 'address'].includes(key)) {
      errors.form = 'Chỉ được cập nhật họ tên, số điện thoại và địa chỉ.';
    } else if (key === 'fullName') {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) errors.fullName = 'Họ tên phải có từ 1 đến 100 đơn vị UTF-16 sau khi bỏ khoảng trắng hai đầu.';
      else values.fullName = value.trim();
    } else if (key === 'phone') {
      // Empty input clears the optional phone; nonempty phone must match the SQL CHECK exactly.
      if (value === null || value === '') values.phone = null;
      else if (typeof value !== 'string' || !/^0[0-9]{9}$/.test(value)) errors.phone = 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0.';
      else values.phone = value;
    } else {
      if (value === null) values.address = null;
      else if (typeof value !== 'string' || value.length > 500) errors.address = 'Địa chỉ tối đa 500 đơn vị UTF-16.';
      else values.address = value.trim() || null;
    }
  }
  if (Object.keys(errors).length) throw new AccountError(errors);
  return values;
}
const fields = { fullName: ['FullName', sql.NVarChar(100)], phone: ['Phone', sql.VarChar(15)], address: ['Address', sql.NVarChar(500)] };
const projection = 'FullName AS fullName, Email AS email, Phone AS phone, Address AS address';
function createAccountRepository(poolProvider) {
  return {
    async read(userId) {
      const pool = await poolProvider();
      const result = await pool.request().input('userId', sql.Int, userId)
        .query(`SELECT ${projection} FROM dbo.Users WHERE Id=@userId AND IsActive=1`);
      return result.recordset[0] || null;
    },
    async update(userId, values) {
      const pool = await poolProvider(), request = pool.request().input('userId', sql.Int, userId);
      const assignments = Object.keys(values).map(key => {
        const [column, type] = fields[key]; request.input(key, type, values[key]);
        return `${column}=@${key}`;
      });
      const result = await request.query(`UPDATE dbo.Users SET ${assignments.join(',')},UpdatedAt=SYSUTCDATETIME()
        OUTPUT INSERTED.FullName AS fullName,INSERTED.Email AS email,INSERTED.Phone AS phone,INSERTED.Address AS address
        WHERE Id=@userId AND IsActive=1`);
      if (result.rowsAffected[0] !== 1) return null;
      return result.recordset[0];
    }
  };
}
const publicProfile = row => ({ fullName: row.fullName, email: row.email, phone: row.phone, address: row.address });
function createAccountRouter({ auth, repository }) {
  const router = express.Router();
  router.use(auth.requireAuth);
  const failure = (res, error) => {
    if (error instanceof AccountError) return res.status(400).json({ code: 'VALIDATION_ERROR', message: error.message, errors: error.errors });
    return res.status(503).json({ code: 'ACCOUNT_UNAVAILABLE', message: 'Không thể xử lý thông tin tài khoản lúc này. Vui lòng thử lại.' });
  };
  const respond = (res, row) => row ? res.json(publicProfile(row)) : res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Vui lòng đăng nhập lại.' });
  router.get('/', async (req, res) => {
    try { respond(res, await repository.read(req.user.id)); } catch (error) { failure(res, error); }
  });
  router.patch('/', auth.sameOrigin, express.json({ limit: '8kb' }), async (req, res) => {
    try { respond(res, await repository.update(req.user.id, validatePatch(req.body))); } catch (error) { failure(res, error); }
  });
  return router;
}
module.exports = { createAccountRepository, createAccountRouter, validatePatch, AccountError };
