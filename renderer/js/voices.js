/*
 * Danh sách giọng VieNeu (bộ voices_v3_turbo, dùng khi tts_server chạy backend onnx).
 * Lấy từ gói vieneu 3.8.3 (vieneu/assets/voices_v3_turbo.json). 10 giọng nổi bật đứng đầu.
 * Giá trị lưu trong cài đặt là tên chuẩn; ALIASES đổi tên cũ (đã lưu từ bản trước) sang tên chuẩn.
 * Dùng cả trong trình duyệt (control.js) và trong test (module.exports).
 */
(() => {
  const VIENEU_VOICES = [
  {
    "name": "Adam bựa",
    "label": "Adam bựa — Nam · giọng Bắc · phong cách tự nhiên",
    "featured": true
  },
  {
    "name": "Trúc Ly",
    "label": "Trúc Ly — Nữ · giọng Bắc · phong cách tự nhiên",
    "featured": true
  },
  {
    "name": "Thiện Minh",
    "label": "Thiện Minh — Nam · giọng Bắc · phong cách kể chuyện",
    "featured": true
  },
  {
    "name": "Mai Anh",
    "label": "Mai Anh — Nữ · giọng Bắc · phong cách tin tức",
    "featured": true
  },
  {
    "name": "Hải Đăng",
    "label": "Hải Đăng — Nam · giọng Bắc · phong cách tự nhiên",
    "featured": true
  },
  {
    "name": "Thùy Dung",
    "label": "Thùy Dung — Nữ · giọng Nam · phong cách tin tức",
    "featured": true
  },
  {
    "name": "Thiền Tâm Đức",
    "label": "Thiền Tâm Đức — Nam · giọng Bắc · phong cách kể chuyện",
    "featured": true
  },
  {
    "name": "Ngọc Huyền",
    "label": "Ngọc Huyền — Nữ · giọng Bắc · giọng đọc tự nhiên",
    "featured": true
  },
  {
    "name": "Quang Sơn",
    "label": "Quang Sơn — Nam · giọng Trung · phong cách tự nhiên",
    "featured": true
  },
  {
    "name": "Ngọc Trân",
    "label": "Ngọc Trân — Nữ · giọng Trung · phong cách tự nhiên",
    "featured": true
  },
  {
    "name": "Adam",
    "label": "Adam — Nam · giọng Nam · giọng đọc tự nhiên",
    "featured": false
  },
  {
    "name": "Kim Thanh",
    "label": "Kim Thanh — Nữ · giọng Nam · phong cách đọc truyện",
    "featured": false
  },
  {
    "name": "Minh Triết",
    "label": "Minh Triết — Nam · giọng Nam · phong cách tin tức",
    "featured": false
  },
  {
    "name": "Minh Đức",
    "label": "Minh Đức — Nam · giọng Bắc · phong cách tin tức",
    "featured": false
  },
  {
    "name": "Mỹ Duyên",
    "label": "Mỹ Duyên — Nữ · giọng Nam · phong cách đọc truyện",
    "featured": false
  },
  {
    "name": "Ngọc Linh",
    "label": "Ngọc Linh — Nữ · giọng Bắc · phong cách kể chuyện",
    "featured": false
  },
  {
    "name": "Phạm Tuyên",
    "label": "Phạm Tuyên — Nam · giọng Bắc · phong cách tự nhiên",
    "featured": false
  },
  {
    "name": "Quốc Tuấn",
    "label": "Quốc Tuấn — Nam · giọng Bắc · phong cách tự nhiên",
    "featured": false
  },
  {
    "name": "Quỳnh Anh",
    "label": "Quỳnh Anh — Nữ · giọng Bắc · phong cách đọc truyện",
    "featured": false
  },
  {
    "name": "Thanh Bình",
    "label": "Thanh Bình — Nam · giọng Bắc · phong cách kể chuyện",
    "featured": false
  },
  {
    "name": "Thái Sơn",
    "label": "Thái Sơn — Nam · giọng Nam · phong cách kể chuyện",
    "featured": false
  },
  {
    "name": "Thục Đoan",
    "label": "Thục Đoan — Nữ · giọng Nam · phong cách kể chuyện",
    "featured": false
  },
  {
    "name": "Xuân Vĩnh",
    "label": "Xuân Vĩnh — Nam · giọng Bắc · phong cách tự nhiên",
    "featured": false
  },
  {
    "name": "Đoan Trang",
    "label": "Đoan Trang — Nữ · giọng Bắc · phong cách tự nhiên",
    "featured": false
  },
  {
    "name": "Đức Trí",
    "label": "Đức Trí — Nam · giọng Nam · phong cách đọc truyện",
    "featured": false
  }
];
  const VIENEU_DEFAULT = 'Hải Đăng';
  const VIENEU_ALIASES = {
  "Anh Khôi": "Thiện Minh",
  "Minh Quân Pro": "Hải Đăng",
  "Minh Quân": "Hải Đăng",
  "Mạnh Dũng": "Quốc Tuấn"
};
  // đưa tên (kể cả tên cũ) về tên chuẩn; tên không biết thì giữ nguyên để không mất lựa chọn
  const canonicalVoice = name => VIENEU_ALIASES[name] || name;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VIENEU_VOICES, VIENEU_DEFAULT, canonicalVoice };
  } else {
    window.VIENEU = { VIENEU_VOICES, VIENEU_DEFAULT, canonicalVoice };
  }
})();
