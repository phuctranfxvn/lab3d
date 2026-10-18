// =====================================================================
//  Nón lưỡi trai chữ nổi 2 dòng
//  Nón lưỡi trai in tên 2 dòng chữ nổi bám theo mặt cong của nón
//
//  Thân nón: nhập nguyên bản từ mesh 3MF gốc, không chỉnh sửa.
//  Chữ: tạo bằng text(), ép bám đúng mặt cong thật của thân nón.
//  Đơn vị: milimét. Kích thước gốc 834.7 x 507.4 x 372.3 mm.
//  Mọi thông số kích thước bên dưới tính theo kích thước gốc,
//  sau đó cả mô hình mới được nhân với ti_le.
//
//  CẦN FONT: cài Baloo2-ExtraBold-Static.ttf vào hệ thống trước khi mở
//  bằng OpenSCAD desktop (web Lab3D tự nạp font trong thư mục này).
//  Windows: chuột phải file TTF > Install.  macOS: mở bằng Font Book.
//  Linux: chép vào ~/.local/share/fonts rồi chạy  fc-cache -f
// =====================================================================


/* [Nội dung chữ] */

// Dòng trên
dong1 = "Thầy Đoàn";
// Dòng dưới
dong2 = "Dạy Lái Xe";


/* [Cỡ chữ] */

// Cỡ chữ dòng 1 (mm). Tên dài thì giảm xuống để chữ không tràn ra hông nón.
co_dong1 = 39.35;
// Cỡ chữ dòng 2 (mm)
co_dong2 = 40.69;
// Giãn cách giữa các chữ (đơn vị em). 0 là mặc định của font.
gian_chu = 0;


/* [Vị trí chữ] */

// Dời dòng 1 lên (+) hoặc xuống (-), mm
cao_dong1 = 41.62;
// Dời dòng 2 lên (+) hoặc xuống (-), mm
cao_dong2 = -42.90;
// Dời dòng 1 sang trái (+) hoặc phải (-), mm
ngang_dong1 = 0;
// Dời dòng 2 sang trái (+) hoặc phải (-), mm
ngang_dong2 = 0;


/* [Vát cạnh] */

// Bề rộng vát cạnh đỉnh chữ (mm). 0 = cạnh vuông.
vat_canh = 1.8;
// Độ mịn đường viền khi vát cạnh
$fn = 24;


/* [Hiển thị và xuất file] */

// Kèm thân nón (web: có trong file tải về; OpenSCAD desktop: chỉ hiện khi xem trước)
hien_than_non = true;
// Tỉ lệ xuất file. 1 = kích thước gốc, 0.4 = 40% (333.9 x 203.0 x 148.9 mm).
ti_le = 0.4;


/* [Hidden] */

// --- Hệ trục của mặt trước nón, đo trực tiếp từ mesh thân nón ---
// O0: điểm trên mặt nón, giữa mặt trước
O0 = [-129.9, 0, 230.4];
// e1: hướng đọc chữ (sang trái khi nhìn từ phía trước)
E1 = [0, -1, 0];
// e2: hướng lên trên, nằm trong mặt phẳng chữ
E2 = [0.471108, 0, 0.882075];
// nz: pháp tuyến mặt trước, hướng ra ngoài
NZ = [-0.882075, 0, 0.471108];

M = [[E1[0], E2[0], NZ[0], O0[0]],
     [E1[1], E2[1], NZ[1], O0[1]],
     [E1[2], E2[2], NZ[2], O0[2]]];

SAU = 60;   // chiều sâu khối cắt, đủ xuyên qua lớp vỏ


// --- Khối lăng trụ mang hình chữ, chiếu dọc theo pháp tuyến mặt trước ---
module khoi_chu(s, co, u, v, thut = 0) {
    multmatrix(M)
        translate([u, v, -SAU])
            linear_extrude(height = 2 * SAU)
                offset(r = -thut)
                    text(s, size = co, font = "Baloo2 ExtraBold",
                         halign = "center", valign = "center",
                         spacing = 1 + gian_chu);
}

// --- Chữ hoàn chỉnh: cắt khối lăng trụ bằng 2 lớp vỏ bám mặt nón ---
//  vo_than.stl : từ -3.0 mm (chìm vào vải) đến +5.2 mm
//  vo_dinh.stl : từ +5.2 mm đến +7.0 mm, dùng với chữ đã thụt vào -> vát cạnh
module chu() {
    union() {
        intersection() {
            import("vo_than.stl", convexity = 10);
            union() {
                khoi_chu(dong1, co_dong1, ngang_dong1, cao_dong1);
                khoi_chu(dong2, co_dong2, ngang_dong2, cao_dong2);
            }
        }
        intersection() {
            import("vo_dinh.stl", convexity = 10);
            union() {
                khoi_chu(dong1, co_dong1, ngang_dong1, cao_dong1, vat_canh);
                khoi_chu(dong2, co_dong2, ngang_dong2, cao_dong2, vat_canh);
            }
        }
    }
}


// =====================================================================
//  KẾT QUẢ
// =====================================================================
//  Thân nón được đánh dấu % vì mesh gốc có 5739 mảnh rời và 64832 cạnh
//  hở, OpenSCAD không làm phép boolean với nó được.
//  OpenSCAD desktop: thân nón chỉ hiện khi xem trước, KHÔNG nằm trong
//  file xuất ra. Xuất chữ ra STL rồi nạp chung với than_non.stl vào
//  slicer. Hai file cùng hệ tọa độ nên tự khớp, không cần căn chỉnh.
//  Web Lab3D: tự ghép thân nón vào file tải về (không boolean, là một
//  phần riêng trong 3MF). Tắt hien_than_non nếu chỉ muốn tải phần chữ.
// =====================================================================

scale(ti_le) {
    chu();
    if (hien_than_non) %import("than_non.stl", convexity = 10);
}
