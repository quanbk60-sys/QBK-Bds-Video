---
name: map-infrastructure-video
description: Video dọc 9:16 "Hạ tầng giao thông quanh dự án": chỉ cần vị trí dự án, agent tự nhận ra đại lộ, vành đai, metro, cầu, sân bay, TTTM xung quanh, chia cảnh theo chủ đề trên nền vệ tinh Esri. Học từ video mẫu 1; mở rộng skill map-location-video.
---

# Bản đồ hạ tầng tự động (học từ video mẫu 1)

Video mẫu (106s, có lời thoại) hướng dẫn: "gọi skill bản đồ hạ tầng → đưa vị trí dự án → bấm chạy → đợi AI dựng video" (~20 phút).
Kết quả là video khoảng 27s dựng trên nền vệ tinh, AI **tự nhận ra** các hạ tầng quanh dự án.

## Khác gì với map-location-video
| | map-location-video | map-infrastructure-video |
|---|---|---|
| Đầu vào | Tọa độ + danh sách tiện ích người dùng đưa | **Chỉ tọa độ** (danh sách tiện ích là tùy chọn) |
| Cảnh | 1 tiện ích / cảnh | 1 **chủ đề** / cảnh, nhiều đối tượng mỗi cảnh |
| Đường | Tuyến OSRM từ dự án tới điểm | Tuyến OSRM + **vẽ chính tuyến hạ tầng** (metro, vành đai) theo màu loại |
| Kết | Toàn cảnh | Zoom xa + **vòng bán kính 5/10/20 km** + **bảng chú thích màu** |

## Cấu trúc cảnh (theo video mẫu)
1. **Mở đầu** 3s: "HẠ TẦNG GIAO THÔNG / QUANH <TÊN DỰ ÁN>" (vàng + xanh), dòng phụ "vành đai · metro · cầu · sân bay". Ghim đỏ ở giữa.
2. **Ngay cửa nhà**: đường lớn sát dự án (vẽ vàng, tên đường vàng viết dọc), địa danh gần (sân vận động, trung tâm hội nghị) với dòng nhỏ "cách <dự án> · 0,5 km".
3. **Vành đai / trục chính** (ví dụ "Vành đai 3 · Phạm Hùng"): tuyến cam, bến xe gần.
4. **Metro đang chạy** (app đặt là "Metro & nhà ga"): từng tuyến metro một màu (tím, xanh), ga có icon tròn, nhãn ga + "cách … km".
5. **Trung tâm thương mại**: tuyến xanh lá từ dự án tới TTTM.
6. **Cầu & sân bay**: zoom xa, vòng bán kính 5/10/20 km có nhãn km, tuyến trắng tới sân bay, cầu lớn.
7. **Toàn cảnh + chú thích**: tất cả tuyến cùng lúc, hộp chú thích màu góc trên ("— Đại lộ Thăng Long", "— Metro 3 (Nhổn – Cầu Giấy)", "— Đường ra SB Nội Bài"…).

Mỗi cảnh: tiêu đề vàng viền đen ở trên, label dự án là thẻ trắng (logo + tên), ghim địa điểm đỏ/xanh tùy loại.

## Tự nhận ra hạ tầng (agent Bản đồ) — đã cài trong app/map-engine.js
- Dùng **Photon có bbox** quanh dự án (bán kính theo chủ đề: 3,5 km ngay cửa nhà, 7 km ga, 9 km TTTM, 12 km bến xe, 45 km cầu & sân bay).
  Không có bbox thì Photon trả kết quả khắp thế giới với từ khóa chung ("ga" ra Gare de Lyon).
- Truy vấn theo loại: `leisure:stadium`, `amenity:hospital`, `amenity:university`, `leisure:park`, `amenity:marketplace` (ngay cửa nhà, mỗi loại 1 điểm theo thứ tự ưu tiên);
  `railway:station|stop|halt` (ga); `shop:mall` + lọc tên (TTTM, loại "Lotteria"); `amenity:bus_station` (bến xe);
  `aeroway:aerodrome` ưu tiên "Quốc tế" + 1 cây cầu lớn (loại cầu vượt, cầu đi bộ).
- Tiện ích người dùng nhập: ưu tiên tên khớp đúng, loại biển chỉ hướng ("Hướng đi cầu …"), không thấy trong 60 km thì bỏ.
- Cảnh ga đặt tên **"Metro & nhà ga"** (dữ liệu OSM không cho biết tuyến đã chạy hay chưa, không khẳng định "đang chạy").
- Tuyến từ dự án tới điểm: OSRM. Mọi lệnh gọi thử lại 3 lần có giãn cách (máy chủ công cộng hay giới hạn tốc độ).
- Overpass (overpass-api.de) là nguồn bổ sung tùy chọn khi gọi được; hiện không bắt buộc.
- Không tìm thấy chủ đề nào thì bỏ cảnh đó; không bịa.

## Giữ nguyên từ map-location-video
Camera nghiêng ~40°, dự án luôn ở giữa, vùng an toàn 36px / 84px, fitFont, kiểm tra RECTS tự động, dòng ghi nguồn Esri/Maxar/OSM, ghi WebM bằng MediaRecorder, không sao chép thương hiệu/watermark của video mẫu (logo kênh, overlay "AI TỰ NHẬN RA", nút "BÌNH LUẬN: SKILL" là của người làm video mẫu, không đưa vào sản phẩm).

## Mạng cần mở
server.arcgisonline.com, router.project-osrm.org, photon.komoot.io (cả ba có CORS `*`, gọi thẳng từ trình duyệt được, kể cả mở file:// ). overpass-api.de tùy chọn.
