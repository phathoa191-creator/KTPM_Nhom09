# CellphoneS Testing Demo

## Giới thiệu dự án

Website demo phục vụ học tập và kiểm thử phần mềm, đã triển khai 10 Use Case từ đăng ký,
đăng nhập, tìm kiếm, giỏ hàng đến đặt hàng và quản trị sản phẩm. Frontend gọi API Express;
dữ liệu nghiệp vụ được lưu trong SQL Server. Đây là dự án minh họa độc lập, không phải
website CellphoneS chính thức và không xử lý thanh toán thực tế.

Nhóm có 4 thành viên: 1 người phụ trách Frontend, Backend, SQL Server và tích hợp;
3 người phụ trách Selenium.

## Công nghệ sử dụng

- Frontend: HTML5, CSS, JavaScript thuần, UTF-8; selector `data-testid` cho kiểm thử.
- Backend: Node.js, Express 5; `mssql` kết nối SQL Server.
- Database: SQL Server/SQL Server Express, database `CellphoneS_Testing`.
- Xác thực: session phía server, cookie HttpOnly/SameSite Strict; mật khẩu Argon2id.
- Kiểm thử: `node:test`, test Backend/API và Frontend DOM mô phỏng; Selenium WebDriver
  với JavaScript/CommonJS và Chrome cho UC-01.
- Dependency được quản lý bằng npm và `package-lock.json`.

## Cấu trúc thư mục

```text
backend/src/
  server.js           # Express, đăng ký route và phục vụ frontend
  config/             # Kiểm tra cấu hình database
  database/           # Pool kết nối mssql
  auth/               # Đăng ký, đăng nhập, session và phân quyền
  products/           # Tìm kiếm, chi tiết sản phẩm
  cart/               # Xem, thêm, cập nhật và xóa dòng giỏ
  orders/             # Đặt hàng COD trong transaction
  account/            # Hồ sơ tài khoản
  admin/              # Bảo trì sản phẩm ADMIN
frontend/
  *.html              # Trang chủ và các trang nghiệp vụ
  admin/products.html # Quản trị sản phẩm
  assets/             # JavaScript, CSS, ảnh
database/
  schema.proposed.sql # Script khởi tạo tham khảo, không tự chạy
  seed-products.sql   # Seed thủ công có kiểm soát
docs/                 # Tài liệu nghiệp vụ, SQL và bàn giao Selenium
tests/
  backend/            # Unit/API, SQL mô phỏng và integration opt-in
  frontend/           # Kiểm thử JavaScript giao diện bằng DOM mô phỏng
  selenium/           # Suite Selenium UC-01
.env.example          # Mẫu cấu hình, không chứa credential thật
package.json
package-lock.json
```

## Danh sách 10 Use Case

Base URL mặc định: `http://localhost:3000`. Trang chủ: `/index.html`.
Lấy `productId` từ tìm kiếm/API thật, không suy ra từ SKU.

| UC | Chức năng | Trang giao diện | API chính |
|---|---|---|---|
| 01 | Đăng ký | `/register.html` | `POST /api/auth/register` |
| 02 | Tìm kiếm sản phẩm | `/search.html` | `GET /api/products` |
| 03 | Xem chi tiết | `/product-detail.html?id=<productId>` | `GET /api/products/:id` |
| 04 | Đăng nhập/đăng xuất | `/login.html` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| 05 | Xem giỏ hàng | `/cart.html` | `GET /api/cart` |
| 06 | Đặt hàng COD | `/checkout.html` | `POST /api/orders` |
| 07 | Thêm giỏ hàng | `/product-detail.html?id=<productId>` | `POST /api/cart/items` |
| 08 | Xem/cập nhật hồ sơ | `/account.html` | `GET/PATCH /api/account` |
| 09 | Sửa số lượng/xóa từng dòng giỏ | `/cart-manage.html` | `PATCH/DELETE /api/cart/items/:productId` |
| 10 | Bảo trì sản phẩm ADMIN | `/admin/products.html` | `GET/POST /api/admin/products`, `GET/PATCH /api/admin/products/:id`, `PATCH /api/admin/products/:id/status`, `GET /api/admin/categories` |

`/add-to-cart.html` chỉ hướng dẫn chọn sản phẩm. UC-07 cộng số lượng; UC-09 thay thế
số lượng tuyệt đối. Thêm giỏ không giữ chỗ tồn kho. UC-06 đọc giá SQL, tạo đơn/snapshot,
trừ kho và xóa dòng giỏ trong cùng transaction; cùng `requestKey` của cùng user trả lại
đơn cũ, không trừ kho thêm.

UC-05–09 yêu cầu session; UC-10 thêm `requireRole('ADMIN')` tại Backend. Đăng ký thành công
hiển thị thông báo khoảng 1 giây rồi sang `/login.html`, không tự đăng nhập. Đăng nhập
thành công xác minh `/api/auth/me` rồi về `/index.html` cho cả CUSTOMER/ADMIN hoặc
`returnTo` nội bộ trong allowlist. Không redirect tới URL bên ngoài.

## Yêu cầu môi trường Node.js và SQL Server

- Node.js **>=24.11.1** và npm theo `package.json`; cần Argon2 của `node:crypto`.
- SQL Server/SQL Server Express đang chạy, cấu hình TCP/IP và cổng/instance đúng.
- Database `CellphoneS_Testing` đã được chuẩn bị với Users, Categories, Products,
  ProductImages, Carts, CartItems, Orders, OrderItems và các ràng buộc cần thiết.
- SQL login ứng dụng riêng với quyền tối thiểu; không dùng `sa`. Tài khoản ADMIN
  website khác với SQL login. Credential và ADMIN được người phụ trách cấp riêng.
- Chrome/driver tương thích để chạy Selenium; Cốc Cốc dùng cho kiểm thử thủ công.

Xem [chuẩn bị SQL Server](docs/sql-server-preparation.md) và
[kết nối database](docs/backend-database-connection.md). Backend không tự migrate,
seed, cấp quyền hoặc tạo ADMIN. Không chạy lại schema/seed trên database hiện hữu tùy ý.

## Cài đặt và cấu hình `.env`

```powershell
cd D:\Downloads\KTPM_Nhom9\KTPM_Nhom09
npm ci
```

Nếu **chưa có `.env`**, sao chép `.env.example` thành `.env`, rồi điền cấu hình môi trường
riêng. Không ghi đè `.env` hiện có, không commit/chia sẻ nội dung file này.

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng HTTP, mặc định 3000 |
| `DB_SERVER` | Chỉ host/IP, không ghép instance hoặc port |
| `DB_PORT` | Cổng TCP SQL thực tế |
| `DB_INSTANCE` | Tên instance, ví dụ SQLEXPRESS; dùng thay DB_PORT |
| `DB_DATABASE` | Database ứng dụng: CellphoneS_Testing |
| `DB_USER`, `DB_PASSWORD` | SQL login ứng dụng và mật khẩu được cấp riêng |
| `DB_ENCRYPT` | `true`/`false` theo môi trường |
| `DB_TRUST_SERVER_CERTIFICATE` | `true`/`false` theo cấu hình chứng chỉ |

Chọn **đúng một** trong `DB_PORT` và `DB_INSTANCE`, để trống biến còn lại. Cổng 1433
trong mẫu không bảo đảm là cổng SQL Express thực tế. Không ghi credential thật vào
README, mã test, URL, log hoặc ảnh chụp.

## Chạy website

```powershell
npm start
```

Mở `http://localhost:3000/index.html` hoặc origin tương ứng nếu PORT khác. Dùng cùng
origin cho frontend/API; không mở file HTML trực tiếp hoặc trộn localhost/127.0.0.1.

- `GET /api/health`: kiểm tra HTTP server.
- `GET /api/health/db`: 200 với `database: connected` khi SELECT kiểm tra thành công;
  503 khi DB không sẵn sàng. Health không xác nhận đủ mọi quyền ghi nghiệp vụ.
- Nếu cổng bận, dừng đúng server cũ trước khi restart; Ctrl+F5 nếu browser cache assets cũ.
- Đăng ký CUSTOMER qua UC-01, đăng nhập bằng tài khoản được chuẩn bị cho môi trường test.

## Chạy kiểm thử

### Kiểm tra cú pháp

```powershell
npm run check
```

Kiểm tra cú pháp các module JavaScript liệt kê trong script; không thay thế test nghiệp vụ.

### Unit / Frontend / Backend

```powershell
npm test
```

Chạy `tests/backend/*.test.js` và `tests/frontend/*.test.js`, không chạy Selenium.
Mặc định dùng repository/SQL/DOM mô phỏng; ba SQL integration test được SKIP.
Để giữ chế độ không ghi SQL, không bật `UC01_SQL_INTEGRATION`, `UC07_SQL_INTEGRATION`,
`UC06_SQL_INTEGRATION` hoặc `UC06_SQL_WRITE_APPROVED`. Test SQL opt-in cần cho phép riêng;
rollback vẫn có thể tăng bộ đếm IDENTITY/ROWVERSION.

### Selenium UC-01

Giữ server chạy, mở terminal thứ hai tại thư mục gốc và chỉ chạy khi được phép tạo user test:

```powershell
npm run test:selenium
```

Script hiện chỉ chạy `tests/selenium/register.test.js` tuần tự với 5 case, không phải
suite 10 UC. Thành công dùng explicit wait tới `/login.html`; TC_03 mở lại register
sau khi tạo fixture. Không dùng fixed sleep để chờ redirect.

Tùy chọn: `SELENIUM_BASE_URL`, `SELENIUM_HEADLESS`, `SELENIUM_TIMEOUT_MS`, `CHROME_BINARY`,
`CHROMEDRIVER_PATH`, `SE_CACHE_PATH`. Xem [hướng dẫn browser/driver](tests/selenium/README.md);
assertion lịch sử trong tài liệu cũ cần đối chiếu file test hiện tại đã hỗ trợ redirect.

**TC_01 và bước chuẩn bị TC_03 ghi SQL thật**; chạy đủ thành công thường tạo hai user giả
có email UUID. Suite không tự xóa fixture. Chỉ chạy trên môi trường test được phép;
không lưu password, cookie hoặc SQL credential trong artifacts.

## Kết quả kiểm thử đã xác nhận

| Nhóm kiểm thử | Kết quả |
|---|---|
| Manual Regression | **10/10 Use Case PASS** |
| Selenium UC-01 | **5 PASS, 0 FAIL**, theo lần chạy thực tế được xác nhận |
| Unit/Frontend/Backend | **73 PASS, 0 FAIL, 3 SKIP**, theo lần chạy gần nhất |
| Selenium UC-02 đến UC-10 | **Chưa có kết quả** |

Đây là kết quả đã xác nhận, không phải tuyên bố chạy lại khi cập nhật README.
Ba SKIP là SQL integration opt-in của đăng ký, giỏ hàng và đặt hàng; SKIP không tính PASS.

## Tài liệu bàn giao Selenium

- [Tổng quan và môi trường](docs/selenium-handover/README.md)
- [10 UC, URL, API và selector](docs/selenium-handover/use-cases.md)
- [Dữ liệu test và bảo mật](docs/selenium-handover/test-data.md)
- [Kịch bản đề xuất](docs/selenium-handover/test-scenarios.md)
- [Kiểm tra và khôi phục an toàn](docs/selenium-handover/database-reset.md)

Một số tài liệu bàn giao trước đây còn phân công 5 thành viên và lưu ý suite UC-01
chưa sửa redirect. Nhóm hiện có 4 người, trong đó 3 người Selenium; cần phân công lại
khi dùng tài liệu. Suite UC-01 hiện đã sửa redirect; thông tin lịch sử không thay thế
mã hiện tại. Hướng dẫn nghiệp vụ nằm trong các file `docs/uc*.md`; UC-05/07 dùng chung
[uc05-uc07-cart.md](docs/uc05-uc07-cart.md).

## Giới hạn và lưu ý dữ liệu kiểm thử

- Session RAM có thời hạn 8 giờ, mất khi restart server; cookie HttpOnly không đọc bằng
  JavaScript. Rate limit login theo IP có thể ảnh hưởng test song song.
- Chỉ COD; chưa có thanh toán online, API hủy đơn/hoàn kho hoặc lịch sử đơn hàng.
- UC-08 chưa đổi mật khẩu/email; UC-09 chưa có API xóa toàn bộ giỏ. UC-10 không hard delete
  sản phẩm, chỉ bật/tắt IsActive; quản lý ảnh SortOrder=0, chưa hỗ trợ xóa ảnh.
- SKU/Slug Admin áp dụng thêm quy tắc ASCII chữ/số/-/_. Version chống ghi đè bản sửa cũ,
  kể cả khi checkout đã làm thay đổi tồn kho.
- Một số card trang chủ là minh họa; dùng tìm kiếm thật lấy ID/giá/stock hiện tại.
- Mỗi worker dùng user/session/email/SKU và sản phẩm checkout riêng. Không sửa stock hoặc
  trạng thái hàng thành viên khác đang dùng; không retry mutation mù khi mất phản hồi.
- Seed không phải reset. Cleanup/restore cần manifest, phạm vi cụ thể và phê duyệt;
  không xóa user/order/product, TRUNCATE hoặc reseed ID tùy tiện để làm test PASS.
- Không công khai `.env`, password, cookie, token, PasswordHash. Test mô phỏng/Selenium
  không tự chứng minh khóa/rollback SQL dưới tải; integration ghi SQL và concurrency thật
  cần kế hoạch riêng được duyệt.
