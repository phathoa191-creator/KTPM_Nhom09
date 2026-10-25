# UC-10 — Bảo trì sản phẩm

## API

Tất cả route /api/admin dùng requireAuth + requireRole('ADMIN'), Cache-Control no-store.
POST/PATCH dùng sameOrigin. Không tin role/userId do client gửi. Không có DELETE sản phẩm.

| Route | Kết quả |
|---|---|
| GET /api/admin/products?q=&page=1&limit=12&isActive=all | Danh sách, total/page/limit; lọc all/true/false, limit tối đa 48 |
| GET /api/admin/products/:id | {product}, gồm cả inactive |
| GET /api/admin/categories | {categories}, gồm cả trạng thái |
| POST /api/admin/products | 201 {product} |
| PATCH /api/admin/products/:id | 200 {product} |
| PATCH /api/admin/products/:id/status | {version,isActive:boolean} → 200 {product} |

400 INVALID_PRODUCT/INVALID_PRODUCT_ID; 401 chưa login; 403 sai role/origin;
404 PRODUCT_NOT_FOUND; 409 DUPLICATE_PRODUCT/PRODUCT_CHANGED/CATEGORY_UNAVAILABLE;
503 ADMIN_PRODUCTS_UNAVAILABLE không lộ SQL. JSON sai/quá lớn theo INVALID_BODY hiện có.

POST bắt buộc sku,slug,name,categoryId,price,stock; tùy chọn description,imageUrl,imageAlt.
Sản phẩm mới active; ảnh có thể bỏ qua. PATCH gửi version và ít nhất một trường thay đổi;
không nhận Id/CreatedAt/UpdatedAt/IsActive ngoài status API. Giá dùng chuỗi, không dùng float.

## Validation

- Giá chuỗi thập phân 0–999999999.99, tối đa hai số lẻ, chuẩn hóa hai số lẻ bằng BigInt.
- Stock number nguyên 0–1000000; Name trim/không trắng, tối đa 200 đơn vị UTF-16.
- SKU <=50 và Slug <=200, trim/không trắng. Quy tắc nghiệp vụ bổ sung chặt hơn CHECK:
  chỉ ASCII A-Z/a-z/0-9/-/_. Không tự sửa định danh cũ ngoài thao tác người dùng.
- CategoryId SQL INT dương, phải tồn tại và active khi thêm/sửa, bật lại.
  Ngừng bán vẫn được phép nếu danh mục inactive.
- Description string <=20000 đơn vị UTF-16 (giới hạn API bổ sung).
- ImageUrl HTTP(S), <=2048 đơn vị UTF-16, không credentials; server không fetch URL.
- ImageAlt null hoặc string <=200. Gửi alt phải kèm URL.
- Version hex 16 ký tự. Đọc SQL phải CONVERT BINARY(8) trước khi đổi sang hex;
  chuyển trực tiếp timestamp sang varchar trên instance này không cho hex đúng.

## Transaction và cạnh tranh

SERIALIZABLE. Khi sửa/status: khóa Products UPDLOCK,HOLDLOCK, so sánh Version;
đọc Categories HOLDLOCK, UPDATE với WHERE Id AND Version, kiểm tra rowsAffected=1.
Version là token điều kiện, không ghi trực tiếp vào cột rowversion.
Checkout thay stock làm Version thay đổi, bản sửa admin cũ trả 409 thay vì ghi đè tồn kho.
SKU/Slug do UNIQUE SQL kiểm tra; lỗi 2601/2627 được ánh xạ 409, kể cả cạnh tranh ghi.
Ghi sản phẩm và ảnh trong cùng transaction; lỗi bất kỳ rollback. Ảnh chỉ SortOrder=0,
UPDATE nếu có/INSERT nếu chưa, không xóa hoặc sửa ảnh khác. Cập nhật riêng ảnh cũng
chạm UpdatedAt của Products để thay version. SELECT sản phẩm mới trước COMMIT, trả sau COMMIT.
Tạo mới ghi rõ Description/IsActive/CreatedAt/UpdatedAt và SortOrder, không dựa vào DEFAULT ẩn.

Không sửa Orders/OrderItems/Carts/CartItems. Giá/tồn kho/trạng thái mới được UC-02/03/05/06/07/09
kiểm tra theo cơ chế đã có; đơn cũ giữ snapshot. Stock admin là giá trị tuyệt đối, cần version mới.
Deadlock/timeout/commit chưa rõ trả lỗi chung; không tự retry. Sau lỗi mơ hồ, frontend khóa ghi,
yêu cầu tải lại để đối chiếu. Không bảo đảm POST idempotent; cần kiểm tra SKU/Slug đã tạo trước khi thử lại.
Version không bảo vệ thay đổi trực tiếp ProductImages bằng SSMS nếu không chạm Products;
không có schema trigger mới. Chưa kiểm chứng concurrency SQL nhiều kết nối thật.

## Frontend và kiểm thử

admin/products.html dùng dữ liệu thật, tìm kiếm/phân trang/trạng thái, thêm/sửa/status,
email/role không phải input quản trị. Khi sửa: giữ ảnh nếu URL trống; không hỗ trợ xóa ảnh.
Dữ liệu textContent, file UTF-8; bỏ phản hồi cũ và xóa form/list khi auth-state-changed.
Chuyển user ở tab khác cần tải lại trang để xác minh; session/role luôn được API kiểm tra lại.

Giữ locator form admin-product-{sku,name,slug,category,price,stock,description,image-url,create,save},
admin-products, admin-product-form-feedback, page-feedback. Thêm image-alt, admin-query,
admin-filter, admin-prev/next/reload, admin-product-new; dòng/action dùng ID bất biến:
admin-product-row-<id>, admin-product-edit-<id>, admin-product-status-<id>.

Test mô phỏng kiểm tra auth mọi route, cross-origin, validation, UNIQUE mapping,
version cũ, transaction/rollback, create/edit/status, UI tìm kiếm/phân trang/gửi đúp,
quyền, lỗi validation/mất mạng/logout, UTF-8 và hồi quy UC-01–09.
Đã kiểm tra SELECT thật cho list/categories/detail, giá dạng chuỗi và version hex.
Không test ghi SQL hoặc Selenium. UI chưa QA trực tiếp trên Cốc Cốc.

## Cốc Cốc

1. Restart npm start; mở http://localhost:3000/admin/products.html, Ctrl+F5.
2. Chưa đăng nhập/CUSTOMER: không thấy danh sách, API trả 401/403.
3. Đăng nhập ADMIN đã có; xem danh sách, tìm tên/SKU, lọc trạng thái, chuyển trang.
4. Thêm sản phẩm mới: SKU/Slug riêng, category active, giá chuỗi thập phân,
   stock hợp lệ, URL ảnh HTTP(S) tùy chọn. Kiểm tra lỗi thiếu trường/trùng SKU trước.
5. Chọn Sửa, đổi tên/giá/stock/ảnh, Lưu chỉnh sửa, mở lại kiểm tra dữ liệu.
6. Mở cùng sản phẩm ở hai tab; lưu tab 1, tab 2 lưu phiên bản cũ phải báo 409.
7. Ngừng kinh doanh và hủy/xác nhận; lọc inactive rồi kích hoạt lại. Sản phẩm
   inactive không còn trên tìm kiếm/chi tiết; cart hiện cảnh báo, checkout chặn.
8. Đơn đã tạo vẫn giữ giá/tên/SKU snapshot. Không cần tạo đơn mới để kiểm tra quản trị.

Bước thêm/sửa/status sẽ ghi SQL thật; chưa thực hiện trong quá trình triển khai.
