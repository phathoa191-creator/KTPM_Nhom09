# UC-01 — Đăng ký tài khoản

Đã triển khai API và frontend. Đã đối chiếu schema thực tế với dbo.Users:
Address NVARCHAR(500) NULL, FullName NVARCHAR(100), Email NVARCHAR(254),
PasswordHash VARCHAR(255), UNIQUE UQ_Users_Email. Login ứng dụng có SELECT/INSERT.
Address và quyền do người dùng cập nhật trong SSMS. File schema.proposed.sql được
đồng bộ tài liệu cột Address; ứng dụng không chạy migration hoặc cấp quyền tự động.

## Hợp đồng API

`POST /api/auth/register`, Content-Type `application/json`:

```json
{
  "fullname": "Nguyễn Văn Test",
  "addr": "123 Đường Kiểm Thử",
  "uname": "uc01@example.test",
  "pwd": "Test-only-123!",
  "password_confirm": "Test-only-123!"
}
```

Họ tên/địa chỉ/email được trim; email chuyển chữ thường. Giới hạn lần lượt
100/500/254 ký tự. Mật khẩu giữ nguyên, dài 8–1024 ký tự, xác nhận phải trùng.
Body tối đa 16 KiB. Giá trị Role/IsActive từ client không được sử dụng.

| HTTP | code | Ý nghĩa |
|---|---|---|
| 201 | REGISTERED | INSERT thành công, chỉ trả code/message |
| 400 | VALIDATION_ERROR | Có errors theo fullname/addr/uname/pwd/password_confirm |
| 400 | INVALID_BODY | JSON sai hoặc body quá lớn |
| 409 | EMAIL_EXISTS | Email đã tồn tại hoặc SQL báo 2601/2627 |
| 500 | REGISTRATION_FAILED | Lỗi SQL, schema/quyền chưa đủ hoặc lỗi hash; thông báo chung |

Không trả hoặc log mật khẩu, hash, cấu hình SQL, stack hay lỗi driver. Truy vấn kiểm tra
email và INSERT đều bind tham số mssql. Không dùng SELECT * hoặc OUTPUT INSERTED.*.
Hash bằng Argon2id bất đồng bộ từ node:crypto (Node >=24.11.1): memory 65536 KiB,
passes 3, parallelism 1, salt ngẫu nhiên 16 byte, output 32 byte; lưu PHC v=19.
Tài liệu API: https://nodejs.org/download/release/v24.11.1/docs/api/crypto.html#cryptoargon2algorithm-parameters-callback

## Đối chiếu schema

Trong SSMS, tài khoản quản trị chạy các SELECT sau ở CellphoneS_Testing,
chỉ gửi metadata, không gửi dữ liệu người dùng hoặc thông tin đăng nhập:

```sql
SELECT c.name, t.name AS type, c.max_length, c.is_nullable, c.is_identity,
       d.definition AS default_value
FROM sys.columns c
JOIN sys.types t ON t.user_type_id=c.user_type_id
LEFT JOIN sys.default_constraints d ON d.object_id=c.default_object_id
WHERE c.object_id=OBJECT_ID(N'dbo.Users') ORDER BY c.column_id;

SELECT i.name, i.is_unique, i.has_filter, c.name AS column_name, ic.key_ordinal
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE i.object_id=OBJECT_ID(N'dbo.Users') AND i.is_unique=1;
```

Repository hiện chỉ cho ghi khi metadata xác nhận FullName NVARCHAR(100) trở lên,
Address NVARCHAR(500) trở lên, Email NVARCHAR(254) trở lên, PasswordHash VARCHAR(255)
trở lên; UNIQUE index không filter trên riêng Email và có quyền SELECT/INSERT.
Address đã được xác nhận trên SQL thật và bởi người dùng. Ứng dụng yêu cầu addr dù
cột cho phép NULL để tương thích dữ liệu cũ. INSERT đặt Role='CUSTOMER', IsActive=1,
CreatedAt/UpdatedAt theo SYSUTCDATETIME(); không nhận các giá trị này từ client.
Id tự sinh, Phone để NULL. Không dựa vào việc client gửi role hoặc các default ẩn.

Quản trị viên cần xác minh đối tượng tồn tại và cấp đúng quyền cần thiết nếu được duyệt:
SELECT trên Email và INSERT trên dbo.Users. Preflight kiểm tra SELECT hiệu lực
trên Email và INSERT ở cấp bảng. Quyền hiện tại đã đủ; không cần db_owner/sysadmin.
Không tự động đổi quyền, tạo cột, xóa dữ liệu hoặc tạo lại database.

## Chạy và kiểm thử

```powershell
Set-Location D:\Downloads\KTPM_Nhom9\KTPM_Nhom09
npm test
npm run check
npm start
```

Nếu server cũ đang giữ cổng 3000, Ctrl+C trong terminal của server đó rồi chạy lại.
Mở http://localhost:3000/register.html. Form dùng fetch, không tải lại trang,
khóa nút khi đang gửi và hiển thị lỗi/thành công tại register-form-feedback.
Các data-testid cũ được giữ; địa chỉ dùng register-address. Chỉ UC-01 gọi API thật;
đăng nhập vẫn thuộc UC-04 chưa triển khai.

Test mặc định dùng repository/driver mô phỏng và hash Argon2id thật; test frontend dùng
DOM mô phỏng. Không ghi database thật, không sửa dữ liệu ngoài test. Bao gồm validation,
success, duplicate/race, lỗi hệ thống, SQL parameters, schema guard, hash không phải
plaintext, response không chứa hash, fetch/error/loading và locator. Health test cũ được giữ.
Selenium WebDriver JavaScript cho TC_01–TC_05 chạy bằng `npm run test:selenium`.
Xem `../tests/selenium/README.md` để cài Chrome/driver, cấu hình và quản lý dữ liệu test.

Test tích hợp SQL thật chạy riêng (opt-in), tạo email UUID riêng trong transaction,
kiểm tra 201, dữ liệu/hash, duplicate 409, UNIQUE thật, health và trang đăng ký,
rồi rollback và kiểm tra user test không còn. Có thể tạo khoảng trống trong IDENTITY
do SQL Server không rollback bộ đếm; không thay đổi record người dùng có sẵn.

```powershell
$env:UC01_SQL_INTEGRATION='1'
node --test tests/backend/register.integration.test.js
Remove-Item Env:UC01_SQL_INTEGRATION
```

Kiểm tra thủ công bằng email riêng ví dụ
uc01-<timestamp>@example.test; đăng ký lần đầu 201 và lần hai 409. Kiểm tra record qua
SSMS bằng SELECT có cột cụ thể, không sao chép hash vào chat/log.
