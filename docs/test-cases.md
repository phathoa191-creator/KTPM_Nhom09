# Trường hợp kiểm thử dự kiến

Các case là tiêu chí nghiệm thu tương lai, chưa phải kết quả test đã chạy. S=thành công, F=thất bại nghiệp vụ, M=thiếu dữ liệu, I=không hợp lệ, B=biên. Mỗi biến thể phân cách dấu chấm phẩy là một lần chạy riêng khi viết Selenium. Test API bổ sung cho các payload không thể gửi từ UI.

## Quy tắc chung dự kiến

Tên trim 1–100 ký tự; email trim/lowercase tối đa 254 ký tự; password 8–72 byte UTF-8, có chữ và số, không tự trim; xác nhận phải khớp. Số điện thoại nếu nhập: 10 số bắt đầu 0. Địa chỉ trim 1–500 ký tự. Product name 1–200; SKU 1–50; slug 1–200, ASCII thường/số/gạch ngang. Giá 0–9.999.999.999,99 và tối đa 2 chữ số thập phân; stock integer 0–1.000.000; quantity integer 1–99 và không vượt stock. Search keyword tối đa 100 ký tự, bỏ trống trả danh sách đang kinh doanh, page>=1, limit 1–50. Tất cả quy tắc phải kiểm tra server, không chỉ thuộc tính HTML.

| ID | Tiền điều kiện / đầu vào / thao tác | Kết quả mong đợi khi triển khai |
|---|---|---|
| TC-01-S | Email mới, tên và mật khẩu hợp lệ, confirm khớp | 201; một Users CUSTOMER, hash khác plaintext; UI báo thành công |
| TC-01-F | Email đã tồn tại hoặc khác hoa/thường | 409; không thêm user |
| TC-01-M | Bỏ trống lần lượt name/email/password/confirm | 400; lỗi đúng field, không insert |
| TC-01-I | Email sai; confirm lệch; chỉ khoảng trắng; mật khẩu không đạt | 400; không insert; thông báo không chứa SQL |
| TC-01-B | Password 7/8/72/73 byte; tên 100/101; email 254/255 | Chấp nhận đúng giới hạn và đúng định dạng; vượt giới hạn bị từ chối |
| TC-02-S | Tìm tên sản phẩm đang bán, có dấu tiếng Việt | 200; đúng danh sách/giá/link chi tiết, không hiện hàng ngừng bán |
| TC-02-F | Từ khóa không khớp; DB không khả dụng | Rỗng có thông báo; lỗi DB hiển thị lỗi riêng, không giả kết quả rỗng |
| TC-02-M | q bỏ trống hoặc chỉ khoảng trắng | 200 danh sách phân trang đang bán |
| TC-02-I | page=0/-1/abc, limit=51; payload SQL injection/XSS | Tham số sai trả 400; chuỗi tìm kiếm không thực thi SQL/HTML |
| TC-02-B | q dài 100/101; trang cuối và vượt trang cuối | 100 hợp lệ, 101 trả 400; trang vượt trả rỗng, không lặp kết quả |
| TC-03-S | ID của sản phẩm active | 200; tên/giá/ảnh/tồn đúng DB |
| TC-03-F | ID không tồn tại; sản phẩm ngừng bán | 404 hoặc thông báo không khả dụng; không cho thêm giỏ |
| TC-03-M | Thiếu ID; sản phẩm thiếu ảnh | URL thiếu định danh được xử lý rõ; thiếu ảnh có placeholder, không crash |
| TC-03-I | ID abc, số âm, quá INT | 400; không lỗi SQL |
| TC-03-B | Stock=0/1; giá=0; mô tả dài | Hết hàng vô hiệu thêm; còn 1 thêm được 1; giá 0 hợp lệ; bố cục không vỡ |
| TC-04-S | User active, email/password đúng | Session thật; /me đúng user; không lộ hash |
| TC-04-F | Sai mật khẩu; user không tồn tại; bị khóa | Từ chối, thông báo chung; không tạo phiên; giới hạn thử sai |
| TC-04-M | Thiếu email hoặc password | 400; không tạo phiên |
| TC-04-I | Email sai; SQL injection; role ADMIN giả trong payload | Không bypass đăng nhập hoặc tăng quyền |
| TC-04-B | Email có khoảng trắng/hoa; password chứa khoảng trắng; session hết hạn | Chuẩn hóa email; password giữ nguyên; phiên hết hạn yêu cầu đăng nhập |
| TC-05-S | Đăng nhập, cart có 2 sản phẩm | Chỉ đọc; số dòng, quantity, tổng khớp DB; GET không làm thay đổi dữ liệu |
| TC-05-F | Chưa đăng nhập; DB lỗi | 401/login; lỗi riêng khi DB lỗi, không hiển thị giỏ giả |
| TC-05-M | Chưa có cart hoặc cart rỗng | Hiện rỗng/tổng 0, không checkout; không tạo cart bằng GET |
| TC-05-I | Gửi userId/cartId của người khác | Không đọc được giỏ khác; server dùng session |
| TC-05-B | Quantity 99; giá hoặc trạng thái sản phẩm thay đổi | Tổng từ server; cảnh báo hàng không khả dụng, không âm/NaN |
| TC-06-S | Cart hợp lệ, stock đủ, địa chỉ hợp lệ, COD | 201; order/items đúng snapshot và total; trừ stock, xóa items trong một transaction |
| TC-06-F | Hết stock; sản phẩm ngừng bán; lỗi sau khi insert order | 409 hoặc lỗi có kiểm soát; rollback, không order mồ côi hoặc trừ tồn một phần |
| TC-06-M | Cart rỗng; thiếu recipient/phone/address/RequestKey | Từ chối, không tạo order |
| TC-06-I | Phone sai, địa chỉ trắng, sửa giá/userId ở request | Validation thất bại hoặc bỏ qua field không được phép; tổng/owner do server xác định |
| TC-06-B | Hai user mua sản phẩm cuối; nhấp hai lần cùng RequestKey; address 500/501 | Chỉ một người mua được hàng cuối; cùng key chỉ một đơn và một lần trừ stock; kiểm tra giới hạn |
| TC-07-S | Đăng nhập, thêm sản phẩm mới; thêm lại sản phẩm đã có | Tạo cart nếu cần, tạo một dòng hoặc cộng quantity, không trùng dòng |
| TC-07-F | Product không tồn tại/ngừng bán/hết hàng; chưa login | 404/409/401 tương ứng, không đổi cart |
| TC-07-M | Thiếu productId hoặc quantity | 400; không thêm |
| TC-07-I | quantity 0/-1/1.5/abc; productId sai | 400; không ghi |
| TC-07-B | Thêm 1/99/100; quantity cộng dồn chạm/vượt stock hoặc 99 | Cho phép đúng giới hạn; từ chối tổng vượt, không cập nhật một phần |
| TC-08-S | User đổi name/phone; đổi mật khẩu đúng hiện tại | Persist DB; tải lại còn dữ liệu; password mới login được, cũ thất bại |
| TC-08-F | Mật khẩu hiện tại sai; session hết hạn | Từ chối đổi; DB giữ nguyên |
| TC-08-M | Thiếu name; thiếu field bắt buộc khi đổi password | 400; không cập nhật một phần |
| TC-08-I | Phone sai; new/confirm lệch; gửi role hoặc userId khác | Không đổi quyền/owner; lỗi field hợp lệ; không thực thi XSS |
| TC-08-B | Name 1/100/101; phone null; password theo ngưỡng chung | Name đúng giới hạn; phone được xóa thành NULL; password đúng quy tắc byte |
| TC-09-S | Đặt quantity mới; xác nhận xóa dòng; xác nhận xóa toàn bộ | Quantity thay thế tuyệt đối; xóa đúng phạm vi; tổng cập nhật từ DB |
| TC-09-F | Item người khác; item đã bị xóa; hủy hộp xác nhận | Không sửa giỏ khác; 404 item mất; hủy không gọi API ghi |
| TC-09-M | PATCH thiếu quantity; DELETE cart rỗng | PATCH 400; xóa cart rỗng thành công idempotent |
| TC-09-I | quantity âm/0/lẻ; itemId sai | Từ chối, không diễn giải 0 thành xóa ngầm |
| TC-09-B | quantity 1/99/100 và bằng/vượt stock | Hợp lệ ở giới hạn phù hợp; vượt trả 409 hoặc 400 theo nguyên nhân |
| TC-10-S | ADMIN thêm, sửa rồi ngừng kinh doanh sản phẩm | DB cập nhật; ảnh đúng product; hàng ngừng bán mất khỏi search và không checkout được |
| TC-10-F | CUSTOMER/chưa login gọi API; SKU/slug trùng; version cũ | 403/401/409; không đổi dữ liệu |
| TC-10-M | Thiếu name/SKU/slug/category/price/stock | 400; không insert/update một phần; ảnh không bắt buộc |
| TC-10-I | Category không tồn tại/inactive; giá âm; stock lẻ; ảnh javascript: | Từ chối; URL ảnh chỉ http(s); parameterized SQL; text render an toàn |
| TC-10-B | Giá 0/max/max+0.01; stock 0/max/max+1; tên 200/201; sản phẩm có order | Kiểm tra giới hạn; ngừng bán giữ FK/snapshot order; không hard delete |

Trước mỗi lần chạy ghi dữ liệu phải dùng database test đã được duyệt. Dùng hai customer để kiểm tra quyền sở hữu; ADMIN riêng cho UC-10. Selenium kiểm tra UI và response hiển thị; kiểm tra hash, transaction, race condition, FK và giá trị DB cần test API/tích hợp bổ sung, không tuyên bố Selenium một mình chứng minh được tất cả.
