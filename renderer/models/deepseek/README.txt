DeepSeek-chan (Live2D Cubism 4), nhân vật thứ 4.
Nguồn: "DeepSeek-chan Free Live2D Model + Layered PSD" (xem điều khoản sử dụng trong gói gốc).

Thư mục này là bản runtime, tên file đã đổi sang ASCII để tránh lỗi đường dẫn:
  deepseek.model3.json   khai báo moc3, texture, physics, cdi (biểu cảm và motion do app tự đăng ký)
  exp/                   23 biểu cảm (.exp3.json), tên file = tên biểu cảm trong tuning.json
  motions/               8 motion (.motion3.json); IDLE.motion3.json là chuyển động khi rảnh,
                         các file khác thành nhóm: raise_hand, lower_hand, finger_up, finger_down,
                         grass_in, grass_out, show
Thêm biểu cảm/motion: bỏ file vào exp/ hoặc motions/, rồi thêm tên vào tuning.json nếu muốn AI dùng.
Hiệu chỉnh riêng: tuning.json cùng thư mục.
