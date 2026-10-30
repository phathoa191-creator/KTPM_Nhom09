
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const baseUrl = process.env.SELENIUM_BASE_URL || 'http://localhost:3000';
let driver;

before(async () => {
  const response = await fetch(`${baseUrl}/api/health/db`);
  assert.equal(response.status, 200);

  const options = new chrome.Options().addArguments('--headless=new');
  driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  await driver.manage().setTimeouts({ implicit: 0, pageLoad: 30000 });
});

after(async () => {
  if (driver) await driver.quit();
});

const el = id => By.css(`[data-testid="${id}"]`);

test('UC-05 TC01: Người chưa đăng nhập được yêu cầu đăng nhập khi xem giỏ hàng', async () => {
  await driver.get(`${baseUrl}/cart.html`);

  await driver.wait(until.elementLocated(el('page-feedback')), 10000);
  await driver.wait(async () => {
    const feedback = await driver.findElement(el('page-feedback')).getText();
    return feedback.trim().length > 0;
  }, 10000);

  const feedback = await driver.findElement(el('page-feedback')).getText();
  const login = await driver.findElement(el('cart-login'));

  assert.match(feedback, /đăng nhập/i);
  assert.equal(await login.isDisplayed(), true);
});

test('UC-05 TC02: Giỏ hàng không hiển thị tổng tiền sai khi chưa đăng nhập', async () => {
  await driver.get(`${baseUrl}/cart.html`);

  await driver.wait(until.elementLocated(el('page-feedback')), 10000);
  await driver.wait(async () => {
    const feedback = await driver.findElement(el('page-feedback')).getText();
    return feedback.trim().length > 0;
  }, 10000);

  const panel = await driver.findElement(el('cart-panel'));
  assert.equal(await panel.isDisplayed(), false);
});

test('UC-05 TC03: Xem giỏ hàng khi đã đăng nhập', async () => {
  const email = `selenium-uc05-${randomUUID()}@example.test`;
  const password = 'Selenium-Test-123!';

  // Đăng ký tài khoản mới
  await driver.get(`${baseUrl}/register.html`);

  await driver.findElement(el('register-name')).sendKeys('Selenium UC05 Test');
  await driver.findElement(el('register-address')).sendKeys('123 Test Street');
  await driver.findElement(el('register-email')).sendKeys(email);
  await driver.findElement(el('register-password')).sendKeys(password);
  await driver.findElement(el('register-confirm-password')).sendKeys(password);
  await driver.findElement(el('register-submit')).click();

  await driver.wait(until.urlContains('/login.html'), 15000);

  // Đăng nhập và yêu cầu quay lại giỏ hàng
  await driver.get(`${baseUrl}/login.html?returnTo=%2Fcart.html`);

  await driver.findElement(el('login-email')).sendKeys(email);
  await driver.findElement(el('login-password')).sendKeys(password);
  await driver.findElement(el('login-submit')).click();

  // Chờ chuyển đến giỏ hàng
  await driver.wait(until.urlContains('/cart.html'), 15000);

  // Chờ trạng thái giỏ hàng được cập nhật
  await driver.wait(async () => {
    const empty = await driver.findElement(el('cart-empty'));
    const panel = await driver.findElement(el('cart-panel'));
    return await empty.isDisplayed() || await panel.isDisplayed();
  }, 15000);

  const login = await driver.findElement(el('cart-login'));
  const empty = await driver.findElement(el('cart-empty'));
  const panel = await driver.findElement(el('cart-panel'));

  assert.equal(await login.isDisplayed(), false, 'Không được yêu cầu đăng nhập lại');

  assert.ok(
    await empty.isDisplayed() || await panel.isDisplayed(),
    'Giỏ hàng phải hiển thị trạng thái rỗng hoặc danh sách sản phẩm'
  );
});
