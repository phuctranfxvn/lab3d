# Lab3D

Web app tùy biến file OpenSCAD rồi tải về STL hoặc 3MF có màu. OpenSCAD chạy ngay trong trình duyệt (WebAssembly, backend Manifold), không cần cài OpenSCAD hay server.

## Cài đặt

Yêu cầu: **Node.js 20.19 trở lên** (hoặc 22.12+). Kiểm tra bằng `node -v`. Nếu chưa có, cài từ [nodejs.org](https://nodejs.org) hoặc bằng Homebrew:

```bash
brew install node
```

Sau đó cài thư viện, chỉ cần làm một lần sau khi tải mã nguồn về:

```bash
cd lab3d
npm install
```

## Chạy ứng dụng

```bash
npm run dev
```

Mở **http://localhost:5173** trên trình duyệt (Chrome, Edge, Safari hoặc Firefox bản mới). Giữ cửa sổ terminal đó mở trong lúc dùng. Thêm hoặc sửa file `.scad`, font hay ảnh trong `flyers/` thì trang tự cập nhật, không cần chạy lại.

Dừng ứng dụng: bấm `Ctrl + C` trong cửa sổ terminal đang chạy.

Lệnh khác:

| Lệnh | Tác dụng |
|---|---|
| `npm run dev -- --open` | Chạy và tự mở trình duyệt |
| `npm run dev -- --host` | Cho điện thoại/máy khác cùng mạng Wi-Fi truy cập, địa chỉ dạng `http://192.168.x.x:5173` hiện trong terminal |
| `npm run build` | Đóng gói thành website tĩnh trong `dist/`, chép thư mục đó lên hosting tĩnh bất kỳ (GitHub Pages, Netlify, Cloudflare Pages…) |
| `npm run preview` | Xem thử bản đã đóng gói trong `dist/` |

### Gặp lỗi

- **`Port 5173 is in use`**: đang có một bản khác chạy. Tắt bản đó bằng `kill $(lsof -t -i:5173)` rồi chạy lại, hoặc dùng cổng khác: `npm run dev -- --port 5180`.
- **Trang không đổi sau khi sửa code**: tải lại cứng bằng `Cmd + Shift + R` (macOS) hoặc `Ctrl + Shift + R`.
- **Ảnh xem trước của mẫu bị cũ**: ảnh được lưu trong trình duyệt và tự làm mới khi file `.scad` thay đổi. Muốn xoá hẳn thì xoá dữ liệu trang (DevTools → Application → Local Storage).
- **Lần đầu mở trang hơi chậm**: trình duyệt phải tải bộ máy OpenSCAD (khoảng 3 MB khi nén). Những lần sau trình duyệt dùng lại bản đã lưu.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `scads/<Danh mục>/*.scad` | Các mẫu thiết kế, mỗi thư mục con là một danh mục |
| `fonts/<Nhóm>/*.ttf` | Font dùng cho `text()`, mỗi thư mục con là một nhóm trong bộ chọn font |
| `flyers/` | Ảnh bay ngang nền trang chủ (xem `flyers/README.txt`) |
| `src/` | Mã nguồn web app |
| `src/vendor/openscad.*` | Bản OpenSCAD WebAssembly chính thức (2025.03.25) |
| `src/profiles/creator5.json` | Profile máy Flashforge Creator 5 dùng khi xuất 3MF |

## Thêm mẫu

Mỗi thư mục con trong `scads/` là một **danh mục**, tên thư mục là tên danh mục. Đặt file `.scad` vào thư mục đó, ví dụ `scads/Móc Khoá Theo Tên/moc_khoa_laura.scad`. File đặt thẳng trong `scads/` (không nằm trong thư mục nào) sẽ vào danh mục "Khác".

Trang chủ hiện danh sách danh mục. Bấm vào một danh mục để xem các mẫu trong đó. Gõ vào ô tìm kiếm để tìm trong mọi danh mục (theo tiêu đề, mô tả, tên danh mục và tên file). Tham số được đọc theo cú pháp Customizer của OpenSCAD:

```openscad
// Móc khoá Laura                       <- tiêu đề (dòng comment đầu file)
// Móc khoá tên 3 lớp, in nhiều màu      <- mô tả ngắn hiện trên thẻ
//
// Ghi chú kỹ thuật sau dòng comment trống sẽ không hiện trên web

/* [Nhóm] */
text  = "Xin chào";   // Mô tả hiển thị
size  = 12;           // [5:1:40]        -> thanh trượt min:step:max
shape = "tron";       // [tron, vuong]   -> lựa chọn
hole  = true;         //                 -> công tắc
pos   = [0, 5];       //                 -> ô X / Y

/* [Hidden] */
internal = 1;         // không hiển thị
```

Việc đọc tham số dừng ở `module`/`function` đầu tiên. Biến tên có chứa `font` sẽ hiện bộ chọn font có xem trước.

## Tải 3MF có màu

Nút **3MF màu** xuất một file 3MF gồm một vật thể chia thành nhiều phần, mỗi phần là một màu `color()` dùng trong file `.scad`. Nút mũi tên bên cạnh dùng để chọn kiểu file:

- **Orca-Flashforge · Creator 5** (mặc định): dự án đầy đủ theo định dạng Bambu/Orca, kèm profile máy Creator 5 lấy từ `mkw-creator-converter` (`src/profiles/creator5.json`). Mỗi phần được gán sẵn một khay sợi mang đúng màu của phần đó (tối đa 4 khay). File được đóng dấu phiên bản `2.3.2` để Flash Studio không báo "file mới hơn phiên bản phần mềm".
- **Slicer khác (3MF chuẩn)**: 3MF theo chuẩn chung, màu ghi bằng `basematerials`. Bambu Studio và Orca không đọc màu kiểu này, nên phải tự gán sợi cho từng phần.

Bản OpenSCAD WebAssembly không xuất được 3MF, nên web dựng từng màu riêng rồi tự đóng gói. Để tách màu, web dùng một file bọc ngoài định nghĩa lại module `color()`, vì vậy:
- Chỉ những màu thật sự được vẽ mới được tách. Phần nằm ngoài mọi `color()` thành một phần riêng tên "Không màu".
- Nếu `color()` lồng nhau (một màu nằm bên trong màu khác), phần bên trong được tính theo màu bên ngoài.

## Font

Font nằm trong `fonts/`, mỗi thư mục con là một danh mục trong bộ chọn font (`Viết tay`, `Vui nhộn`, `Không chân`, `Có chân`, `Đơn cách`). Hiện có 40 font từ Google Fonts. Tất cả đều có dấu tiếng Việt và đã được dựng thử bằng OpenSCAD WASM.

Thêm font: chép file `.ttf`/`.otf` vào một thư mục con, trang sẽ tự tải lại. Tên dùng trong `text(font=...)` được đọc từ chính file font, ví dụ `Montserrat:style=ExtraBold`.

Lưu ý khi thêm font:
- Nên dùng bản tĩnh, độ đậm cố định. Font biến thiên (`Name[wght].ttf`) thường có độ đậm mặc định là Thin/Light nên in ra rất mảnh. Có thể lấy bản tĩnh qua `https://fonts.googleapis.com/css2?family=Ten+Font:wght@700`.
- Cherry Bomb One bị OpenSCAD dựng sai mà không báo lỗi. Hãy xem thử kết quả sau khi thêm font mới.
- File `.scad` có dòng `use <Ten-Font.ttf>` vẫn chạy được: web tự đặt font cùng tên họ vào cạnh file `.scad`.
- Bộ chọn font cảnh báo khi nội dung có ký tự font không hỗ trợ, vì OpenSCAD sẽ in ký tự đó thành ô vuông.
