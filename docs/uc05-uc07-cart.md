# UC-07 Thêm sản phẩm và UC-05 Xem giỏ hàng

Sử dụng session HttpOnly và requireAuth của UC-04. Không có giỏ khách, không dùng
localStorage cho giỏ hoặc xác thực. Không triển khai sửa/xóa dòng UC-09 hay đặt hàng UC-06.

## Schema và quyền đã kiểm tra

Đã đọc metadata SQL thật trước khi triển khai:

- Carts: Id INT IDENTITY, UserId INT, UpdatedAt DATETIME2(3), UNIQUE(UserId).
- CartItems: Id INT IDENTITY, CartId INT, ProductId INT, Quantity INT,
  UNIQUE(CartId,ProductId).
- FK Carts.UserId → Users.Id; CartItems.CartId → Carts.Id;
  CartItems.ProductId → Products.Id. FK/UNIQUE đều đang bật; FK được trusted.
- CHECK CK_CartItems_Quantity đang bật/trusted. Login không thấy definition;
  ứng dụng dùng giới hạn 1–99 trong schema.proposed.sql. Ghi thực tế số lượng 1 và 3
  đã được kiểm chứng trong transaction test và rollback.
- SELECT/INSERT trên Carts và CartItems; UPDATE cột Carts.UpdatedAt và
  CartItems.Quantity đã xác nhận. Đã thử SELECT WITH(UPDLOCK,HOLDLOCK) trong transaction
  chỉ đọc để kiểm tra quyền. Không cần cấp thêm quyền, UPDATE Products hoặc DELETE.

Không sửa .env, schema, quyền hoặc seed. Backend không tự migrate dữ liệu.

## API

| Endpoint | Hành vi |
|---|---|
| POST /api/cart/items | JSON `{productId: 1, quantity: 2}`; 200 `{productId, quantity, message}` với quantity là số lượng sau cộng |
| GET /api/cart | 200 `{items, total, totalQuantity, currency, hasUnavailableItems}` |

Hai API đều yêu cầu session hợp lệ; chưa đăng nhập trả 401. Chủ giỏ chỉ lấy từ
req.user.id do requireAuth xác nhận. userId/cartId/giá gửi lên không được sử dụng;
query userId trên GET cũng không đổi giỏ được xem.
POST bảo vệ Origin/Sec-Fetch-Site bằng middleware UC-04; cross-site trả 403.

Các lỗi POST: 400 INVALID_CART_ITEM (ID/số lượng sai, số lượng không nguyên hoặc ngoài
1–99); 404 PRODUCT_NOT_AVAILABLE (sản phẩm không tồn tại hoặc sản phẩm/danh mục inactive);
409 OUT_OF_STOCK, INSUFFICIENT_STOCK hoặc QUANTITY_LIMIT. SQL/kết nối lỗi trả 503
CART_UNAVAILABLE chung, không đưa nội dung driver/config vào response.

## Transaction và tiền

POST chạy SERIALIZABLE. Khóa UPDLOCK/HOLDLOCK giỏ theo UserId, kể cả range khi chưa có;
đọc sản phẩm/danh mục bằng HOLDLOCK; đọc dòng giỏ bằng UPDLOCK/HOLDLOCK. Kiểm tra tồn kho
dựa trên số lượng hiện tại + số lượng thêm trước khi ghi. Tạo Carts nếu thiếu,
INSERT dòng mới hoặc UPDATE Quantity dòng có sẵn, cập nhật UpdatedAt rồi COMMIT;
lỗi rollback toàn bộ. UNIQUE là hàng rào cuối chống dòng trùng. Thứ tự khóa nhất quán
giữa các request. Không trừ hoặc giữ chỗ tồn kho, không tự retry POST.

GET chỉ SELECT, không tạo cart rỗng. Giá hiện tại lấy từ Products.Price (DECIMAL(18,2)),
truyền về backend dưới dạng chuỗi; nhân và cộng bằng BigInt theo đơn vị 1/100 để tránh
sai số floating point. unitPrice, lineTotal, total trong JSON là chuỗi thập phân 2 số lẻ.
Frontend cũng định dạng các chuỗi này trực tiếp, không tự tính lại tổng tiền.

GET giữ các dòng đã có dù sản phẩm hết hàng hoặc inactive. availability là available,
out_of_stock, insufficient_stock hoặc discontinued. Dòng ngừng kinh doanh không có
link chi tiết. Tổng tiền tạm tính gồm **tất cả dòng**, kể cả dòng có cảnh báo; giao diện
nêu rõ điều này. Đây chưa phải tổng đơn hàng/khả năng đặt hàng UC-06. Không tự xóa dòng,
giảm số lượng hoặc sửa tồn kho. Khi giỏ trống: items=[], total="0.00", totalQuantity=0.

## Giao diện và Cốc Cốc

```powershell
cd D:\Downloads\KTPM_Nhom9\KTPM_Nhom09
npm start
```

Nếu server cũ đang chạy, Ctrl+C đúng terminal rồi chạy lại. Trong Cốc Cốc, dùng cùng
host http://localhost:3000 xuyên suốt để cookie không bị tách giữa localhost/127.0.0.1.
Nếu tài nguyên cũ bị cache, Ctrl+F5 sau khi restart.

1. Chưa đăng nhập, mở cart.html: thấy yêu cầu đăng nhập, không thấy giỏ người khác.
2. Đăng nhập tài khoản UC-01, mở search.html, chọn sản phẩm còn hàng để xem chi tiết.
3. Nhập số lượng 1, nhấn Thêm vào giỏ. Hiện thành công; chọn Xem giỏ hàng.
4. Kiểm tra ảnh/tên/đơn giá/số lượng/thành tiền/tổng tiền từ SQL. Ví dụ giỏ ban đầu
   trống, sản phẩm 19.490.000 ₫ thêm 1 rồi thêm 2 sẽ có **một dòng, số lượng 3,
   thành tiền 58.470.000 ₫** nếu giá SQL không đổi.
5. Quay lại chi tiết, thêm số lượng khiến tổng trong giỏ vượt tồn kho: phải bị từ chối,
   số lượng trong giỏ giữ nguyên. Có thể bị chặn sớm khi lượng nhập vượt tồn kho hoặc 99.
6. Sản phẩm hết hàng (ID=3 trong dataset đã quan sát): nút thêm bị disabled. Sản phẩm
   inactive không mở được chi tiết; gọi POST trực tiếp cũng bị chặn bởi backend.
7. Tài khoản chưa từng có giỏ: giao diện giỏ trống. Đăng xuất: nội dung giỏ bị ẩn và
   chuyển sang yêu cầu đăng nhập. Chuyển tài khoản hoặc mở lại tab sẽ tải lại giỏ.
8. Hai tài khoản đăng nhập ở hai profile/cửa sổ riêng: giỏ độc lập. Không cần thay quyền
   hay sửa SQL để kiểm tra phân quyền.

Thêm từ trang chi tiết là luồng UC-07 chính. add-to-cart.html chỉ hướng dẫn chọn sản phẩm,
không còn form skeleton giả. Nút đặt hàng/sửa giỏ chưa được thêm vì thuộc UC sau.

## data-testid

| Locator | Ý nghĩa |
|---|---|
| add-cart-form / add-cart-quantity | Form và ô số lượng trên trang chi tiết |
| detail-add-to-cart | Nút thêm, disabled khi hết hàng hoặc đang gửi |
| add-cart-form-feedback | Loading/thành công/lỗi; aria-live, data-state=success/error |
| add-cart-login / detail-view-cart | Link đăng nhập khi 401 / link xem giỏ |
| cart-panel / cart-items / cart-item-rows | Panel, bảng, tbody giỏ |
| cart-item-<SKU> | Dòng theo SKU, có data-product-id |
| cart-item-name / cart-item-price / cart-item-quantity / cart-item-subtotal | Thành phần tìm trong mỗi dòng |
| cart-item-status | availability tại data-state |
| cart-total / cart-count / cart-warning | Tổng tiền/số lượng/cảnh báo |
| cart-empty / cart-login / cart-refresh | Trống/đăng nhập/tải lại |
| page-feedback | Trạng thái tải giỏ: loading/success/auth-required/error |

## Test và giới hạn kiểm chứng

`npm test`: unit/API với repository mô phỏng, SQL parameter/lock/rollback, tiền chính xác,
phân quyền/session, spoof userId/giá, CSRF, lỗi tồn kho; frontend DOM mô phỏng cho thêm,
giỏ trống/lỗi/401, hiển thị tiền và xóa nội dung giỏ sau logout. Giữ hồi quy UC-01–04.

Test SQL thật opt-in cần 2 user giả đã tồn tại từ test UC-01 trước đó và một sản phẩm
active còn ít nhất 3, không nằm trong giỏ user thử. Test không tạo user hoặc seed.
Tạo outer transaction SERIALIZABLE; mỗi thao tác repository dùng savepoint, không commit
outer transaction. Chạy API thật với requireAuth đọc Users thật, thêm 1 rồi 2, kiểm tra
một dòng số lượng 3, đọc giỏ, cô lập user, từ chối vượt kho/inactive rồi rollback và
so sánh giỏ với baseline. Không lưu thay đổi thử nghiệm; IDENTITY có thể có khoảng trống.

```powershell
$env:UC07_SQL_INTEGRATION='1'
node --test tests/backend/cart.integration.test.js
Remove-Item Env:UC07_SQL_INTEGRATION
npm run check
```

Kết quả: 40 test mặc định đạt, 2 test SQL opt-in skip; test SQL giỏ chạy riêng đạt.
Chưa stress-test nhiều kết nối đồng thời hoặc QA trên Cốc Cốc thật; concurrency được
bảo vệ bằng SERIALIZABLE/range locks và UNIQUE, có kiểm tra cấu trúc trong unit test.
Không viết hoặc chạy Selenium. Chưa triển khai chỉnh số lượng/xóa dòng UC-09.

File mới: backend/src/cart/cart.js, frontend/assets/cart.js,
tests/backend/cart.test.js, tests/backend/cart.integration.test.js,
tests/frontend/cart.test.js, docs/uc05-uc07-cart.md.
File sửa: backend/src/server.js, backend/src/auth/login.js (export sameOrigin),
frontend/assets/product-detail.js, frontend/assets/auth.js, frontend/assets/styles.css,
frontend/product-detail.html, frontend/cart.html, frontend/add-to-cart.html,
tests/frontend/detail.test.js, package.json, README.md, docs/uc-mapping.md,
docs/uc03-product-detail.md.
