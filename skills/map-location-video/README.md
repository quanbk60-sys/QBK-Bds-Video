# map-location-video

Skill tạo video dọc 9:16 giới thiệu vị trí và kết nối của dự án bất động sản trên nền ảnh vệ tinh Esri nghiêng 3D, có tuyến đường (OSRM), label kim loại, xuất WebM ngay trong trình duyệt tích hợp của app Claude.

## Cài sang máy khác

**Claude (claude.ai / app desktop)**
1. Mở Settings, mục Capabilities (hoặc Skills), chọn tải lên skill.
2. Chọn file `map-location-video.zip` này (thư mục `map-location-video/` nằm ở gốc file zip).
3. Bật skill. Gọi trong chat, ví dụ: "dùng skill map-location-video làm video vị trí cho dự án X".

**Claude Code**
1. Giải nén vào `~/.claude/skills/` để có `~/.claude/skills/map-location-video/SKILL.md`.
2. Khởi động lại phiên (hoặc gõ /reload-skills nếu có).

## Điều kiện để chạy
- App Claude desktop đang mở trên máy có mạng (dùng trình duyệt tích hợp của app).
- Cho phép trình duyệt truy cập server.arcgisonline.com khi được hỏi.
- Cần tọa độ thật của dự án (lat, lon) và danh sách địa điểm lân cận.

## Cấu trúc
- `SKILL.md` : hướng dẫn quy trình và quy tắc thiết kế.
- `scripts/part-a-data.js` : điền thông tin dự án và lấy tuyến OSRM.
- `scripts/part-b-render.js` : dựng, kiểm tra tự động, ghi video.
- `scripts/rerecord.js` : ghi lại video khi lần đầu bị trễ khung.

## Lưu ý
- Ảnh vệ tinh Esri/Maxar và dữ liệu OpenStreetMap cần ghi nguồn (video đã có dòng ghi nguồn nhỏ ở chân).
- Kho icon/label riêng của bạn chưa được tích hợp; khi có kho, thay các hàm glyph(), pinBody(), drawLabel() trong part-b-render.js.
