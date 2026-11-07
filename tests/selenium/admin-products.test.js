
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const BASE_URL = process.env.SELENIUM_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.SELENIUM_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SELENIUM_ADMIN_PASSWORD;
const PASSWORD = 'Selenium-Test-123!';
const TIMEOUT = 20000;

const byId = id => By.css(`[data-testid="${id}"]`);

let driver;
let testProductId;
let testSku;
let testName;

before(async () => {
  assert.ok(ADMIN_EMAIL, 'Missing SELENIUM_ADMIN_EMAIL');
  assert.ok(ADMIN_PASSWORD, 'Missing SELENIUM_ADMIN_PASSWORD');

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

async function login(email, password) {
  await openPage('login.html');

  await (await element('login-email')).sendKeys(email);
  await (await element('login-password')).sendKeys(password);
  await (await element('login-submit')).click();

  await driver.wait(
    until.urlContains('/index.html'),
    TIMEOUT,
    'Login must redirect to home'
  );
}

async function loginAdmin() {
  await driver.manage().deleteAllCookies();
  await login(ADMIN_EMAIL, ADMIN_PASSWORD);
}

async function openAdmin() {
  await openPage('admin-products.html');

  await driver.wait(async () => {
    const feedback = await driver.findElement(byId('page-feedback'));
    return (await feedback.getText()) === 'Đã tải danh sách sản phẩm.';
  }, TIMEOUT);

  await element('admin-panel');
}

async function fillField(id, value) {
  const input = await element(id);
  await input.clear();

  if (value !== '') {
    await input.sendKeys(String(value));
  }
}

async function searchProduct(query) {
  await fillField('admin-query', query);
  await (await element('admin-search-form')).submit();

  await driver.wait(async () => {
    try {
      const feedback = await driver.findElement(byId('page-feedback'));
      return (await feedback.getText()) ===
        'Đã tải danh sách sản phẩm.';
    } catch (error) {
      if (error.name === 'StaleElementReferenceError') return false;
      throw error;
    }
  }, TIMEOUT);
}

async function waitForProduct(sku) {
  return driver.wait(async () => {
    const rows = await driver.findElements(
      By.css('[data-testid^="admin-product-row-"]')
    );

    for (const row of rows) {
      try {
        const cells = await row.findElements(By.css('td'));
        if (cells.length && (await cells[0].getText()) === sku) {
          return row;
        }
      } catch (error) {
        if (error.name !== 'StaleElementReferenceError') throw error;
      }
    }

    return false;
  }, TIMEOUT, `Product ${sku} not found`);
}

async function getProductId(sku) {
  const row = await waitForProduct(sku);
  const id = await row.getAttribute('data-testid');
  return Number(id.replace('admin-product-row-', ''));
}

async function createProduct() {
  testSku = `SELENIUM-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  testName = 'Selenium UC10 Test Product';

  await openAdmin();

  await fillField('admin-product-sku', testSku);
  await fillField('admin-product-slug', testSku.toLowerCase());
  await fillField('admin-product-name', testName);

  const category = await element('admin-product-category');
  const options = await category.findElements(By.css('option'));

  let selected = false;

  for (const option of options) {
    const value = await option.getAttribute('value');
    const label = await option.getText();

    if (value && !label.includes('ngừng hoạt động')) {
      await option.click();
      selected = true;
      break;
    }
  }

  assert.ok(selected, 'No active category available');

  await fillField('admin-product-price', '1000000');
  await fillField('admin-product-stock', '10');
  await fillField('admin-product-description', 'San pham kiem thu UC10');

  await (await element('admin-product-create')).click();

  await driver.wait(async () => {
    const feedback = await driver.findElement(byId('page-feedback'));
    return (await feedback.getText()) === 'Đã lưu sản phẩm thành công.';
  }, TIMEOUT, 'Product creation must succeed');

  await searchProduct(testSku);
  testProductId = await getProductId(testSku);

  assert.ok(testProductId > 0);
}

// TC_ADMIN_01: Xem danh sach san pham
test('TC_ADMIN_01: Hien thi danh sach san pham', async () => {
  await loginAdmin();
  await openAdmin();

  const rows = await driver.findElements(
    By.css('[data-testid^="admin-product-row-"]')
  );

  assert.ok(rows.length > 0, 'Product list must not be empty');
});

// TC_ADMIN_02: Them san pham
test('TC_ADMIN_02: Them san pham moi', async () => {
  await createProduct();

  const row = await waitForProduct(testSku);
  assert.match(await row.getText(), /Selenium UC10 Test Product/);
});

// TC_ADMIN_03: Sua san pham
test('TC_ADMIN_03: Sua thong tin san pham', async () => {
  assert.ok(testProductId, 'Run TC_ADMIN_02 first');

  await openAdmin();
  await searchProduct(testSku);

  await (await element(`admin-product-edit-${testProductId}`)).click();

  await driver.wait(async () => {
    const feedback = await driver.findElement(
      byId('admin-product-form-feedback')
    );
    return (await feedback.getText()).includes('Đang sửa sản phẩm');
  }, TIMEOUT);

  await fillField(
    'admin-product-name',
    'Selenium UC10 Updated Product'
  );

  await (await element('admin-product-save')).click();

  await driver.wait(async () => {
    const feedback = await driver.findElement(byId('page-feedback'));
    return (await feedback.getText()) === 'Đã lưu sản phẩm thành công.';
  }, TIMEOUT);

  await searchProduct(testSku);

  const row = await waitForProduct(testSku);
  assert.match(await row.getText(), /Selenium UC10 Updated Product/);
});

// TC_ADMIN_04: Ngung kinh doanh san pham
test('TC_ADMIN_04: Ngung kinh doanh san pham', async () => {
  assert.ok(testProductId, 'Run TC_ADMIN_02 first');

  await openAdmin();
  await searchProduct(testSku);

  await driver.executeScript('window.confirm = () => true');

  await (await element(`admin-product-status-${testProductId}`)).click();

  await driver.wait(async () => {
    const feedback = await driver.findElement(byId('page-feedback'));
    return (await feedback.getText()) === 'Đã lưu sản phẩm thành công.';
  }, TIMEOUT);

  await searchProduct(testSku);

  const row = await waitForProduct(testSku);
  assert.match(await row.getText(), /Ngừng kinh doanh/);
});

// TC_ADMIN_05: Khach hang khong co quyen quan tri
test('TC_ADMIN_05: Khach hang khong co quyen quan tri', async () => {
  await driver.manage().deleteAllCookies();

  const email = `selenium-admin-role-${randomUUID()}@example.test`;

  await openPage('register.html');

  const values = {
    'register-name': 'Selenium Customer',
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
    until.urlContains('/login.html'), TIMEOUT
  );

  await login(email, PASSWORD);

  await openPage('admin-products.html');

  const feedback = await element('page-feedback');

  await driver.wait(
    until.elementTextContains(
      feedback,
      'Bạn không có quyền quản trị.'
    ),
    TIMEOUT
  );

  const panel = await driver.findElement(byId('admin-panel'));
  assert.equal(await panel.isDisplayed(), false);
});
