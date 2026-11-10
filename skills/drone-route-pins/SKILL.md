---
name: drone-route-pins
description: Kẻ đường neon và ghim vị trí trên ảnh/clip drone phối cảnh (kiểu "Kẻ đường và ghim vị trí trên CapCut trong 30 giây"): tuyến xanh neon to dần về phía camera, chấm sáng chạy dọc, ghim vàng bật lên có bóng và vòng chân, thẻ ảnh có đường dẫn mảnh. Học từ video mẫu 3. Đã cài trong app/index.html (kiểu ảnh "Drone phối cảnh").
---

# Đường neon & ghim trên ảnh drone (học từ video mẫu 3, ~21s, không lời)

Nền: ảnh hoặc clip drone nhìn nghiêng (bầu trời phía trên, đường chạy về điểm tụ). Tiêu đề 3 dòng ở trên, từ khóa tô vàng.

| Thứ tự | Đồ họa | Cách vẽ trong app |
|---|---|---|
| 1 | Ghim chính "CĂN NHÀ" | `pin(drone)`: vàng gold, bóng elip rộng + vòng trắng dưới chân, rơi xuống |
| 2 | Tuyến neon theo các trục đường | `drawRoad(drone)`: xanh #3dffe0, glow 18px, **độ dày theo y** (3px ở xa → 16px ở gần) để ra phối cảnh; vẽ từ gần ra xa |
| 3 | Chấm sáng chạy dọc tuyến | sau khi vẽ xong, một chấm trắng-xanh glow 30px chạy lặp theo tuyến |
| 4 | Thẻ ảnh (KHÁCH SẠN, TÒA ÁN) | `drawCard(drone)`: đường dẫn trắng mảnh liền nét → khung → ảnh → thanh nhãn xanh dương |
| 5 | Ghim tiện ích (TRƯỜNG HỌC, SIÊU THỊ, NHÀ HÀNG) | `pin()` vàng chanh bật lên lần lượt, icon trong vòng trắng, nhãn vàng viền đen |

## Quy tắc
- Kẻ đường: bấm từ điểm gần camera (dưới ảnh) ra xa (về đường chân trời) để nét vẽ dần đúng hướng như video mẫu.
- Ghim ở xa nên nhỏ hơn: (giai đoạn sau) scale ghim theo y giống độ dày đường.
- Với clip drone đang bay, đồ họa đứng yên theo khung hình; giai đoạn sau thêm theo dõi chuyển động (tracking) bằng optical flow ở backend.
- Chung quy tắc vùng an toàn và lưu tọa độ theo tỉ lệ ảnh như map-amenity-overlay.
