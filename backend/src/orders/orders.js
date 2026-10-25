const express = require('express');
const sql = require('mssql');
const { randomUUID } = require('node:crypto');
class OrderError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
function validate(body) {
  const fail = () => { throw new OrderError(400, 'INVALID_ORDER', 'Kiểm tra mã yêu cầu, người nhận, số điện thoại và địa chỉ giao hàng.'); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail();
  const { requestKey, recipientName, phone, shippingAddress } = body;
  if (typeof requestKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey)) fail();
  for (const [value, max] of [[recipientName, 100], [shippingAddress, 500]]) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail();
  }
  if (typeof phone !== 'string' || !/^0[0-9]{9}$/.test(phone)) fail();
  if (body.paymentMethod !== undefined && body.paymentMethod !== 'COD') fail();
  return { requestKey: requestKey.toLowerCase(), recipientName: recipientName.trim(), phone, shippingAddress: shippingAddress.trim() };
}
const MAX = 999999999999999999n;
function amount(value) {
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/.test(value)) throw new Error('Invalid SQL amount');
  const n = BigInt(value.replace('.', ''));
  if (n > MAX) throw new OrderError(409, 'AMOUNT_LIMIT', 'Tổng tiền vượt giới hạn cho phép.');
  return n;
}
const money = n => `${n / 100n}.${String(n % 100n).padStart(2, '0')}`;
function totalItems(items) {
  let total = 0n;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw new OrderError(409, 'INVALID_CART', 'Số lượng trong giỏ không hợp lệ.');
    total += amount(item.unitPrice) * BigInt(item.quantity);
    if (total > MAX) throw new OrderError(409, 'AMOUNT_LIMIT', 'Tổng tiền vượt giới hạn cho phép.');
  }
  return money(total);
}
function createOrdersRepository(poolProvider, { transactionFactory = pool => new sql.Transaction(pool), codeFactory = () => 'CPS-' + randomUUID() } = {}) {
  return { async place(userId, data) {
    const pool = await poolProvider(), tx = transactionFactory(pool);
    let began = false;
    const query = async (text, values = []) => {
      const req = tx.request();
      for (const [name, type, value] of values) req.input(name, type, value);
      return req.query(text);
    };
    const user = ['userId', sql.Int, userId];
    try {
      await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE); began = true;
      // Same first lock as UC-07: serialize all mutations of this user's cart.
      const carts = await query('SELECT Id AS id FROM dbo.Carts WITH (UPDLOCK,HOLDLOCK) WHERE UserId=@userId', [user]);
      const previous = await query(`SELECT Id AS id, OrderCode AS orderCode, CONVERT(VARCHAR(50),TotalAmount) AS total,
        Status AS status, PaymentMethod AS paymentMethod FROM dbo.Orders WHERE UserId=@userId AND RequestKey=@requestKey`,
      [user, ['requestKey', sql.UniqueIdentifier, data.requestKey]]);
      if (previous.recordset.length) {
        await tx.commit(); began = false;
        return { ...previous.recordset[0], replayed: true, currency: 'VND' };
      }
      const cartId = carts.recordset[0]?.id;
      if (!cartId) throw new OrderError(409, 'EMPTY_CART', 'Giỏ hàng đang trống.');
      const cart = ['cartId', sql.Int, cartId];
      // Cart lock prevents UC-07 changing these rows; product locks follow in ID order.
      const rows = (await query('SELECT Id AS id, ProductId AS productId, Quantity AS quantity FROM dbo.CartItems WHERE CartId=@cartId ORDER BY ProductId', [cart])).recordset;
      if (!rows.length) throw new OrderError(409, 'EMPTY_CART', 'Giỏ hàng đang trống.');
      const items = [];
      for (const row of rows) {
        const products = await query(`SELECT p.Name AS name,p.Sku AS sku,CONVERT(VARCHAR(50),p.Price) AS unitPrice,
          p.Stock AS stock,p.IsActive AS active,c.IsActive AS categoryActive
          FROM dbo.Products p WITH (UPDLOCK,HOLDLOCK) JOIN dbo.Categories c WITH (HOLDLOCK) ON c.Id=p.CategoryId WHERE p.Id=@productId`,
        [['productId', sql.Int, row.productId]]);
        const product = products.recordset[0];
        if (!product || !product.active || !product.categoryActive) throw new OrderError(409, 'PRODUCT_NOT_AVAILABLE', 'Giỏ có sản phẩm đã ngừng kinh doanh.');
        if (product.stock < row.quantity) throw new OrderError(409, 'INSUFFICIENT_STOCK', 'Sản phẩm trong giỏ không đủ tồn kho.');
        items.push({ ...row, ...product });
      }
      const total = totalItems(items);
      const inserted = await query(`INSERT INTO dbo.Orders (UserId,OrderCode,RequestKey,RecipientName,Phone,ShippingAddress,Status,PaymentMethod,TotalAmount)
        OUTPUT INSERTED.Id AS id,INSERTED.OrderCode AS orderCode VALUES (@userId,@code,@requestKey,@name,@phone,@address,'PENDING','COD',CONVERT(DECIMAL(18,2),@total))`,
      [user, ['code', sql.VarChar(40), codeFactory()], ['requestKey', sql.UniqueIdentifier, data.requestKey],
        ['name', sql.NVarChar(100), data.recipientName], ['phone', sql.VarChar(15), data.phone],
        ['address', sql.NVarChar(500), data.shippingAddress], ['total', sql.VarChar(30), total]]);
      const order = inserted.recordset[0];
      for (const item of items) {
        const params = [['productId', sql.Int, item.productId], ['quantity', sql.Int, item.quantity]];
        await query(`INSERT INTO dbo.OrderItems (OrderId,ProductId,ProductName,ProductSku,UnitPrice,Quantity)
          VALUES (@orderId,@productId,@name,@sku,CONVERT(DECIMAL(18,2),@price),@quantity)`,
        [...params, ['orderId', sql.Int, order.id], ['name', sql.NVarChar(200), item.name], ['sku', sql.VarChar(50), item.sku], ['price', sql.VarChar(30), item.unitPrice]]);
        const updated = await query('UPDATE dbo.Products SET Stock=Stock-@quantity,UpdatedAt=SYSUTCDATETIME() WHERE Id=@productId AND Stock>=@quantity', params);
        if (updated.rowsAffected[0] !== 1) throw new OrderError(409, 'INSUFFICIENT_STOCK', 'Tồn kho đã thay đổi. Vui lòng kiểm tra lại giỏ.');
      }
      const removed = await query('DELETE FROM dbo.CartItems WHERE CartId=@cartId', [cart]);
      if (removed.rowsAffected[0] !== items.length) throw new Error('Cart changed');
      const touched = await query('UPDATE dbo.Carts SET UpdatedAt=SYSUTCDATETIME() WHERE Id=@cartId', [cart]);
      if (touched.rowsAffected[0] !== 1) throw new Error('Cart missing');
      await tx.commit(); began = false;
      return { ...order, total, status: 'PENDING', paymentMethod: 'COD', currency: 'VND', replayed: false };
    } catch (error) {
      if (began) await tx.rollback().catch(() => {});
      throw error;
    }
  } };
}
function createOrdersRouter({ auth, repository }) {
  const router = express.Router();
  router.post('/', auth.requireAuth, auth.sameOrigin, express.json({ limit: '8kb' }), async (req, res) => {
    try {
      const result = await repository.place(req.user.id, validate(req.body));
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof OrderError) return res.status(error.status).json({ code: error.code, message: error.message });
      res.status(503).json({ code: 'ORDER_UNAVAILABLE', message: 'Chưa xác định được kết quả đặt hàng. Vui lòng thử lại với cùng mã yêu cầu.' });
    }
  });
  return router;
}
module.exports = { createOrdersRepository, createOrdersRouter, validate, totalItems, OrderError };
