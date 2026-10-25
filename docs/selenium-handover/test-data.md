# Dữ liệu test, cô lập và bảo mật

## Tài khoản

| Alias | Role | Cách chuẩn bị |
|---|---|---|
| CUSTOMER_M1 … CUSTOMER_M5 | CUSTOMER active | Mỗi thành viên đăng ký user giả riêng; không dùng chung giỏ |
| CUSTOMER_B_<runId> | CUSTOMER active | User thứ hai kiểm tra cách ly owner; browser profile riêng |
| ADMIN_TEST | ADMIN active | Người phụ trách cung cấp qua kênh riêng; không tạo/nâng role qua Selenium |
| NEW_USER_<runId> | CUSTOMER sau UC-01 | Email mới cho mỗi case thành công; giữ manifest để tránh đăng ký lại ngoài chủ đích |

Theo xác nhận trước bàn giao đã có ADMIN; không coi một ID/email cố định là fixture
bắt buộc của môi trường khác. Kiểm tra /api/auth/me sau login. Không ghi password thật,
session cookie, SQL credential hoặc nội dung .env ở đây, log, Git, screenshot/HAR.
Credential browser test nhận qua cơ chế secret của nhóm hoặc biến môi trường test
riêng do nhóm định nghĩa; suite mới không cần đọc .env ứng dụng.

Email duy nhất: selenium-m<1..5>-<runId>-<caseId>-<uuid>@example.test.
runId là timestamp UTC không chứa dấu cộng; kết hợp UUID tránh va chạm chạy song song.
Với case trùng email: tạo fixture riêng rồi cố đăng ký lại cùng email (có thể đổi hoa/thường);
không phụ thuộc thứ tự chạy case khác. Đăng ký thành công ghi SQL thật và không tự login.

## Sản phẩm và SKU

Các giá trị sau lấy từ **file seed**, không phải baseline DB hiện tại sau 10 UC thủ công:

| SKU | Tên/điều kiện seed | Dùng tham khảo |
|---|---|---|
| DEMO-UC02-001 | iPhone 16 128GB, giá seed 19490000.00, stock seed 30 | Tìm kiếm/chi tiết, đối chiếu giá nếu hiện tại vẫn giống |
| DEMO-UC02-003 | iPhone 15 128GB, stock seed 0, active | Hết hàng, phải kiểm tra lại trước test |
| DEMO-UC02-008 | OPPO Reno13, inactive trong seed | Ngừng bán, không có trong API tìm kiếm công khai |
| DEMO-UC02-012 | Lenovo IdeaPad Slim 3, stock seed 0 | Fixture đọc tham khảo |

Không suy ra productId từ hậu tố SKU. UC-02 lấy product-detail-<SKU>.href hoặc
GET /api/products để tìm ID active. Inactive cần Admin list hoặc baseline được cung cấp.
Không dùng card sản phẩm tĩnh index.html làm nguồn ID/giá hiện tại.

SKU ghi độc lập: SEL-M<member>-<runId>-<shortUuid>, tổng <=50 ký tự.
Slug tương tự dạng chữ ASCII/số/-/_, <=200. Sản phẩm customer ghi kho phải được thành viên
Admin chuẩn bị riêng theo manifest sau khi nhóm cho phép ghi; không sửa hàng demo dùng chung.
Một sản phẩm riêng cho mỗi case checkout hoặc từng worker; categoryId lấy từ admin categories
và xác nhận isActive=true. Case stock cuối/inactive có fixture riêng, không dùng chung với tìm kiếm.

## Giá trị hợp lệ/không hợp lệ

| Trường | Hợp lệ/biên | Không hợp lệ |
|---|---|---|
| Đăng ký fullname/addr | Tên tiếng Việt 1–100; địa chỉ 1–500 sau trim | Trắng, tên 101, địa chỉ 501 |
| Password đăng ký | 8–1024 đơn vị chuỗi, confirm giống hệt; mật khẩu giả cấp riêng | Ngắn hơn 8, confirm lệch; không log giá trị |
| Email | Email @example.test duy nhất <=254, được trim/lowercase | Sai định dạng, trùng email fixture |
| Quantity | JSON number nguyên 1/99, không vượt kho | 0, -1, 1.5, 100; chuỗi "2" chỉ test API vì UI chuyển Number |
| Checkout phone | Chuỗi 10 số bắt đầu 0, ví dụ dữ liệu giả 0901234567 | 9/11 số, chữ, đầu khác 0, kiểu number |
| Checkout recipient/address | 1–100/1–500 sau trim, không control character | Trắng, quá dài, thiếu requestKey UUID |
| Account phone | Đúng 10 số đầu 0; null hoặc "" xóa | Khoảng trắng, đầu khác 0, kiểu number |
| Account address | null/""/trắng → NULL; input <=500 trước trim | 501, kiểu số |
| Admin price | Chuỗi "0", "0.10", "999999999.99" | Number thay chuỗi, âm, 3 số lẻ, "1000000000.00" |
| Admin stock | Number nguyên 0/1000000 | Âm, số lẻ, 1000001 |
| Admin name | Chuỗi trim 1–200 đơn vị UTF-16 | Trắng, 201 |
| Admin sku/slug | ASCII chữ/số/-/_, <=50/200 | Trắng, ký tự ngoài quy tắc, trùng UNIQUE |
| Admin imageUrl | HTTP(S) <=2048, không user/password | javascript:, credentials, quá dài |
| Admin version | Token hex 16 ký tự từ GET mới | Token cũ hoặc thiếu; không tự tạo token khi sửa |

maxlength/min/max của HTML có thể chặn đầu vào trước request. Những case vượt rào UI,
field bảo vệ hoặc sai kiểu JSON cần kiểm tra API riêng trong browser cùng session;
không kết luận backend đã được kiểm tra nếu request chưa gửi.

## Manifest mỗi lượt chạy

Ghi member/runId/caseId, email alias, user ID không nhạy cảm nếu cần, productId/SKU/slug,
categoryId, baseline price/stock/isActive/image, quantity trước/sau, requestKey và orderCode
phục vụ đối chiếu, timestamp, outcome. Không ghi password/token/cookie/PasswordHash.
Lưu manifest trong thư mục artifacts riêng được bỏ qua bởi Git; nhóm thống nhất vòng đời.

Checkout thực sự trừ kho; thêm/sửa giỏ không giữ chỗ hoặc trừ kho. Tổng giỏ dùng giá SQL
hiện tại, không mặc định 58.470.000 đ trừ khi baseline chứng minh đơn giá 19.490.000 x 3.
Không thay fixture đang được thành viên khác dùng. Xem database-reset.md trước khi dọn.
