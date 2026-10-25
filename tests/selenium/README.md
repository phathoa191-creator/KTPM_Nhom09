# Selenium WebDriver — UC-01 Đăng ký tài khoản

Node.js >=24.11.1, JavaScript CommonJS, selenium-webdriver, Chrome và node:test.
Không cần Java/JUnit. Không đọc `.env` hay truy cập SQL trực tiếp từ test Selenium.

## Chạy

Ở thư mục gốc dự án:

```powershell
npm install
npm start
```

Giữ terminal backend chạy. Trong terminal thứ hai, cùng thư mục:

```powershell
npm run test:selenium
```

Backend phải chạy mã UC-01 hiện tại; `/api/health/db` phải trả 200.
Mặc định dùng http://localhost:3000 và Chrome headless. Selenium Manager tìm Chrome
và driver phù hợp; lần đầu có thể cần Internet để tải browser/driver.
Tài liệu chính thức: https://www.selenium.dev/documentation/selenium_manager/

Để xem Chrome thao tác trực tiếp:

```powershell
$env:SELENIUM_HEADLESS='false'
npm run test:selenium
Remove-Item Env:SELENIUM_HEADLESS
```

Các tùy chọn không chứa thông tin nhạy cảm:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| SELENIUM_BASE_URL | http://localhost:3000 | URL backend/frontend cùng origin |
| SELENIUM_HEADLESS | true | Đặt false để hiện Chrome |
| SELENIUM_TIMEOUT_MS | 15000 | Thời hạn explicit wait |
| CHROME_BINARY | tự tìm | Đường dẫn chrome.exe nếu cài ở vị trí riêng |
| CHROMEDRIVER_PATH | Selenium Manager | Đường dẫn driver khớp phiên bản Chrome nếu chạy offline |
| SE_CACHE_PATH | tests/selenium/.cache | Thư mục cache browser/driver có quyền ghi |

Nếu có bản Chrome for Testing giải nén tại `.cache/chrome-win64/chrome.exe` và
driver khớp phiên bản tại `.cache/chromedriver-win64/chromedriver.exe`, suite tự dùng
cặp này mà không cần tải lại. CHROME_BINARY/CHROMEDRIVER_PATH ưu tiên hơn cache.
Các binary/cache và ảnh lỗi không được đưa vào Git.

## Test case và assertion

| Test | Cách kiểm tra |
|---|---|
| TC_01 | Nhập đủ trường, email UUID mới mỗi lần; thông báo thành công và form được reset |
| TC_02 | Gửi form trống; kiểm tra thông báo cho cả 5 trường và aria-invalid=true |
| TC_03 | Tạo fixture email riêng bằng giao diện, đăng ký lại với email viết hoa; kiểm tra lỗi trùng email |
| TC_04 | Email sai định dạng; kiểm tra thông báo và aria-invalid của email |
| TC_05 | Hai mật khẩu khác nhau; kiểm tra thông báo và aria-invalid của xác nhận |

Mỗi test mở lại register.html; TC_03 không phụ thuộc dữ liệu/việc chạy TC_01.
Tất cả locator dùng data-testid hiện có, bao gồm register-address.
Chỉ dùng explicit wait (phần tử xuất hiện/hiển thị/enabled, feedback đúng và form hết busy),
không dùng sleep. Tất cả case kiểm tra nút submit được bật lại và document không reload.
Assertion sai hoặc lỗi WebDriver làm lệnh trả exit code khác 0.

Chạy riêng một case:

```powershell
node --test --test-name-pattern="TC_03" tests/selenium/register.test.js
```

## Dữ liệu test và ảnh lỗi

Mỗi lượt chạy đầy đủ thành công tạo 2 tài khoản test thật: một cho TC_01 và một
fixture cho TC_03. Email dạng selenium-uc01-<UUID>@example.test, tên/địa chỉ và
mật khẩu ứng dụng đều là dữ liệu giả. Không sử dụng tài khoản hoặc mật khẩu SQL.
Các record test được giữ lại; suite không xóa dữ liệu, thay schema hoặc cấp quyền.
Chỉ chạy trên database demo/test. Có thể nhận diện dữ liệu test bằng tiền tố email
khi cần dọn thủ công theo quy trình của dự án.

Khi một case lỗi, suite cố chụp PNG vào tests/selenium/artifacts/; thư mục này được
Git ignore. Browser được đóng ở after hook. Nếu setup Chrome/backend thất bại,
node:test báo lỗi setup; các case chưa thực thi không được coi là đạt.

Test này chạy thật qua browser và API; `npm test` vẫn chạy các test backend/frontend
mô phỏng riêng, không tự chạy Selenium hoặc tạo dữ liệu SQL.

## Kết quả xác minh ngày 24/10/2026

Chạy `npm run test:selenium` với Chrome for Testing/ChromeDriver 156.0.8078.47
headless trên Windows: TC_01, TC_02, TC_03, TC_04, TC_05 đều đạt (5/5, không skip).
Hai tài khoản giả đã được tạo qua giao diện; không xóa dữ liệu sau test.
`npm test`: 12 bài đạt, 1 bài tích hợp SQL opt-in được skip đúng thiết kế;
`npm run check` và kiểm tra cú pháp file Selenium đều đạt.
