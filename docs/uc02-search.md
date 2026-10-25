# UC-02 — Tìm kiếm sản phẩm

Trang search.html trước đây chỉ hiển thị 6 sản phẩm mẫu và form data-skeleton.
Backend chưa có GET /api/products. UC-02 hiện dùng API SQL và giữ CSS CellphoneS hiện có;
không triển khai chi tiết sản phẩm, giỏ hàng hoặc Selenium.

## API

`GET /api/products?q=iphone&page=1&limit=12`

- q được trim, tối đa 200 ký tự. Rỗng hoặc chỉ khoảng trắng: liệt kê sản phẩm đang kinh doanh.
- Tìm một phần tên bằng LIKE với collation Latin1_General_100_CI_AS, không phân biệt
  hoa/thường, vẫn phân biệt dấu. %, _, [, ~ được hiểu là ký tự thường trong từ khóa.
- page mặc định 1, phạm vi 1–1000000; limit mặc định 12, phạm vi 1–48.
- Chỉ lấy Products.IsActive=1 và Categories.IsActive=1. Hết hàng vẫn hiển thị trạng thái.
- Giá, tên, mô tả, SKU, tồn kho, danh mục và ảnh lấy từ database. Ảnh đầu tiên được chọn
  theo SortOrder rồi Id; không có ảnh/ảnh lỗi dùng SVG minh họa hiện có.
- HTTP 200: `{products, total, q, page, limit, totalPages}`; không có kết quả trả products=[] và total=0.
- HTTP 400: INVALID_SEARCH nếu tham số không hợp lệ.
- HTTP 503: PRODUCTS_UNAVAILABLE khi SQL mất kết nối, thiếu quyền hoặc truy vấn lỗi;
  không tiết lộ login, password, stack hoặc nội dung lỗi SQL.

Tất cả dữ liệu đầu vào được bind qua mssql, không nối vào SQL. Frontend dựng DOM bằng
textContent, không chèn nội dung sản phẩm hoặc từ khóa vào innerHTML.

## SQL và điều kiện vận hành

Mapping theo database/schema.proposed.sql:

- Products: Id, CategoryId, Sku, Name, Description, Price, Stock, IsActive.
- Categories: Id, Name, IsActive.
- ProductImages: Id, ProductId, ImageUrl, AltText, SortOrder.

Người dùng đã cấp SELECT cho cả 3 bảng. Đã đối chiếu metadata cột/identity/UNIQUE thực tế
và xác nhận mapping trên. Ba bảng chưa có dữ liệu theo xác nhận của người dùng.
Seed thủ công được chuẩn bị tại database/seed-products.sql, xem `seed-products.md`;
agent không chạy seed. Backend không cấp quyền, sửa schema hoặc tự seed dữ liệu.
Không cần quyền INSERT, db_owner hoặc sysadmin cho API UC-02.
Nếu chưa có sản phẩm/danh mục đang active, kết quả rỗng là trạng thái hợp lệ.

## Chạy và kiểm tra thủ công

```powershell
cd D:\Downloads\KTPM_Nhom9\KTPM_Nhom09
npm start
```

Nếu tiến trình cũ đang giữ cổng 3000, Ctrl+C đúng terminal đó rồi chạy lại để nạp route mới.
Mở http://localhost:3000/search.html. Thanh tìm kiếm header ở các trang hiện có cũng
chuyển tới search.html?q=... và tự tải kết quả theo URL.

1. Để trống từ khóa: thấy sản phẩm đang kinh doanh hoặc thông báo danh mục rỗng.
2. Nhập một phần tên có trong SQL, sau đó đổi hoa/thường: cùng tập kết quả, cùng thứ tự.
3. Nhập từ khóa không tồn tại: danh sách rỗng và thông báo không tìm thấy.
4. Kiểm tra ảnh/tên/giá VND/danh mục/mô tả/tồn kho/SKU; dùng Trang sau/Trang trước nếu có.
5. Submit không tải lại trang; URL lưu q/page, Back/Forward tải lại kết quả tương ứng.
6. Khi thiếu quyền/mất kết nối SQL: hiện lỗi tải sản phẩm, không hiển thị dữ liệu mẫu giả.
7. Kiểm tra register.html và hai API health vẫn hoạt động.

Locator cho thành viên viết Selenium:

| data-testid | Ý nghĩa |
|---|---|
| search-form | Form tìm kiếm |
| search-keyword | Ô từ khóa |
| search-submit | Nút tìm kiếm |
| search-form-feedback | Loading, thành công hoặc lỗi; role=status |
| search-results | Danh sách; aria-busy trong lúc tải |
| product-card-<SKU> | Card theo SKU thực tế; có data-product-id, data-sku |
| product-name / product-price | Tên/giá, tìm trong từng card |
| search-empty | Thông báo rỗng; hidden khi không áp dụng |
| search-summary | Tổng số kết quả |
| search-pagination / search-prev / search-next | Phân trang; link chỉ hiện khi có trang tương ứng |

SKU có ký tự đặc biệt cần escape trong CSS selector. Không dùng locator SKU mẫu của
trang skeleton cũ nếu SKU đó không có trong database.

## Kiểm thử

`npm test`: kiểm thử API/tham số, LIKE escaping, truy vấn có tham số, 200/400/503,
UI render/empty/error, đồng thời giữ test hồi quy UC-01. `npm run check`: kiểm tra cú pháp.
Test không ghi Products/Categories/ProductImages và không chạy Selenium.

Kết quả ngày 24/10/2026: 18 bài đạt, 1 bài tích hợp đăng ký opt-in được skip;
kiểm tra cú pháp đạt. Kiểm tra HTTP bằng mã mới với SQL thật: /api/health và
/api/health/db trả 200; /search.html và /register.html trả 200.
Sau khi người dùng cấp SELECT, /api/products?q=iphone trả 200, total=0, products=[].
Seed mới chỉ kiểm tra tĩnh, chưa thực thi; chưa kiểm chứng danh sách sản phẩm sau seed
hoặc giao diện trong trình duyệt thật.
