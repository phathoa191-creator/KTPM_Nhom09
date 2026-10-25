const sql = require('mssql');

// Only metadata is read here. Never migrate schema or grant permissions at runtime.
async function assertRegistrationSchema(pool) {
  const result = await pool.request().query(`
    SELECT c.name, t.name AS type, c.max_length
    FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.Users');
    SELECT HAS_PERMS_BY_NAME(N'dbo.Users','OBJECT','SELECT',N'Email','COLUMN') AS can_select,
      HAS_PERMS_BY_NAME(N'dbo.Users','OBJECT','INSERT') AS can_insert;
    SELECT i.name FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
    JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
    WHERE i.object_id=OBJECT_ID(N'dbo.Users') AND i.is_unique=1
      AND i.has_filter=0 AND ic.key_ordinal=1 AND c.name=N'Email'
      AND NOT EXISTS (SELECT 1 FROM sys.index_columns other
        WHERE other.object_id=i.object_id AND other.index_id=i.index_id AND other.key_ordinal>1);
  `);
  const [columns, permissions, uniqueEmail] = result.recordsets;
  const expected = { FullName: ['nvarchar', 200], Address: ['nvarchar', 1000],
    Email: ['nvarchar', 508], PasswordHash: ['varchar', 255] };
  const compatible = Object.entries(expected).every(([name, [type, length]]) =>
    columns.some(c => c.name === name && c.type === type && (c.max_length === -1 || c.max_length >= length)));
  if (!compatible || !uniqueEmail.length || permissions[0]?.can_select !== 1 || permissions[0]?.can_insert !== 1) {
    const error = new Error('Registration schema or permissions unavailable');
    error.code = 'REGISTRATION_NOT_READY';
    throw error;
  }
}

function createUsersRepository(poolProvider) {
  return {
    async open() {
      const pool = await poolProvider();
      // Recheck so manual schema/permission fixes do not require restarting Node.
      await assertRegistrationSchema(pool);
      return {
        async emailExists(email) {
          const result = await pool.request().input('email', sql.NVarChar(254), email)
            .query('SELECT TOP (1) 1 AS found FROM dbo.Users WHERE Email = @email');
          return result.recordset.length > 0;
        },
        async insert({ fullname, addr, uname, passwordHash }) {
          await pool.request()
            .input('fullname', sql.NVarChar(100), fullname)
            .input('addr', sql.NVarChar(500), addr)
            .input('email', sql.NVarChar(254), uname)
            .input('passwordHash', sql.VarChar(255), passwordHash)
            .query(`INSERT INTO dbo.Users
                    (FullName, Address, Email, PasswordHash, Role, IsActive, CreatedAt, UpdatedAt)
                    VALUES (@fullname, @addr, @email, @passwordHash,
                            'CUSTOMER', 1, SYSUTCDATETIME(), SYSUTCDATETIME())`);
        }
      };
    }
  };
}

module.exports = { createUsersRepository, assertRegistrationSchema };
