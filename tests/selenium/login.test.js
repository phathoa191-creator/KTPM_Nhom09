const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdir, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

// ---------- Cấu hình (giống register.test.js) ----------
const baseUrl = new URL(process.env.SELENIUM_BASE_URL || 'http://localhost:3000');
const timeout = Number(process.env.SELENIUM_TIMEOUT_MS || 15000);
assert(Number.isInteger(timeout) && timeout > 0, 'SELENIUM_TIMEOUT_MS must be a positive integer');
const byTestId = id => By.css(`[data-testid="${id}"]`);
const loginUrl = new URL('/login.html', baseUrl).href;
const homeUrl = new URL('/index.html', baseUrl).href;
const registerUrl = new URL('/register.html', baseUrl).href;
const cacheDirectory = path.join(__dirname, '.cache');
process.env.SE_CACHE_PATH ||= cacheDirectory;
const cachedChrome = path.join(cacheDirectory, 'chrome-win64', 'chrome.exe');
const cachedDriver = path.join(cacheDirectory, 'chromedriver-win64', 'chromedriver.exe');
let driver;

before(async () => {
  const response = await fetch(new URL('/api/health/db', baseUrl), { signal: AbortSignal.timeout(timeout) });
  assert.equal(response.status, 200, 'Start the current backend and verify /api/health/db first');
  const options = new chrome.Options().addArguments('--window-size=1440,1000');
  if (process.env.SELENIUM_HEADLESS !== 'false') options.addArguments('--headless=new');
  const chromeBinary = process.env.CHROME_BINARY || (existsSync(cachedChrome) ? cachedChrome : undefined);
  const driverBinary = process.env.CHROMEDRIVER_PATH || (!process.env.CHROME_BINARY && existsSync(cachedChrome) && existsSync(cachedDriver) ? cachedDriver : undefined);
  if (chromeBinary) options.setChromeBinaryPath(chromeBinary);
  let builder = new Builder().forBrowser('chrome').setChromeOptions(options);
  if (driverBinary) builder = builder.setChromeService(new chrome.ServiceBuilder(driverBinary));
  driver = await builder.build();
  await driver.manage().setTimeouts({ implicit: 0, pageLoad: 30000, script: timeout });
});

after(async () => { if (driver) await driver.quit(); });

// ---------- Hàm dùng chung ----------
async function element(id) {
  const found = await driver.wait(until.elementLocated(byTestId(id)), timeout, `Missing data-testid=${id}`);
  await driver.wait(until.elementIsVisible(found), timeout);
  await driver.wait(until.elementIsEnabled(found), timeout);
  return found;
}

// Mở trang đăng nhập với phiên sạch (xóa cookie của test trước).
async function openLogin() {
  await driver.get(loginUrl);
  await driver.manage().deleteAllCookies();
  await driver.get(loginUrl);
  await element('login-form');
}

beforeEach(openLogin);

// Tạo tài khoản mới (dữ liệu độc lập) bằng chính trang đăng ký.
async function createUser() {
  const user = {
    name: 'Selenium UC04 Test',
    address: '123 Selenium Test Street',
    email: `selenium-uc04-${randomUUID()}@example.test`,
    password: 'Selenium-Test-123!'
  };
  await driver.get(registerUrl);
  await element('register-form');
  const values = {
    'register-name': user.name,
    'register-address': user.address,
    'register-email': user.email,
    'register-password': user.password,
    'register-confirm-password': user.password
  };
  for (const [id, value] of Object.entries(values)) await (await element(id)).sendKeys(value);
  await (await element('register-submit')).click();
  await driver.wait(until.urlIs(loginUrl), timeout, 'Registration must redirect to login');
  return user;
}

async function submitLogin(email, password) {
  const emailInput = await element('login-email');
  await emailInput.clear();
  await emailInput.sendKeys(email);
  const passwordInput = await element('login-password');
  await passwordInput.clear();
  await passwordInput.sendKeys(password);
  await (await element('login-submit')).click();
}

// Kiểm tra đăng nhập bị từ chối: có lỗi, vẫn ở trang login, không có phiên.
async function expectLoginFailure() {
  const feedback = await element('login-form-feedback');
  await driver.wait(async () => (await feedback.getAttribute('data-state')) === 'error', timeout,
    'Expected an error message after failed login');
  const message = (await feedback.getText()).trim();
  assert.notEqual(message, '', 'Error message must not be empty');
  assert.notEqual(message, 'Đang đăng nhập...', 'Request must have finished');
  assert.equal(await driver.getCurrentUrl(), loginUrl, 'Must stay on the login page');
  assert.equal(await (await element('login-password')).getAttribute('value'), '', 'Password field must be cleared');
  assert.equal((await driver.findElements(byTestId('auth-account'))).length, 0, 'No logged-in session may be shown');
  await driver.wait(until.elementIsEnabled(await element('login-submit')), timeout);
  return message;
}

// Chỉ chụp ảnh khi test lỗi (chỉ chứa dữ liệu giả).
async function scenario(context, run) {
  try { await run(); } catch (error) {
    if (driver) {
      const directory = path.join(__dirname, 'artifacts');
      try {
        await mkdir(directory, { recursive: true });
        const file = path.join(directory, `${context.name.split(':')[0]}-${Date.now()}.png`);
        await writeFile(file, await driver.takeScreenshot(), 'base64');
        context.diagnostic(`Failure screenshot: ${file}`);
      } catch { context.diagnostic('Unable to capture failure screenshot'); }
    }
    throw error;
  }
}

// ---------- Test case UC-04: Đăng nhập ----------
test('TC_LOGIN_01: Đăng nhập với email và mật khẩu đúng', async context => scenario(context, async () => {
  const user = await createUser();
  await openLogin();
  await submitLogin(user.email, user.password);
  await driver.wait(until.urlIs(homeUrl), timeout, 'Successful login must redirect to the home page');
  const account = await element('auth-account');
  await driver.wait(until.elementTextContains(account, user.name), timeout, 'Header must show the user name');
  assert((await account.getText()).includes('(CUSTOMER)'), 'Header must show the CUSTOMER role');
  await element('auth-logout');
}));

test('TC_LOGIN_02: Đăng nhập sai mật khẩu', async context => scenario(context, async () => {
  const user = await createUser();
  await openLogin();
  await submitLogin(user.email, 'Wrong-Password-999!');
  await expectLoginFailure();
}));

test('TC_LOGIN_03: Đăng nhập bằng tài khoản không tồn tại', async context => scenario(context, async () => {
  await submitLogin(`khong-ton-tai-${randomUUID()}@example.test`, 'Selenium-Test-123!');
  await expectLoginFailure();
}));
