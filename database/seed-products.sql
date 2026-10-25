-- UC-02 DEMO: chỉ người dùng xem xét và chạy thủ công trong SSMS.
-- Chọn CellphoneS_Testing, chạy TOÀN BỘ file ở query mới, không có transaction mở.
-- Giá/cấu hình/tên thương mại chỉ là dữ liệu giả phục vụ học tập, không phải báo giá.
-- Chỉ INSERT bản ghi thiếu; không UPDATE/DELETE, không sửa schema/quyền/Users.
-- Chạy lại giữ nguyên dữ liệu đã có. SKU/slug xung đột sẽ rollback thay vì ghi đè.
-- 5 danh mục active, 25 sản phẩm (22 active, 3 inactive), 25 ảnh SortOrder=0.
IF DB_NAME() IS NULL OR DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'CellphoneS_Testing'
    THROW 50100, N'Phải chọn database CellphoneS_Testing trước khi chạy seed.', 1;
IF @@TRANCOUNT <> 0
    THROW 50101, N'Dùng query mới, không có transaction đang mở.', 1;
IF OBJECT_ID(N'dbo.Categories', N'U') IS NULL
 OR OBJECT_ID(N'dbo.Products', N'U') IS NULL
 OR OBJECT_ID(N'dbo.ProductImages', N'U') IS NULL
    THROW 50102, N'Thiếu bảng danh mục/sản phẩm/ảnh. Không tự chạy script khởi tạo schema.', 1;

SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @Categories TABLE (Slug VARCHAR(150) PRIMARY KEY, Name NVARCHAR(100) NOT NULL);
INSERT INTO @Categories (Slug, Name) VALUES
 ('uc02-dien-thoai', N'Điện thoại'),
 ('uc02-laptop', N'Laptop'),
 ('uc02-may-tinh-bang', N'Máy tính bảng'),
 ('uc02-tai-nghe', N'Tai nghe'),
 ('uc02-dong-ho', N'Đồng hồ thông minh');

DECLARE @Products TABLE (
 Sku VARCHAR(50) PRIMARY KEY, Slug VARCHAR(200) UNIQUE NOT NULL,
 CategorySlug VARCHAR(150) NOT NULL, Name NVARCHAR(200) NOT NULL,
 Description NVARCHAR(MAX) NOT NULL, Price DECIMAL(18,2) NOT NULL,
 Stock INT NOT NULL, IsActive BIT NOT NULL, ImageUrl NVARCHAR(2048) NOT NULL
);
INSERT INTO @Products (Sku, Slug, CategorySlug, Name, Description, Price, Stock, IsActive, ImageUrl) VALUES
 ('DEMO-UC02-001','uc02-iphone-16-128gb','uc02-dien-thoai',N'iPhone 16 128GB',N'DEMO UC-02 · Điện thoại · 128GB · Màu đen',19490000,30,1,N'/assets/images/demo-phone-01.svg'),
 ('DEMO-UC02-002','uc02-iphone-16-256gb','uc02-dien-thoai',N'iPhone 16 256GB',N'DEMO UC-02 · Điện thoại · 256GB · Màu xanh',22490000,18,1,N'/assets/images/demo-phone-01.svg'),
 ('DEMO-UC02-003','uc02-iphone-15-128gb','uc02-dien-thoai',N'iPhone 15 128GB',N'DEMO UC-02 · Điện thoại · 128GB · Hết hàng để kiểm thử',15990000,0,1,N'/assets/images/iphone-15.svg'),
 ('DEMO-UC02-004','uc02-samsung-galaxy-s25-256gb','uc02-dien-thoai',N'Samsung Galaxy S25 256GB',N'DEMO UC-02 · Điện thoại · RAM 12GB · Bộ nhớ 256GB',18990000,24,1,N'/assets/images/samsung-s25.svg'),
 ('DEMO-UC02-005','uc02-samsung-galaxy-s25-512gb','uc02-dien-thoai',N'Samsung Galaxy S25 512GB',N'DEMO UC-02 · Điện thoại · RAM 12GB · Bộ nhớ 512GB',21990000,12,1,N'/assets/images/samsung-s25.svg'),
 ('DEMO-UC02-006','uc02-samsung-galaxy-a56-128gb','uc02-dien-thoai',N'Samsung Galaxy A56 5G 128GB',N'DEMO UC-02 · Điện thoại · RAM 8GB · Bộ nhớ 128GB',8990000,45,1,N'/assets/images/samsung-a56.svg'),
 ('DEMO-UC02-007','uc02-xiaomi-14t-256gb','uc02-dien-thoai',N'Xiaomi 14T 256GB',N'DEMO UC-02 · Điện thoại · RAM 12GB · Bộ nhớ 256GB',10490000,20,1,N'/assets/images/xiaomi-14t.svg'),
 ('DEMO-UC02-008','uc02-oppo-reno13-256gb','uc02-dien-thoai',N'OPPO Reno13 256GB',N'DEMO UC-02 · Điện thoại ngừng kinh doanh · Không hiện trong UC-02',11490000,9,0,N'/assets/images/oppo-reno.svg'),
 ('DEMO-UC02-009','uc02-macbook-air-m3-13-256gb','uc02-laptop',N'MacBook Air M3 13 inch 256GB',N'DEMO UC-02 · Laptop · RAM 8GB · SSD 256GB',24990000,14,1,N'/assets/images/demo-laptop.svg'),
 ('DEMO-UC02-010','uc02-macbook-air-m3-13-512gb','uc02-laptop',N'MacBook Air M3 13 inch 512GB',N'DEMO UC-02 · Laptop · RAM 16GB · SSD 512GB',29990000,8,1,N'/assets/images/demo-laptop.svg'),
 ('DEMO-UC02-011','uc02-asus-vivobook-15-i5','uc02-laptop',N'ASUS Vivobook 15 Intel Core i5',N'DEMO UC-02 · Laptop · Màn hình 15 inch · SSD 512GB',14990000,22,1,N'/assets/images/demo-laptop.svg'),
 ('DEMO-UC02-012','uc02-lenovo-ideapad-slim-3','uc02-laptop',N'Lenovo IdeaPad Slim 3',N'DEMO UC-02 · Laptop · RAM 16GB · Hết hàng để kiểm thử',12990000,0,1,N'/assets/images/demo-laptop.svg'),
 ('DEMO-UC02-013','uc02-dell-inspiron-15','uc02-laptop',N'Dell Inspiron 15 Intel Core i5',N'DEMO UC-02 · Laptop ngừng kinh doanh · Không hiện trong UC-02',16990000,5,0,N'/assets/images/demo-laptop.svg'),
 ('DEMO-UC02-014','uc02-ipad-air-11-128gb','uc02-may-tinh-bang',N'iPad Air 11 inch 128GB',N'DEMO UC-02 · Máy tính bảng · Wi-Fi · 128GB',15990000,18,1,N'/assets/images/demo-tablet.svg'),
 ('DEMO-UC02-015','uc02-ipad-air-11-256gb','uc02-may-tinh-bang',N'iPad Air 11 inch 256GB',N'DEMO UC-02 · Máy tính bảng · Wi-Fi · 256GB',18490000,11,1,N'/assets/images/demo-tablet.svg'),
 ('DEMO-UC02-016','uc02-samsung-galaxy-tab-s9-fe','uc02-may-tinh-bang',N'Samsung Galaxy Tab S9 FE 128GB',N'DEMO UC-02 · Máy tính bảng · Màn hình 10.9 inch · 128GB',9990000,16,1,N'/assets/images/demo-tablet.svg'),
 ('DEMO-UC02-017','uc02-xiaomi-pad-6-128gb','uc02-may-tinh-bang',N'Xiaomi Pad 6 128GB',N'DEMO UC-02 · Máy tính bảng · Màn hình 11 inch · 128GB',6990000,25,1,N'/assets/images/demo-tablet.svg'),
 ('DEMO-UC02-018','uc02-airpods-pro-2','uc02-tai-nghe',N'Apple AirPods Pro 2 USB-C',N'DEMO UC-02 · Tai nghe không dây · Chống ồn · USB-C',5490000,35,1,N'/assets/images/demo-headphones.svg'),
 ('DEMO-UC02-019','uc02-airpods-4','uc02-tai-nghe',N'Apple AirPods 4',N'DEMO UC-02 · Tai nghe không dây · Hết hàng để kiểm thử',3290000,0,1,N'/assets/images/demo-headphones.svg'),
 ('DEMO-UC02-020','uc02-samsung-galaxy-buds3','uc02-tai-nghe',N'Samsung Galaxy Buds3',N'DEMO UC-02 · Tai nghe không dây · Hộp sạc USB-C',2990000,28,1,N'/assets/images/demo-headphones.svg'),
 ('DEMO-UC02-021','uc02-sony-wh-ch520','uc02-tai-nghe',N'Sony WH-CH520 Bluetooth',N'DEMO UC-02 · Tai nghe chụp tai · Kết nối Bluetooth',1190000,40,1,N'/assets/images/demo-headphones.svg'),
 ('DEMO-UC02-022','uc02-apple-watch-se-40mm','uc02-dong-ho',N'Apple Watch SE 40mm GPS',N'DEMO UC-02 · Đồng hồ thông minh · Dây thể thao · GPS',5490000,17,1,N'/assets/images/demo-watch.svg'),
 ('DEMO-UC02-023','uc02-apple-watch-se-44mm','uc02-dong-ho',N'Apple Watch SE 44mm GPS',N'DEMO UC-02 · Đồng hồ thông minh · Dây thể thao · GPS',6190000,13,1,N'/assets/images/demo-watch.svg'),
 ('DEMO-UC02-024','uc02-samsung-galaxy-watch7-40mm','uc02-dong-ho',N'Samsung Galaxy Watch7 40mm',N'DEMO UC-02 · Đồng hồ thông minh · Màn hình tròn',6490000,19,1,N'/assets/images/demo-watch.svg'),
 ('DEMO-UC02-025','uc02-xiaomi-redmi-watch-4','uc02-dong-ho',N'Xiaomi Redmi Watch 4',N'DEMO UC-02 · Đồng hồ ngừng kinh doanh · Hết hàng · Không hiện trong UC-02',1990000,0,0,N'/assets/images/demo-watch.svg');

DECLARE @AddedCategories INT = 0, @AddedProducts INT = 0, @AddedImages INT = 0;
BEGIN TRY
 BEGIN TRANSACTION;
 -- HOLDLOCK bảo vệ phép kiểm tra/INSERT trong transaction, UNIQUE là hàng rào cuối.
 INSERT INTO dbo.Categories (Name, Slug, IsActive)
 SELECT s.Name, s.Slug, 1 FROM @Categories s
 WHERE NOT EXISTS (SELECT 1 FROM dbo.Categories c WITH (UPDLOCK, HOLDLOCK) WHERE c.Slug=s.Slug);
 SET @AddedCategories = @@ROWCOUNT;

 IF EXISTS (
   SELECT 1 FROM @Products s JOIN dbo.Products p WITH (UPDLOCK, HOLDLOCK)
     ON p.Sku=s.Sku OR p.Slug=s.Slug
   JOIN dbo.Categories c ON c.Slug=s.CategorySlug
   WHERE p.Sku<>s.Sku OR p.Slug<>s.Slug OR p.CategoryId<>c.Id
 )
   THROW 50103, N'SKU/slug/danh mục seed xung đột dữ liệu hiện có. Đã rollback; không ghi đè.', 1;

 INSERT INTO dbo.Products
   (CategoryId, Sku, Slug, Name, Description, Price, Stock, IsActive, CreatedAt, UpdatedAt)
 SELECT c.Id, s.Sku, s.Slug, s.Name, s.Description, s.Price, s.Stock, s.IsActive,
   SYSUTCDATETIME(), SYSUTCDATETIME()
 FROM @Products s JOIN dbo.Categories c ON c.Slug=s.CategorySlug
 WHERE NOT EXISTS (SELECT 1 FROM dbo.Products p WITH (UPDLOCK, HOLDLOCK) WHERE p.Sku=s.Sku);
 SET @AddedProducts = @@ROWCOUNT;

 INSERT INTO dbo.ProductImages (ProductId, ImageUrl, AltText, SortOrder)
 SELECT p.Id, s.ImageUrl, N'Ảnh minh họa demo: ' + s.Name, 0
 FROM @Products s JOIN dbo.Products p ON p.Sku=s.Sku
 WHERE NOT EXISTS (SELECT 1 FROM dbo.ProductImages i WITH (UPDLOCK, HOLDLOCK)
   WHERE i.ProductId=p.Id AND i.SortOrder=0);
 SET @AddedImages = @@ROWCOUNT;
 COMMIT TRANSACTION;
 SELECT @AddedCategories AS AddedCategories, @AddedProducts AS AddedProducts, @AddedImages AS AddedImages;
END TRY
BEGIN CATCH
 IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
