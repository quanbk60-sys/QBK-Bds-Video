---
name: map-amenity-overlay
description: Biểu diễn tiện ích trên ảnh vệ tinh nhìn thẳng (kiểu CapCut): ghim vị trí đất, đường vàng phát sáng có tên đường, vòng bán kính, ghim tiện ích, lô đất 3D có kích thước và m², tên sông/khu vực phát sáng, thẻ ảnh tiện ích nối nét đứt. Học từ video mẫu 2. Đã cài trong app/index.html (kiểu ảnh "Vệ tinh nhìn thẳng").
---

# Tiện ích trên ảnh vệ tinh (học từ video mẫu 2, ~29s, không lời)

Nền: ảnh chụp vệ tinh nhìn thẳng (người dùng tải lên). Tiêu đề 2 dòng trắng ở trên, từ khóa tô vàng.
Các hiệu ứng xuất hiện **lần lượt**, mỗi cái ~0,5–1,3s:

| Thứ tự | Đồ họa | Cách vẽ trong app |
|---|---|---|
| 1 | Ghim "VỊ TRÍ ĐẤT" vàng có icon nhà | `pin()` rơi từ trên xuống (easing back), vòng sóng ở chân ghim |
| 2 | Đường phát sáng | `drawRoad(top)`: nét vàng chanh dày 11px, glow 22px, lõi trắng-vàng 3,5px, vẽ dần theo độ dài |
| 3 | Tên đường dọc theo đường ("TRẦN ĐẠI NGHĨA") | chữ 900 gradient vàng, xoay theo đoạn dài nhất, không bao giờ lộn ngược |
| 4 | Vòng bán kính | `drawRing()`: 2 vòng vàng mảnh nở ra, nhãn km phía trên |
| 5 | Ghim tiện ích (Chợ, Trường học, Siêu thị) | `pin()` bật lên (scale back-easing), nhãn vàng viền đen |
| 6 | Lô đất 3D "200m² · 20m × 10m" | `drawPlot()`: 4 góc, khối xanh dương nổi lên 24px, viền sáng, đường kích thước có vạch hai đầu |
| 7 | Tên sông/khu vực ("SÔNG CỔ CÒ") | `drawText()`: chữ trắng glow cam, hiện dần trái sang phải |
| 8 | Thẻ ảnh tiện ích (Bar, Chợ) | `drawCard()`: nét đứt vàng từ điểm tới thẻ → khung trắng → ảnh hiện → thanh nhãn xanh dương trượt ra |

## Quy tắc
- Tọa độ đồ họa lưu theo **tỉ lệ ảnh (0..1)** để đi theo Ken Burns; cảnh có đồ họa dùng zoom nhẹ 1.00→1.05, không lia.
- Nhãn và thẻ tự dịch vào trong lề 36px; thẻ ảnh không lên trên y=225 (chừa tiêu đề) và không xuống dưới đáy an toàn.
- Thời lượng cảnh = max(3,4s, thời điểm đồ họa cuối xong + 1,4s).
- Không chép logo/watermark kênh của video mẫu.
