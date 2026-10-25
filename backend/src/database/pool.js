const sql = require('mssql');
const { buildDatabaseConfig } = require('../config/database');

// Một promise dùng chung cả khi nhiều request đầu tiên đến cùng lúc.
// Chỉ kết nối khi được gọi; lỗi connect được xóa để request sau có thể thử lại.
function createPoolManager({ driver = sql, getConfig = buildDatabaseConfig } = {}) {
  let pending;
  function getPool() {
    if (!pending) {
      pending = (async () => {
        const pool = new driver.ConnectionPool(getConfig());
        // Driver có thể phát lỗi ngoài request. Không log error/connection config.
        pool.on('error', () => {});
        try {
          await pool.connect();
          return pool;
        } catch (error) {
          await pool.close().catch(() => {});
          throw error;
        }
      })().catch(error => {
        pending = undefined;
        throw error;
      });
    }
    return pending;
  }
  async function closePool() {
    const current = pending;
    if (!current) return;
    try {
      const pool = await current;
      await pool.close();
    } finally {
      if (pending === current) pending = undefined;
    }
  }
  return { getPool, closePool };
}

module.exports = { ...createPoolManager(), createPoolManager };
