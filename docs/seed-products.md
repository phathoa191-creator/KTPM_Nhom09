# Dữ liệu mẫu UC-02

File chạy thủ công: `database/seed-products.sql`. Script chưa được thực thi bởi agent.
Schema cột/identity/UNIQUE của Categories, Products, ProductImages đã đối chiếu trực
tiếp bằng SELECT với SQL Server; tương thích schema.proposed.sql. Definition của
CHECK bị ẩn với login ứng dụng, nên giá trị seed tuân theo CHECK trong file đề xuất.
Không thay đổi Users, quyền, schema hoặc mã nghiệp vụ.

## Chạy trong SSMS

1. Kết nối đúng SQL Server bằng tài khoản quản trị hiện có.
2. Mở `database/seed-products.sql` bằng File → Open → File (giữ encoding UTF-8).
3. Chọn database **CellphoneS_Testing** trên dropdown. Dùng query mới không có transaction mở.
4. Đọc toàn bộ script và Execute **toàn bộ file**. Không chạy schema.proposed.sql để seed.
5. Result set cuối trả AddedCategories, AddedProducts, AddedImages. Nếu có lỗi runtime,
   transaction rollback và THROW; sửa nguyên nhân rồi chạy lại toàn bộ file.

Không có GO hoặc thao tác đổi database. Script kiểm tra DB_NAME và @@TRANCOUNT trước
khi ghi; chỉ INSERT dữ liệu thiếu trong một transaction, bật XACT_ABORT.
Lỗi compile không được TRY/CATCH cùng batch bắt; nếu SSMS báo lỗi thì không chạy
tiếp các đoạn hoặc COMMIT thủ công. Kiểm tra XACT_STATE()/@@TRANCOUNT trước khi xử lý.

## Số lượng dự kiến khi ba bảng ban đầu rỗng

| Nhóm | Sản phẩm |
|---|---:|
| Điện thoại | 8 |
| Laptop | 5 |
| Máy tính bảng | 4 |
| Tai nghe | 4 |
| Đồng hồ thông minh | 4 |
| Tổng | 25 |

- 5 danh mục active, 25 sản phẩm, 25 ảnh đầu tiên (SortOrder=0).
- 22 sản phẩm active: 19 còn hàng, 3 hết hàng (SKU 003, 012, 019).
- 3 sản phẩm inactive: SKU 008, 013, 025; SKU 025 cũng có Stock=0.
- Tổng 4 sản phẩm Stock=0 trong SQL; UC-02 chỉ hiển thị 3 sản phẩm hết hàng active.
- SKU `DEMO-UC02-001` đến `DEMO-UC02-025`; slug sản phẩm/danh mục bắt đầu `uc02-`.
- Giá VND/cấu hình chỉ mô phỏng học tập; không phải dữ liệu kinh doanh được xác minh.

Chạy lại nguyên script: AddedCategories=0, AddedProducts=0, AddedImages=0 nếu không
ai xóa hoặc thay đổi khóa seed. Không reset tồn kho/giá/trạng thái/tên/ảnh đã chỉnh tay.
Danh mục được nhận diện bằng slug, sản phẩm bằng SKU và đối chiếu slug/category;
ảnh bằng ProductId + SortOrder=0. SKU/slug/category xung đột thì rollback toàn bộ,
không ghi đè hay tự đổi khóa. Nếu bản ghi bị thiếu, lần chạy sau chỉ bổ sung phần thiếu.
Giữ nguyên ảnh hiện có ở SortOrder=0, không tạo ảnh trùng hoặc thay ảnh đó.

Ảnh local trong frontend/assets/images, dùng URL /assets/images/... không phụ thuộc
dịch vụ ngoài. Các ảnh đều là minh họa, không phải ảnh chính xác của từng model.

## SELECT kiểm tra sau khi bạn chạy

```sql
SELECT DB_NAME() AS CurrentDatabase;

SELECT COUNT(*) AS SeedCategories
FROM dbo.Categories WHERE Slug IN
('uc02-dien-thoai','uc02-laptop','uc02-may-tinh-bang','uc02-tai-nghe','uc02-dong-ho');

SELECT COUNT(*) AS SeedProducts,
 SUM(CASE WHEN IsActive=1 THEN 1 ELSE 0 END) AS ActiveProducts,
 SUM(CASE WHEN IsActive=0 THEN 1 ELSE 0 END) AS InactiveProducts,
 SUM(CASE WHEN Stock=0 THEN 1 ELSE 0 END) AS AllOutOfStock,
 SUM(CASE WHEN IsActive=1 AND Stock=0 THEN 1 ELSE 0 END) AS ActiveOutOfStock
FROM dbo.Products WHERE Sku LIKE 'DEMO-UC02-%';
-- Dự kiến: 25, 22, 3, 4, 3.

SELECT COUNT(*) AS SeedImages
FROM dbo.ProductImages i JOIN dbo.Products p ON p.Id=i.ProductId
WHERE p.Sku LIKE 'DEMO-UC02-%'; -- 25 nếu chưa bổ sung ảnh khác.

SELECT c.Name AS Category, COUNT(*) AS Products
FROM dbo.Products p JOIN dbo.Categories c ON c.Id=p.CategoryId
WHERE p.Sku LIKE 'DEMO-UC02-%' GROUP BY c.Name;

SELECT p.Sku, p.Name, p.Price, p.Stock, p.IsActive, i.ImageUrl
FROM dbo.Products p LEFT JOIN dbo.ProductImages i ON i.ProductId=p.Id AND i.SortOrder=0
WHERE p.Sku LIKE 'DEMO-UC02-%' ORDER BY p.Sku;

-- Hai truy vấn này phải trả 0 dòng:
SELECT p.Sku FROM dbo.Products p
WHERE p.Sku LIKE 'DEMO-UC02-%'
AND NOT EXISTS (SELECT 1 FROM dbo.ProductImages i WHERE i.ProductId=p.Id);

SELECT Sku, COUNT(*) AS Copies FROM dbo.Products
WHERE Sku LIKE 'DEMO-UC02-%' GROUP BY Sku HAVING COUNT(*)>1;
```

## Kiểm tra trên website sau seed

Khởi động lại backend nếu chưa nạp mã UC-02; mở http://localhost:3000/search.html.
Với đúng seed nguyên bản và không có sản phẩm khác:

- q rỗng: total=22, 2 trang ở limit=12; các sản phẩm Stock=0 vẫn hiển thị hết hàng.
- `iphone` / `IPHONE`: cùng 3 kết quả; `iPhone 16`: 2 kết quả.
- `MacBook Air`: 2 kết quả; `Apple Watch SE`: 2 kết quả.
- `OPPO Reno13`, `Dell Inspiron`, `Redmi Watch 4`: 0 vì inactive.
- `uc02-khong-co-san-pham`: 0 kết quả.

Có thể gọi trực tiếp `/api/products?q=iphone` và `/api/products?page=2&limit=12`.
Script không được backend tự nạp, không có npm script tự seed hoặc Selenium đi kèm.
