
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const baseUrl = process.env.SELENIUM_BASE_URL || 'http://localhost:3000';
const timeout = Number(process.env.SELENIUM_TIMEOUT_MS || 15000);
const byTestId = id => By.css(`[data-testid="${id}"]`);

let driver;

before(async () => {
  const response = await fetch(`${baseUrl}/api/health/db`, {
    signal: AbortSignal.timeout(timeout)
  });
  assert.equal(response.status, 200, 'Backend và database phải hoạt động');

  const options = new chrome.Options().addArguments('--window-size=1440,1000');
  if (process.env.SELENIUM_HEADLESS !== 'false') {
    options.addArguments('--headless=new');
  }
  if (process.env.CHROME_BINARY) options.setChromeBinaryPath(process.env.CHROME_BINARY);

  let builder = new Builder().forBrowser('chrome').setChromeOptions(options);
  if (process.env.CHROMEDRIVER_PATH) {
    builder = builder.setChromeService(
      new chrome.ServiceBuilder(process.env.CHROMEDRIVER_PATH)
    );
  }

  driver = await builder.build();
  await driver.manage().setTimeouts({
    implicit: 0,
    pageLoad: 30000,
    script: timeout
  });
});

after(async () => {
  if (driver) await driver.quit();
});

async function element(id) {
  const found = await driver.wait(
    until.elementLocated(byTestId(id)),
    timeout,
    `Không tìm thấy data-testid="${id}"`
  );
  return found;
}

async function visibleElement(id) {
  const found = await element(id);
  await driver.wait(until.elementIsVisible(found), timeout);
  return found;
}

async function waitForSearch() {
  await driver.wait(async () => {
    const form = await element('search-form');
    return (await form.getAttribute('aria-busy')) !== 'true';
  }, timeout, 'Tìm kiếm chưa hoàn tất');
}

async function openSearch() {
  await driver.get(`${baseUrl}/search.html`);
  await visibleElement('search-form');
  await waitForSearch();
}

beforeEach(openSearch);

test('TC_SEARCH_01: Tìm kiếm với từ khóa không tồn tại', async () => {
  const keyword = await visibleElement('search-keyword');
  await keyword.clear();
  await keyword.sendKeys('sanpham-khong-ton-tai-xyz-987654');
  await (await visibleElement('search-submit')).click();

  await waitForSearch();

  const feedback = await element('search-form-feedback');
  await driver.wait(
    async () => (await feedback.getText()).trim() !== 'Đang tìm sản phẩm...',
    timeout
  );

  assert.match(
    await feedback.getText(),
    /Không tìm thấy sản phẩm phù hợp/
  );

  const empty = await element('search-empty');
  await driver.wait(async () => {
    return (await empty.isDisplayed()) === true;
  }, timeout);

  const results = await element('search-results');
  const cards = await results.findElements(By.css('.product-card'));
  assert.equal(cards.length, 0);

  assert.equal(
    await driver.executeScript('return new URL(location.href).searchParams.get("q")'),
    'sanpham-khong-ton-tai-xyz-987654'
  );
});

test('TC_SEARCH_02: Tìm kiếm với từ khóa trống', async () => {
  const keyword = await visibleElement('search-keyword');
  await keyword.clear();
  await (await visibleElement('search-submit')).click();

  await waitForSearch();

  const feedback = await element('search-form-feedback');
  await driver.wait(
    async () => (await feedback.getText()).trim() !== 'Đang tìm sản phẩm...',
    timeout
  );

  const results = await element('search-results');
  const cards = await results.findElements(By.css('.product-card'));
  const empty = await element('search-empty');

  if (cards.length === 0) {
    assert.equal(await empty.isDisplayed(), true);
    assert.match(await empty.getText(), /Không tìm thấy sản phẩm phù hợp/);
  } else {
    assert.equal(await empty.isDisplayed(), false);
    assert.ok(cards.length > 0);
  }

  assert.equal(
    await driver.executeScript('return new URL(location.href).searchParams.get("q")'),
    ''
  );
});

test('TC_SEARCH_03: Gửi từ khóa có khoảng trắng ở hai đầu', async () => {
  const keyword = await visibleElement('search-keyword');
  await keyword.clear();
  await keyword.sendKeys('   iphone   ');
  await (await visibleElement('search-submit')).click();

  await waitForSearch();

  assert.equal(
    await driver.executeScript('return new URL(location.href).searchParams.get("q")'),
    'iphone'
  );
});

test('TC_SEARCH_04: Tìm kiếm không làm tải lại tài liệu', async () => {
  const marker = 'search-document-marker';
  await driver.executeScript(
    'window.__searchTestMarker = arguments[0]',
    marker
  );

  const keyword = await visibleElement('search-keyword');
  await keyword.clear();
  await keyword.sendKeys('iphone');
  await (await visibleElement('search-submit')).click();

  await waitForSearch();

  assert.equal(
    await driver.executeScript('return window.__searchTestMarker'),
    marker,
    'Tìm kiếm không được tải lại toàn bộ trang'
  );
});
test('TC_SEARCH_05: Tìm kiếm thành công với từ khóa hợp lệ', async () => {
  const keyword = await visibleElement('search-keyword');
  await keyword.clear();
  await keyword.sendKeys('iphone');
  await (await visibleElement('search-submit')).click();

  await waitForSearch();

  const results = await driver.findElements(
    By.css('[data-testid^="product-detail-"]')
  );

  assert.ok(results.length > 0, 'Phải hiển thị sản phẩm phù hợp với từ khóa');

  assert.equal(
    await driver.executeScript('return new URL(location.href).searchParams.get("q")'),
    'iphone'
  );
});