# QBK BĐS Video — Kế hoạch hệ thống

App tạo video dọc 9:16 giới thiệu dự án bất động sản từ ảnh/video người dùng tải lên,
kèm kịch bản (không bắt buộc), một nút **Hoàn tất** để các agent tự dựng video, và mục **Xuất video**.

## 1. Kiến thức học được từ skill & video mẫu

| Nguồn | Học được gì | Dùng ở agent nào |
|---|---|---|
| Skill `map-location-video` | Nền vệ tinh Esri nghiêng 3D ~40°, ghim dự án luôn giữa khung, mỗi tiện ích là 1 cảnh 5,5s có tuyến OSRM vẽ dần, thẻ km/phút, label kim loại (gold/blue/ruby), tự kiểm tra vùng an toàn, ghi WebM 576×1024 30fps | Bản đồ, Kiểm duyệt |
| Video mẫu 1 (bản đồ + metro) | Tiêu đề trên cùng theo cảnh ("Ngay cửa nhà", "Metro đang chạy", "Cầu & sân bay"), checklist dưới, vòng bán kính km | Biên kịch, Dựng hình |
| Video mẫu 2 (map CapCut) | Đường phát sáng theo trục chính, khung lô đất có kích thước (10m × 20m, 200m²), thẻ ảnh tiện ích nối bằng nét đứt | Bản đồ, Dựng hình |
| Video mẫu 3 (drone) | Ảnh/clip drone làm nền, kẻ tuyến neon, ghim vàng "CĂN NHÀ / TRƯỜNG HỌC / SIÊU THỊ", thẻ ảnh khách sạn, tòa án | Phân tích media, Dựng hình |

Quy tắc giữ nguyên từ skill: lề an toàn 36px trái/phải, thẻ dưới cách đáy 84px, chữ tự co (fitFont),
dòng ghi nguồn "Ảnh vệ tinh: Esri, Maxar · Đường: © OpenStreetMap" khi có cảnh bản đồ,
**không bịa tọa độ** (thiếu thì dùng vị trí tạm và ghi rõ), không chép thương hiệu/watermark video mẫu.

## 2. Đề xuất số agent: **6 agent** (+1 tùy chọn giai đoạn 2)

```
                ┌────────────────────────┐
  Người dùng ──▶│ 1. ĐIỀU PHỐI (Orchestr)│◀── trạng thái, log, tiến độ ──▶ UI
                └──────────┬─────────────┘
          ┌────────────────┼──────────────────┐
          ▼                ▼                  ▼
 2. PHÂN TÍCH MEDIA   3. BIÊN KỊCH        4. BẢN ĐỒ & VỊ TRÍ
 (song song)          (song song)          (chỉ chạy khi có tọa độ)
          └────────────────┼──────────────────┘
                           ▼
                  5. DỰNG HÌNH & XUẤT
                           ▼
                  6. KIỂM DUYỆT (QA) ──lỗi──▶ quay lại 5 (tối đa 2 lần)
                           ▼
                      Mục Xuất video
```

| # | Agent | Đầu vào | Đầu ra | Công nghệ |
|---|---|---|---|---|
| 1 | **Điều phối** | Media, kịch bản, thông tin dự án | Kế hoạch job, giao việc, gộp kết quả, báo tiến độ | Hàng đợi job (BullMQ/Redis), state machine |
| 2 | **Phân tích media** | Ảnh, video | Phân loại (phối cảnh / drone / nội thất / tiện ích / pháp lý), điểm chất lượng, đoạn clip đẹp nhất, thứ tự cảnh đề xuất | Claude (vision) + ffprobe/ffmpeg cắt cảnh |
| 3 | **Biên kịch** | Kịch bản người dùng (nếu có) + kết quả agent 2 | Kịch bản chia cảnh: hook 3s, tiêu đề từng cảnh, checklist, CTA. Có kịch bản thì chỉ chuẩn hóa, không viết lại ý | Claude (văn bản) |
| 4 | **Bản đồ & vị trí** | Tọa độ dự án, danh sách tiện ích | Cảnh bản đồ vệ tinh 3D có tuyến đường, km/phút, label | Skill `map-location-video` chạy trong Chromium headless (Playwright): Photon, OSRM, Esri |
| 5 | **Dựng hình & xuất** | Kịch bản chia cảnh + media + cảnh bản đồ | Video 9:16 (Ken Burns, chuyển cảnh, chữ, ghim, tuyến neon, end card), xuất MP4/WebM | Canvas render + FFmpeg (libx264, AAC nếu có nhạc) |
| 6 | **Kiểm duyệt (QA)** | Video + timeline | Báo cáo: chữ tràn vùng an toàn, khung trễ, thời lượng, dung lượng, dòng ghi nguồn, thông tin "vị trí tạm" | Kiểm tra tự động (RECTS như skill) + Claude đọc bảng khung hình |
| 7* | Giọng đọc (giai đoạn 2) | Kịch bản | File thoại + phụ đề khớp thời gian | TTS tiếng Việt |

Lý do chọn 6: mỗi agent có đầu vào/đầu ra tách bạch, 3 agent giữa chạy song song nên thời gian
chờ ngắn; gộp Dựng hình với Xuất vì cùng dùng FFmpeg; tách QA riêng để có vòng sửa lỗi tự động.
Ít hơn (ví dụ gộp Biên kịch vào Phân tích) làm prompt quá tải; nhiều hơn chỉ thêm chi phí điều phối.

## 3. Luồng người dùng (4 bước trên UI)

1. **Tải lên** ảnh/video (kéo thả, sắp xếp, xóa). Nhập tên dự án, khu vực, CTA; tọa độ + tiện ích (không bắt buộc).
2. **Kịch bản** (không bắt buộc): dán kịch bản, mỗi dòng = 1 cảnh; hoặc chọn mẫu giọng văn. Bỏ trống thì agent Biên kịch tự viết.
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
| 1 | Backend + hàng đợi, agent Biên kịch & Phân tích media gọi Claude, xuất MP4 bằng FFmpeg | Chờ duyệt |
| 2 | Agent Bản đồ chạy skill headless, hiệu ứng ghim/tuyến neon trên ảnh drone, khung lô đất | Chờ duyệt |
| 3 | Giọng đọc TTS, nhạc nền, thư viện icon/label riêng của người dùng | Chờ duyệt |

## 6. Bản xem trước (giai đoạn 0) làm được gì

Mở `app/index.html` bằng Chrome/Edge:
- Tải ảnh/video thật, xem thumbnail, đổi thứ tự, xóa.
- Kịch bản tùy chọn; bỏ trống thì có kịch bản mẫu tự sinh (mô phỏng agent Biên kịch, chưa gọi AI).
- Bấm **Hoàn tất & tạo video**: 6 agent chạy lần lượt có log; video 576×1024 30fps được dựng và ghi thật bằng canvas + MediaRecorder.
- Mục **Xuất video**: xem lại và tải file WebM. MP4 và cảnh bản đồ cần backend (giai đoạn 1–2).
