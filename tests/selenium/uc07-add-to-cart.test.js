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

test('UC-07 TC01: Người chưa đăng nhập thêm sản phẩm thì được yêu cầu đăng nhập', async () => {
  await driver.get(`${baseUrl}/search.html?q=iphone`);

  const link = await driver.wait(
    until.elementLocated(By.css('[data-testid^="product-detail-"]')),
    10000
  );
  await link.click();

  await driver.wait(until.elementLocated(el('product-name')), 10000);
  await driver.wait(async () => {
    const name = await driver.findElement(el('product-name')).getText();
    return name.trim().length > 0;
  }, 10000);

  await driver.findElement(el('add-cart-quantity')).clear();
  await driver.findElement(el('add-cart-quantity')).sendKeys('1');
  await driver.findElement(el('detail-add-to-cart')).click();

  await driver.wait(async () => {
    const login = await driver.findElement(el('add-cart-login'));
    return login.isDisplayed();
  }, 10000);

  assert.equal(
    await driver.findElement(el('add-cart-login')).isDisplayed(),
    true
  );
});

test('UC-07 TC02: Không cho thêm sản phẩm với số lượng không hợp lệ', async () => {
  await driver.get(`${baseUrl}/search.html?q=iphone`);

  const link = await driver.wait(
    until.elementLocated(By.css('[data-testid^="product-detail-"]')),
    10000
  );
  await link.click();

  await driver.wait(until.elementLocated(el('add-cart-quantity')), 10000);

  const quantity = await driver.findElement(el('add-cart-quantity'));
  await quantity.clear();
  await quantity.sendKeys('0');

  const form = await driver.findElement(el('add-cart-form'));
  const valid = await driver.executeScript(
    'return arguments[0].checkValidity()',
    form
  );

  assert.equal(valid, false);
});