// =====================================================
//  Móc khoá Antonio
//  Đế viền theo chữ, chữ nổi và khoen treo bên trái
//
//  Tái tạo từ ParametricModelMaker.3mf
// =====================================================

/* [Nội dung] */
name_text   = "Antonio";   // Tên hiển thị
font_name   = "Lobster";   // Font gốc: Lobster (Google Fonts) - cần cài vào máy
text_size   = 12;          // Cỡ chữ (mm)
letter_spacing = 1.024;    // Giãn chữ

/* [Độ dày] */
base_height = 2;           // Đế (mm)
text_height = 1;           // Chữ nổi trên đế (mm)

/* [Viền đế] */
border      = 2.3;         // Độ rộng viền quanh chữ (mm)

/* [Khoen treo] */
ring_outer_d = 7;          // Đường kính ngoài khoen
hole_d       = 3;          // Đường kính lỗ
ring_offset  = [-2.0, 6.0];  // Tâm khoen [x, y] so với gốc chữ (mép trái, đường baseline)

$fn = 64;

module name_2d() {
    text(name_text, size = text_size, font = font_name,
         spacing = letter_spacing, halign = "left", valign = "baseline");
}

module base_2d() {
    union() {
        offset(delta = border) name_2d();
        translate(ring_offset) circle(d = ring_outer_d);
    }
}

// Đế
color("MediumBlue")
linear_extrude(height = base_height)
    difference() {
        base_2d();
        translate(ring_offset) circle(d = hole_d);
    }

// Chữ nổi
color("LightGray")
translate([0, 0, base_height])
    linear_extrude(height = text_height)
        name_2d();
