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
4. **Metro đang chạy**: từng tuyến metro một màu (tím, xanh), ga có icon tròn, nhãn ga + "cách … km".
5. **Trung tâm thương mại**: tuyến xanh lá từ dự án tới TTTM.
6. **Cầu & sân bay**: zoom xa, vòng bán kính 5/10/20 km có nhãn km, tuyến trắng tới sân bay, cầu lớn.
7. **Toàn cảnh + chú thích**: tất cả tuyến cùng lúc, hộp chú thích màu góc trên ("— Đại lộ Thăng Long", "— Metro 3 (Nhổn – Cầu Giấy)", "— Đường ra SB Nội Bài"…).

Mỗi cảnh: tiêu đề vàng viền đen ở trên, label dự án là thẻ trắng (logo + tên), ghim địa điểm đỏ/xanh tùy loại.

## Tự nhận ra hạ tầng (agent Bản đồ)
- Truy vấn Overpass API quanh tọa độ (bán kính 3 km cho "ngay cửa nhà", 8 km cho metro/TTTM, 30 km cho sân bay/cầu):
  `highway=trunk|primary|motorway` (lấy tên), `railway=subway|light_rail` + `station`, `shop=mall`, `leisure=stadium`,
  `amenity=bus_station`, `aeroway=aerodrome`, `bridge=yes` + `highway` lớn.
- Xếp hạng theo khoảng cách và độ nổi tiếng (có `wikidata`), mỗi chủ đề lấy 1–3 đối tượng.
- Tuyến từ dự án tới điểm: OSRM như map-location-video. Đường đi metro: vẽ hình học way của tuyến.
- Đối chiếu tên trước khi dùng, không bịa: nếu không tìm thấy chủ đề nào thì bỏ cảnh đó.

## Giữ nguyên từ map-location-video
Camera nghiêng ~40°, dự án luôn ở giữa, vùng an toàn 36px / 84px, fitFont, kiểm tra RECTS tự động, dòng ghi nguồn Esri/Maxar/OSM, ghi WebM bằng MediaRecorder, không sao chép thương hiệu/watermark của video mẫu (logo kênh, overlay "AI TỰ NHẬN RA", nút "BÌNH LUẬN: SKILL" là của người làm video mẫu, không đưa vào sản phẩm).

## Mạng cần mở
server.arcgisonline.com, router.project-osrm.org, photon.komoot.io, overpass-api.de.
