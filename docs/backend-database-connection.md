# Kết nối backend với SQL Server

## Chẩn đoán 501 do tiến trình cũ

Lần kiểm tra ngày 23/10/2026: cổng 3000 thuộc node.exe PID 20408, lệnh `node backend/src/server.js`. `/api/health` từ tiến trình này trả `phase=ui-skeleton`, chứng minh không chạy phiên bản hiện tại (`phase=database-connection`). File route hiện tại đặt `/api/health/db` trước fallback, không bị fallback chặn. Node không tự nạp lại file đã sửa.

Ưu tiên Ctrl+C tại terminal đã mở server cũ. Nếu không còn terminal đó, dùng PowerShell để xác định lại PID (PID có thể đổi, không dùng mù PID ghi trong tài liệu):

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000 | Select-Object OwningProcess
# Thay 20408 bên dưới bằng PID vừa tìm được, xác nhận đúng node/server dự án:
Get-CimInstance Win32_Process -Filter "ProcessId = 20408" | Format-List ProcessId,Name,CommandLine
# Chỉ sau khi xác nhận đúng tiến trình:
Stop-Process -Id 20408
Set-Location D:\Downloads\KTPM_Nhom9\KTPM_Nhom09
npm start
```

Không dừng toàn bộ tiến trình Node. Server mới in PID và marker `db-health-v1`; khi cổng bị chiếm sẽ báo lỗi rõ thay vì coi đó là khởi động thành công.

```powershell
curl.exe -i http://localhost:3000/api/health
curl.exe -i http://localhost:3000/api/health/db
```

Header phải có `X-CellphoneS-Backend: db-health-v1`. API db trả 200 hoặc 503, không phải 501. Test hồi quy xác nhận route chạy SELECT 1 trước fallback trong khi API chưa triển khai vẫn trả 501.

Kiểm chứng driver thật trong lượt này: kết nối thất bại với mã ELOGIN, chưa xác nhận SELECT 1 thành công. Không đưa nội dung lỗi driver ra HTTP/log. Với ELOGIN: thử SSMS bằng **SQL Server Authentication**, server `localhost,1433`, cùng login và database `CellphoneS_Testing` (không chỉ thử `.\SQLEXPRESS` qua giao thức khác). Kiểm tra Mixed Mode, login enabled, mật khẩu đúng, default database/user mapping/CONNECT và trạng thái database. Kiểm tra biến DB_* đặt sẵn trong terminal vì chúng ưu tiên hơn .env; không in giá trị secret. Khởi động lại sau khi sửa .env. Tài khoản quản trị có thể xem SQL Server Error Log trong SSMS để xác định nguyên nhân login thất bại, không sao chép log chứa thông tin nhạy cảm vào response.

Backend tự đọc `.env` theo đường dẫn project, không phụ thuộc thư mục chạy. Biến môi trường của tiến trình có sẵn được ưu tiên. Chỉ endpoint `/api/health/db` gọi pool; khởi động server không tạo database hoặc chạy DDL/seed. Một pool/promise được dùng chung, connect lỗi sẽ được thử lại ở request sau; SIGINT/SIGTERM đóng pool. Không log config/error driver, không trả secret/stack cho client.

## Tạo SQL login riêng bằng SSMS (bạn tự thực hiện)

1. Kết nối `.\SQLEXPRESS` bằng tài khoản quản trị hiện có. Server Properties → Security: kiểm tra SQL Server and Windows Authentication Mode. Nếu cần đổi mode thì bạn chủ động bật và restart SQL Server.
2. Security → Logins → New Login. Đặt tên `cellphones_app`, chọn SQL Server authentication, tự nhập mật khẩu mạnh và giữ password policy. Bỏ “User must change password at next login” cho tài khoản dịch vụ; không sử dụng `sa`.
3. Default database: `CellphoneS_Testing`. Server Roles chỉ giữ `public`; không cấp sysadmin, securityadmin hoặc dbcreator.
4. User Mapping: chỉ tick `CellphoneS_Testing`, user `cellphones_app`, default schema `dbo`; database roles chỉ giữ `public`, không db_owner/db_datareader/db_datawriter.
5. Endpoint hiện chỉ chạy `SELECT 1 AS connection_ok`: cần login kết nối server và database user được CONNECT vào database, không cần quyền SELECT trên bảng. Quyền CONNECT thường có qua public; nếu hệ thống đã thu hồi, quản trị viên chỉ cấp CONNECT cần thiết. Không cần cấp quyền ghi hoặc DDL để health check thành công.
6. Khi triển khai từng UC, cấp riêng SELECT/INSERT/UPDATE/DELETE trên các đối tượng/cột thực sự cần. Không cấp trước toàn schema hoặc tất cả 8 bảng. Quyền tổng hợp còn phụ thuộc quyền public và DENY trong hệ thống.
7. Thử đăng nhập SSMS bằng SQL login mới tại `localhost,1433`, chọn database đích, chạy `SELECT 1 AS connection_ok;`. Không chạy lại schema hoặc tạo dữ liệu để kiểm tra kết nối.

Tham khảo: [Microsoft — tạo login](https://learn.microsoft.com/en-us/sql/relational-databases/security/authentication-access/create-a-login?view=sql-server-ver17), [quyền đối tượng](https://learn.microsoft.com/en-us/sql/t-sql/statements/grant-object-permissions-transact-sql?view=sql-server-ver17).

## Điền .env local

```dotenv
PORT=3000
DB_SERVER=localhost
DB_PORT=1433
DB_INSTANCE=
DB_DATABASE=CellphoneS_Testing
DB_USER=cellphones_app
DB_PASSWORD="<nhập mật khẩu bạn vừa đặt>"
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true
```

Không dùng nguyên placeholder làm mật khẩu. File `.env` đã được ignore, không gửi qua chat hoặc commit. Password không trim. Nếu có quote/ký tự đặc biệt, dùng quote phù hợp cú pháp .env của Node; không log để debug. `trustServerCertificate=true` chỉ cho local chứng chỉ tự ký. Cổng cố định không cần SQL Browser và không được cấu hình đồng thời DB_INSTANCE. TCP/IP của SQLEXPRESS phải bật và lắng nghe đúng 1433.

## Khởi động và thử API

Trong thư mục `KTPM_Nhom09`, chạy `npm start`. Nếu cổng 3000 đang có server cũ, dừng server bạn đã mở bằng Ctrl+C rồi khởi động lại. Đổi .env cần restart backend.

Mở http://localhost:3000/api/health/db hoặc chạy:

```powershell
curl.exe -i http://localhost:3000/api/health/db
```

Thành công HTTP 200: `{"status":"ok","database":"connected","message":"Kết nối cơ sở dữ liệu thành công."}`.

Thất bại HTTP 503: `status=error`, `database=unavailable`, thông báo kiểm tra cấu hình và SQL Server. Không trả mã lỗi driver hoặc nội dung có thể chứa thông tin đăng nhập. Kiểm tra lần lượt: DB_USER/PASSWORD không trống và không sa; Mixed Mode; login enabled; user mapping/CONNECT; TCP/port; TLS. `/api/health` chỉ xác nhận web server sống, không xác nhận database.

Health check chứng minh kết nối và chạy câu lệnh cơ bản; không chứng minh đủ 8 bảng hoặc quyền nghiệp vụ. Không có endpoint nào ở giai đoạn này thêm/sửa/xóa dữ liệu. Các API nghiệp vụ tiếp tục trả 501.

## Kiểm tra code

`node --test tests/backend/database.test.js`: pool đồng thời/retry/close, từ chối sa, HTTP 200/503 và che error driver. Test dùng driver mô phỏng, không kết nối SQL Server. Cấu hình được triển khai theo [node-mssql](https://tediousjs.github.io/node-mssql/).
