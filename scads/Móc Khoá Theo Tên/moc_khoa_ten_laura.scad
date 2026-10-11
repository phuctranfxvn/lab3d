// ============================================================
//  Móc khoá Laura
//  Móc khoá tên 3 lớp: viền, nền màu và chữ nổi, in được nhiều màu (AMS)
//
//  LauraF.scad — dựng lại dạng tham số từ LauraF.3mf
//  "Customizable Multi-Color Name Keychain (AMS Ready)"
//  Giá trị mặc định tái tạo đúng bản gốc (font Pacifico, size 20).
//  Cần file Pacifico-Regular.ttf đặt cùng thư mục với file .scad
//  (hoặc cài font vào máy).
// ============================================================

/* [Chữ] */
name_text    = "Laura";
font_name    = "Pacifico";
text_size    = 20;      // chiều cao chữ (mm, theo cỡ font)
text_spacing = 1.024;   // khoảng cách ký tự

/* [Kích thước] */
base_thickness  = 3;    // độ dày lớp nền màu (mm)
raised_height   = 1.5;  // chữ và viền nhô cao hơn nền (mm)
bg_offset       = 3.5;  // nền màu nở ra quanh chữ (mm)
border_width    = 2;    // độ rộng viền ngoài (mm)
fill_letter_holes = true; // lấp các lỗ kín trong nền (vd. trong vòng chữ L)
// "auto" dùng fill() nếu OpenSCAD hỗ trợ; "closing" cho OpenSCAD 2021 (gần đúng)
fill_method = "auto"; // ["auto", "fill", "closing"]
closing_radius = 3;   // chỉ dùng khi fill_method = closing

/* [Vòng móc khóa] */
ring_x          = -3.5;   // tâm lỗ, trục X (mm)
ring_y          = 11.712; // tâm lỗ, trục Y (mm) — mặc định ≈ giữa chữ "Laura"
ring_outer_d    = 12;     // đường kính phần đế quanh lỗ (mm)
ring_hole_d     = 5;      // đường kính lỗ (mm)

/* [Hiển thị / xuất] */
// "all" = toàn bộ có màu; "white" / "accent" để xuất STL riêng từng màu (AMS)
part = "all"; // ["all", "white", "accent", "border", "background", "text"]
color_white  = "white";
color_accent = "#8E0FA0";
resolution   = 64;

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

// Nền màu, chưa đục lỗ móc
module accent_solid_2d() {
    fill_holes() offset(r = bg_offset) text_2d();
    translate([ring_x, ring_y]) circle(d = ring_outer_d);
}
module hole_2d() translate([ring_x, ring_y]) circle(d = ring_hole_d);

module accent_2d()    difference() { accent_solid_2d(); hole_2d(); }
module footprint_2d() difference() { offset(r = border_width) accent_solid_2d(); hole_2d(); }

// ---------- 3D ----------
module border()
    linear_extrude(base_thickness + raised_height)
        difference() { footprint_2d(); accent_2d(); }

module background()
    linear_extrude(base_thickness) accent_2d();

module text_layer()
    translate([0, 0, base_thickness]) linear_extrude(raised_height)
        intersection() { text_2d(); accent_2d(); }

if (part == "all") {
    color(color_white)  border();
    color(color_accent) background();
    color(color_white)  text_layer();
}
else if (part == "white")      { border(); text_layer(); }
else if (part == "accent")     background();
else if (part == "border")     border();
else if (part == "background") background();
else if (part == "text")       text_layer();
