# UC-04 — Đăng nhập, phiên và đăng xuất

Đã đối chiếu dbo.Users và xác nhận login SQL có SELECT. Sử dụng Id, FullName,
Email, PasswordHash, Role, IsActive; không sửa schema, quyền, Users hoặc seed.
UC-01 tạo Argon2id PHC v=19, memory=65536 KiB, passes=3, parallelism=1, salt 16 byte,
key 32 byte. Verify đọc tham số/salt/hash từ PHC, dẫn xuất bằng Argon2id và so sánh
buffer timingSafeEqual; không so sánh mật khẩu plaintext. Có giới hạn chi phí PHC.

## API

| Endpoint | Input/kết quả |
|---|---|
| POST /api/auth/login | JSON `{uname: "email", pwd: "password"}`; 200 authenticated/user/message và Set-Cookie |
| POST /api/auth/logout | 200 authenticated=false/user=null; hủy session server và cookie; gọi lại vẫn an toàn |
| GET /api/auth/me | 200 `{authenticated, user}`; chưa đăng nhập/phiên hết hạn trả false và user=null |

user công khai chỉ có id, fullname, email, role; không trả PasswordHash, password,
session token trong JSON. SQL dùng tham số @email/@id. Email trim/lowercase,
mật khẩu giữ nguyên. Dữ liệu sai/trống: 400. Email không tồn tại, mật khẩu sai,
tài khoản inactive hoặc role không hợp lệ: cùng 401 INVALID_CREDENTIALS và thông báo
chung. Email không tồn tại vẫn chạy dummy Argon2id verify. Lỗi SQL: 503 chung.
Giới hạn 20 lần login hợp lệ cú pháp/IP/15 phút: 429 + Retry-After, không khóa SQL user.

## Phiên và phân quyền

- Cookie cellphones.sid chứa 32 byte random dạng base64url; HttpOnly, SameSite=Strict,
  Path=/, thời hạn tuyệt đối 8 giờ. Server chỉ giữ SHA-256 của token và userId/thời hạn.
- Cookie Secure khi request HTTPS hoặc NODE_ENV=production. Không lưu password/token
  trong localStorage/sessionStorage, URL hoặc API JSON.
- Login thành công thay phiên cũ, logout hủy token ngay; phiên giả/hết hạn bị từ chối.
- /me và middleware đọc lại Users để lấy role/trạng thái hiện tại. User bị disable/xóa
  hoặc role lạ sẽ bị hủy phiên. Không nhận role từ client.
- POST login/logout kiểm tra Origin khi có và từ chối Sec-Fetch-Site=cross-site.
  Không bật CORS cross-origin. Auth response có Cache-Control:no-store.
- Phiên và bộ đếm thử login giữ trong bộ nhớ, giới hạn 10000 mục mỗi loại. Restart
  backend làm mất phiên/bộ đếm. Phù hợp demo một Node process; nhiều process/production
  cần shared session/rate-limit store với TTL, chưa nằm trong UC này.

Middleware sẵn tại app.locals.auth.requireAuth và requireRole. Ví dụ cho UC sau:

```js
app.get('/api/admin/example',
  app.locals.auth.requireAuth,
  app.locals.auth.requireRole('ADMIN'),
  handler);
```

requireAuth trả 401 nếu chưa đăng nhập, 503 nếu không kiểm tra được SQL;
requireRole trả 403 nếu sai role. Phải đặt trước handler, không dựa vào giao diện.
UC-08/UC-10 chưa triển khai API nghiệp vụ; account.html/admin/products.html vẫn là
giao diện khung, không phải endpoint cung cấp dữ liệu riêng tư được bảo vệ.

HTTPS kết thúc tại reverse proxy loopback: chỉ khi cấu hình proxy đúng, có thể đặt
TRUST_PROXY_LOOPBACK=true trong môi trường khởi động (không cần sửa .env). Khi đó
Express tin X-Forwarded-Proto từ loopback. Nếu proxy không phải loopback, cần cấu hình
trust proxy đúng hạ tầng trước khi dùng. Không bật tin mọi proxy.
NODE_ENV=production yêu cầu HTTPS để trình duyệt gửi cookie Secure.

## Giao diện và cách chạy

```powershell
cd D:\Downloads\KTPM_Nhom9\KTPM_Nhom09
npm start
```

Ctrl+C đúng server cũ trước khi chạy lại. Mở http://localhost:3000/login.html.
Nhập email/mật khẩu đã đăng ký UC-01. Form dùng fetch không reload, xóa ô mật khẩu
sau response và hiện feedback. Không tự tạo user/admin hoặc đổi role trong SQL.
Đăng nhập thành công hiện tên/vai trò, link Tài khoản và nút Đăng xuất trên thanh
điều hướng các trang; reload trang vẫn kiểm tra phiên qua /me. Nút Đăng xuất gửi POST.
Trang tài khoản là liên kết chuẩn bị cho UC-08, chưa triển khai sửa thông tin.

Kiểm tra thủ công: đăng nhập đúng; thử mật khẩu sai/email lạ (cùng thông báo),
gửi form trống; reload và chuyển search/detail để kiểm tra trạng thái; logout rồi
reload phải trở về chưa đăng nhập. Kiểm tra cookie trong DevTools: HttpOnly,
SameSite=Strict; khi HTTPS thêm Secure. Không cần thay dữ liệu để test inactive/admin:
đã có test mô phỏng các trường hợp này.

Locator giữ nguyên login-form, login-email, login-password, login-submit,
login-form-feedback. Bổ sung auth-session, auth-account, auth-logout (hai mục sau
chỉ có khi đăng nhập). login-form-feedback có data-state=success/error và aria-live.

## Xác minh

`npm test`, `npm run check`. Test dùng Argon2id thật và repository mô phỏng cho lifecycle,
rotation, cookie flags, CSRF, CUSTOMER/ADMIN, inactive, hết hạn, SQL binding, lỗi chung,
UI login/logout; kèm toàn bộ hồi quy UC-01/02/03. Không chạy Selenium.
SQL thật: dùng tài khoản giả đã tồn tại từ đợt test trước, login 200, /me nhận CUSTOMER,
logout 200 và token cũ không còn hiệu lực. Không ghi dữ liệu SQL.
Health/search/detail/login.html đều 200 khi kiểm tra mã mới. Chưa QA trình duyệt thật.

Kết quả cuối: 31 test đạt, 1 test SQL opt-in skip, 0 lỗi; npm run check đạt.

File mới: backend/src/auth/login.js, frontend/assets/auth.js,
tests/backend/login.test.js, tests/frontend/login.test.js và tài liệu này.
File sửa: backend/src/auth/password.js, backend/src/server.js, frontend/assets/styles.css,
package.json, README.md, docs/uc-mapping.md. login.html hoàn thiện form;
index.html, register.html, search.html, product-detail.html, account.html,
add-to-cart.html, cart.html, cart-manage.html, checkout.html, admin/products.html
chỉ thêm script auth.js để cập nhật trạng thái thanh điều hướng.
