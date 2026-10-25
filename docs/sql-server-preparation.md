# Rà soát schema và chuẩn bị SQL Server Express

Trạng thái: đã đọc toàn bộ `database/schema.proposed.sql`, đối chiếu UC-01–UC-10. Chưa thực thi SQL, kết nối database, seed hoặc triển khai nghiệp vụ. Đánh giá tĩnh, chưa chứng minh DDL chạy thành công trên engine thật. SQL dự kiến giữ nguyên để người dùng duyệt các vấn đề trước khi chạy.

## Bảng, quan hệ, kiểu dữ liệu

| Bảng | PK / UNIQUE / quan hệ | UC |
|---|---|---|
| Users | INT IDENTITY PK; Email UNIQUE; Role CUSTOMER/ADMIN | 01,04,08; quyền 10 |
| Categories | INT IDENTITY PK; Slug UNIQUE; một category có nhiều products | 02,03,10 |
| Products | INT IDENTITY PK; CategoryId FK; SKU/Slug UNIQUE; IsActive ngừng bán | 02,03,05,06,07,09,10 |
| ProductImages | INT IDENTITY PK; ProductId FK; UNIQUE(ProductId,SortOrder) | 02,03,10 |
| Carts | INT IDENTITY PK; UserId FK UNIQUE: mỗi user tối đa một cart | 05,06,07,09 |
| CartItems | INT IDENTITY PK; CartId/ProductId FK; UNIQUE(CartId,ProductId) | 05,06,07,09 |
| Orders | INT IDENTITY PK; UserId FK; OrderCode UNIQUE; UNIQUE(UserId,RequestKey) | 06 |
| OrderItems | INT IDENTITY PK; OrderId/ProductId FK; UNIQUE(OrderId,ProductId) | 06 |

Có 8 PK, 8 FK; FK mặc định NO ACTION, không xóa dây chuyền. Users→Orders, Categories→Products, Products→ProductImages, Carts→CartItems, Products→CartItems, Orders→OrderItems, Products→OrderItems đều 1:N; Users→Carts là 1:0..1. SQL cho phép order chưa có item, service phải bảo đảm ít nhất một item trước commit.

NVARCHAR phù hợp tiếng Việt; VARCHAR dùng cho mã/role/phone/hash. Price/UnitPrice/TotalAmount là DECIMAL(18,2), tránh FLOAT. Stock/Quantity là INT; DATETIME2(3) lưu UTC qua SYSUTCDATETIME; ROWVERSION là token nhị phân chống sửa đồng thời, không phải ngày giờ. LineTotal tính toán persisted. Không cần thêm bảng cho phạm vi 10 UC; session có thể dùng store riêng khi triển khai.

## Kết quả CHECK và vấn đề cần xử lý

| Nội dung | Đánh giá / việc cần làm |
|---|---|
| Email | NOT NULL + UNIQUE và CHECK lowercase/trim/hình thức cơ bản. LIKE vẫn chấp nhận một số email sai (nhiều @, khoảng trắng nội bộ). So sánh SQL có thể bỏ qua khoảng trắng cuối ngay cả khi dùng BIN2; cần kiểm tra DATALENGTH so với bản trim và validate API. Nên chốt collation email rõ ràng, case-insensitive nhưng accent-sensitive; unique hiện phụ thuộc collation database. |
| Giá | CHECK 0–9.999.999.999,99 đúng quy tắc demo hiện tại (cho phép miễn phí). DECIMAL có thể làm tròn dữ liệu thừa phần lẻ khi chuyển kiểu; API phải từ chối quá 2 chữ số thập phân trước bind SQL. Nếu muốn giá >0 cần đồng bộ lại test biên. |
| Tồn kho | CHECK integer 0–1.000.000 phù hợp; không ràng buộc quantity với stock liên bảng. Backend phải kiểm tra khi thêm/sửa cart và checkout. |
| Quantity | CartItems và OrderItems giới hạn 1–99; unique ngăn trùng dòng. Cộng quantity phải kiểm tra tổng, không chỉ lượng thêm. |
| Status | CHECK chỉ nhận PENDING/CONFIRMED/SHIPPING/COMPLETED/CANCELLED, mặc định PENDING. Không bảo đảm trình tự chuyển trạng thái; service cần máy trạng thái, không cho COMPLETED→PENDING. Collation mặc định có thể cho phép chữ thường; nên chốt quy tắc canonical. |
| PasswordHash | VARCHAR(255) NOT NULL đủ chứa chuỗi Argon2id thông thường hoặc bcrypt 60 ký tự. Hiện vẫn nhận chuỗi rỗng/plaintext: tên cột không bảo đảm hash an toàn. Hash/verify bằng thư viện backend, không HASHBYTES đơn thuần, không lưu password/confirm. Có thể bổ sung CHECK định dạng tối thiểu sau khi chốt thuật toán, nhưng CHECK không chứng minh hash đúng. |
| SKU/slug/order code/snapshot | UNIQUE không ngăn chuỗi rỗng. Đề xuất CHECK không rỗng cho SKU/slug/OrderCode/ProductName/ProductSku; định dạng mã và slug validate API. |
| Phone/name/address | LEN bỏ qua dấu cách cuối; LTRIM/RTRIM mặc định không loại mọi Unicode whitespace. Chuẩn hóa/validate tại API; điện thoại là quy tắc demo Việt Nam 10 số đầu 0, không phải định dạng quốc tế. |
| Images | ImageUrl chỉ kiểm tra không rỗng; cần allowlist http(s) hoặc đường dẫn ảnh nội bộ cùng origin. Hiện UI dùng SVG nội bộ, cần đồng bộ tài liệu test đang chỉ ghi http(s). |
| TotalAmount | >=0 đúng tối thiểu; chưa bảo đảm bằng SUM(LineTotal), chưa buộc order có item. Tính từ giá DB trong transaction, không tin giá frontend. |
| UpdatedAt | Default chỉ khi insert, repository phải cập nhật khi UPDATE; không tự đồng bộ. |
| Index | IX_ProductImages_Product có thể dư vì UNIQUE(ProductId,SortOrder) đã có prefix ProductId; đánh giá sau có workload. Chưa có index tìm kiếm tên; LIKE '%q%' vẫn có thể scan ở dữ liệu nhỏ. |
| SQL execution | Có guard database đích và transaction, nhưng không idempotent. Nên bổ sung TRY/CATCH rollback rõ ràng, chặn schema đã tồn tại trước khi chạy bản chính thức. Không chạy lại nguyên file để sửa schema đã có. |

Không có lỗi tham chiếu tên bảng/cột hoặc thứ tự tạo bảng được phát hiện qua đọc tĩnh. Không coi đây là kết quả thực thi SQL. Trước triển khai nên sửa các điểm email, mã rỗng và transaction wrapper trong file SQL dự kiến, rồi review lại; chưa sửa SQL trong lượt này.

## Mật khẩu và dữ liệu Selenium

Đề xuất Argon2id với salt ngẫu nhiên do thư viện sinh, lưu nguyên chuỗi encoded gồm thuật toán/tham số/salt/hash. Không dùng SHA-256 hoặc mã hóa hai chiều thay password hashing. Nếu chọn bcrypt, phải giới hạn 72 byte UTF-8 và chốt lại test; giới hạn 8–72 byte hiện có trong test là quy tắc cũ cần duyệt lại nếu chuyển Argon2id. Chưa cài thư viện hoặc sinh hash.

| Fixture dự kiến | Mục đích |
|---|---|
| demo.admin@example.test / ADMIN | UC-10; đăng nhập/phân quyền |
| demo.customer01@example.test / CUSTOMER | hồ sơ, giỏ, checkout thành công |
| demo.customer02@example.test / CUSTOMER | kiểm tra không đọc/sửa giỏ của nhau, tranh mua |
| demo.inactive@example.test / CUSTOMER, IsActive=0 | đăng nhập tài khoản bị khóa |
| Category demo-phone, demo-accessory | danh mục hợp lệ; thêm category inactive để test từ chối |
| DEMO-PHONE-01, active, giá 10.000.000, stock 10 | happy path; đồng bộ giá trang detail/cart mẫu |
| DEMO-LAST-01, active, giá 5.000.000, stock 1 | biên và mua đồng thời |
| DEMO-EMPTY-01, active, stock 0 | hết hàng |
| DEMO-STOP-01, inactive, stock 10 | ngừng kinh doanh |
| DEMO-FREE-01, active, giá 0, stock 2 | biên giá hiện được phép |
| Sản phẩm tên tiếng Việt, không có ảnh hoặc nhiều ảnh | tìm kiếm Unicode, fallback ảnh, sort ảnh |

Mật khẩu seed lấy SEED_ADMIN_PASSWORD/SEED_CUSTOMER_PASSWORD từ môi trường lúc chạy seed tương lai, không đưa vào mã/SQL/tài liệu. Password SQL login DB_PASSWORD hoàn toàn khác mật khẩu user website. Fixture chỉ đề xuất, không có INSERT/UPDATE/DELETE được chạy. Dữ liệu không hợp lệ dùng payload test thất bại, không seed bằng cách tắt CHECK. Các sản phẩm homepage hiện là minh họa với giá khác, cần đồng bộ khi UC-02/03 lấy DB thật.

## Cấu hình đã chuẩn bị

- `.env` local (được gitignore), `.env.example`: host localhost, instance SQLEXPRESS, database CellphoneS_Testing; user/password để trống.
- `backend/src/config/database.js`: hàm thuần buildDatabaseConfig; validate biến môi trường, boolean, host, port; không đọc file tự động, không import mssql, không connect.
- Server giữ nguyên: không load config, không query hoặc tạo database.
- Giai đoạn sau chạy từ thư mục project, dùng Node 24 `process.loadEnvFile('.env')` trước build config. Chỉ gọi `new sql.ConnectionPool(config).connect()` khi đã được phép triển khai kết nối; không thêm vào startup giai đoạn này. Không log object config vì chứa secret.
- Cấu hình chuẩn bị dùng SQL Authentication qua driver Tedious mặc định của mssql. Việc SSMS đăng nhập Windows không có nghĩa username/password Windows dùng được theo cách này. Windows integrated auth cần lựa chọn driver/auth khác và kiểm tra riêng, chưa cấu hình.
- Cách ưu tiên: TCP cổng cố định của SQLEXPRESS, `DB_PORT=<cổng thực tế>`, `DB_INSTANCE=`. Không đoán 1433.
- Cách thay thế: DB_PORT trống, DB_INSTANCE=SQLEXPRESS; cần SQL Server Browser hoạt động và UDP 1434 truy cập được. Không đặt cả port và instance.
- DB_ENCRYPT=true; DB_TRUST_SERVER_CERTIFICATE=true chỉ cho local chứng chỉ tự ký; môi trường thật dùng chứng chỉ tin cậy và false.

## Từng bước tự chuẩn bị trong SSMS

1. Mở SSMS, Server type Database Engine, Server name `.\SQLEXPRESS`, chọn cách xác thực hiện đang hoạt động. Chưa thay đổi cấu hình nếu chưa cần.
2. New Query, chạy SELECT chỉ đọc dưới đây để xác minh đúng instance, phiên bản và database có tồn tại không:

```sql
SELECT @@SERVERNAME AS ServerName,
 SERVERPROPERTY('ProductVersion') AS ProductVersion,
 SERVERPROPERTY('Edition') AS Edition,
 SERVERPROPERTY('IsIntegratedSecurityOnly') AS WindowsOnly;
SELECT name, state_desc, collation_name
FROM sys.databases WHERE name=N'CellphoneS_Testing';
```

3. Nếu database tồn tại: dừng việc tạo mới, xem Tables và dữ liệu, không xóa/ghi đè hoặc chạy schema lại. Nếu chưa tồn tại và bạn quyết định tạo: Object Explorer → Databases → New Database → nhập `CellphoneS_Testing`, kiểm tra đường dẫn/collation rồi OK. Thao tác này do bạn chủ động thực hiện, ứng dụng không làm tự động.
4. Chọn database mới trong dropdown. Đọc các vấn đề schema ở trên và duyệt/sửa SQL dự kiến trước. Chỉ với database mới/rỗng đã xác nhận: mở `database/schema.proposed.sql`, kiểm tra database dropdown và guard đầu file, rồi Execute toàn bộ. Không chạy từng đoạn bỏ qua guard/transaction; không chạy nếu có bảng trùng.
5. Nếu có lỗi, không chạy COMMIT thủ công. Kiểm tra transaction và rollback trong cùng cửa sổ query trước khi thử lại; cần tìm nguyên nhân, không drop bảng để né lỗi. Với schema chưa bọc TRY/CATCH, dùng `IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;` để kết thúc transaction còn mở sau khi xác định lỗi.
6. Refresh Tables: xác nhận đủ 8 bảng; mở Keys/Constraints/Indexes. Kiểm tra chỉ đọc:

```sql
SELECT t.name FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id=t.schema_id
WHERE s.name=N'dbo' ORDER BY t.name;
SELECT name FROM sys.foreign_keys;
SELECT name, is_disabled, is_not_trusted FROM sys.check_constraints;
-- Sau seed ở giai đoạn tương lai:
SELECT Id, Email, Role, IsActive FROM dbo.Users;
SELECT Id, Sku, Price, Stock, IsActive FROM dbo.Products;
```

7. Để backend dùng TCP: mở SQL Server Configuration Manager → SQL Server Network Configuration → Protocols for SQLEXPRESS → TCP/IP. Bật TCP/IP; nếu dùng cổng cố định, đặt cổng còn trống ở IPAll, xóa giá trị TCP Dynamic Ports và restart SQL Server (SQLEXPRESS). Không cần Browser ở phương án cổng cố định. Chỉ mở firewall khi có truy cập từ máy khác và giới hạn nguồn cần thiết.
8. Nếu chọn SQL Authentication: trong SSMS, Server Properties → Security, kiểm tra Mixed Mode; chỉ bật và restart nếu cần. Security → Logins → New Login: tạo login riêng, mật khẩu tự đặt, default database CellphoneS_Testing. User Mapping chỉ database này; runtime chỉ cấp quyền SELECT/INSERT/UPDATE/DELETE trên phạm vi cần dùng; không sysadmin/db_owner cho runtime. Tài khoản tạo bảng là tài khoản quản trị riêng. Không sử dụng sa cho ứng dụng.
9. Điền DB_USER/DB_PASSWORD trong `.env` trên máy của bạn, không gửi mật khẩu qua chat. Dùng cú pháp .env có quote nếu có # hoặc khoảng trắng; Node parser hỗ trợ giá trị quoted, không tự ý thay ký tự mật khẩu. Trước khi kết nối thật cần kiểm tra lại TCP/port, login mapping và quyền. Lượt hiện tại chưa thực hiện bước kết nối thử.

## File cần sửa ở các giai đoạn sau

`database/schema.proposed.sql`: CHECK email/mã rỗng, transaction wrapper đã nêu; `docs/database-design.md`, `docs/test-cases.md`: đồng bộ password/image/normalization; `backend/src/server.js`: tích hợp pool sau xác nhận; thêm module pool và script kiểm tra kết nối SELECT 1 độc lập, không DDL; seed script chỉ sau chấp thuận dữ liệu. Không triển khai các file nghiệp vụ trong lượt chuẩn bị này.

## Nguồn đối chiếu

- mssql config/instance/driver: https://github.com/tediousjs/node-mssql
- Password hashing: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- UNIQUE/CHECK: https://learn.microsoft.com/en-us/sql/relational-databases/tables/unique-constraints-and-check-constraints?view=sql-server-ver17
