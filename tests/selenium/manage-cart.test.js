
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const BASE_URL = process.env.SELENIUM_BASE_URL || 'http://localhost:3000';
const TIMEOUT = 15000;
const PASSWORD = 'Selenium-Test-123!';
const SKU = 'DEMO-UC02-001';

const byId = id => By.css(`[data-testid="${id}"]`);

let driver;

// Khoi tao trinh duyet
before(async () => {
  const response = await fetch(`${BASE_URL}/api/health/db`);
  assert.equal(response.status, 200, 'Database must be connected');

  const options = new chrome.Options()
    .addArguments('--window-size=1440,1000');

  if (process.env.SELENIUM_HEADLESS !== 'false') {
    options.addArguments('--headless=new');
  }

  driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();
});

// Dong trinh duyet
after(async () => {
  if (driver) await driver.quit();
});

// Tim phan tu theo data-testid
async function element(id) {
  const found = await driver.wait(
    until.elementLocated(byId(id)),
    TIMEOUT
  );

  await driver.wait(
    until.elementIsVisible(found),
    TIMEOUT
  );

  return found;
}

// Mo trang web
async function openPage(page) {
  await driver.get(`${BASE_URL}/${page}`);
}

// Dang ky va dang nhap tai khoan moi
async function createUser() {
  const email = `selenium-cart-${randomUUID()}@example.test`;

  await openPage('register.html');

  const values = {
    'register-name': 'Selenium Cart Test',
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
    until.urlContains('/login.html'),
    TIMEOUT
  );

  await (await element('login-email')).sendKeys(email);
  await (await element('login-password')).sendKeys(PASSWORD);

  await (await element('login-submit')).click();

  await driver.wait(
    until.urlContains('/index.html'),
    TIMEOUT
  );
}

// Them san pham vao gio hang
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
  }, TIMEOUT);
}

// Chuan bi gio hang cho moi test
async function prepareCart() {
  await createUser();
  await addProduct();

  await openPage('cart-manage.html');

  await element(`cart-item-${SKU}`);

  await driver.wait(async () => {
    const feedback = await driver.findElement(byId('page-feedback'));
    return (await feedback.getText()) === 'Đã tải giỏ hàng.';
  }, TIMEOUT);
}

// Cap nhat so luong san pham
async function updateQuantity(value) {
  const input = await element(`manage-cart-quantity-${SKU}`);

  await input.clear();
  await input.sendKeys(String(value));

  await (await element(`manage-cart-update-${SKU}`)).click();
}

// Cho gio hang cap nhat hoan tat
async function waitForQuantity(expected) {
  await driver.wait(async () => {
    try {
      const feedback = await driver.findElement(byId('page-feedback'));
      const message = await feedback.getText();

      if (
        message === 'Đang tải giỏ hàng...' ||
        message === 'Đang cập nhật giỏ hàng...'
      ) {
        return false;
      }

      const input = await driver.findElement(
        byId(`manage-cart-quantity-${SKU}`)
      );

      const quantity = await input.getAttribute('value');

      const count = await driver.findElement(byId('cart-count'));
      const countText = await count.getText();

      return (
        quantity === String(expected) &&
        countText.includes(`${expected} sản phẩm`)
      );

    } catch (error) {
      if (
        error.name === 'StaleElementReferenceError' ||
        error.name === 'NoSuchElementError'
      ) {
        return false;
      }

      throw error;
    }
  }, TIMEOUT, `Expected updated quantity ${expected}`);
}

// TC_CART_01: Hien thi san pham trong gio
test('TC_CART_01: Hien thi san pham trong gio', async () => {
  await prepareCart();

  const row = await element(`cart-item-${SKU}`);

  assert.match(
    await row.getText(),
    /iPhone 16 128GB/
  );

  const quantity = await element(`manage-cart-quantity-${SKU}`);

  assert.equal(
    await quantity.getAttribute('value'),
    '1'
  );
});

// TC_CART_02: Cap nhat so luong
test('TC_CART_02: Cap nhat so luong san pham', async () => {
  await prepareCart();

  await updateQuantity(2);
  await waitForQuantity(2);

  const count = await element('cart-count');

  assert.match(
    await count.getText(),
    /2 sản phẩm/
  );
});

// TC_CART_03: Xoa san pham khoi gio
test('TC_CART_03: Xoa san pham khoi gio', async () => {
  await prepareCart();

  // Tu dong dong y xoa san pham
  await driver.executeScript('window.confirm = () => true');

  await (await element(`manage-cart-remove-${SKU}`)).click();

  const empty = await driver.wait(
    until.elementLocated(byId('cart-empty')),
    TIMEOUT
  );

  await driver.wait(
    until.elementIsVisible(empty),
    TIMEOUT
  );

  assert.equal(
    await empty.isDisplayed(),
    true
  );
});

// TC_CART_04: Kiem tra tong tien
test('TC_CART_04: Kiem tra tong tien sau cap nhat', async () => {
  await prepareCart();

  await updateQuantity(2);
  await waitForQuantity(2);

  await driver.wait(async () => {
    try {
      const total = await driver.findElement(byId('cart-total'));
      const text = await total.getText();

      return text.includes('38.980.000');

    } catch (error) {
      if (
        error.name === 'StaleElementReferenceError' ||
        error.name === 'NoSuchElementError'
      ) {
        return false;
      }

      throw error;
    }
  }, TIMEOUT, 'Cart total must be updated');

  const total = await element('cart-total');

  assert.match(
    await total.getText(),
    /38\.980\.000/
  );
});

// TC_CART_05: So luong khong hop le
test('TC_CART_05: So luong khong hop le', async () => {
  await prepareCart();

  await updateQuantity(0);

  const feedback = await element('page-feedback');

  await driver.wait(
    until.elementTextContains(
      feedback,
      'Số lượng phải là số nguyên'
    ),
    TIMEOUT
  );

  assert.match(
    await feedback.getText(),
    /Số lượng phải là số nguyên/
  );
});
