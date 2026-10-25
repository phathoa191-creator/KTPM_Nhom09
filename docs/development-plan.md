# Kiến trúc và kế hoạch

## Kiến trúc đơn giản

Trình duyệt (HTML/CSS/JS) → fetch JSON cùng origin `/api` → Express routes → services (quy tắc nghiệp vụ, transaction) → repositories (`mssql`, truy vấn tham số) → SQL Server Express.

Giai đoạn hiện tại: `frontend/` chứa trang và assets; `backend/src/server.js` chỉ static/health; `database/` chứa SQL dự kiến; `docs/` chứa thiết kế; `tests/selenium/` giữ hướng dẫn. Khi triển khai thêm `backend/src/routes/`, `services/`, `repositories/`, `middleware/`, `config/` theo nhu cầu từng UC; không tạo tầng trừu tượng không cần thiết.

## Các giai đoạn và điểm dừng

| Giai đoạn | Phạm vi | Điều kiện bàn giao |
|---|---|---|
| 0 — hiện tại | Khung 10 UC, SQL dự kiến, tài liệu | Người dùng duyệt giao diện, quy tắc và schema; không tác động DB |
| 1 — nền tảng | Xác minh TCP/port/auth, cài Express/mssql, cấu hình môi trường, thiết lập schema và seed sau xác nhận riêng | Kết nối đúng database được duyệt, ghi nhận migration và seed |
| 2 — UC-01 | Đăng ký thật | API lưu hash, unique email, test UC-01 đạt; dừng chờ kiểm tra |
| 3 — UC-04 | Đăng nhập thật | Session cookie HttpOnly, đăng xuất, giới hạn thử sai; test UC-04 đạt |
| 4 — UC-02 | Tìm kiếm từ DB | Phân trang, kết quả rỗng, dữ liệu hợp lệ; test UC-02 đạt |
| 5 — UC-03 | Chi tiết từ DB | 404/ảnh dự phòng/sản phẩm ngừng bán; test UC-03 đạt |
| 6 — UC-07 | Thêm hàng thật | Kiểm tra đăng nhập, số lượng, stock, gộp dòng; test UC-07 đạt |
| 7 — UC-05 | Xem giỏ thật | Chỉ đọc, tổng giá từ server, quyền sở hữu; test UC-05 đạt |
| 8 — UC-09 | Sửa/xóa giỏ | Xác nhận xóa, không tác động giỏ khác; test UC-09 đạt |
| 9 — UC-08 | Hồ sơ và mật khẩu | Kiểm tra mật khẩu hiện tại, không đổi role; test UC-08 đạt |
| 10 — UC-06 | Đặt hàng thật | Transaction, snapshot, chống gửi lặp, rollback; test UC-06 đạt |
| 11 — UC-10 | Quản trị sản phẩm | ADMIN tại server, thêm/sửa/ngừng bán, giữ lịch sử; test UC-10 đạt |
| 12 | Selenium hồi quy | Java + JUnit 5, dữ liệu tách biệt, báo cáo và ảnh lỗi |

Mỗi hàng triển khai UC là một lần bàn giao độc lập; không tự triển khai hàng tiếp theo khi người dùng chưa kiểm tra. Đăng nhập đi trước các UC có quyền sở hữu dù mã số UC khác thứ tự triển khai.

## Hợp đồng backend dự kiến

Response thành công `{ data: ... }`, thất bại `{ error: { code, message, fields? } }`. HTTP 400 thiếu/sai dữ liệu; 401 chưa đăng nhập; 403 thiếu quyền; 404 không tồn tại; 409 trùng hoặc xung đột stock/version; 500 lỗi nội bộ không lộ SQL/credentials. Các response này chưa được triển khai; hiện tại API nghiệp vụ trả 501.

Đăng ký/đăng nhập/checkout chỉ báo thành công khi DB xác nhận; không dùng localStorage làm nguồn tài khoản hoặc đơn hàng. Session phía server, cookie HttpOnly/SameSite, CSRF cho API thay đổi trạng thái; hash mật khẩu bằng thư viện chuyên dụng. Server tự lấy userId/role từ session và tự tính giá, không tin giá/role gửi từ client. Dùng truy vấn tham số `mssql`, pool dùng chung, không ghép chuỗi SQL. `.env` không commit; backend kiểm tra biến môi trường, không mặc định sang database khác.

Môi trường gần nhất: Node 24.11.1, npm 11.6.2, SQL Express 2025 17.0.1000.7, SQLEXPRESS đang chạy, TCP tắt. Chưa có JDK/Maven trong PATH. Kiểm tra lại trước triển khai, không đổi cấu hình SQL tự động.
