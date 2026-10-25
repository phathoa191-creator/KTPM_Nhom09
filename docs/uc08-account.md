# UC-08 — Xem và cập nhật tài khoản

## API

- `GET /api/account`: requireAuth; trả `{fullName,email,phone,address}` của session hiện tại.
- `PATCH /api/account`: requireAuth + sameOrigin; chỉ nhận fullName, phone, address.
  Cập nhật riêng các trường có mặt, body rỗng hoặc field khác trả 400.
  Không nhận Id/userId/email/role/PasswordHash/IsActive/UpdatedAt từ client.
- Hai API dùng Cache-Control: no-store. 200 thành công, 400 validation (errors theo field),
  401 thiếu session hoặc user không còn active, 403 cross-origin, 503 SQL lỗi chung.
  JSON sai/quá lớn theo xử lý INVALID_BODY hiện có.

## Validation và SQL

FullName string trim, không trắng, tối đa 100 đơn vị UTF-16 theo CK_Users_Name admin xác nhận.
Phone là string đúng /^0[0-9]{9}$/; null hoặc chuỗi rỗng chính xác `""` chuyển NULL.
Phone có khoảng trắng bị từ chối, không ép number hoặc tự chuẩn hóa đầu số.
Address string tối đa 500 đơn vị UTF-16 (kiểm tra độ dài đầu vào trước trim);
null/chuỗi rỗng/chỉ khoảng trắng chuyển NULL. Không nhận kiểu khác.

SQL parameterized, tên cột từ whitelist, một UPDATE nguyên tử cho toàn request,
WHERE Id=@userId AND IsActive=1, cập nhật UpdatedAt bằng SYSUTCDATETIME().
OUTPUT chỉ bốn trường hồ sơ; kiểm tra rowsAffected=1. Không thay Email/Role/IsActive/hash.
SELECT và UPDATE theo cột FullName/Phone/Address/UpdatedAt đã kiểm tra chỉ đọc.
Không thay schema, quyền, seed, .env hoặc dữ liệu trong quá trình triển khai.

## Frontend

account.html tải GET thật, email readonly, số điện thoại/địa chỉ có thể xóa.
PATCH credentials same-origin, chặn nhấn đúp, hiện lỗi từng trường.
account-profile-updated yêu cầu auth.js đọc lại auth/me rồi cập nhật header.
auth-state-changed, pageshow, focus tải lại hồ sơ, xóa dữ liệu cũ ngay và bỏ phản hồi
đến muộn bằng generation counter. Khi đổi tài khoản ở tab khác, phát hiện khi focus
hoặc có sự kiện auth; chưa có đồng bộ realtime giữa các tab.
Không dùng innerHTML cho dữ liệu người dùng, không lưu hồ sơ ở localStorage/sessionStorage.
Đổi mật khẩu chưa hỗ trợ; locator form cũ giữ lại nhưng hidden/inert/disabled,
không có submit handler giả hoặc API đổi mật khẩu.

Locator giữ: account-form, account-name, account-phone, account-save,
account-form-feedback, page-feedback và nhóm password-* ẩn.
Thêm: account-email, account-address, account-login,
account-fullName-error, account-phone-error, account-address-error.

## Kiểm thử và Cốc Cốc

`npm run check`, `npm test`: unit/API với repository mô phỏng, SQL statement/parameter,
validation biên UTF-16, null, field cấm, auth/CSRF/logout, no-store, lỗi SQL,
frontend VM, lỗi theo trường, gửi đúp và bỏ response sau logout, UTF-8 và hồi quy UC-01–07.
Không chạy Selenium hoặc test SQL ghi. Chưa xác minh UPDATE thật trên SQL/Cốc Cốc.

1. Chạy npm start (restart đúng server cũ nếu cần), mở http://localhost:3000/account.html,
   Ctrl+F5 nếu cache cũ. Chưa đăng nhập phải thấy yêu cầu đăng nhập, không hồ sơ mẫu.
2. Đăng nhập, chọn Tài khoản: email chỉ đọc, tên/phone/address từ SQL.
3. Sửa tên tiếng Việt, điện thoại 10 số bắt đầu 0 và địa chỉ; Lưu thông tin.
   Header đổi tên; tải lại còn thông tin. Bước lưu sẽ ghi SQL thật.
4. Thử điện thoại sai hoặc họ tên trắng: lỗi theo trường, không lưu một phần.
5. Xóa điện thoại/địa chỉ rồi lưu: hai trường NULL; email vẫn giữ nguyên.
6. Logout/chuyển tài khoản: không còn hồ sơ cũ. Mở hai profile để kiểm tra cách ly.
7. Chức năng đổi mật khẩu không hoạt động và có thông báo chưa hỗ trợ.

Giới hạn: hai PATCH đồng thời trên cùng trường dùng giá trị request được SQL xử lý sau;
chưa có optimistic concurrency. Session UC-04 vẫn lưu RAM, mất khi restart server.
