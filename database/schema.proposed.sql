-- THIẾT KẾ DỰ KIẾN: KHÔNG ĐƯỢC ỨNG DỤNG TỰ ĐỘNG THỰC THI.
-- HƯỚNG DẪN SSMS:
-- 1. Kết nối đúng instance .\SQLEXPRESS; tự tạo database bằng SSMS nếu chưa có.
-- 2. Chọn CellphoneS_Testing ở dropdown, kiểm tra SELECT @@SERVERNAME, DB_NAME().
-- 3. Chỉ chạy TOÀN BỘ file trong cửa sổ query mới, không có transaction đang mở.
-- 4. Script khởi tạo, KHÔNG phải migration hoặc script chạy lại trên schema có sẵn.
--    Nếu gặp bảng/view trùng tên: dừng, kiểm tra hiện trạng; không xóa để chạy lại.
-- 5. Sau thành công: Refresh Tables, kiểm tra Keys/Constraints/Indexes.
-- Không tạo/xóa database, không xóa bảng và không sửa dữ liệu hiện hữu.
-- Không có GO để giữ TRY/CATCH trong cùng batch. Lỗi runtime rollback rồi THROW lại.
-- Lỗi compile cùng batch không được CATCH xử lý: không chạy tiếp từng đoạn hoặc
-- COMMIT thủ công; kiểm tra XACT_STATE()/@@TRANCOUNT trước khi xử lý transaction.
IF DB_NAME() IS NULL OR DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'CellphoneS_Testing'
    THROW 50000, N'Phải chọn database CellphoneS_Testing đã được phê duyệt.', 1;
IF @@TRANCOUNT <> 0
    THROW 50001, N'Dùng cửa sổ query không có transaction đang mở.', 1;
IF EXISTS (
    SELECT 1 FROM sys.objects AS o
    JOIN sys.schemas AS s ON s.schema_id = o.schema_id
    WHERE s.name = N'dbo' AND o.name IN
      (N'Users', N'Categories', N'Products', N'ProductImages',
       N'Carts', N'CartItems', N'Orders', N'OrderItems')
)
    THROW 50002, N'Đã có đối tượng trùng tên trong dbo. Dừng để kiểm tra, không chạy lại schema.', 1;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
-- UC-01/04/08: backend bắt buộc trim/lowercase email, validate định dạng và độ dài
-- trước bind tham số. CHECK bên dưới chỉ là hàng rào cơ bản, KHÔNG xác thực email đầy đủ.
-- Backend hash/verify bằng Argon2id; không lưu password/confirm, không dùng hash nhanh.
-- CHECK hash chỉ chặn plaintext thông thường; không chứng minh hash được tạo an toàn.
CREATE TABLE dbo.Users (
 Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
 FullName NVARCHAR(100) NOT NULL,
 -- Đã được bổ sung thủ công trong database hiện tại; không chạy lại script khởi tạo.
 -- UC-01 bắt buộc addr ở tầng ứng dụng; NULL giữ tương thích với user cũ.
 Address NVARCHAR(500) NULL,
 Email NVARCHAR(254) COLLATE Latin1_General_100_CI_AS NOT NULL,
 PasswordHash VARCHAR(255) NOT NULL,
 Phone VARCHAR(15) NULL,
 Role VARCHAR(10) NOT NULL CONSTRAINT DF_Users_Role DEFAULT 'CUSTOMER',
 IsActive BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
 CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
 UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT SYSUTCDATETIME(),
 CONSTRAINT UQ_Users_Email UNIQUE(Email),
 CONSTRAINT CK_Users_Name CHECK(LEN(LTRIM(RTRIM(FullName))) BETWEEN 1 AND 100),
 CONSTRAINT CK_Users_EmailNormalized CHECK(
   DATALENGTH(Email) = DATALENGTH(LTRIM(RTRIM(Email)))
   AND Email COLLATE Latin1_General_100_BIN2 = LOWER(Email) COLLATE Latin1_General_100_BIN2
   AND Email LIKE '%_@_%._%'
   AND Email NOT LIKE N'% %' AND Email NOT LIKE N'%' + NCHAR(9) + N'%'
   AND Email NOT LIKE N'%' + NCHAR(10) + N'%' AND Email NOT LIKE N'%' + NCHAR(13) + N'%'
 ),
 CONSTRAINT CK_Users_PasswordHash CHECK(
   PasswordHash COLLATE Latin1_General_100_BIN2 LIKE '$argon2id$v=19$%'
   AND DATALENGTH(PasswordHash) BETWEEN 80 AND 255
 ),
 CONSTRAINT CK_Users_Role CHECK(Role IN ('CUSTOMER','ADMIN')),
 CONSTRAINT CK_Users_Phone CHECK(Phone IS NULL OR (LEN(Phone)=10 AND LEFT(Phone,1)='0' AND Phone NOT LIKE '%[^0-9]%'))
);
CREATE TABLE dbo.Categories (
 Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Categories PRIMARY KEY,
 Name NVARCHAR(100) NOT NULL, Slug VARCHAR(150) NOT NULL,
 IsActive BIT NOT NULL CONSTRAINT DF_Categories_IsActive DEFAULT 1,
 CONSTRAINT UQ_Categories_Slug UNIQUE(Slug),
 CONSTRAINT CK_Categories_Name CHECK(LEN(LTRIM(RTRIM(Name)))>0),
 -- Mã ASCII: yêu cầu ít nhất một ký tự khác space/tab/CR/LF/VT/FF/NBSP.
 -- Backend còn phải trim và kiểm tra alphabet slug; CHECK không thay validation.
 CONSTRAINT CK_Categories_SlugNotBlank CHECK(
   Slug COLLATE Latin1_General_100_BIN2 LIKE '%[^ ' + CHAR(9) + CHAR(10) + CHAR(11) + CHAR(12) + CHAR(13) + CHAR(160) + ']%'
 )
);
CREATE TABLE dbo.Products (
 Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Products PRIMARY KEY,
 CategoryId INT NOT NULL, Sku VARCHAR(50) NOT NULL, Slug VARCHAR(200) NOT NULL,
 Name NVARCHAR(200) NOT NULL, Description NVARCHAR(MAX) NOT NULL CONSTRAINT DF_Products_Description DEFAULT N'',
 Price DECIMAL(18,2) NOT NULL, Stock INT NOT NULL,
 IsActive BIT NOT NULL CONSTRAINT DF_Products_IsActive DEFAULT 1,
 CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Products_CreatedAt DEFAULT SYSUTCDATETIME(),
 UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Products_UpdatedAt DEFAULT SYSUTCDATETIME(),
 Version ROWVERSION,
 CONSTRAINT FK_Products_Categories FOREIGN KEY(CategoryId) REFERENCES dbo.Categories(Id),
 CONSTRAINT UQ_Products_Sku UNIQUE(Sku), CONSTRAINT UQ_Products_Slug UNIQUE(Slug),
 CONSTRAINT CK_Products_Name CHECK(LEN(LTRIM(RTRIM(Name)))>0),
 CONSTRAINT CK_Products_SkuNotBlank CHECK(
   Sku COLLATE Latin1_General_100_BIN2 LIKE '%[^ ' + CHAR(9) + CHAR(10) + CHAR(11) + CHAR(12) + CHAR(13) + CHAR(160) + ']%'
 ),
 CONSTRAINT CK_Products_SlugNotBlank CHECK(
   Slug COLLATE Latin1_General_100_BIN2 LIKE '%[^ ' + CHAR(9) + CHAR(10) + CHAR(11) + CHAR(12) + CHAR(13) + CHAR(160) + ']%'
 ),
 CONSTRAINT CK_Products_Price CHECK(Price BETWEEN 0 AND 9999999999.99),
 CONSTRAINT CK_Products_Stock CHECK(Stock BETWEEN 0 AND 1000000)
);
CREATE TABLE dbo.ProductImages (
 Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProductImages PRIMARY KEY,
 ProductId INT NOT NULL, ImageUrl NVARCHAR(2048) NOT NULL, AltText NVARCHAR(200) NULL,
 SortOrder INT NOT NULL CONSTRAINT DF_ProductImages_SortOrder DEFAULT 0,
 CONSTRAINT FK_ProductImages_Products FOREIGN KEY(ProductId) REFERENCES dbo.Products(Id),
 CONSTRAINT UQ_ProductImages_Order UNIQUE(ProductId,SortOrder),
 CONSTRAINT CK_ProductImages_Order CHECK(SortOrder>=0),
 CONSTRAINT CK_ProductImages_Url CHECK(LEN(LTRIM(RTRIM(ImageUrl)))>0)
);
CREATE TABLE dbo.Carts (
 Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Carts PRIMARY KEY,
 UserId INT NOT NULL,
 UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Carts_UpdatedAt DEFAULT SYSUTCDATETIME(),
 CONSTRAINT UQ_Carts_User UNIQUE(UserId),
 CONSTRAINT FK_Carts_Users FOREIGN KEY(UserId) REFERENCES dbo.Users(Id)
);
CREATE TABLE dbo.CartItems (
 Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CartItems PRIMARY KEY,
 CartId INT NOT NULL, ProductId INT NOT NULL, Quantity INT NOT NULL,
 CONSTRAINT FK_CartItems_Carts FOREIGN KEY(CartId) REFERENCES dbo.Carts(Id),
 CONSTRAINT FK_CartItems_Products FOREIGN KEY(ProductId) REFERENCES dbo.Products(Id),
 CONSTRAINT UQ_CartItems_Product UNIQUE(CartId,ProductId),
 CONSTRAINT CK_CartItems_Quantity CHECK(Quantity BETWEEN 1 AND 99)
);
CREATE TABLE dbo.Orders (
 Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Orders PRIMARY KEY,
 UserId INT NOT NULL, OrderCode VARCHAR(40) NOT NULL, RequestKey UNIQUEIDENTIFIER NOT NULL,
 RecipientName NVARCHAR(100) NOT NULL, Phone VARCHAR(15) NOT NULL,
 ShippingAddress NVARCHAR(500) NOT NULL,
 Status VARCHAR(20) NOT NULL CONSTRAINT DF_Orders_Status DEFAULT 'PENDING',
 PaymentMethod VARCHAR(10) NOT NULL CONSTRAINT DF_Orders_Payment DEFAULT 'COD',
 TotalAmount DECIMAL(18,2) NOT NULL,
 CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Orders_CreatedAt DEFAULT SYSUTCDATETIME(),
 CONSTRAINT FK_Orders_Users FOREIGN KEY(UserId) REFERENCES dbo.Users(Id),
 CONSTRAINT UQ_Orders_Code UNIQUE(OrderCode),
 CONSTRAINT UQ_Orders_Request UNIQUE(UserId,RequestKey),
 CONSTRAINT CK_Orders_CodeNotBlank CHECK(
   OrderCode COLLATE Latin1_General_100_BIN2 LIKE '%[^ ' + CHAR(9) + CHAR(10) + CHAR(11) + CHAR(12) + CHAR(13) + CHAR(160) + ']%'
 ),
 CONSTRAINT CK_Orders_Name CHECK(LEN(LTRIM(RTRIM(RecipientName)))>0),
 CONSTRAINT CK_Orders_Phone CHECK(LEN(Phone)=10 AND LEFT(Phone,1)='0' AND Phone NOT LIKE '%[^0-9]%'),
 CONSTRAINT CK_Orders_Address CHECK(LEN(LTRIM(RTRIM(ShippingAddress)))>0),
 CONSTRAINT CK_Orders_Status CHECK(Status IN ('PENDING','CONFIRMED','SHIPPING','COMPLETED','CANCELLED')),
 CONSTRAINT CK_Orders_Payment CHECK(PaymentMethod='COD'),
 CONSTRAINT CK_Orders_Total CHECK(TotalAmount>=0)
);
CREATE TABLE dbo.OrderItems (
 Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_OrderItems PRIMARY KEY,
 OrderId INT NOT NULL, ProductId INT NOT NULL,
 ProductName NVARCHAR(200) NOT NULL, ProductSku VARCHAR(50) NOT NULL,
 UnitPrice DECIMAL(18,2) NOT NULL, Quantity INT NOT NULL,
 LineTotal AS (CONVERT(DECIMAL(18,2),UnitPrice*Quantity)) PERSISTED,
 CONSTRAINT FK_OrderItems_Orders FOREIGN KEY(OrderId) REFERENCES dbo.Orders(Id),
 CONSTRAINT FK_OrderItems_Products FOREIGN KEY(ProductId) REFERENCES dbo.Products(Id),
 CONSTRAINT UQ_OrderItems_Product UNIQUE(OrderId,ProductId),
 CONSTRAINT CK_OrderItems_Name CHECK(LEN(LTRIM(RTRIM(ProductName)))>0),
 CONSTRAINT CK_OrderItems_SkuNotBlank CHECK(
   ProductSku COLLATE Latin1_General_100_BIN2 LIKE '%[^ ' + CHAR(9) + CHAR(10) + CHAR(11) + CHAR(12) + CHAR(13) + CHAR(160) + ']%'
 ),
 CONSTRAINT CK_OrderItems_Price CHECK(UnitPrice BETWEEN 0 AND 9999999999.99),
 CONSTRAINT CK_OrderItems_Quantity CHECK(Quantity BETWEEN 1 AND 99)
);
CREATE INDEX IX_Products_CategoryActive ON dbo.Products(CategoryId,IsActive);
-- UNIQUE(ProductId,SortOrder) đã có prefix ProductId, không tạo index trùng chức năng.
CREATE INDEX IX_CartItems_Product ON dbo.CartItems(ProductId);
CREATE INDEX IX_Orders_UserCreated ON dbo.Orders(UserId,CreatedAt);
CREATE INDEX IX_OrderItems_Product ON dbo.OrderItems(ProductId);
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
-- Các FK giữ NO ACTION, ngừng bán dùng Products.IsActive (UC-10), không hard delete.
-- UC-05 chỉ đọc; UC-07 cộng quantity; UC-09 thay quantity/xóa dòng có chủ đích.
-- UC-06: backend đọc giá DB, lưu snapshot ProductName/ProductSku/UnitPrice tại đây,
-- không tính lại lịch sử từ Products.Price. Tổng order = SUM(LineTotal), ít nhất
-- một item, stock đủ, chống gửi lặp RequestKey và cập nhật cart/stock/order phải
-- được kiểm tra trong CÙNG transaction backend; CHECK không thực thi luật liên bảng.
-- UpdatedAt chỉ có DEFAULT lúc INSERT; backend đặt SYSUTCDATETIME() khi UPDATE.
-- DECIMAL có thể làm tròn khi chuyển kiểu: backend từ chối tiền quá 2 số thập phân.
