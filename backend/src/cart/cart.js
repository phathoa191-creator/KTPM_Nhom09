const express = require('express');
const sql = require('mssql');

class CartError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function checkAddition(product, current, quantity) {
  if (!product || !product.active || !product.categoryActive) throw new CartError(404, 'PRODUCT_NOT_AVAILABLE', 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh.');
  if (product.stock < 1) throw new CartError(409, 'OUT_OF_STOCK', 'Sản phẩm đã hết hàng.');
  if (current + quantity > 99) throw new CartError(409, 'QUANTITY_LIMIT', 'Mỗi sản phẩm trong giỏ tối đa 99 chiếc.');
  if (current + quantity > product.stock) throw new CartError(409, 'INSUFFICIENT_STOCK', 'Tổng số lượng trong giỏ vượt quá tồn kho hiện tại.');
  return current + quantity;
}
const cents = value => {
  const match = /^(\d+)\.(\d{2})$/.exec(value);
  if (!match) throw new Error('Invalid SQL monetary amount');
  return BigInt(match[1]) * 100n + BigInt(match[2]);
};
const money = value => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
function summarize(rows) {
  let total = 0n, quantity = 0;
  const items = rows.map(row => {
    const amount = cents(row.unitPrice) * BigInt(row.quantity);
    total += amount; quantity += row.quantity;
    const availability = !row.active || !row.categoryActive ? 'discontinued' :
      row.stock < 1 ? 'out_of_stock' : row.quantity > row.stock ? 'insufficient_stock' : 'available';
    const { active, categoryActive, ...item } = row;
    return { ...item, lineTotal: money(amount), availability };
  });
  return { items, total: money(total), totalQuantity: quantity, currency: 'VND',
    hasUnavailableItems: items.some(item => item.availability !== 'available') };
}

function createCartRepository(poolProvider, { transactionFactory = pool => new sql.Transaction(pool) } = {}) {
  async function mutate(userId, productId, quantity) {
    const transaction = transactionFactory(await poolProvider());
    let began = false;
    const query = (text, parameters) => {
      const request = transaction.request();
      for (const [key, type, value] of parameters) request.input(key, type, value);
      return request.query(text);
    };
    const missing = () => new CartError(404, 'CART_ITEM_NOT_FOUND', 'Không tìm thấy sản phẩm trong giỏ hàng của bạn.');
    try {
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE); began = true;
      // Same first lock as UC-06/07, including the missing-cart key range.
      const carts = await query('SELECT Id AS id FROM dbo.Carts WITH (UPDLOCK,HOLDLOCK) WHERE UserId=@userId', [['userId', sql.Int, userId]]);
      const cartId = carts.recordset[0]?.id;
      if (!cartId) throw missing();
      const params = [['cartId', sql.Int, cartId], ['productId', sql.Int, productId]];
      let product;
      if (quantity !== undefined) {
        // Match UC-07 product/category-before-item lock order. No stock reservation.
        const products = await query(`SELECT p.Stock AS stock,p.IsActive AS active,c.IsActive AS categoryActive
          FROM dbo.Products p WITH (HOLDLOCK) JOIN dbo.Categories c WITH (HOLDLOCK) ON c.Id=p.CategoryId
          WHERE p.Id=@productId`, [['productId', sql.Int, productId]]);
        product = products.recordset[0];
      }
      const items = await query('SELECT Id AS id FROM dbo.CartItems WITH (UPDLOCK,HOLDLOCK) WHERE CartId=@cartId AND ProductId=@productId', params);
      if (!items.recordset.length) throw missing();
      if (quantity !== undefined) checkAddition(product, 0, quantity);
      const changed = quantity === undefined
        ? await query('DELETE FROM dbo.CartItems WHERE CartId=@cartId AND ProductId=@productId', params)
        : await query('UPDATE dbo.CartItems SET Quantity=@quantity WHERE CartId=@cartId AND ProductId=@productId', [...params, ['quantity', sql.Int, quantity]]);
      if (changed.rowsAffected[0] !== 1) throw missing();
      const touched = await query('UPDATE dbo.Carts SET UpdatedAt=SYSUTCDATETIME() WHERE Id=@cartId', [['cartId', sql.Int, cartId]]);
      if (touched.rowsAffected[0] !== 1) throw new Error('Cart update failed');
      await transaction.commit(); began = false;
      return quantity === undefined ? { productId } : { productId, quantity };
    } catch (error) {
      if (began) await transaction.rollback().catch(() => {});
      throw error;
    }
  }
  return {
    update: (userId, productId, quantity) => mutate(userId, productId, quantity),
    remove: (userId, productId) => mutate(userId, productId),
    async read(userId) {
      const pool = await poolProvider();
      const result = await pool.request().input('userId', sql.Int, userId).query(`
        SELECT i.Id AS id, p.Id AS productId, p.Sku AS sku, p.Name AS name,
          CONVERT(VARCHAR(50), p.Price) AS unitPrice, i.Quantity AS quantity,
          p.Stock AS stock, p.IsActive AS active, c.IsActive AS categoryActive,
          image.ImageUrl AS imageUrl, image.AltText AS imageAlt
        FROM dbo.Carts cart JOIN dbo.CartItems i ON i.CartId=cart.Id
        JOIN dbo.Products p ON p.Id=i.ProductId JOIN dbo.Categories c ON c.Id=p.CategoryId
        OUTER APPLY (SELECT TOP(1) ImageUrl, AltText FROM dbo.ProductImages
          WHERE ProductId=p.Id ORDER BY SortOrder, Id) image
        WHERE cart.UserId=@userId ORDER BY i.Id;
      `);
      return summarize(result.recordset);
    },
    async add(userId, productId, quantity) {
      const pool = await poolProvider(), transaction = transactionFactory(pool);
      let began = false;
      try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE); began = true;
        const request = () => transaction.request();
        // Serialize mutations of this user's cart, including first-cart creation.
        const carts = await request().input('userId', sql.Int, userId)
          .query('SELECT Id AS id FROM dbo.Carts WITH (UPDLOCK,HOLDLOCK) WHERE UserId=@userId');
        let cartId = carts.recordset[0]?.id;
        const products = await request().input('productId', sql.Int, productId).query(`
          SELECT p.Stock AS stock, p.IsActive AS active, c.IsActive AS categoryActive
          FROM dbo.Products p WITH (HOLDLOCK) JOIN dbo.Categories c WITH (HOLDLOCK) ON c.Id=p.CategoryId
          WHERE p.Id=@productId`);
        const product = products.recordset[0];
        let current = 0, itemId;
        if (cartId) {
          const items = await request().input('cartId', sql.Int, cartId).input('productId', sql.Int, productId)
            .query('SELECT Id AS id, Quantity AS quantity FROM dbo.CartItems WITH (UPDLOCK,HOLDLOCK) WHERE CartId=@cartId AND ProductId=@productId');
          current = items.recordset[0]?.quantity || 0; itemId = items.recordset[0]?.id;
        }
        const newQuantity = checkAddition(product, current, quantity);
        if (!cartId) {
          const inserted = await request().input('userId', sql.Int, userId)
            .query('INSERT INTO dbo.Carts (UserId, UpdatedAt) OUTPUT INSERTED.Id AS id VALUES (@userId,SYSUTCDATETIME())');
          cartId = inserted.recordset[0].id;
        }
        if (itemId) {
          await request().input('itemId', sql.Int, itemId).input('quantity', sql.Int, newQuantity)
            .query('UPDATE dbo.CartItems SET Quantity=@quantity WHERE Id=@itemId');
        } else {
          await request().input('cartId', sql.Int, cartId).input('productId', sql.Int, productId).input('quantity', sql.Int, newQuantity)
            .query('INSERT INTO dbo.CartItems (CartId,ProductId,Quantity) VALUES (@cartId,@productId,@quantity)');
        }
        await request().input('cartId', sql.Int, cartId)
          .query('UPDATE dbo.Carts SET UpdatedAt=SYSUTCDATETIME() WHERE Id=@cartId');
        await transaction.commit(); began = false;
        return { productId, quantity: newQuantity };
      } catch (error) {
        if (began) await transaction.rollback().catch(() => {});
        throw error;
      }
    }
  };
}

function createCartRouter({ auth, repository }) {
  const router = express.Router();
  router.use(auth.requireAuth);
  const failure = (res, error) => {
    if (error instanceof CartError) return res.status(error.status).json({ code: error.code, message: error.message });
    return res.status(503).json({ code: 'CART_UNAVAILABLE', message: 'Không thể xử lý giỏ hàng lúc này. Vui lòng thử lại sau.' });
  };
  router.get('/', async (req, res) => {
    try { res.json(await repository.read(req.user.id)); } catch (error) { failure(res, error); }
  });
  router.post('/items', auth.sameOrigin, express.json({ limit: '4kb' }), async (req, res) => {
    const { productId, quantity } = req.body || {};
    if (!Number.isInteger(productId) || productId < 1 || productId > 2147483647 ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ code: 'INVALID_CART_ITEM', message: 'Sản phẩm phải có ID hợp lệ và số lượng nguyên từ 1 đến 99.' });
    }
    try {
      const result = await repository.add(req.user.id, productId, quantity);
      res.json({ ...result, message: 'Đã thêm sản phẩm vào giỏ hàng.' });
    } catch (error) { failure(res, error); }
  });
  const validProductId = value => /^[1-9][0-9]{0,9}$/.test(value) && Number(value) <= 2147483647;
  router.patch('/items/:productId', auth.sameOrigin, express.json({ limit: '4kb' }), async (req, res) => {
    const body = req.body;
    if (!validProductId(req.params.productId) || !body || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'quantity') ||
      !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 99) {
      return res.status(400).json({ code: 'INVALID_CART_ITEM', message: 'Chỉ gửi số lượng nguyên từ 1 đến 99 và mã sản phẩm hợp lệ.' });
    }
    try {
      res.json({ ...await repository.update(req.user.id, Number(req.params.productId), body.quantity), message: 'Đã cập nhật số lượng.' });
    } catch (error) { failure(res, error); }
  });
  router.delete('/items/:productId', auth.sameOrigin, async (req, res) => {
    if (!validProductId(req.params.productId)) return res.status(400).json({ code: 'INVALID_CART_ITEM', message: 'Mã sản phẩm không hợp lệ.' });
    try {
      res.json({ ...await repository.remove(req.user.id, Number(req.params.productId)), message: 'Đã xóa sản phẩm khỏi giỏ.' });
    } catch (error) { failure(res, error); }
  });
  return router;
}

module.exports = { createCartRepository, createCartRouter, CartError, checkAddition, summarize };
