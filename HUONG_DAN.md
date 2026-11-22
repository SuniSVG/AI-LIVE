# Hướng dẫn chạy Kurumi Desktop

## Yêu cầu
- Node.js 18 trở lên (tải tại https://nodejs.org)
- (Tùy chọn) Gemini API key để Kurumi trả lời thật (lấy miễn phí tại https://aistudio.google.com/apikey)

## Cài đặt và chạy
Mở terminal trong thư mục kurumi-desktop:

```
npm install
npm start
```

Lần đầu, `npm install` sẽ tải Electron nên hơi lâu.

## Bật câu trả lời thật
Không có key thì app vẫn mở, Kurumi chỉ báo chưa kết nối.

- Windows PowerShell:
  ```
  $env:GEMINI_API_KEY="sk-..."; npm start
  ```
- macOS / Linux:
  ```
  GEMINI_API_KEY=sk-... npm start
  ```

## Về motion (.mtn)
Bản này chưa có file `.mtn`, nên `model.json` đã bỏ mục `motions`. Nhân vật vẫn hiển thị, vẫn đổi biểu cảm và mấp máy miệng, chỉ không có chuyển động cơ thể theo motion.

Khi có đủ `id4.mtn`, `id4_1.mtn` … `id4_6.mtn`:
1. Đặt các file vào `renderer/models/kurumi/motions/`.
2. Mở `renderer/models/kurumi/model.json`, thêm lại mục `"motions"` (có thể lấy từ bản gốc bạn đã gửi).
3. Chạy lại `npm start`.

## Thư viện Live2D
Các file trong `renderer/vendor/` (pixi.min.js, live2d.min.js, pixi-live2d.min.js) và `renderer/js/avatar.js` đã có sẵn. Không cần cài thêm.

## Lỗi thường gặp
- **Màn hình hiện "Kurumi chưa chuyển động được":** mở DevTools (Ctrl+Shift+I) xem lỗi trong Console, thường do thiếu file model hoặc texture.
- **Không nhận được tin nhắn:** kiểm tra đã đặt `GEMINI_API_KEY` trước khi chạy chưa.
