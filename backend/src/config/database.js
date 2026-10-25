// Chỉ xây dựng cấu hình, không log secret hoặc mở kết nối.
function buildDatabaseConfig(env = process.env) {
  const required = key => {
    if (typeof env[key] !== 'string' || !env[key].trim()) {
      throw new Error(`Thiếu biến môi trường ${key}`);
    }
    return env[key].trim();
  };
  const boolean = key => {
    const value = required(key);
    if (value !== 'true' && value !== 'false') throw new Error(`${key} phải là true hoặc false`);
    return value === 'true';
  };
  const server = required('DB_SERVER');
  if (server.includes('\\') || server.includes(',')) {
    throw new Error('DB_SERVER chỉ chứa host; tách DB_INSTANCE hoặc DB_PORT');
  }
  const portText = (env.DB_PORT || '').trim();
  const instanceName = (env.DB_INSTANCE || '').trim();
  if (Boolean(portText) === Boolean(instanceName)) {
    throw new Error('Chọn đúng một trong DB_PORT hoặc DB_INSTANCE');
  }
  const config = {
    server,
    database: required('DB_DATABASE'),
    user: required('DB_USER'),
    // Không trim password: khoảng trắng có thể là một phần của mật khẩu.
    password: env.DB_PASSWORD,
    options: {
      encrypt: boolean('DB_ENCRYPT'),
      trustServerCertificate: boolean('DB_TRUST_SERVER_CERTIFICATE'),
      appName: 'CellphoneS Testing Demo'
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout: 15000
  };
  if (config.user.toLowerCase() === 'sa') {
    throw new Error('DB_USER phải là SQL login ứng dụng riêng, không sử dụng sa');
  }
  if (typeof config.password !== 'string' || config.password.length === 0) {
    throw new Error('Thiếu biến môi trường DB_PASSWORD');
  }
  if (portText) {
    if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
      throw new Error('DB_PORT phải là số nguyên từ 1 đến 65535');
    }
    config.port = Number(portText);
  } else {
    config.options.instanceName = instanceName;
  }
  return config;
}
module.exports = { buildDatabaseConfig };
