# Ánh xạ UC — hợp đồng dự kiến

UC-01 đến UC-05 và UC-07 đã có API và frontend gọi API, xem `uc01-registration.md`, `uc02-search.md`, `uc03-product-detail.md`, `uc04-login.md`, `uc05-uc07-cart.md`, `uc06-checkout.md`. Dữ liệu 5 danh mục/25 sản phẩm/25 ảnh đã được người dùng seed thủ công. Các UC còn lại là thiết kế, chưa triển khai. Test case nằm trong `test-cases.md`. Các test ID có hậu tố `demo-phone-01` chỉ là locator của dữ liệu mẫu giao diện; trang tìm kiếm/giỏ thật dùng SKU bất biến.

| UC | Trang | API dự kiến | Bảng | Locator chính | Test case |
|---|---|---|---|---|---|
| UC-01 Đăng ký | register.html | POST /api/auth/register | Users | register-name, register-address, register-email, register-password, register-confirm-password, register-submit, register-form-feedback | TC-01-S/F/M/I/B |
| UC-02 Tìm kiếm | search.html | GET /api/products?q=&page=&limit= | Products, Categories, ProductImages | search-keyword, search-submit, search-results, search-empty | TC-02-S/F/M/I/B |
| UC-03 Chi tiết | product-detail.html | GET /api/products/:id | Products, Categories, ProductImages | product-name, product-price, product-stock, product-description, detail-add-to-cart | TC-03-S/F/M/I/B |
| UC-04 Đăng nhập | login.html | POST /api/auth/login; POST /api/auth/logout; GET /api/auth/me | Users | login-email, login-password, login-submit, login-form-feedback | TC-04-S/F/M/I/B |
| UC-05 Xem giỏ | cart.html | GET /api/cart | Carts, CartItems, Products | cart-items, cart-total, cart-checkout-link | TC-05-S/F/M/I/B |
| UC-06 Đặt hàng | checkout.html | POST /api/orders | Users, Carts, CartItems, Products, Orders, OrderItems | checkout-recipient, checkout-phone, checkout-address, checkout-submit, checkout-form-feedback | TC-06-S/F/M/I/B |
| UC-07 Thêm giỏ | product-detail.html; add-to-cart.html hướng dẫn chọn sản phẩm | POST /api/cart/items {productId,quantity} | Carts, CartItems, Products | add-cart-quantity, detail-add-to-cart, add-cart-form-feedback | TC-07-S/F/M/I/B |
| UC-08 Tài khoản | account.html | GET/PATCH /api/account (password API deferred) | Users | account-name, account-phone, account-save, password-current, password-new, password-confirm, password-save | TC-08-S/F/M/I/B |
| UC-09 Quản lý giỏ | cart-manage.html | PATCH /api/cart/items/:productId; DELETE /api/cart/items/:productId | Carts, CartItems, Products | manage-cart-quantity-demo-phone-01, manage-cart-update-demo-phone-01, manage-cart-remove-demo-phone-01, manage-cart-clear | TC-09-S/F/M/I/B |
| UC-10 Bảo trì sản phẩm | admin/products.html | GET/POST /api/admin/products; PATCH /api/admin/products/:id; PATCH /api/admin/products/:id/status; GET /api/admin/categories | Products, Categories, ProductImages | admin-product-sku/name/slug/category/price/stock/description/image-url, admin-product-create, admin-product-save, admin-product-edit-demo-phone-01, admin-product-discontinue-demo-phone-01 | TC-10-S/F/M/I/B |

UC-05 chỉ đọc giỏ hiện tại, không đổi số lượng. UC-07 cộng quantity vào dòng hiện có hoặc tạo dòng mới. UC-09 đặt lại quantity tuyệt đối, xóa dòng hoặc xóa toàn bộ giỏ. UC-06 chuyển cart thành order trong transaction. User chưa đăng nhập phải đăng nhập trước UC-05/06/07/08/09; không có giỏ khách trong phạm vi đầu.

UC-01/02/03/04 công khai; UC-10 yêu cầu ADMIN tại middleware/API. UC-08 không nhận Role/IsActive từ client. Các API giỏ/order luôn dùng user từ session; kiểm tra quyền sở hữu từng item. Đường dẫn giao diện admin không phải cơ chế phân quyền.

Khi triển khai: bổ sung productId từ URL; trạng thái loading/empty/error/success; form feedback hiện lỗi theo field; xác nhận xóa/ngừng bán; session và nút logout. Khung hiện tại chủ đích chỉ hiển thị dữ liệu mẫu và thông báo chung.
