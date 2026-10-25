const sql = require('mssql');

function createProductsRepository(poolProvider) {
  return {
    async search({ q, page, limit }) {
      const pool = await poolProvider();
      // Treat LIKE metacharacters as literal text, not user-controlled wildcards.
      const pattern = `%${q.replace(/[~%_\[]/g, character => `~${character}`)}%`;
      const result = await pool.request()
        .input('pattern', sql.NVarChar(402), pattern)
        .input('offset', sql.Int, (page - 1) * limit)
        .input('limit', sql.Int, limit)
        .query(`
          SELECT COUNT(*) AS total
          FROM dbo.Products p JOIN dbo.Categories c ON c.Id=p.CategoryId
          WHERE p.IsActive=1 AND c.IsActive=1
            AND p.Name COLLATE Latin1_General_100_CI_AS LIKE @pattern ESCAPE N'~';
          SELECT p.Id AS id, p.Sku AS sku, p.Name AS name, p.Description AS description,
            p.Price AS price, p.Stock AS stock, c.Name AS category,
            image.ImageUrl AS imageUrl, image.AltText AS imageAlt
          FROM dbo.Products p JOIN dbo.Categories c ON c.Id=p.CategoryId
          OUTER APPLY (SELECT TOP (1) pi.ImageUrl, pi.AltText
            FROM dbo.ProductImages pi WHERE pi.ProductId=p.Id ORDER BY pi.SortOrder, pi.Id) image
          WHERE p.IsActive=1 AND c.IsActive=1
            AND p.Name COLLATE Latin1_General_100_CI_AS LIKE @pattern ESCAPE N'~'
          ORDER BY p.Id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
        `);
      return { total: result.recordsets[0][0].total, products: result.recordsets[1] };
    }
  };
}

function createSearchHandler({ productsRepository }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { q = '', page = '1', limit = '12' } = req.query;
    if (typeof q !== 'string' || q.trim().length > 200 ||
        typeof page !== 'string' || !/^[1-9]\d*$/.test(page) || Number(page) > 1000000 ||
        typeof limit !== 'string' || !/^[1-9]\d*$/.test(limit) || Number(limit) > 48) {
      return res.status(400).json({ code: 'INVALID_SEARCH', message: 'Từ khóa tối đa 200 ký tự; page từ 1 đến 1000000, limit từ 1 đến 48.' });
    }
    const query = { q: q.trim(), page: Number(page), limit: Number(limit) };
    try {
      const result = await productsRepository.search(query);
      return res.json({ ...result, ...query, totalPages: Math.ceil(result.total / query.limit) });
    } catch {
      return res.status(503).json({ code: 'PRODUCTS_UNAVAILABLE', message: 'Không thể tải sản phẩm lúc này. Vui lòng thử lại sau.' });
    }
  };
}

module.exports = { createProductsRepository, createSearchHandler };
