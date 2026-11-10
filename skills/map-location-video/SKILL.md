---
name: map-location-video
description: Làm video dọc 9:16 giới thiệu vị trí và kết nối của dự án bất động sản: nền ảnh vệ tinh Esri nghiêng 3D, tuyến đường OSRM, label kim loại, xuất WebM ngay trong trình duyệt tích hợp. Không dùng cho mô phỏng thi công metro.
---

# Video vị trí & kết nối trên nền ảnh vệ tinh

Tạo video dọc 9:16 (576x1024, 30fps, khoảng 29 giây với 4 địa điểm) cho một dự án: camera nghiêng khoảng 40 độ, ghim dự án luôn ở giữa khung, mỗi địa điểm lân cận là một cảnh có tuyến đường vẽ dần, thẻ thông tin (km, phút), ghim và label kim loại (vàng gold, xanh ánh kim, đỏ ruby). Toàn bộ dựng và ghi trong trình duyệt tích hợp của app Claude (canvas + MediaRecorder), không dùng trang web render ngoài.

Khác với skill map-animation (nhận một ảnh vệ tinh và dựng hoạt cảnh thi công metro): skill này dựng từ tile ảnh vệ tinh và dữ liệu tuyến, dùng cho video giới thiệu vị trí.

## Các file đi kèm
- scripts/part-a-data.js : điền CFG (tên, chữ, tọa độ, địa điểm) và lấy tuyến OSRM.
- scripts/part-b-render.js : dựng, kiểm tra tự động, ghi video, tạo bảng khung hình.
- scripts/rerecord.js : ghi lại video khi lần đầu bị trễ khung.

Cách chạy mỗi file: đọc nội dung file bằng công cụ đọc file, rồi truyền nguyên văn vào tham số text của javascript_tool (action javascript_exec) trong tab trình duyệt.

## Cần hỏi người dùng trước (nếu chưa có)
1. Tên dự án (ví dụ HAPPY ONE ELITE), khu vực hiển thị (ví dụ TAM BÌNH · THỦ ĐỨC).
2. Tọa độ chính xác của dự án (lat, lon) hoặc link Google Maps. Nếu chưa có tọa độ thật, KHÔNG tự bịa: dùng vị trí tạm và nói rõ đây là vị trí tạm. Tìm địa chỉ bằng geocoder có thể ra dự án khác trùng tên, phải đối chiếu tên trước khi dùng.
3. Danh sách địa điểm lân cận (tên, loại: Y TẾ / MUA SẮM / KẾT NỐI ...). Mặc định 4 địa điểm, 5,5 giây mỗi cảnh.
4. Dòng chữ mở đầu (2 dòng + 1 câu phụ), tagline, chữ nút kêu gọi, ghi chú cuối.
Không sao chép thương hiệu, tên kênh hay watermark của video mẫu của người khác.

## Quy trình
1. Bật trình duyệt tích hợp: gọi enable__mcp__remote-devices__Claude_Browser, rồi nạp toàn bộ tool bằng một lệnh ToolSearch với tiền tố mcp__remote-devices__Claude_Browser__. Đọc skill built-in-browser trước bước đầu tiên.
2. Gọi request_access cho https://server.arcgisonline.com (scope site), rồi preview_start mở một tile, ví dụ https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/450/820. Mọi mã JS chạy trong tab này (origin arcgisonline) nên tải tile và đọc vào canvas không bị chặn CORS. Giữ nguyên tab, không điều hướng đi nơi khác trong lúc làm.
3. Lấy tọa độ địa điểm bằng Photon (https://photon.komoot.io/api/?limit=3&lat=<lat>&lon=<lon>&q=<tên>) qua fetch trong tab. Đối chiếu tên và vị trí từng kết quả. Không dùng Nominatim và tile raster của OpenStreetMap: bị chặn từ trang này.
4. Chạy scripts/part-a-data.js sau khi điền CFG.
5. Chạy scripts/part-b-render.js. Mã chạy ngầm; đợi bằng computer wait rồi đọc JSON.stringify(window.ST) cho đến khi done là true. Mất khoảng 1 phút.
6. Đọc kết quả kiểm tra: ST.check.violationCount phải bằng 0; ST.late (số khung trễ) phải bằng 0 và dung lượng video thường 13 MB trở lên. Nếu late lớn hoặc file nhỏ bất thường, chạy scripts/rerecord.js (dùng lại tile đã tải).
7. Xem bảng khung hình: pane đang hiện bảng khung có đường viền an toàn nét đứt hồng. Chụp màn hình pane để xem. Nút zoom của computer không phóng to ảnh; muốn xem cận cảnh thì vẽ crop vào canvas rồi chụp pane (xem mẹo).
8. Gọi window.showVideo() để phát video trong pane kèm nút Tải video. Báo người dùng các điểm cần lưu ý (vị trí tạm, label dùng cách đặt dự phòng nếu có).

## Quy tắc thiết kế (đã được người dùng duyệt, giữ nguyên)
- Vùng an toàn cho mạng xã hội: chữ, thẻ, label cách mép trái phải 36px, thẻ dưới cách đáy 84px, thanh trên cùng hạ xuống y=64 và tiến trình y=82. Mọi chữ tự co (fitFont) để không tràn viền.
- Dòng cuối: dòng chính do người dùng chọn (mặc định Video được làm bởi Claude Code) và dòng nhỏ bên dưới ghi nguồn: Ảnh vệ tinh: Esri, Maxar · Đường: © OpenStreetMap · Số liệu ước tính. Không xóa dòng nguồn trừ khi người dùng yêu cầu rõ (Esri và OpenStreetMap yêu cầu ghi nguồn).
- Camera nghiêng khoảng 40 độ (strip warp), tâm camera luôn là dự án nên ghim dự án luôn ở giữa khung (y=500). Zoom chọn bằng cách lùi dần đến khi mọi điểm của tuyến nằm trong khung x từ 80 đến W-80, y từ 215 đến đỉnh thẻ trừ 44. Mở đầu nghiêng dần từ 15 đến 40 độ.
- Label: đầu nhọn ghim luôn đúng vị trí trên bản đồ. Nếu label căn giữa tràn mép phải thì chữ nằm bên trái icon; tràn mép trái thì nằm bên phải; còn lại căn trục giữa phía trên icon. Chữ và icon có khoảng cách rõ (14px trên đầu ghim, 12px khi ở bên). Label tự né logo dự án và thân ghim dự án; nếu cả ba hướng đều vướng thì dùng center* (căn giữa, dịch vào trong cho khỏi tràn viền).
- Label không bao giờ đè thẻ chữ phía dưới: cách thẻ tối thiểu 14px.
- Icon kim loại: gold cho ghim dự án và mua sắm, blue cho kết nối (sân bay, giao thông), ruby cho y tế. Thêm loại mới: thêm nhánh trong glyph() và chọn sty.
- Dự án mẫu, vị trí chưa xác thực: ghi chú cuối nói rõ số liệu và vị trí mang tính tham khảo.

## Mẹo và lỗi hay gặp
- Shell của sandbox không tải được tile (proxy trả 403) và GitHub bị chặn: mọi việc tải tile, định tuyến, tìm địa chỉ phải làm bằng fetch trong tab trình duyệt.
- Nominatim và tile raster của openstreetmap.org bị chặn từ trang; dùng Photon cho tìm địa chỉ, OSRM (router.project-osrm.org) cho tuyến, tile Esri World Imagery cho nền (zoom tối đa 17 trong mã).
- MediaRecorder ghi theo thời gian thực: mỗi khung phải dựng dưới 33ms. Mã tự đo, nếu quá 24ms thì giảm độ phân giải dải strip (STEP=2). Pane trình duyệt phải đang hiển thị, đừng chuyển panel khác trong lúc ghi.
- Xem cận cảnh: gọi window.RENDER(t) rồi dùng drawImage(window.CVS, ...) phóng to một vùng vào canvas mới, đặt vào stage và chụp pane. window.RENDER(t) chỉ vẽ lên canvas CVS, không cần canvas đang gắn vào trang.
- Kết quả là file WebM nằm trong trình duyệt. Người dùng bấm nút Tải video. Muốn MP4 hoặc thêm nhạc: người dùng thêm một thư mục vào app (Add folder), đặt file WebM vào đó, rồi dùng ffmpeg trong phiên: ffmpeg -i in.webm -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p out.mp4 (thêm -i nhac.mp3 -shortest -c:a aac để chèn nhạc). Không tự tải file xuống máy người dùng nếu họ chưa đồng ý.
- Giấy phép: ảnh Esri/Maxar và dữ liệu OpenStreetMap cần ghi nguồn; nếu dùng thương mại hãy nhắc người dùng kiểm tra điều khoản.
- Số cảnh bằng số phần tử của pois (3 đến 6 là hợp lý); thời lượng T = 3,5 + 5,5 x N + 3,5 giây. Với N khác 4, đặt window.RECORD_SECONDS = T trước khi chạy rerecord.js.

## Kho label riêng của người dùng (chưa triển khai)
Người dùng có kho icon và thiết kế label riêng và muốn dùng cho label đẹp hơn. Khi họ gửi kho (zip, thư mục qua Add folder, hoặc link): đọc cấu trúc, map từng loại địa điểm sang một icon SVG hoặc PNG, nạp bằng new Image() (SVG qua data URL) rồi thay thế glyph() (icon trong thẻ), pinBody() (thân ghim) và drawLabel() (khung label). Giữ nguyên toàn bộ quy tắc vùng an toàn, cách đặt label trái, giữa, phải và bước kiểm tra tự động. Làm lại bản demo để người dùng so sánh trước khi chốt.
