const { argon2, randomBytes, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(argon2);

// Node >=24.11.1 supplies Argon2id; PHC encoding keeps salt and cost with the hash.
async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive('argon2id', {
    message: password, nonce: salt, memory: 65536, passes: 3,
    parallelism: 1, tagLength: 32
  });
  const base64 = buffer => buffer.toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=65536,t=3,p=1$${base64(salt)}$${base64(key)}`;
}

async function verifyPassword(hash, password) {
  if (typeof hash !== 'string' || typeof password !== 'string') return false;
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(hash);
  if (!match) return false;
  const [, memoryText, passesText, parallelismText, saltText, keyText] = match;
  const memory = Number(memoryText), passes = Number(passesText), parallelism = Number(parallelismText);
  const nonce = Buffer.from(saltText, 'base64'), expected = Buffer.from(keyText, 'base64');
  // Bound cost when parsing stored PHC data; UC-01 uses 65536/3/1 and 16/32 bytes.
  if (memory < 8 * parallelism || memory > 131072 || passes < 1 || passes > 6 ||
      parallelism < 1 || parallelism > 4 || nonce.length < 8 || nonce.length > 64 ||
      expected.length < 16 || expected.length > 64) return false;
  const actual = await derive('argon2id', { message: password, nonce, memory, passes, parallelism, tagLength: expected.length });
  return timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
