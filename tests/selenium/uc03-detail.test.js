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
  driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  await driver.manage().setTimeouts({ implicit: 0, pageLoad: 30000 });
});

after(async () => {
  if (driver) await driver.quit();
});

const el = id => By.css(`[data-testid="${id}"]`);

test('UC-03 TC01: Xem chi tiết sản phẩm hợp lệ', async () => {
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

  assert.ok((await driver.findElement(el('product-sku')).getText()).trim());
});

test('UC-03 TC02: ID sản phẩm không hợp lệ không hiển thị sản phẩm giả', async () => {
  await driver.get(`${baseUrl}/product-detail.html?id=999999999`);
  await driver.wait(until.elementLocated(el('page-feedback')), 10000);

  const feedback = await driver.findElement(el('page-feedback')).getText();
  assert.match(
    feedback,
    /không thể tải|không hợp lệ|không tìm thấy|không tồn tại|ngừng kinh doanh/i
  );
});