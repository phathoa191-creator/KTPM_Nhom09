# UC-09 — Quản lý giỏ hàng

## API

`PATCH /api/cart/items/:productId` nhận duy nhất `{quantity: number}`. Số lượng
nguyên 1–99, đặt tuyệt đối, không cộng thêm. Không tạo cart/item mới.
`DELETE /api/cart/items/:productId` xóa đúng dòng trong giỏ user hiện tại, không xóa Carts.
ProductId là số nguyên dương miền SQL INT; không chấp nhận dấu, số lẻ, đuôi ký tự hoặc số 0 đầu.
UserId chỉ lấy từ session, không từ URL/body/query. PATCH từ chối field thừa.
Cả hai dùng requireAuth, sameOrigin và no-store từ middleware auth hiện có.

200 thành công `{productId,quantity?,message}`; 400 INVALID_CART_ITEM; 401 AUTH_REQUIRED;
403 FORBIDDEN; 404 CART_ITEM_NOT_FOUND. PATCH sản phẩm/danh mục không khả dụng trả
404 PRODUCT_NOT_AVAILABLE; hết hàng 409 OUT_OF_STOCK; vượt kho 409 INSUFFICIENT_STOCK.
Lỗi SQL/timeout/deadlock trả 503 CART_UNAVAILABLE chung. Không lộ driver/SQL/stack.
Không có DELETE /api/cart trong phạm vi này. Định danh endpoint là ProductId, không phải CartItems.Id.

## Transaction

SERIALIZABLE, đầu tiên SELECT Carts theo UserId WITH(UPDLOCK,HOLDLOCK), giống UC-06/07.
PATCH đọc Products/Categories HOLDLOCK rồi CartItems UPDLOCK,HOLDLOCK theo thứ tự UC-07.
Kiểm tra dòng trong giỏ trước khi báo lỗi trạng thái sản phẩm, không lộ giỏ user khác.
Kiểm tra active, quantity <= stock; UPDATE Quantity tuyệt đối với CartId AND ProductId.
DELETE không đọc Products nên vẫn xóa được hàng hết kho/ngừng bán.
Kiểm tra rowsAffected=1, UPDATE Carts.UpdatedAt trong cùng transaction; lỗi rollback.
Không ghi Products/Orders/OrderItems, không giữ chỗ kho, không sửa snapshot đơn cũ.

Các mutation cùng giỏ tuần tự hóa tại khóa Carts. PATCH trước checkout làm checkout
thấy quantity mới; checkout trước làm PATCH/DELETE nhận 404. POST trước/sau PATCH
cho kết quả theo thứ tự commit; POST sau DELETE có thể tạo lại dòng như UC-07 vốn có.
Deadlock/lock escalation vẫn có thể xảy ra; không tự retry mutation phía server/client.
Hai tab sửa cùng dòng chưa có kiểm soát phiên bản: thao tác sau quyết định quantity cuối.

Quyền đã được xác minh trong khảo sát: SELECT Carts/CartItems/Products/Categories,
UPDATE CartItems.Quantity và Carts.UpdatedAt, DELETE CartItems. Không cấp thêm quyền.

## Frontend và locator

cart.html vẫn xem giỏ; cart-manage-link sang cart-manage.html; khôi phục
cart-checkout-link sang checkout.html. Trang quản lý bỏ toàn bộ dòng demo/form skeleton,
dùng GET /api/cart để lấy tên/ảnh/SKU/giá/quantity/thành tiền/tổng.
Mutation thành công tải lại GET, không tính tổng bằng floating point.
Xác nhận trước DELETE, chặn thao tác trùng; lỗi mơ hồ khóa controls đến khi GET lại thành công.
Không tự gửi lại mutation. Tải lại không đảm bảo request cũ đã kết thúc trên server;
nếu commit còn chưa rõ, cần đối chiếu kết quả trước khi thao tác lại.
Logout/auth-state-changed xóa dòng và tổng ngay, bỏ phản hồi cũ bằng generation counter.
Thay đổi đăng nhập ở tab khác được nhận khi focus hoặc có sự kiện auth; chưa realtime.
Dữ liệu dùng textContent, URL ảnh lọc protocol và credentials, file UTF-8.

Giữ cart-items, cart-item-rows, cart-total, cart-count, cart-warning, cart-panel,
cart-empty, cart-login, cart-refresh, page-feedback, cart-item-<SKU>.
Thêm manage-cart-quantity-<SKU>, manage-cart-update-<SKU>, manage-cart-remove-<SKU>.
Không còn locator giả demo-phone-01 hoặc nút manage-cart-clear.

## Kiểm thử và Cốc Cốc

`npm run check`, `npm test`: API auth/CSRF/owner/input, SQL parameters và lock order,
rowsAffected/rollback, DELETE hàng inactive, frontend xác nhận/hủy xóa, tổng từ GET,
giỏ trống, mất mạng, gửi đúp/logout, UTF-8, liên kết checkout; hồi quy UC-01–08.
Test đồng thời dùng mô hình SQL trong RAM với các repository UC-06/07/09 thực tế:
PATCH–POST, DELETE–POST, PATCH–checkout, DELETE–checkout theo cả thứ tự cần thiết.
Mô hình không chứng minh hành vi khóa SQL Server thật. Không chạy SQL ghi hoặc Selenium.

1. npm start; restart server cũ đúng terminal nếu cần. Cốc Cốc mở http://localhost:3000,
   Ctrl+F5; chưa login mở cart-manage.html phải yêu cầu đăng nhập.
2. Login, thêm sản phẩm rồi chọn Quản lý giỏ hàng từ cart.html.
3. Ví dụ iPhone giá SQL 19.490.000 đ, quantity 3: sửa thành 2 rồi Cập nhật;
   tổng một dòng phải 38.980.000 đ nếu giá không đổi. Reload vẫn quantity 2.
4. Thử 0, âm, số lẻ, 100; thử vượt kho: bị từ chối, giỏ giữ nguyên.
5. Xóa → Hủy: không gọi DELETE. Xác nhận: dòng mất; dòng cuối mất thì giỏ trống.
6. Hai tài khoản/profile độc lập: không sửa/xóa giỏ nhau. Logout xóa hiển thị cũ.
7. Giỏ còn hàng hợp lệ: Đặt hàng → checkout, đối chiếu giỏ; chỉ xác nhận đơn nếu muốn ghi SQL thật.

Các bước cập nhật/xóa/checkout thủ công sẽ thay đổi SQL thật; chưa thực hiện trong đợt triển khai.
