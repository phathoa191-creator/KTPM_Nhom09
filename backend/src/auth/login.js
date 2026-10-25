const express = require('express');
const sql = require('mssql');
const { randomBytes, createHash } = require('node:crypto');
const { verifyPassword } = require('./password');
const COOKIE = 'cellphones.sid';
const TTL = 8 * 60 * 60 * 1000;
const dummyHash = '$argon2id$v=19$m=65536,t=3,p=1$' + Buffer.alloc(16).toString('base64').replace(/=+$/, '') + '$' + Buffer.alloc(32).toString('base64').replace(/=+$/, '');

function createLoginRepository(poolProvider) {
  const read = async (parameter, type, value, predicate, includeHash) => {
    const pool = await poolProvider();
    const result = await pool.request().input(parameter, type, value).query(`
      SELECT Id AS id, FullName AS fullname, Email AS email, Role AS role, IsActive AS active
        ${includeHash ? ', PasswordHash AS passwordHash' : ''}
      FROM dbo.Users WHERE ${predicate}`);
    return result.recordset[0] || null;
  };
  return {
    findByEmail: email => read('email', sql.NVarChar(254), email, 'Email=@email', true),
    findById: id => read('id', sql.Int, id, 'Id=@id', false)
  };
}

function createSessionStore({ now = Date.now, ttl = TTL } = {}) {
  const entries = new Map();
  const key = token => createHash('sha256').update(token).digest('hex');
  function prune() { for (const [id, value] of entries) if (value.expires <= now()) entries.delete(id); }
  return {
    create(userId) {
      prune();
      if (entries.size >= 10000) throw new Error('Session capacity reached');
      const token = randomBytes(32).toString('base64url');
      entries.set(key(token), { userId, expires: now() + ttl });
      return token;
    },
    get(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const entry = entries.get(key(token));
      if (!entry || entry.expires <= now()) { entries.delete(key(token)); return null; }
      return entry;
    },
    delete(token) { if (typeof token === 'string') entries.delete(key(token)); }
  };
}

function cookieToken(req) {
  const values = (req.headers.cookie || '').split(';').map(item => item.trim()).filter(item => item.startsWith(COOKIE + '='));
  return values.length === 1 ? values[0].slice(COOKIE.length + 1) : '';
}
const publicUser = user => ({ id: user.id, fullname: user.fullname, email: user.email, role: user.role });
const allowedUser = user => user?.active && ['CUSTOMER', 'ADMIN'].includes(user.role);

function createAuth({ repository, sessions = createSessionStore(), verifier = verifyPassword } = {}) {
  const router = express.Router();
  const attempts = new Map();
  const options = req => ({ httpOnly: true, sameSite: 'strict', secure: req.secure || process.env.NODE_ENV === 'production', path: '/' });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  function sameOrigin(req, res, next) {
    const origin = req.get('origin');
    if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Yêu cầu không được phép.' });
    }
    next();
  }
  async function resolve(req) {
    const token = cookieToken(req), session = sessions.get(token);
    if (!session) return null;
    const user = await repository.findById(session.userId);
    if (!allowedUser(user)) { sessions.delete(token); return null; }
    return publicUser(user);
  }
  async function requireAuth(req, res, next) {
    res.set('Cache-Control', 'no-store');
    try {
      req.user = await resolve(req);
      if (!req.user) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Vui lòng đăng nhập.' });
      next();
    } catch { res.status(503).json({ code: 'AUTH_UNAVAILABLE', message: 'Không thể kiểm tra đăng nhập lúc này.' }); }
  }
  const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Vui lòng đăng nhập.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ code: 'FORBIDDEN', message: 'Bạn không có quyền truy cập.' });
    next();
  };
  router.post('/login', sameOrigin, express.json({ limit: '16kb' }), async (req, res) => {
    const email = typeof req.body?.uname === 'string' ? req.body.uname.trim().toLowerCase() : '';
    const password = req.body?.pwd;
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
        typeof password !== 'string' || !password.length || password.length > 1024) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Vui lòng nhập email hợp lệ và mật khẩu.' });
    }
    const now = Date.now();
    for (const [ip, value] of attempts) if (value.expires <= now) attempts.delete(ip);
    const attempt = attempts.get(req.ip) || { count: 0, expires: now + 15 * 60 * 1000 };
    if (attempt.count >= 20 || (!attempts.has(req.ip) && attempts.size >= 10000)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((attempt.expires - now) / 1000))));
      return res.status(429).json({ code: 'TOO_MANY_ATTEMPTS', message: 'Bạn thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.' });
    }
    attempt.count++; attempts.set(req.ip, attempt);
    try {
      const user = await repository.findByEmail(email);
      const matches = await verifier(user?.passwordHash || dummyHash, password);
      if (!matches || !allowedUser(user)) return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng, hoặc tài khoản không thể đăng nhập.' });
      const token = sessions.create(user.id);
      sessions.delete(cookieToken(req));
      res.cookie(COOKIE, token, { ...options(req), maxAge: TTL });
      return res.json({ authenticated: true, user: publicUser(user), message: 'Đăng nhập thành công.' });
    } catch { return res.status(503).json({ code: 'AUTH_UNAVAILABLE', message: 'Không thể đăng nhập lúc này. Vui lòng thử lại sau.' }); }
  });
  router.post('/logout', sameOrigin, (req, res) => {
    sessions.delete(cookieToken(req));
    res.clearCookie(COOKIE, options(req));
    res.json({ authenticated: false, user: null, message: 'Đã đăng xuất.' });
  });
  router.get('/me', async (req, res) => {
    try {
      const user = await resolve(req);
      res.json({ authenticated: Boolean(user), user });
    } catch { res.status(503).json({ code: 'AUTH_UNAVAILABLE', message: 'Không thể kiểm tra đăng nhập lúc này.' }); }
  });
  return { router, requireAuth, requireRole, sameOrigin };
}

module.exports = { createAuth, createLoginRepository, createSessionStore };
