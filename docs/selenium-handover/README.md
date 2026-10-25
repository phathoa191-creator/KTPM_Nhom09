# Bàn giao Selenium — CellphoneS Testing Demo

Người dùng xác nhận hồi quy thủ công 10/10 UC PASS. Tài liệu này đối chiếu mã nguồn
hiện hành; không đồng nghĩa suite Selenium 10 UC đã được viết/chạy hoặc đã PASS.
Không có Selenium hay thao tác SQL ghi được chạy trong đợt chuẩn bị bàn giao.

- [URL, API, session và selector](use-cases.md)
- [Dữ liệu test và bảo mật](test-data.md)
- [Kịch bản và phân công 5 thành viên](test-scenarios.md)
- [Cô lập, kiểm tra và khôi phục dữ liệu](database-reset.md)

## Cài đặt và khởi động

Yêu cầu theo package.json: Node.js >=24.11.1, npm, SQL Server đang chạy và cấu hình
ứng dụng đã được người phụ trách chuẩn bị. Không gửi/copy nội dung .env vào báo cáo.
Có package-lock.json; dùng npm ci khi thiết lập checkout mới. Không chạy cài lại trên
server đang phục vụ nhóm nếu chưa thống nhất. Dependency chính: express, mssql;
devDependency selenium-webdriver. Không có bước migrate/seed tự động.

```powershell
cd D:\Downloads\KTPM_Nhom9\KTPM_Nhom09
npm ci
npm start
```

Giữ terminal server chạy; dùng cùng origin http://localhost:3000 cho cả frontend/API.
Không mở file://, không trộn localhost và 127.0.0.1. PORT có thể khác nếu môi trường
đã cấu hình; thay BASE_URL đồng nhất, không sửa .env để chạy từng thành viên.

Kiểm tra môi trường trước test:

1. GET /api/health trả 200 status=ok (chưa chứng minh DB sẵn sàng).
2. GET /api/health/db trả 200 database=connected; 503 thì dừng test phụ thuộc DB.
   Health DB chỉ SELECT 1, không xác nhận mọi quyền nghiệp vụ.
3. Mở /index.html, /search.html; không lỗi tải assets; kiểm tra tiếng Việt.
4. Đăng nhập bằng tài khoản test được bàn giao riêng; /api/auth/me trả đúng user/role.
5. Đối chiếu SKU/productId/categoryId/stock từ API trước các case ghi.
6. Nếu cổng bận: dừng đúng tiến trình cũ qua terminal của nó rồi restart; Ctrl+F5.

## Kiểm tra chất lượng không chạy Selenium

```powershell
npm run check
npm test
```

Các SQL integration test là opt-in. Trước khi chạy npm test, kiểm tra không có biến
UC01_SQL_INTEGRATION, UC07_SQL_INTEGRATION, UC06_SQL_INTEGRATION đang bật và không có
UC06_SQL_WRITE_APPROVED=YES. Xem tên biến chính xác ở các file *.integration.test.js;
không bật bất kỳ opt-in ghi SQL nào trong lượt smoke thông thường.

Không nhầm npm test với npm run test:selenium. Script test:selenium hiện chỉ chạy
tests/selenium/register.test.js, không phải bộ 10 UC; script đó tạo user SQL thật.
Suite UC-01 cũ còn assertion submit phải enabled và trang không đổi sau thành công.
Hiện tại đăng ký thành công giữ submit disabled và chuyển /login.html sau 1 giây:
nhóm Selenium phải cập nhật assertion thành công trước khi dùng suite cũ.
Không sửa ứng dụng chỉ để làm assertion cũ PASS.

## Browser và cách chờ

Suite có sẵn dùng Node.js/CommonJS + node:test + selenium-webdriver + Chrome;
không bắt buộc Java/JUnit. Nhóm thống nhất browser chạy automation và phiên bản
driver; PASS thủ công trên Cốc Cốc không tự chứng minh automation Chrome/Cốc Cốc.
Biến hỗ trợ của suite cũ: SELENIUM_BASE_URL, SELENIUM_HEADLESS, SELENIUM_TIMEOUT_MS,
CHROME_BINARY, CHROMEDRIVER_PATH, SE_CACHE_PATH. Đây không phải biến tự có của ứng dụng.

Ưu tiên By.css('[data-testid="..."]'). Dùng explicit wait cho visibility, enabled,
URL, trạng thái nội dung; không chỉ wait elementLocated vì nhiều panel tồn tại nhưng hidden.
Không dùng sleep cố định để đợi redirect 1 giây. Sau refresh/mutation, tìm lại row/element
để tránh stale element. Loading và thông báo tiếng Việt phải kiểm tra sau khi response về.
Lỗi môi trường/fixture phải báo riêng; không coi skip là PASS.

## Cấu trúc và nguồn đối chiếu

frontend/: HTML/JS/CSS tĩnh, Express phục vụ cùng origin.
backend/src/: server, config/database, database/pool, auth, products, cart, orders,
account, admin. database/: schema.proposed.sql và seed-products.sql là script thủ công,
không phải reset/migration có thể chạy lại tùy ý. tests/backend và tests/frontend là
unit/API/VM mock; tests/selenium hiện có UC-01 riêng.

docs/uc-mapping.md và một số README cũ còn câu mô tả giai đoạn skeleton, locator demo,
đổi mật khẩu/xóa toàn bộ giỏ. Với bàn giao hiện tại dùng bảng use-cases.md trong thư mục
này và mã nguồn làm căn cứ: không có đổi mật khẩu hoặc API xóa toàn bộ giỏ.
Trang chủ còn card minh họa, một số link chi tiết không có ID; dùng search thật để lấy
đường dẫn product-detail.html?id=... cho UC-03/07.

Lưu bằng chứng: case ID, runId/member, browser, timestamp, URL không chứa secret,
Expected/Actual, ảnh dữ liệu giả, method/status/code (đã lọc secret). Không đính kèm
cookie, token, request password, .env, PasswordHash hoặc HAR chưa làm sạch.

## Kết quả kiểm tra bàn giao

| Kiểm tra | Kết quả |
|---|---|
| npm run check | PASS |
| npm test | 76 test: 73 PASS, 0 FAIL, 3 SKIP |
| SQL integration | 3 SKIP đúng opt-in: register, cart, orders |
| Selenium trong lượt này | Không chạy |
| Hồi quy thủ công 10 UC | Người dùng báo 10/10 PASS; không tự chạy lại trong lượt này |
| Phạm vi thay đổi | Chỉ tạo 5 Markdown trong docs/selenium-handover; không sửa mã chức năng hoặc SQL |

Rủi ro còn lại: suite Selenium UC-01 cũ chưa tương thích redirect; chưa có suite tự động
đủ 10 UC được xác minh; tài liệu cũ còn nội dung lịch sử. Login rate limit chung theo
IP có thể ảnh hưởng 5 thành viên; fixture stock/role/trạng thái phải cô lập. Session RAM
mất khi server restart. Không có API hủy đơn/hoàn kho, xóa user, xóa toàn bộ giỏ hoặc đổi
mật khẩu. Test SQL concurrency thật và QA automation trên browser nhóm chọn chưa được
thực hiện trong lượt bàn giao này.
