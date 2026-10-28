const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
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