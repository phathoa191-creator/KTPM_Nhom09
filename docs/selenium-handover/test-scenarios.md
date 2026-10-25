# Kịch bản đề xuất cho 5 thành viên

## Phân công và cách phối hợp

| Thành viên | Phạm vi chính | Hướng dẫn ngắn |
|---|---|---|
| 1 | UC-01, UC-04 | User/email riêng; sửa assertion suite đăng ký cũ theo redirect; kiểm tra login/me/returnTo/logout |
| 2 | UC-02, UC-03 | Chạy đọc dữ liệu đã chốt; lấy productId từ link/API thật, scope selector trong card |
| 3 | UC-05, UC-07 | Customer riêng, giỏ độc lập; POST cộng quantity, GET không tạo giỏ; đối chiếu một dòng/SKU |
| 4 | UC-06, UC-09 | Product và customer riêng; không dùng chung hàng checkout; lưu orderCode/requestKey, DELETE từng dòng |
| 5 | UC-08, UC-10 | Customer hồ sơ riêng và ADMIN được cấp; chuẩn bị sản phẩm fixture theo yêu cầu 3/4, không đổi hàng demo chung |

Mỗi worker có browser profile/session riêng. Không chia cookie hoặc chạy checkout/admin
trên cùng sản phẩm đồng thời trừ case concurrency được điều phối. Thành viên 5 tạo fixture
ghi trước; các thành viên khác bắt đầu sau khi manifest sẵn sàng. Chạy các case ảnh hưởng
stock/trạng thái theo đợt riêng với case đọc. Suite từng case tự chuẩn bị tiền điều kiện,
không phụ thuộc kết quả case liền trước. Không tự chạy reset/seed đầu mỗi suite.

## Kịch bản theo UC

| Case | Chuẩn bị và thao tác | Expected UI và API |
|---|---|---|
| 01-S | Email UUID mới, điền đủ, submit | POST register 201; thông báo rồi URL /login.html; submit bị khóa lúc chờ redirect; /me không tự authenticated nếu bắt đầu chưa login |
| 01-F | Trống, email sai, confirm lệch; email fixture trùng | 400 lỗi theo trường hoặc 409 EMAIL_EXISTS; giữ register, không redirect, không mất input ngoài chủ đích |
| 04-S | Login CUSTOMER, rồi ADMIN ở session riêng | 200 login, 200 /me đúng user; URL /index.html; auth-account có tên, auth-logout; ADMIN vẫn vào được admin |
| 04-F | Sai mật khẩu; request mạng lỗi; thiếu session xác nhận | Không chuyển trang; thông báo chung; không lộ secret. Hạn chế số lần vì rate limit 20 attempts/15 phút theo IP |
| 04-R | /login.html?returnTo=%2Fcheckout.html và URL ngoài/login/register | Thành công quay checkout với đường dẫn cho phép; URL không hợp lệ về index; CUSTOMER không return admin |
| 02-S | Search một phần tên, hoa/thường, page tiếp/trước | Card SQL thật, tổng và phân trang theo response 200; inactive product/category không hiện |
| 02-F | Chuỗi không khớp, từ khóa đặc biệt %, _, [ | Empty rõ ràng; ký tự LIKE được coi literal; không báo lỗi hệ thống chỉ vì không có kết quả |
| 03-S | Click link từ card, xem còn hàng/hết hàng | ID query đúng; tên/giá/kho/ảnh khớp GET; hết kho xem được nhưng nút thêm disabled |
| 03-F | Thiếu/sai ID; ID inactive được fixture cung cấp | UI lỗi phù hợp; 400/404; không dữ liệu chi tiết cũ |
| 05-S | Customer mới chưa có cart; customer có nhiều dòng | Empty hoặc tổng tiền SQL chính xác; GET không tạo dữ liệu; cảnh báo availability khi stock giảm |
| 05-A | Logout hoặc chuyển customer khác | Xóa panel/dòng cũ; GET 401 khi chưa login; user khác có giỏ độc lập |
| 07-S | Hàng stock đủ, thêm 1 rồi thêm 2 | POST 200 hai lần; một row SKU quantity=3; tổng từ GET; stock không đổi |
| 07-F | Quantity vượt kho, 0/100, inactive | 400/404/409 đúng nguyên nhân; giỏ không tăng; frontend có thể chặn trước request |
| 06-S | Cart riêng hợp lệ, người nhận/phone/address/COD | POST 201, checkout-success mã đơn/tổng; GET cart rỗng; đối chiếu stock và snapshot riêng nếu được cấp quyền đọc |
| 06-I | Gửi lại cùng requestKey của lần đã thành công trong cùng user | 200 replayed=true, cùng order ID/code, không trừ kho thêm dù cart rỗng |
| 06-F | Cart rỗng, phone sai, thiếu địa chỉ, stock thiếu | 400/409, giữ giỏ nếu thất bại; không tuyên bố rollback SQL chỉ từ screenshot |
| 06-N | Mất phản hồi rồi thử lại trong cùng tab | Giữ nguyên key/body trong pending; không tự sinh key mới khi kết quả chưa rõ |
| 08-S | Sửa tên tiếng Việt, phone, address; reload | PATCH 200, email readonly; header cập nhật qua auth/me; reload còn dữ liệu |
| 08-F | Tên trắng, phone sai; API gửi role/email/userId | 400, không cập nhật một phần; null/empty phone/address xóa; password form ẩn, không test đổi password |
| 09-S | Quantity 3 → 2 rồi update; xóa và hủy/xác nhận | PATCH thay tuyệt đối, tổng GET mới; Hủy không DELETE; xác nhận 200, dòng cuối mất → empty |
| 09-F | Vượt stock, item đã mất, logout lúc response chậm | 409/404; giỏ user khác không đổi; không render response cũ; lỗi mơ hồ không tự retry |
| 10-S | ADMIN thêm SKU riêng, sửa giá/stock/ảnh, deactivate/reactivate | 201/200; list/detail thật, filter/page đúng; chỉ ảnh SortOrder=0 thay đổi; không DELETE product |
| 10-F | CUSTOMER/chưa login; trùng SKU/slug; biên price/stock | 403/401/409/400; không ghi một phần; lỗi tiếng Việt |
| 10-V | Hai tab mở cùng version; tab A lưu, tab B lưu | B nhận 409 PRODUCT_CHANGED; reload trước khi sửa tiếp. Checkout đổi stock cũng làm version cũ |

## Expected Result đáng tin cậy

UI: wait URL/visibility/nội dung cụ thể, kiểm tra tên/SKU/quantity/tổng/status. API đọc:
GET /api/cart, /api/account, /api/products/:id, /api/auth/me trong cùng origin/session,
hoặc admin detail bằng ADMIN. Không xuất cookie ra Node hoặc log; không cần đọc .env.
GET /me chưa login là 200 false/null, khác 401 của API được bảo vệ.

Selenium WebDriver cơ bản không tự trả network status sau click. Nhóm có thể dùng
network instrumentation được thống nhất, hoặc một API assertion riêng qua fetch trong
browser. Không gửi lại POST/DELETE chỉ để lấy status của thao tác UI đã thực hiện.
API-only assertion không thay thế bằng chứng click/form UI. Không lưu request password.

Với checkout, UI/API replay chứng minh kết quả trả về; tính nguyên tử/rollback/FK/stock
concurrency cần test backend hoặc kiểm tra DB chỉ đọc được phép. Không gọi một ảnh chụp
màn hình là bằng chứng transaction SQL đã rollback. Không có API order history để đọc
mọi đơn, không tự tạo API hoặc cấp quyền SQL cho Selenium.

## Chờ, retry và báo lỗi

Đăng ký thành công: explicit wait URL /login.html; thông báo tồn tại ngắn nên không ép
assert submit enabled sau 201. Validation thất bại thì submit enabled, không URL đổi.
Sau login, explicit wait /index.html hoặc returnTo rồi header auth-account; /me đúng role.
Sau mutation giỏ, wait dữ liệu GET mới; không sleep rồi đọc node cũ.
Alert xác nhận xóa/status: dismiss không mutation, accept mới mutation.

Không retry toàn case ghi vô điều kiện: tạo user/product/order có thể đã commit.
Lỗi môi trường báo BLOCKED/ERROR theo quy ước nhóm, không đổi thành PASS hoặc bỏ assertion.
Mỗi báo cáo nêu runId, fixture, browser/version, URL, Expected/Actual, status/code đã lọc,
bằng chứng UI và trạng thái cleanup. Thông tin rate limit hoặc stock bị worker khác đổi
phải tách khỏi lỗi logic ứng dụng.
