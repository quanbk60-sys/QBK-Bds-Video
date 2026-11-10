# QBK BĐS Video — Kế hoạch hệ thống

App tạo video dọc 9:16 giới thiệu dự án bất động sản từ ảnh/video người dùng tải lên,
kèm kịch bản (không bắt buộc), một nút **Hoàn tất** để các agent tự dựng video, và mục **Xuất video**.

## 1. Kiến thức học được từ skill & video mẫu

Có 4 skill (1 skill gửi dạng zip + 3 skill học từ 3 video, video 1 đã chuyển giọng nói thành chữ để học quy trình):

| Skill | Nguồn | Nội dung chính | Agent dùng | Trạng thái trong app |
|---|---|---|---|---|
| [map-location-video](../skills/map-location-video/SKILL.md) | File zip | Vệ tinh Esri nghiêng 40°, ghim dự án giữa khung, 1 tiện ích/cảnh, tuyến OSRM, thẻ km/phút, label kim loại, tự kiểm tra vùng an toàn | Bản đồ hạ tầng | Backend (giai đoạn 2) |
| [map-infrastructure-video](../skills/map-infrastructure-video/SKILL.md) | Video 1 (có lời thoại) | Chỉ cần vị trí, AI **tự nhận ra** đại lộ, vành đai, metro, cầu, sân bay, TTTM; cảnh theo chủ đề "Ngay cửa nhà / Metro đang chạy / Cầu & sân bay"; vòng 5/10/20 km; bảng chú thích màu | Bản đồ hạ tầng | Backend (giai đoạn 2) |
| [map-amenity-overlay](../skills/map-amenity-overlay/SKILL.md) | Video 2 | Trên ảnh vệ tinh nhìn thẳng: ghim vị trí đất, đường vàng phát sáng có tên đường, vòng bán kính, ghim tiện ích, lô đất 3D + m², tên sông phát sáng, thẻ ảnh nối nét đứt | Đồ họa ghim & tuyến | **Đã chạy trong app** |
| [drone-route-pins](../skills/drone-route-pins/SKILL.md) | Video 3 | Trên ảnh/clip drone: tuyến neon xanh to dần theo phối cảnh, chấm sáng chạy, ghim bật lên có bóng, thẻ ảnh đường dẫn mảnh | Đồ họa ghim & tuyến | **Đã chạy trong app** |

Quy tắc chung giữ nguyên: lề an toàn 36px trái/phải, đáy 84px, chữ tự co (fitFont), tiêu đề có từ khóa tô vàng,
dòng ghi nguồn Esri/OSM khi có cảnh bản đồ, **không bịa tọa độ**, không chép logo/watermark/overlay của video mẫu.

## 2. Đề xuất số agent: **7 agent** (+1 tùy chọn giai đoạn 3)

```
                ┌────────────────────────┐
  Người dùng ──▶│ 1. ĐIỀU PHỐI            │◀── trạng thái, log, tiến độ ──▶ UI
                └──────────┬─────────────┘
       ┌──────────────┬────┴─────────┬────────────────┐
       ▼              ▼              ▼                ▼
 2. PHÂN TÍCH    3. BIÊN KỊCH   4. BẢN ĐỒ HẠ TẦNG  5. ĐỒ HỌA GHIM & TUYẾN
    MEDIA                       (khi có tọa độ)    (ảnh vệ tinh / drone)
       └──────────────┴────┬─────────┴────────────────┘
                           ▼
                  6. DỰNG HÌNH & XUẤT
                           ▼
                  7. KIỂM DUYỆT (QA) ──lỗi──▶ quay lại 6 (tối đa 2 lần)
                           ▼
                      Mục Xuất video
```

| # | Agent | Đầu vào | Đầu ra | Công nghệ |
|---|---|---|---|---|
| 1 | **Điều phối** | Media, kịch bản, thông tin dự án | Kế hoạch job, giao việc, gộp kết quả, báo tiến độ | Hàng đợi job (BullMQ/Redis), state machine |
| 2 | **Phân tích media** | Ảnh, video | Phân loại **vệ tinh nhìn thẳng / drone phối cảnh / phối cảnh / nội thất / pháp lý**, điểm chất lượng, đoạn clip đẹp, thứ tự cảnh | Claude (vision) + ffprobe/ffmpeg |
| 3 | **Biên kịch** | Kịch bản (nếu có) + kết quả agent 2 | Hook 3s, tiêu đề từng cảnh có từ khóa tô vàng, CTA. Có kịch bản thì chỉ chuẩn hóa | Claude (văn bản) |
| 4 | **Bản đồ hạ tầng** | Tọa độ dự án (+ tiện ích tùy chọn) | Cảnh vệ tinh 3D theo chủ đề, tự nhận ra hạ tầng, vòng km, chú thích | Skill map-location-video + map-infrastructure-video, Chromium headless, Overpass/Photon/OSRM/Esri |
| 5 | **Đồ họa ghim & tuyến** | Ảnh vệ tinh/drone + ghim người dùng cắm (giai đoạn sau: agent 2 gợi ý vị trí) | Lớp đồ họa động: ghim, đường neon, lô đất 3D, thẻ ảnh, vòng bán kính, tên khu vực | Skill map-amenity-overlay + drone-route-pins (canvas) |
| 6 | **Dựng hình & xuất** | Kịch bản + media + cảnh bản đồ + lớp đồ họa | Video 9:16, xuất MP4/WebM | Canvas + FFmpeg |
| 7 | **Kiểm duyệt (QA)** | Video + timeline | Vùng an toàn, khung trễ, thời lượng, dung lượng, ghi nguồn, "vị trí tạm" | Kiểm tra RECTS tự động + Claude đọc bảng khung hình |
| 8* | Giọng đọc (giai đoạn 3) | Kịch bản | Thoại + phụ đề | TTS tiếng Việt |

Lý do tăng từ 6 lên 7: video 2 và 3 cho thấy đồ họa trên ảnh (ghim, đường neon, lô đất) là một mảng riêng,
khác hẳn bản đồ vệ tinh tự động (cần tọa độ, gọi API bản đồ). Tách riêng để hai agent chạy song song và
agent Đồ họa vẫn làm được khi người dùng không có tọa độ.

## 3. Luồng người dùng (4 bước trên UI)

1. **Tải lên** ảnh/video (kéo thả, sắp xếp, xóa). Nhập tên dự án, khu vực, CTA; tọa độ + tiện ích (không bắt buộc).
2. **Kịch bản** (không bắt buộc): dán kịch bản, mỗi dòng = 1 cảnh; hoặc chọn mẫu giọng văn. Bỏ trống thì agent Biên kịch tự viết.
   Trên từng ảnh bấm **✎ Ghim** để cắm ghim, kẻ đường neon, vẽ lô đất 3D, gắn thẻ ảnh, vòng bán kính, tên khu vực.
3. **Hoàn tất** → bảng agent hiện trạng thái từng agent (chờ / đang chạy / xong / bỏ qua / lỗi) và log, khung điện thoại xem trước video.
4. **Xuất video**: chọn định dạng (MP4 / WebM), độ phân giải (576×1024, 1080×1920), có/không nhạc, tải xuống.

## 4. Kiến trúc kỹ thuật (bản đầy đủ)

- **Frontend**: React/Next.js (bản xem trước hiện tại: `app/index.html`, một file, chạy ngay trong trình duyệt).
- **Backend**: Node.js (Fastify) + Redis/BullMQ, lưu file S3 hoặc ổ đĩa.
- **Agent**: Claude API cho Phân tích media (vision), Biên kịch, QA; agent Bản đồ và Dựng hình là worker kỹ thuật.
- **Render**: Playwright/Chromium cho cảnh canvas (bản đồ), FFmpeg ghép cảnh và xuất MP4.
- API chính: `POST /projects`, `POST /projects/:id/media`, `PUT /projects/:id/script`,
  `POST /projects/:id/render` (nút Hoàn tất), `GET /jobs/:id` (SSE tiến độ agent), `GET /projects/:id/export?format=mp4`.

## 5. Lộ trình

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 0 | Kế hoạch + giao diện xem trước chạy được trong trình duyệt (dựng video từ ảnh/video, xuất WebM) | **Đã làm** |
| 0b | Trình ghim & kẻ đường (skill video 2 + 3) trong app | **Đã làm** |
| 1 | Backend + hàng đợi, agent Biên kịch & Phân tích media gọi Claude, xuất MP4 bằng FFmpeg | Chờ duyệt |
| 2 | Agent Bản đồ hạ tầng chạy skill headless (tự nhận ra hạ tầng), agent 2 gợi ý vị trí ghim, bám chuyển động clip drone | Chờ duyệt |
| 3 | Giọng đọc TTS, nhạc nền, thư viện icon/label riêng của người dùng | Chờ duyệt |

## 6. Bản xem trước (giai đoạn 0) làm được gì

Mở `app/index.html` bằng Chrome/Edge:
- Tải ảnh/video thật, xem thumbnail, đổi thứ tự, xóa.
- Kịch bản tùy chọn; bỏ trống thì có kịch bản mẫu tự sinh (mô phỏng agent Biên kịch, chưa gọi AI).
- Bấm **✎ Ghim** trên ảnh: 7 công cụ đồ họa, 2 kiểu ảnh (vệ tinh nhìn thẳng / drone phối cảnh).
- Bấm **Hoàn tất & tạo video**: 7 agent chạy lần lượt có log; video 576×1024 30fps được dựng và ghi thật bằng canvas + MediaRecorder.
- Mục **Xuất video**: xem lại và tải file WebM. MP4 và cảnh bản đồ cần backend (giai đoạn 1–2).
