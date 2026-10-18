// ============================================================
//  Móc khoá Leonardo
//  Móc khoá tên 2 lớp: đế màu và chữ nổi, in được 2 màu (AMS)
//
//  moc_khoa_leonardo.scad — dựng lại dạng tham số từ Nicole (1).3mf
//  Giá trị mặc định tái tạo đúng bản gốc (font Pacifico, size 12).
//  Cần file Pacifico-Regular.ttf đặt cùng thư mục với file .scad
//  (hoặc cài font vào máy).
// ============================================================

/* [Chữ] */
name_text    = "Leonardo";
font_name    = "Pacifico";
text_size    = 12;      // chiều cao chữ (mm, theo cỡ font)
text_spacing = 1.024;   // khoảng cách ký tự

/* [Kích thước] */
base_thickness = 2;     // độ dày đế (mm)
text_thickness = 1;     // chữ nổi trên đế (mm)
base_offset    = 2.3;   // đế nở ra quanh chữ (mm)
fill_letter_holes = false; // lấp các lỗ kín còn sót trong đế (bản gốc: tắt)
// "auto" dùng fill() nếu OpenSCAD hỗ trợ; "closing" cho OpenSCAD 2021 (gần đúng)
fill_method = "auto"; // ["auto", "fill", "closing"]
closing_radius = 2;   // chỉ dùng khi fill_method = closing

/* [Vòng móc khóa] */
ring_x       = -1.2;  // tâm lỗ, trục X (mm)
ring_y       = 6;     // tâm lỗ, trục Y (mm)
ring_outer_d = 6;     // đường kính phần đế quanh lỗ (mm)
ring_hole_d  = 3;     // đường kính lỗ (mm)

/* [Lỗ móc phụ ở cuối tên] */
// Thêm một lỗ ở cuối tên để treo thêm vật khác (charm, chuông...)
end_ring       = true;
end_ring_gap   = 3.5;   // khoảng cách từ mép phải chữ đến tâm lỗ (mm), tự bám theo độ dài tên
end_ring_y     = 6;     // tâm lỗ, trục Y (mm) — lỗ bám vào mép phải chữ ở đúng độ cao này
end_ring_outer_d = 6;   // đường kính phần đế quanh lỗ (mm)
end_ring_hole_d  = 3;   // đường kính lỗ (mm)

/* [Hiển thị / xuất] */
// "all" = toàn bộ có màu; "base" / "text" để xuất STL riêng từng màu (AMS)
part = "all"; // ["all", "base", "text"]
color_base = "#E85AD6";
color_text = "white";
resolution = 64;

/* [Hidden] */
$fn = resolution;
use <Pacifico-Regular.ttf>

// ---------- 2D ----------
module text_2d()
    text(name_text, size = text_size, spacing = text_spacing, font = font_name);

module fill_holes() {
    if (!fill_letter_holes) children();
    else if (fill_method == "fill" || (fill_method == "auto" && version_num() >= 20240101))
        fill() children();
    else
        offset(r = -closing_radius) offset(r = closing_radius) children();
}

// Điểm neo ở mép phải của chữ, tính bằng hình học nên tự bám theo
// độ dài tên (chạy được trên mọi bản OpenSCAD, không cần textmetrics):
// cắt bao lồi của chữ bằng một dải ngang rất mỏng tại độ cao end_ring_y,
// rồi chỉ giữ lát mỏng ở đầu phải của đoạn cắt đó.
module text_row_2d()
    intersection() {
        hull() text_2d();
        translate([-1000, end_ring_y - 0.0005]) square([3000, 0.001]);
    }
module text_right_anchor_2d() {
    eps = 0.01;
    translate([end_ring_gap, 0]) difference() {
        text_row_2d();
        translate([-eps, 0]) text_row_2d();
    }
}
module end_ring_disk_2d(d) offset(r = d / 2) text_right_anchor_2d();

module holes_2d() {
    translate([ring_x, ring_y]) circle(d = ring_hole_d);
    if (end_ring) end_ring_disk_2d(end_ring_hole_d);
}

module footprint_2d() difference() {
    union() {
        fill_holes() offset(r = base_offset) text_2d();
        translate([ring_x, ring_y]) circle(d = ring_outer_d);
        if (end_ring) end_ring_disk_2d(end_ring_outer_d);
    }
    holes_2d();
}

// ---------- 3D ----------
module base() linear_extrude(base_thickness) footprint_2d();
module text_layer()
    translate([0, 0, base_thickness]) linear_extrude(text_thickness)
        difference() { text_2d(); holes_2d(); }   // không để chữ che lỗ

if (part == "all") {
    color(color_base) base();
    color(color_text) text_layer();
}
else if (part == "base") base();
else if (part == "text") text_layer();
