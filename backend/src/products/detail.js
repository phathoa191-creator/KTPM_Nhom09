const sql = require('mssql');

function createProductDetailRepository(poolProvider) {
  return {
    async findById(id) {
      const pool = await poolProvider();
      const result = await pool.request().input('id', sql.Int, id).query(`
        SELECT p.Id AS id, p.Sku AS sku, p.Slug AS slug, p.Name AS name,
          p.Description AS description, p.Price AS price, p.Stock AS stock,
          c.Name AS category
        FROM dbo.Products p JOIN dbo.Categories c ON c.Id=p.CategoryId
        WHERE p.Id=@id AND p.IsActive=1 AND c.IsActive=1;
        SELECT i.Id AS id, i.ImageUrl AS url, i.AltText AS alt, i.SortOrder AS sortOrder
        FROM dbo.ProductImages i JOIN dbo.Products p ON p.Id=i.ProductId
        JOIN dbo.Categories c ON c.Id=p.CategoryId
        WHERE p.Id=@id AND p.IsActive=1 AND c.IsActive=1
        ORDER BY i.SortOrder, i.Id;
      `);
      const product = result.recordsets[0][0];
      return product ? { ...product, images: result.recordsets[1] } : null;
    }
  };
}

function createProductDetailHandler({ productDetailRepository }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
      return res.status(400).json({ code: 'INVALID_PRODUCT_ID', message: 'Mã sản phẩm không hợp lệ.' });
    }
    try {
      const product = await productDetailRepository.findById(Number(req.params.id));
      if (!product) return res.status(404).json({ code: 'PRODUCT_NOT_FOUND', message: 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh.' });
      return res.json({ product });
    } catch {
      return res.status(503).json({ code: 'PRODUCT_UNAVAILABLE', message: 'Không thể tải thông tin sản phẩm lúc này. Vui lòng thử lại sau.' });
    }
  };
}

module.exports = { createProductDetailRepository, createProductDetailHandler };
