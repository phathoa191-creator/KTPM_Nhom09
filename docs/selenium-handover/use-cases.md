# URL, API và selector hiện hành

BASE_URL mặc định **http://localhost:3000**. Ghép base với path bên dưới; productId
phải lấy từ API/card thật, không hardcode ID seed. Trang chủ: /index.html (root / cũng
được Express static phục vụ index). Link trang chủ trong giao diện dùng index.html.

| UC | URL giao diện | Tiền điều kiện | Expected Result chính |
|---|---|---|---|
| 01 Đăng ký | /register.html | Email test mới | 201, thông báo; ~1 giây sang /login.html, không tự login |
| 02 Tìm kiếm | /search.html?q=iphone | Công khai | Danh sách thật, phân trang; chỉ product/category active |
| 03 Chi tiết | /product-detail.html?id=<productId> | ID thật, product/category active | Tên/giá/kho/mô tả/ảnh; hết kho vẫn xem được |
| 04 Đăng nhập | /login.html | User active, mật khẩu được cấp riêng | Session xác nhận qua /me, về /index.html hoặc returnTo an toàn |
| 05 Xem giỏ | /cart.html | Session CUSTOMER/ADMIN | Giỏ đúng user, giá/tổng hiện tại, không tạo giỏ bằng GET |
| 06 Đặt hàng | /checkout.html | Session, giỏ hợp lệ, tồn đủ | COD, mã đơn và tổng; làm trống giỏ, trừ kho một lần |
| 07 Thêm giỏ | /product-detail.html?id=<productId> | Session, hàng active, tồn đủ | Cộng quantity vào một dòng duy nhất |
| 08 Tài khoản | /account.html | Session | Xem/sửa tên, phone, address; email chỉ đọc |
| 09 Quản lý giỏ | /cart-manage.html | Session, giỏ riêng | Thay quantity tuyệt đối, xác nhận xóa từng dòng |
| 10 Admin sản phẩm | /admin/products.html | Session role ADMIN | List/filter/page, thêm/sửa, bật/tắt; version chống ghi đè |

/add-to-cart.html chỉ hướng dẫn chọn sản phẩm, không phải form thêm giỏ hoạt động.

## API / Expected status

Các body dưới đây mô tả contract, không phải lời yêu cầu chạy mutation.

| UC | Method + route, body hoặc query | Thành công và lỗi quan trọng | Ghi SQL? |
|---|---|---|---|
| 01 | POST /api/auth/register {fullname,addr,uname,pwd,password_confirm} | 201 REGISTERED; 400 VALIDATION_ERROR/errors; 409 EMAIL_EXISTS; 500 REGISTRATION_FAILED | Có: Users |
| 02 | GET /api/products?q=&page=1&limit=12 | 200 {total,products,totalPages,q,page,limit}; 400 INVALID_SEARCH; 503 PRODUCTS_UNAVAILABLE | Không |
| 03 | GET /api/products/:id | 200 {product}, images; 400 ID sai; 404 PRODUCT_NOT_FOUND; 503 | Không |
| 04 | POST /api/auth/login {uname,pwd} | 200 {authenticated:true,user}; 400 validation; 401 INVALID_CREDENTIALS; 403; 429 rate limit; 503 | Không: tạo session RAM/cookie |
| 04 | GET /api/auth/me | 200 {authenticated,user}; chưa login cũng 200, false/null; 503 AUTH_UNAVAILABLE | Không |
| 04 | POST /api/auth/logout | 200 authenticated=false,user=null; 403 origin | Không: xóa session/cookie |
| 05 | GET /api/cart | 200 {items,total,totalQuantity,currency,hasUnavailableItems}; 401; 503 | Không |
| 07 | POST /api/cart/items {productId,quantity} | 200 {productId,quantity,message}, quantity sau cộng; 400; 404 PRODUCT_NOT_AVAILABLE; 409 OUT_OF_STOCK/INSUFFICIENT_STOCK/QUANTITY_LIMIT | Có: cart/items |
| 06 | POST /api/orders {requestKey,recipientName,phone,shippingAddress} | 201 đơn mới; 200 replay key cùng user; {id,orderCode,total,status,paymentMethod,currency,replayed}; 400; 409 EMPTY_CART/INVALID_CART/PRODUCT_NOT_AVAILABLE/INSUFFICIENT_STOCK/AMOUNT_LIMIT; 503 | Có: orders/items, stock, cart |
| 08 | GET /api/account | 200 {fullName,email,phone,address}; 401; 503 | Không |
| 08 | PATCH /api/account {fullName?,phone?,address?} | 200 profile; 400 VALIDATION_ERROR/errors; 401; 403; 503 | Có: Users |
| 09 | PATCH /api/cart/items/:productId {quantity} | 200 productId/quantity/message; 400; 404 CART_ITEM_NOT_FOUND/PRODUCT_NOT_AVAILABLE; 409 OUT_OF_STOCK/INSUFFICIENT_STOCK; 503 | Có: items/timestamp |
| 09 | DELETE /api/cart/items/:productId | 200 productId/message; 400; 404 CART_ITEM_NOT_FOUND; 503 | Có: dòng items/timestamp |
| 10 | GET /api/admin/products?q=&page=1&limit=12&isActive=all | 200 {total,products,page,limit}; isActive all/true/false; 400; 503 | Không |
| 10 | GET /api/admin/products/:id | 200 {product}, gồm version và inactive; 400; 404; 503 | Không |
| 10 | GET /api/admin/categories | 200 {categories}, gồm isActive | Không |
| 10 | POST /api/admin/products {sku,slug,name,categoryId,price,stock,description?,imageUrl?,imageAlt?} | 201 {product}; 400 INVALID_PRODUCT/errors; 409 DUPLICATE_PRODUCT/CATEGORY_UNAVAILABLE; 503 | Có: products/ảnh |
| 10 | PATCH /api/admin/products/:id {version,...fields} | 200 {product}; 400; 404; 409 PRODUCT_CHANGED/DUPLICATE_PRODUCT/CATEGORY_UNAVAILABLE; 503 | Có: products/ảnh |
| 10 | PATCH /api/admin/products/:id/status {version,isActive} | 200 {product}; 400; 404; 409 PRODUCT_CHANGED/CATEGORY_UNAVAILABLE; 503 | Có: trạng thái |

API giỏ/order/account cần requireAuth: thiếu session trả 401, SQL auth lỗi 503.
Admin thêm requireRole('ADMIN'): CUSTOMER trả 403, không chỉ ẩn UI. Các mutation đã có
sameOrigin (ngoại trừ register theo implementation hiện tại); cross-origin bị kiểm tra
trên login/logout/cart/orders/account/admin. Request JSON sai/quá lớn trả 400 INVALID_BODY.
Không gọi API chưa triển khai: fallback /api trả 501, không phải lỗi nghiệp vụ của UC.

## Session và điều hướng

Cookie cellphones.sid HttpOnly, SameSite=Strict; Secure khi HTTPS/production.
Không đọc cookie bằng document.cookie để assertion. Session RAM TTL 8 giờ, mất khi restart;
requireAuth đọc lại user/role/IsActive. Chỉ user active CUSTOMER/ADMIN được đăng nhập.
Header đọc /api/auth/me khi pageshow; ADMIN vẫn có đường dẫn quản trị, API mới là hàng rào.

Login chỉ chuyển sau POST thành công và GET /me xác nhận cùng user ID. Mặc định
/index.html cho cả hai role. returnTo chỉ cho đúng /cart.html, /cart-manage.html,
/checkout.html, /account.html, /admin/products.html; trang admin chỉ cho ADMIN.
URL ngoài, //host, login/register, query/hash không khớp allowlist đều về /index.html.
Link đăng nhập trên trang được bảo vệ được auth.js gắn returnTo sau khi xác định chưa login.
Không có auto redirect khi chỉ mở trang chủ/login, không có vòng lặp. Không nhận returnTo
cho product-detail query hoặc chuyển tiếp returnTo qua đăng ký trong phạm vi hiện tại.

## Selector ổn định

| UC | data-testid nên dùng |
|---|---|
| 01 | register-form/name/address/email/password/confirm-password/submit/form-feedback (mỗi tên có prefix register-) |
| 02 | search-keyword, search-submit, search-results, search-empty; product-card-<SKU>, product-detail-<SKU>; product-name/product-price trong card |
| 03 | product-name, product-price, product-stock, product-description, product-image; ảnh phụ product-image-<imageId> |
| 04 | login-email, login-password, login-submit, login-form-feedback, auth-account, auth-logout |
| 05 | cart-panel, cart-empty, cart-login, cart-item-rows, cart-item-<SKU>, cart-total, cart-count, cart-warning, cart-checkout-link, cart-manage-link |
| 06 | checkout-recipient, checkout-phone, checkout-address, checkout-submit, checkout-form-feedback, checkout-success, checkout-items, cart-total |
| 07 | add-cart-form, add-cart-quantity, detail-add-to-cart, add-cart-form-feedback, add-cart-login, detail-view-cart |
| 08 | account-form/name/phone/address/email/save/form-feedback (prefix account-); account-fullName-error, account-phone-error, account-address-error |
| 09 | manage-cart-quantity-<SKU>, manage-cart-update-<SKU>, manage-cart-remove-<SKU>, cart-item-<SKU>, cart-total, page-feedback |
| 10 | admin-product-{sku,name,slug,category,price,stock,description,image-url,image-alt,create,save,new}; admin-query/filter/prev/next/reload; admin-product-row-<ID>, admin-product-edit-<ID>, admin-product-status-<ID> |

Prefix notation là viết tắt tài liệu, không phải selector literal. Ví dụ
`[data-testid="register-name"]`, `[data-testid="account-address"]`.
Scope selector tên/giá trong card hoặc row cụ thể; đừng chọn phần tử đầu trang tùy ý.
Động theo SKU ở card/giỏ; động theo ID ở admin. SKU có thể đổi qua admin, vì vậy suite
ghi lại SKU mới sau sửa hoặc dùng ID ở trang admin. Không dùng demo-phone-01 của card
tĩnh trang chủ để định vị sản phẩm SQL. Không có manage-cart-clear hoạt động;
password-form trên account bị ẩn/disabled, đổi mật khẩu ngoài phạm vi.
