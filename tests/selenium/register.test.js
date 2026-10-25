const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdir, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const baseUrl = new URL(process.env.SELENIUM_BASE_URL || 'http://localhost:3000');
const timeout = Number(process.env.SELENIUM_TIMEOUT_MS || 15000);
assert(Number.isInteger(timeout) && timeout > 0, 'SELENIUM_TIMEOUT_MS must be a positive integer');
const byTestId = id => By.css(`[data-testid="${id}"]`);
const fields = ['register-name', 'register-address', 'register-email', 'register-password', 'register-confirm-password'];
const uniqueEmail = () => `selenium-uc01-${randomUUID()}@example.test`;
const cacheDirectory = path.join(__dirname, '.cache');
process.env.SE_CACHE_PATH ||= cacheDirectory;
const cachedChrome = path.join(cacheDirectory, 'chrome-win64', 'chrome.exe');
const cachedDriver = path.join(cacheDirectory, 'chromedriver-win64', 'chromedriver.exe');
// Synthetic application password, never a database credential.
const validData = () => ['Selenium UC01 Test', '123 Selenium Test Street', uniqueEmail(), 'Selenium-Test-123!', 'Selenium-Test-123!'];
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

async function element(id) {
  const found = await driver.wait(until.elementLocated(byTestId(id)), timeout, `Missing data-testid=${id}`);
  await driver.wait(until.elementIsVisible(found), timeout);
  await driver.wait(until.elementIsEnabled(found), timeout);
  return found;
}

async function openRegistration() {
  await driver.get(new URL('/register.html', baseUrl).href);
  await element('register-form');
}

beforeEach(openRegistration);

async function fill(values) {
  for (let i = 0; i < fields.length; i++) {
    const input = await element(fields[i]);
    await input.clear();
    if (values[i]) await input.sendKeys(values[i]);
  }
}

async function submitAndExpectSuccess() {
  await (await element('register-submit')).click();
  const loginUrl = new URL('/login.html', baseUrl).href;
  await driver.wait(until.urlIs(loginUrl), timeout, 'Successful registration must redirect to login');
  // Locate fresh elements only after navigation; the registration document is gone.
  const loginForm = await element('login-form');
  assert(await loginForm.isDisplayed(), 'Login form must be visible after registration');
  assert.equal(await driver.getCurrentUrl(), loginUrl);
}

async function submitAndExpectFailure(expectedMessage) {
  const originalUrl = await driver.getCurrentUrl();
  assert.equal(originalUrl, new URL('/register.html', baseUrl).href);
  // Detect a reload even if it returns to exactly the same URL.
  const marker = randomUUID();
  await driver.executeScript('window.__uc01SeleniumDocument = arguments[0]', marker);
  await (await element('register-submit')).click();
  const feedback = await element('register-form-feedback');
  await driver.wait(until.elementTextContains(feedback, expectedMessage), timeout,
    `Expected registration feedback: ${expectedMessage}`);
  const form = await element('register-form');
  await driver.wait(async () => (await form.getAttribute('aria-busy')) !== 'true', timeout);
  assert((await feedback.getText()).includes(expectedMessage));
  assert.equal(await driver.getCurrentUrl(), originalUrl);
  assert.equal(await driver.executeScript('return window.__uc01SeleniumDocument'), marker, 'Form must not reload the document');
  assert(await (await element('register-submit')).isEnabled());
  return feedback;
}

// Preserve a screenshot only on failure, containing synthetic test data only.
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

test('TC_01: Đăng ký tài khoản với dữ liệu hợp lệ', async context => scenario(context, async () => {
  await fill(validData());
  await submitAndExpectSuccess();
}));

test('TC_02: Bỏ trống các trường bắt buộc', async context => scenario(context, async () => {
  await submitAndExpectFailure('Vui lòng nhập họ tên.');
  const feedback = await (await element('register-form-feedback')).getText();
  for (const message of ['Vui lòng nhập họ tên.', 'Vui lòng nhập địa chỉ.', 'Vui lòng nhập email.',
    'Vui lòng nhập mật khẩu.', 'Vui lòng xác nhận mật khẩu.']) assert(feedback.includes(message), message);
  for (const id of fields) assert.equal(await (await element(id)).getAttribute('aria-invalid'), 'true');
}));

test('TC_03: Đăng ký bằng email đã tồn tại', async context => scenario(context, async () => {
  // Independent fixture: this case also works when selected without TC_01.
  const values = validData();
  await fill(values);
  await submitAndExpectSuccess();
  await openRegistration();
  values[2] = values[2].toUpperCase();
  await fill(values);
  await submitAndExpectFailure('Email đã được đăng ký.');
  assert.equal(await (await element('register-email')).getAttribute('aria-invalid'), 'true');
  assert.equal(await (await element('register-email')).getAttribute('value'), values[2]);
}));

test('TC_04: Nhập email không đúng định dạng', async context => scenario(context, async () => {
  const values = validData(); values[2] = 'invalid-email';
  await fill(values);
  await submitAndExpectFailure('Email không hợp lệ.');
  assert.equal(await (await element('register-email')).getAttribute('aria-invalid'), 'true');
}));

test('TC_05: Mật khẩu và xác nhận mật khẩu không khớp', async context => scenario(context, async () => {
  const values = validData(); values[4] = 'Different-Test-123!';
  await fill(values);
  await submitAndExpectFailure('Mật khẩu xác nhận không trùng khớp.');
  assert.equal(await (await element('register-confirm-password')).getAttribute('aria-invalid'), 'true');
}));
