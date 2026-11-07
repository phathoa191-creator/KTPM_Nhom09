
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

async function openProduct() {
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
}

async function registerAndLogin() {
  const email = `selenium-uc07-${randomUUID()}@example.test`;
  const password = 'Selenium-Test-123!';

  // Đăng ký tài khoản mới
  await driver.get(`${baseUrl}/register.html`);

  await driver.findElement(el('register-name')).sendKeys('Selenium UC07 Test');
  await driver.findElement(el('register-address')).sendKeys('123 Test Street');
  await driver.findElement(el('register-email')).sendKeys(email);
  await driver.findElement(el('register-password')).sendKeys(password);
  await driver.findElement(el('register-confirm-password')).sendKeys(password);
  await driver.findElement(el('register-submit')).click();

  await driver.wait(until.urlContains('/login.html'), 15000);

  // Đăng nhập
  await driver.get(`${baseUrl}/login.html?returnTo=%2Fcart.html`);

  await driver.findElement(el('login-email')).sendKeys(email);
  await driver.findElement(el('login-password')).sendKeys(password);
  await driver.findElement(el('login-submit')).click();

  await driver.wait(until.urlContains('/cart.html'), 15000);
}

test('UC-07 TC01: Người chưa đăng nhập thêm sản phẩm thì được yêu cầu đăng nhập', async () => {
  await openProduct();

  await driver.findElement(el('add-cart-quantity')).clear();
  await driver.findElement(el('add-cart-quantity')).sendKeys('1');
  await driver.findElement(el('detail-add-to-cart')).click();

  await driver.wait(async () => {
    return await driver.findElement(el('add-cart-login')).isDisplayed();
  }, 10000);

  assert.equal(
    await driver.findElement(el('add-cart-login')).isDisplayed(),
    true
  );
});

test('UC-07 TC02: Không cho thêm sản phẩm với số lượng không hợp lệ', async () => {
  await openProduct();

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

test('UC-07 TC03: Đăng nhập và thêm sản phẩm thành công vào giỏ hàng', async () => {
  await registerAndLogin();

  // Mở trang sản phẩm
  await openProduct();

  // Chọn số lượng 2 và thêm vào giỏ
  const quantity = await driver.findElement(el('add-cart-quantity'));
  await quantity.clear();
  await quantity.sendKeys('2');

  await driver.findElement(el('detail-add-to-cart')).click();

  // Chờ thông báo thêm sản phẩm thành công
  await driver.wait(async () => {
    const feedback = await driver.findElement(el('add-cart-form-feedback')).getText();
    return /thành công|đã thêm|thêm vào giỏ/i.test(feedback);
  }, 15000);

  // Mở giỏ hàng
  await driver.get(`${baseUrl}/cart.html`);

  await driver.wait(until.elementLocated(el('cart-item-rows')), 15000);

  // Chờ sản phẩm xuất hiện trong giỏ
  await driver.wait(async () => {
    const rows = await driver.findElement(el('cart-item-rows'));
    const items = await rows.findElements(By.css('tr'));
    return items.length > 0;
  }, 15000);

  // Kiểm tra số lượng sản phẩm
  const rows = await driver.findElement(el('cart-item-rows'));
  const items = await rows.findElements(By.css('tr'));

  assert.equal(items.length, 1, 'Giỏ hàng phải có 1 dòng sản phẩm');

  const cartQuantity = await items[0].findElement(el('cart-item-quantity'));
  const actualQuantity = (await cartQuantity.getText()).trim();

  assert.equal(actualQuantity, '2', 'Số lượng trong giỏ hàng phải bằng 2');
});
