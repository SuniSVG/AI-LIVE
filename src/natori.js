'use strict';

// Hiệu chỉnh riêng cho Natori (Live2D Cubism 4, file *.model3.json).
// Natori khác Kurumi: tham số dạng ParamAngleX (không phải PARAM_ANGLE_X), biểu cảm là file .exp3.json,
// chuyển động là .motion3.json đặt tên theo nhóm trong model3.json. Phần này đổi tên nhóm cho AI dễ chọn
// và đặt tên cho vùng chạm, còn biểu cảm/khung hình/cử chỉ nằm ở renderer/models/natori/tuning.json.

// Tên nhóm gốc trong model3.json -> tên ngắn mà AI được phép chọn (nhóm Idle giữ nguyên, tự chạy khi rảnh).
const GROUP_ALIASES = Object.freeze({
  'Tap': 'tap',
  'FlickUp@Head': 'head_up',
  'Flick@Body': 'body_swing',
  'FlickDown@Body': 'body_down',
  'Tap@Head': 'head_pat'
});

// Id vùng chạm trong model -> tên vùng (model gốc để trống tên nên không nhận được cú chạm)
const HIT_NAMES = Object.freeze({ HitAreaHead: 'head', HitAreaBody: 'body' });

const isIdle = g => /^idle$/i.test(g);

// Trả về model3.json đã đổi tên nhóm motion và đặt tên vùng chạm. Không sửa đối tượng gốc.
function buildModel3Json(base) {
  const out = JSON.parse(JSON.stringify(base));
  const refs = out.FileReferences || (out.FileReferences = {});
  if (refs.Motions) {
    const renamed = {};
    for (const [g, list] of Object.entries(refs.Motions)) {
      const name = isIdle(g) ? 'Idle' : (GROUP_ALIASES[g] || String(g).replace(/[^\w.-]/g, '_').toLowerCase());
      renamed[name] = (renamed[name] || []).concat(list);
    }
    refs.Motions = renamed;
  }
  out.HitAreas = (out.HitAreas || []).map(h => ({ ...h, Name: HIT_NAMES[h.Id] || h.Name || h.Id }));
  return out;
}

// Các nhóm motion mà AI được chọn (mọi nhóm trừ Idle), đã theo tên mới.
function motionGroupsOf(model3) {
  const m = buildModel3Json(model3).FileReferences.Motions || {};
  return Object.keys(m).filter(g => !isIdle(g) && Array.isArray(m[g]) && m[g].length).sort();
}

module.exports = { GROUP_ALIASES, HIT_NAMES, buildModel3Json, motionGroupsOf };
