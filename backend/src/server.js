const express = require('express');
const path = require('node:path');
try {
  process.loadEnvFile(path.join(__dirname, '../../.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Không thể đọc cấu hình .env');
}
const { getPool, closePool } = require('./database/pool');
const { createUsersRepository } = require('./auth/users');
const { createRegisterHandler } = require('./auth/register');
const { createProductsRepository, createSearchHandler } = require('./products/search');
const { createProductDetailRepository, createProductDetailHandler } = require('./products/detail');
const { createAuth, createLoginRepository } = require('./auth/login');
const { createCartRepository, createCartRouter } = require('./cart/cart');
const { createOrdersRepository, createOrdersRouter } = require('./orders/orders');
const { createAccountRepository, createAccountRouter } = require('./account/account');
const { createAdminProductsRepository, createAdminProductsRouter } = require('./admin/products');

function createApp({ poolProvider = getPool, usersRepository = createUsersRepository(poolProvider), passwordHasher,
  productsRepository = createProductsRepository(poolProvider),
  productDetailRepository = createProductDetailRepository(poolProvider),
  loginRepository = createLoginRepository(poolProvider), sessions, passwordVerifier,
  cartRepository = createCartRepository(poolProvider), ordersRepository = createOrdersRepository(poolProvider),
  accountRepository = createAccountRepository(poolProvider), adminProductsRepository = createAdminProductsRepository(poolProvider) } = {}) {
const app = express();
if (process.env.TRUST_PROXY_LOOPBACK === 'true') app.set('trust proxy', 'loopback');
const auth = createAuth({ repository: loginRepository, sessions, verifier: passwordVerifier });
app.locals.auth = auth;
app.disable('x-powered-by');
// Dấu nhận diện bản route để phân biệt server đang chạy với tiến trình cũ.
app.use((_req, res, next) => {
  res.set('X-CellphoneS-Backend', 'db-health-v1');
  next();
});
app.get('/api/health', (_req, res) => res.json({ status: 'ok', phase: 'database-connection', database: 'check /api/health/db' }));
app.get('/api/health/db', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const pool = await poolProvider();
    // Không đọc dữ liệu người dùng; không yêu cầu quyền SELECT trên 8 bảng.
    await pool.request().query('SELECT 1 AS connection_ok');
    res.json({ status: 'ok', database: 'connected', message: 'Kết nối cơ sở dữ liệu thành công.' });
  } catch {
    // Không trả error.message, stack, host, login hoặc config của driver.
    res.status(503).json({ status: 'error', database: 'unavailable', message: 'Không thể kết nối hoặc kiểm tra cơ sở dữ liệu. Kiểm tra cấu hình và dịch vụ SQL Server.' });
  }
});
app.post('/api/auth/register', express.json({ limit: '16kb' }), createRegisterHandler({ usersRepository, passwordHasher }));
app.use('/api/auth', auth.router);
app.use('/api/cart', createCartRouter({ auth, repository: cartRepository }));
app.use('/api/orders', createOrdersRouter({ auth, repository: ordersRepository }));
app.use('/api/account', createAccountRouter({ auth, repository: accountRepository }));
app.use('/api/admin', createAdminProductsRouter({ auth, repository: adminProductsRepository }));
app.get('/api/products', createSearchHandler({ productsRepository }));
app.get('/api/products/:id', createProductDetailHandler({ productDetailRepository }));
app.use((error, _req, res, _next) => {
  const invalidBody = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
  res.status(invalidBody ? 400 : 500).json({ code: invalidBody ? 'INVALID_BODY' : 'INTERNAL_ERROR',
    message: invalidBody ? 'Dữ liệu JSON không hợp lệ hoặc quá lớn.' : 'Không thể xử lý yêu cầu.' });
});
app.use('/api', (_req, res) => res.status(501).json({ code: 'NOT_IMPLEMENTED', message: 'API nghiệp vụ chưa được triển khai.' }));
app.use(express.static(path.join(__dirname, '../../frontend')));
return app;
}
const app = createApp();
const port = Number(process.env.PORT || 3000);
if (require.main === module) {
  const server = app.listen(port, () => console.log(`CellphoneS Testing Demo: http://localhost:${port} [db-health-v1, PID ${process.pid}]`));
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? `Không thể khởi động: cổng ${port} đang được dùng. Dừng đúng tiến trình cũ rồi chạy lại.`
      : 'Không thể khởi động HTTP server. Kiểm tra cổng và quyền truy cập.');
    process.exitCode = 1;
  });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => process.exit(1), 20000);
    timer.unref();
    server.close(async () => {
      try { await closePool(); } catch { process.exitCode = 1; }
      clearTimeout(timer);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
module.exports = app;
module.exports.createApp = createApp;
