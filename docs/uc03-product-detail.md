# UC-03 — Xem chi tiết sản phẩm

Tái sử dụng product-detail.html, CSS detail-gallery/detail-summary và pool SQL hiện có.
Card tìm kiếm được bọc bằng link thật: click ảnh/tên/nội dung hoặc Enter để mở
product-detail.html?id=<ID lấy từ API>, không suy luận ID từ SKU.
Không sửa schema, seed, quyền hoặc logic đăng ký/tìm kiếm SQL. Không viết/chạy Selenium.

## API

`GET /api/products/:id` — tra cứu theo ID INT dương; chưa cung cấp route slug.

- 200: `{product: {id, sku, slug, name, description, price, stock, category, images}}`.
- images gồm `{id, url, alt, sortOrder}`, sắp xếp SortOrder rồi Id.
- 400 INVALID_PRODUCT_ID: ID không phải số nguyên dương chuẩn hoặc vượt 2147483647.
- 404 PRODUCT_NOT_FOUND: không tồn tại, Products.IsActive=0 hoặc Categories.IsActive=0.
  Cả ba tình huống trả cùng thông báo, không tiết lộ chi tiết sản phẩm bị ẩn.
- 503 PRODUCT_UNAVAILABLE: lỗi SQL/kết nối, response không chứa thông tin driver/secret.
- Cache-Control: no-store; chỉ SELECT, bind @id bằng mssql.Int.

Stock=0 vẫn trả chi tiết nhưng hiển thị Tạm hết hàng. Trang chỉ hiện panel sau khi
API tải thành công; lỗi/404/ID thiếu hoặc sai không hiển thị dữ liệu mẫu cũ.
Tên/mô tả từ SQL được render bằng textContent, ảnh chỉ chấp nhận URL http/https;
ảnh thiếu/hỏng dùng SVG minh họa hiện có. Mô tả giữ xuống dòng.
Nút thêm giỏ giữ locator và đã nối UC-07; nhập số lượng và gửi POST /api/cart/items
khi còn hàng. Hết hàng thì disabled. Xem `uc05-uc07-cart.md` để kiểm tra luồng giỏ.

## Chạy và kiểm tra thủ công

```powershell
cd D:\Downloads\KTPM_Nhom9\KTPM_Nhom09
npm start
```

Nếu server cũ đang chạy, Ctrl+C tại đúng terminal rồi khởi động lại để nạp API mới.

1. Mở http://localhost:3000/search.html, tìm iphone, click card bất kỳ.
   Kiểm tra URL có id và tên/ảnh/giá/danh mục/mô tả/SKU/tồn kho tương ứng card.
2. Với dữ liệu đã quan sát: product-detail.html?id=1 là iPhone 16 128GB còn 30;
   product-detail.html?id=3 là iPhone 15 128GB, Tạm hết hàng, tồn kho 0.
3. id=8, id=12, id=17 là sản phẩm inactive: trang báo không tồn tại/ngừng kinh doanh;
   API tương ứng trả 404, không trả tên/ảnh/mô tả của sản phẩm.
4. id=2147483647 không tồn tại: 404. id=abc, id=0, thiếu id hoặc id lặp: trang báo ID sai.
5. Dừng SQL trong môi trường thử nếu muốn kiểm tra mất kết nối: trang báo lỗi tải;
   không hiển thị panel. Có thể kiểm thử lỗi này bằng mock trong npm test, không cần dừng SQL.
6. Link Tìm kiếm sản phẩm đưa về UC-02. Kiểm tra register.html/UC-01 như trước.

ID là khóa database thực tế, có thể khác trên máy khác: nên đi từ tìm kiếm thay vì
cố định ID theo số thứ tự SKU. Không cần chạy lại seed để kiểm thử.

## Locator

| data-testid | Ý nghĩa |
|---|---|
| product-detail-<SKU> | Link từ từng card tìm kiếm |
| product-detail | Panel chi tiết, hidden khi lỗi/đang tải, data-product-id khi thành công |
| product-name / product-price / product-description | Thông tin chính |
| product-category / product-sku / product-stock | Danh mục, SKU, tồn kho |
| product-availability | Còn hàng/hết hàng; data-state=in-stock hoặc out-of-stock |
| product-images | Gallery ảnh |
| product-image | Ảnh đầu; ảnh tiếp theo product-image-<ImageId> |
| page-feedback | Loading/lỗi/thành công; data-state=loading/success/invalid/not-found/error |
| detail-back-to-search | Link về tìm kiếm |
| detail-add-to-cart | Nút thêm giỏ UC-07; disabled khi hết hàng/đang gửi |

## Xác minh

`npm test`: test backend/frontend UC-03, test hồi quy UC-01/UC-02. `npm run check`: cú pháp.
Kiểm tra HTTP với SQL thật bằng mã mới: /api/products/1 và /3 trả 200 cùng ảnh;
/8, /12, /17, /2147483647 trả 404; /invalid trả 400. /api/products?q=iphone trả 200,
total=3. /api/health và /api/health/db trả 200; /register.html và trang chi tiết trả 200.
Không thực hiện ghi dữ liệu SQL. UI kiểm tra bằng DOM mô phỏng, chưa kiểm tra bằng
trình duyệt thật hoặc Selenium; test mất kết nối và danh mục inactive dùng mô phỏng/truy vấn guard.
