# UC-06 Đặt hàng

POST /api/orders yêu cầu session HttpOnly (requireAuth) và sameOrigin. Body:
`{requestKey: UUID, recipientName: string, phone: string, shippingAddress: string}`.
Chỉ COD; owner từ session. Giá, tên, SKU lấy SQL; bỏ qua userId/giá client.
201 cho đơn mới; 200 cho key đã thành công của cùng user, kể cả giỏ rỗng.
400 INVALID_ORDER; 401 AUTH_REQUIRED; 403 FORBIDDEN;
409 EMPTY_CART/INVALID_CART/PRODUCT_NOT_AVAILABLE/INSUFFICIENT_STOCK/AMOUNT_LIMIT;
503 ORDER_UNAVAILABLE cho lỗi SQL/timeout/deadlock/commit chưa xác định.
Không lộ lỗi driver. Không tự retry POST phía server.

Metadata admin xác nhận: điện thoại /^0[0-9]{9}$/ (giữ chuỗi), tên NVARCHAR(100),
địa chỉ NVARCHAR(500), quantity 1..99, stock 0..1000000; LineTotal computed persisted.
CreatedAt dùng DEFAULT SYSDATETIME() thực tế. Backend ghi rõ PENDING và COD.
Không suy đoán biểu thức CHECK dài còn lại: snapshot đi thẳng từ SQL, tổng không âm,
chuỗi đầu vào trim/không trắng; vi phạm constraint chưa dự kiến rollback và trả lỗi chung.

Transaction SERIALIZABLE: khóa Carts(UserId) UPDLOCK,HOLDLOCK giống UC-07, tìm key cũ,
đọc giỏ, khóa Products UPDLOCK,HOLDLOCK theo ID tăng dần và Categories HOLDLOCK,
kiểm tra active/tồn kho, tính tiền BigInt đơn vị 1/100 và giới hạn DECIMAL(18,2).
Tạo Orders/OrderItems (không INSERT LineTotal); UPDATE stock có điều kiện và kiểm tra
rowsAffected; DELETE items trong giỏ đã khóa; UPDATE Carts.UpdatedAt; COMMIT.
Lỗi rollback tất cả; không DELETE Carts. UNIQUE là bảo vệ bổ sung.
Cùng giỏ bị tuần tự hóa: hai key chỉ đơn đầu lấy được giỏ, đơn sau nhận EMPTY_CART
(trừ trường hợp có thêm hàng hợp lệ giữa hai thao tác). Hai user tranh hàng cuối:
product update locks và Stock>=quantity ngăn kho âm. Deadlock có thể vẫn xảy ra do
kế hoạch SQL/lock escalation; trả 503, client thử cùng key. Chưa kiểm chứng tải SQL thật.

Frontend tải GET /api/auth/me và GET /api/cart, hiển thị tiền chuỗi chính xác,
không dùng innerHTML cho dữ liệu. Chặn nhấn đúp, lưu key và body của yêu cầu chưa rõ
kết quả trong sessionStorage cùng user ID để khôi phục sau reload trong cùng tab.
Khi còn pending, retry cùng body/key; dữ liệu nhập mới chỉ dùng sau lỗi dứt khoát.
Logout/chuyển user xóa pending và dữ liệu hiển thị, bỏ phản hồi cũ. sessionStorage
chứa thông tin nhận hàng cho tới khi kết thúc yêu cầu hoặc đổi user/đóng tab; nếu trình
 duyệt chặn storage thì chỉ giữ trong RAM. Không dùng chung key cho đơn mới.
Không chia sẻ trạng thái pending giữa nhiều tab. Nếu đóng tab khi kết quả chưa rõ,
cần đối chiếu đơn trước khi tạo yêu cầu mới; chưa có trang lịch sử đơn hàng.

## Kiểm thử

`npm test`: hồi quy và unit/API/mock transaction/frontend VM; không ghi SQL mặc định.
`npm run check`: kiểm tra cú pháp. Không Selenium.
Test orders.integration.test.js yêu cầu đồng thời UC06_SQL_INTEGRATION=1,
UC06_SQL_WRITE_APPROVED=YES và UC06_TEST_USER_ID là user synthetic đã có
(email selenium-uc01-%@example.test), giỏ hợp lệ chuẩn bị riêng sau khi được cho phép.
KHÔNG bật trước khi người dùng chấp thuận. Test không seed hoặc tự chọn user thật.
Outer transaction luôn rollback; thao tác dùng savepoint, commit adapter là no-op.
Kiểm tra lỗi sau INSERT, snapshot, replay, trừ kho một lần, phục hồi giỏ/tồn kho.
IDENTITY vẫn có thể tăng dù rollback; ROWVERSION cũng không hoàn nguyên bộ đếm.
Test này không chứng minh concurrency nhiều connection; chưa chạy test SQL ghi.

## Cốc Cốc

1. npm start, dùng http://localhost:3000 thống nhất; Ctrl+F5 nếu cache cũ.
2. Chưa đăng nhập: checkout yêu cầu đăng nhập, không dữ liệu mẫu.
3. Đăng nhập, thêm hàng từ chi tiết, mở giỏ rồi nhấn Đặt hàng.
4. Đối chiếu tổng tiền tạm tính; ví dụ 19.490.000 x 3 = 58.470.000 đ nếu giá SQL không đổi.
5. Nhập tên, số điện thoại bắt đầu 0 gồm đúng 10 số, địa chỉ; thử dữ liệu sai trước.
6. Xác nhận COD: mã đơn và tổng tiền hiện sau commit; giỏ trống. Thao tác này ghi dữ liệu thật.
7. Nhấn đúp không tạo hai POST; thử mất kết nối và retry cùng key qua DevTools.
8. Logout/chuyển tài khoản: không còn dữ liệu đơn cũ. Admin đối chiếu order/items/stock.
9. Cạnh tranh hàng cuối cần hai tài khoản/profile và dữ liệu test được phê duyệt riêng.

Locator giữ: checkout-form, checkout-recipient, checkout-phone, checkout-address,
checkout-submit, checkout-form-feedback, cart-items, cart-total, page-feedback.
Thêm: cart-checkout-link, checkout-panel, checkout-items, checkout-login, checkout-success;
dòng hàng cart-item-<SKU>.
