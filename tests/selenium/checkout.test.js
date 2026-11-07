
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const BASE_URL = process.env.SELENIUM_BASE_URL || 'http://localhost:3000';
const TIMEOUT = 15000;
const PASSWORD = 'Selenium-Test-123!';
const byId = id => By.css(`[data-testid="${id}"]`);

let driver;

before(async () => {
  const response = await fetch(`${BASE_URL}/api/health/db`);
  assert.equal(response.status, 200, 'Backend SQL Server must be connected');

  const options = new chrome.Options().addArguments('--window-size=1440,1000');
  if (process.env.SELENIUM_HEADLESS !== 'false') {
    options.addArguments('--headless=new');
  }

  driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();
});

after(async () => {
  if (driver) await driver.quit();
});

async function element(id) {
  const found = await driver.wait(
    until.elementLocated(byId(id)), TIMEOUT
  );
  await driver.wait(until.elementIsVisible(found), TIMEOUT);
  return found;
}

async function openPage(page) {
  await driver.get(`${BASE_URL}/${page}`);
}

async function register() {
  const email = `selenium-checkout-${randomUUID()}@example.test`;

  await openPage('register.html');

  const values = {
    'register-name': 'Selenium Checkout Test',
    'register-address': '123 Test Street',
    'register-email': email,
    'register-password': PASSWORD,
    'register-confirm-password': PASSWORD
  };

  for (const [id, value] of Object.entries(values)) {
    await (await element(id)).sendKeys(value);
  }

  await (await element('register-submit')).click();

  await driver.wait(
    until.urlContains('/login.html'), TIMEOUT,
    'Registration must redirect to login'
  );

  return email;
}

async function login(email) {
  await openPage('login.html');

  await (await element('login-email')).sendKeys(email);
  await (await element('login-password')).sendKeys(PASSWORD);
  await (await element('login-submit')).click();

  await driver.wait(
    until.urlContains('/index.html'), TIMEOUT,
    'Login must redirect to home'
  );
}

async function createUser() {
  const email = await register();
  await login(email);
}

async function addProduct() {
  await openPage('product-detail.html?id=1');

  await element('add-cart-form');

  const quantity = await element('add-cart-quantity');
  await quantity.clear();
  await quantity.sendKeys('1');

  await (await element('detail-add-to-cart')).click();

  const feedback = await element('add-cart-form-feedback');

  await driver.wait(async () => {
    return (await feedback.getAttribute('data-state')) === 'success';
  }, TIMEOUT, 'Product must be added successfully');
}

async function prepareCheckout() {
  await createUser();
  await addProduct();
  await openPage('checkout.html');
  await element('checkout-form');
}

async function fillCheckout(name, phone, address) {
  const values = {
    'checkout-recipient': name,
    'checkout-phone': phone,
    'checkout-address': address
  };

  for (const [id, value] of Object.entries(values)) {
    const input = await element(id);
    await input.clear();
    if (value) await input.sendKeys(value);
  }
}

// TC_CHECKOUT_01: Đặt hàng thành công
test('TC_CHECKOUT_01: Dat hang thanh cong', async () => {
  await prepareCheckout();

  await fillCheckout(
    'Nguyen Van Test',
    '0912345678',
    '123 Duong Test, Ha Noi'
  );

  await (await element('checkout-submit')).click();

  const success = await driver.wait(
    until.elementLocated(byId('checkout-success')), TIMEOUT
  );

  await driver.wait(
    until.elementIsVisible(success), TIMEOUT
  );

  const message = await success.getText();

  assert.match(message, /Đặt hàng thành công/);
  assert.match(message, /Mã đơn:/);
});

// TC_CHECKOUT_02: Giỏ hàng trống
test('TC_CHECKOUT_02: Khong dat hang khi gio trong', async () => {
  await createUser();
  await openPage('checkout.html');

  const feedback = await element('page-feedback');

  await driver.wait(
    until.elementTextContains(feedback, 'Giỏ hàng đang trống'),
    TIMEOUT
  );

  const form = await driver.findElement(byId('checkout-form'));
  assert.equal(await form.isDisplayed(), false);
});

// TC_CHECKOUT_03: Thiếu người nhận
test('TC_CHECKOUT_03: Bo trong nguoi nhan', async () => {
  await prepareCheckout();

  await fillCheckout('', '0912345678', '123 Duong Test');

  await (await element('checkout-submit')).click();

  const feedback = await element('checkout-form-feedback');

  await driver.wait(
    until.elementTextContains(feedback, 'Nhập người nhận'),
    TIMEOUT
  );

  assert.match(await feedback.getText(), /Nhập người nhận/);
});

// TC_CHECKOUT_04: Số điện thoại không hợp lệ
test('TC_CHECKOUT_04: So dien thoai khong hop le', async () => {
  await prepareCheckout();

  await fillCheckout(
    'Nguyen Van Test',
    '12345',
    '123 Duong Test'
  );

  await (await element('checkout-submit')).click();

  const feedback = await element('checkout-form-feedback');

  await driver.wait(
    until.elementTextContains(feedback, 'số điện thoại 10 chữ số'),
    TIMEOUT
  );

  assert.match(await feedback.getText(), /số điện thoại 10 chữ số/);
});

// TC_CHECKOUT_05: Chưa đăng nhập
test('TC_CHECKOUT_05: Chua dang nhap', async () => {
  await driver.manage().deleteAllCookies();
  await openPage('checkout.html');

  const feedback = await element('page-feedback');

  await driver.wait(
    until.elementTextContains(feedback, 'Vui lòng đăng nhập'),
    TIMEOUT
  );

  const form = await driver.findElement(byId('checkout-form'));
  assert.equal(await form.isDisplayed(), false);
});
