# Kiểm tra và khôi phục dữ liệu test an toàn

Tài liệu là quy trình cho người phụ trách, không phải script tự chạy. Đợt bàn giao
không sửa SQL thật. Không chạy schema.proposed.sql/seed-products.sql để reset: schema
là script khởi tạo, seed chỉ thêm bản ghi thiếu, không phục hồi giá/stock đã thay đổi.

## Ưu tiên cô lập

1. Người phụ trách chuẩn bị database test riêng hoặc bản sao được duyệt và cơ chế backup;
   không tự đổi .env/schema/quyền trong suite Selenium.
2. Chốt không có thao tác ngoài nhóm trong đợt ghi. Mỗi member/run dùng user/product riêng.
3. Lưu manifest trước ghi: user alias/email, IDs/SKU, stock/price/isActive/category/image,
   cart quantities, profile giả và thời điểm; không PasswordHash/password/cookie.
4. Chuẩn bị baseline và backup bằng quy trình admin của môi trường. Không đưa file backup
   chứa dữ liệu nhạy cảm vào Git/artifacts công khai.
5. Case đọc không cần reset. Case mutation chỉ dọn đúng fixture được chứng minh thuộc run.

## Kiểm tra chỉ đọc

Ưu tiên API GET theo session/role. Nếu người phụ trách dùng SSMS, chọn đúng database,
tham số ID từ manifest, SELECT trước mọi quyết định sửa. Ví dụ dưới đây không thay dữ liệu:

```sql
USE [CellphoneS_Testing];
SELECT DB_NAME() AS CurrentDatabase;

DECLARE @TestUserId INT = NULL;   -- admin điền ID chính xác từ manifest
DECLARE @TestProductId INT = NULL;

SELECT Id, FullName, Email, Phone, Address, Role, IsActive
FROM dbo.Users WHERE Id = @TestUserId;

SELECT c.Id AS CartId, i.ProductId, i.Quantity
FROM dbo.Carts c LEFT JOIN dbo.CartItems i ON i.CartId=c.Id
WHERE c.UserId=@TestUserId;

SELECT Id, Sku, Slug, Price, Stock, IsActive, CategoryId, UpdatedAt
FROM dbo.Products WHERE Id=@TestProductId;

SELECT Id, ProductId, ImageUrl, AltText, SortOrder
FROM dbo.ProductImages WHERE ProductId=@TestProductId;

SELECT Id, OrderCode, UserId, RequestKey, TotalAmount, Status
FROM dbo.Orders WHERE UserId=@TestUserId;

SELECT i.OrderId, i.ProductId, i.ProductName, i.ProductSku,
       i.UnitPrice, i.Quantity, i.LineTotal
FROM dbo.OrderItems i JOIN dbo.Orders o ON o.Id=i.OrderId
WHERE o.UserId=@TestUserId;
```

Không SELECT * từ Users; không đọc/xuất PasswordHash. Các truy vấn order chỉ dành
người được phép; không xin thêm quyền runtime để làm cleanup.

## Quy trình khôi phục theo loại dữ liệu

| Dữ liệu | Cách xử lý an toàn |
|---|---|
| Giỏ fixture riêng | Liệt kê GET cart, xóa từng productId bằng DELETE UC-09 sau khi xác nhận ownership; không có API clear-all. Có thể dựng lại quantity baseline qua POST/PATCH chỉ nếu stock/active còn hợp lệ |
| Profile giả | PATCH ba trường về baseline đã lưu; email không sửa được; không chạm Role/IsActive/hash |
| Product do run tạo | Ưu tiên ngừng bán qua status API với version mới; giữ để truy vết, không hard delete |
| Product test được sửa | Nếu không ai khác thay đổi, dùng bản baseline và version hiện tại để sửa qua Admin; không ghi đè thay đổi ngoài run |
| Checkout đã commit | Giữ đơn/snapshot và manifest; không xóa Orders/OrderItems hoặc cộng kho tự động; chưa có API hủy đơn/hoàn kho |
| User đăng ký test | Giữ bản ghi có nhận diện run hoặc cleanup admin riêng được duyệt; không có API xóa user |

Không phục hồi stock về số cũ nếu có checkout thật/worker khác sau baseline: có thể
làm mất cập nhật. Với stock cuối/checkout nhiều lượt, ưu tiên tạo fixture mới cho lần
chạy sau; đối chiếu quantity đã bán trước mọi đề xuất bù kho. Bất kỳ SQL cleanup ghi
thủ công nào đều cần phạm vi ID cụ thể, review, phê duyệt và transaction riêng của admin.
Không cung cấp lệnh DELETE/TRUNCATE/DBCC CHECKIDENT toàn bảng hoặc chạy theo LIKE prefix
đơn thuần. Không disable CHECK/FK, không xóa ảnh/sản phẩm có tham chiếu, không reseed ID.

## Khôi phục từ backup

Chỉ admin thực hiện trên database test được xác định chính xác, trong thời gian nhóm
đã dừng test/server kết nối, theo quy trình restore của môi trường. Xác nhận backup và
đích restore trước thao tác; không restore đè môi trường có dữ liệu ngoài nhóm. Sau đó
khởi động lại ứng dụng, login lại, chạy health + SELECT/GET baseline và ánh xạ ID mới.
Không hardcode ID cũ sau restore. Không để suite Selenium tự restore database.

Transaction rollback không hoàn nguyên bộ đếm IDENTITY/ROWVERSION; không coi ID liên
tục là Expected Result. Selenium HTTP thông thường commit từng request; không thể
bao cả browser scenario trong transaction rollback như test repository nội bộ.

## Kết thúc lượt chạy

Đối chiếu manifest và dữ liệu sau, ghi rõ retained/restored/pending-cleanup, người review,
fixture cần giữ cho điều tra. Khi có lỗi chưa biết commit hay chưa, dừng retry ghi và
kiểm tra kết quả trước cleanup. Không xóa bằng chứng hoặc dữ liệu thật để suite chạy xanh.
