const { test, before, after } = require('node:test');
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
const accountUrl = new URL('/account.html', baseUrl).href;
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

// Chờ một phần tử chứa chữ nào đó. Tìm lại phần tử mỗi lần vì trang có thể vẽ lại.
async function waitForText(id, expected, message) {
  await driver.wait(async () => {
    try { return (await driver.findElement(byTestId(id)).getText()).includes(expected); } catch { return false; }
  }, timeout, message || `Expected "${expected}" in data-testid=${id}`);
}

// Đọc giá trị hiện tại của ô nhập (kể cả textarea).
async function valueOf(id) {
  return driver.executeScript('return arguments[0].value', await driver.findElement(byTestId(id)));
}

async function replaceText(id, value) {
  const input = await element(id);
  await input.clear();
  await input.sendKeys(value);
}

// Tạo tài khoản mới bằng trang đăng ký (dữ liệu độc lập cho từng test).
async function createUser() {
  const user = {
    name: 'Selenium UC08 Test',
    address: '123 Selenium Test Street',
    email: `selenium-uc08-${randomUUID()}@example.test`,
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

// Đăng nhập bằng giao diện với phiên sạch.
async function loginAs(user) {
  await driver.get(loginUrl);
  await driver.manage().deleteAllCookies();
  await driver.get(loginUrl);
  await element('login-form');
  await replaceText('login-email', user.email);
  await replaceText('login-password', user.password);
  await (await element('login-submit')).click();
  await driver.wait(until.urlIs(homeUrl), timeout, 'Login must redirect to the home page');
}

// Mở trang tài khoản và chờ dữ liệu tải xong ổn định.
// Trang tải lại dữ liệu khi trạng thái đăng nhập được xác nhận, nên chờ phần tên người dùng trên đầu trang trước.
async function openAccount() {
  await driver.get(accountUrl);
  await element('auth-account');
  await waitForText('page-feedback', 'Đã tải thông tin tài khoản.', 'Account data must finish loading');
  await element('account-form');
  await element('account-save');
}

// Chụp ảnh khi test lỗi (chỉ chứa dữ liệu giả).
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

// ---------- Test case UC-08: Quản lý tài khoản ----------
test('TC_ACCOUNT_01: Xem thông tin tài khoản', async context => scenario(context, async () => {
  const user = await createUser();
  await loginAs(user);
  await openAccount();
  assert.equal(await valueOf('account-email'), user.email, 'Email must match the registered email');
  assert.equal(await valueOf('account-name'), user.name, 'Name must match the registered name');
  assert.equal(await valueOf('account-address'), user.address, 'Address must match the registered address');
  assert.equal(await valueOf('account-phone'), '', 'Phone is empty because registration has no phone');
  assert.equal(await (await element('account-email')).getAttribute('readonly'), 'true', 'Email must be read-only');
  await waitForText('auth-account', user.name, 'Header must show the logged-in user name');
}));

test('TC_ACCOUNT_02: Cập nhật thông tin hợp lệ', async context => scenario(context, async () => {
  const user = await createUser();
  await loginAs(user);
  await openAccount();
  const updated = { name: 'Huy Cap Nhat Selenium', phone: '0912345678', address: '456 Duong Cap Nhat, Ha Noi' };
  await replaceText('account-name', updated.name);
  await replaceText('account-phone', updated.phone);
  await replaceText('account-address', updated.address);

  // Trang xóa dòng thông báo ngay sau khi lưu, nên ghi lại mọi thay đổi chữ để bắt được thông báo thành công.
  // Dòng thông báo đang trống nên chưa "hiển thị"; chỉ cần tìm thấy phần tử, không chờ hiển thị.
  const feedback = await driver.findElement(byTestId('account-form-feedback'));
  await driver.executeScript(`
    const target = arguments[0];
    window.__accountFeedbackLog = [];
    new MutationObserver(() => window.__accountFeedbackLog.push(target.textContent))
      .observe(target, { childList: true, characterData: true, subtree: true });`, feedback);
  await (await element('account-save')).click();
  await driver.wait(async () => (await driver.executeScript('return window.__accountFeedbackLog')).includes('Đã lưu thông tin tài khoản.'),
    timeout, 'Expected success message after saving');

  // Tên mới phải hiện trên đầu trang, rồi mở lại trang để chắc chắn dữ liệu đã lưu vào hệ thống.
  await waitForText('auth-account', updated.name, 'Header must show the updated name');
  await openAccount();
  assert.equal(await valueOf('account-name'), updated.name);
  assert.equal(await valueOf('account-phone'), updated.phone);
  assert.equal(await valueOf('account-address'), updated.address);
  assert.equal(await valueOf('account-email'), user.email, 'Email must not change');
}));

// Mở trang tài khoản khi chưa đăng nhập (xóa cookie rồi tải lại).
async function openAccountLoggedOut() {
  await driver.get(accountUrl);
  await driver.manage().deleteAllCookies();
  await driver.get(accountUrl);
  await waitForText('auth-session', 'Chưa đăng nhập', 'Header must show the logged-out state');
  const loginLink = await driver.wait(until.elementLocated(byTestId('account-login')), timeout);
  await driver.wait(until.elementIsVisible(loginLink), timeout, 'Login link must be shown to logged-out visitors');
}

test('TC_ACCOUNT_03: Chưa đăng nhập truy cập trang tài khoản bị chặn', async context => scenario(context, async () => {
  await openAccountLoggedOut();
  // Yêu cầu của đặc tả: không có dữ liệu tài khoản, có lời nhắc đăng nhập, API trả 401.
  await waitForText('page-feedback', 'Vui lòng đăng nhập', 'Page must ask the visitor to log in');
  assert.equal(await valueOf('account-email'), '', 'No email may be shown');
  assert.equal(await valueOf('account-name'), '', 'No name may be shown');
  assert.equal((await driver.findElements(byTestId('auth-account'))).length, 0, 'No logged-in session may be shown');
  const status = await driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1];
    fetch('/api/account', { credentials: 'same-origin', cache: 'no-store' })
      .then(response => done(response.status)).catch(() => done(0));`);
  assert.equal(status, 401, 'GET /api/account without a session must return 401');
}));

// Quan sát giao diện (ghi nhận BUG-ACC-01): form phải được ẩn khi chưa đăng nhập.
test('TC_ACCOUNT_03a: Form thông tin tài khoản không hiển thị khi chưa đăng nhập', async context => scenario(context, async () => {
  await openAccountLoggedOut();
  const form = await driver.findElement(byTestId('account-form'));
  const formState = await driver.executeScript(
    'return { hidden: arguments[0].hidden, display: getComputedStyle(arguments[0]).display };', form);
  assert.equal(await form.isDisplayed(), false,
    `Account form must stay hidden (hidden attribute=${formState.hidden}, CSS display=${formState.display})`);
}));
