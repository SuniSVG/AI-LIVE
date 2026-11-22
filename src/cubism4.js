'use strict';

// Tự đăng ký biểu cảm (.exp3.json) và chuyển động (.motion3.json) cho mọi model Live2D Cubism 4.
// Quy tắc:
//  - exp/<ten>.exp3.json  -> biểu cảm tên <ten> (Expressions trong model3.json)
//  - motions/<ten>.motion3.json -> nhóm motion <ten>; file IDLE* vào nhóm Idle (tự chạy khi rảnh)
// File đã được khai báo sẵn trong model3.json thì giữ nguyên, không đăng ký lần nữa.
// Hàm thuần: không đụng ổ đĩa, nhận danh sách đường dẫn tương đối (dạng posix) để kiểm thử dễ.

const EXP_RE = /^exp\/([^/]+)\.exp3\.json$/i;
const MOTION_RE = /^motions\/([^/]+)\.motion3\.json$/i;

function registerFolderFiles(model3, files) {
  const out = JSON.parse(JSON.stringify(model3));
  const refs = out.FileReferences || (out.FileReferences = {});
  const expressions = Array.isArray(refs.Expressions) ? refs.Expressions : [];
  const motions = refs.Motions || {};
  const knownExp = new Set(expressions.map(e => e.File));
  const knownMotion = new Set(Object.values(motions).flat().map(m => m.File));
  const usedNames = new Set(expressions.map(e => e.Name));

  for (const f of [...files].sort()) {
    const exp = f.match(EXP_RE);
    if (exp && !knownExp.has(f) && !usedNames.has(exp[1])) {
      expressions.push({ Name: exp[1], File: f });
      usedNames.add(exp[1]);
      continue;
    }
    const mot = f.match(MOTION_RE);
    if (mot && !knownMotion.has(f)) {
      const group = /^idle/i.test(mot[1]) ? 'Idle' : mot[1];
      (motions[group] = motions[group] || []).push({ File: f });
    }
  }

  if (expressions.length) refs.Expressions = expressions;
  if (Object.keys(motions).length) refs.Motions = motions;
  return out;
}

// Danh sách file con cần quét trong thư mục model (exp/ và motions/), dạng đường dẫn tương đối
function folderFileList(fsApi, dirAbs) {
  const res = [];
  for (const sub of ['exp', 'motions']) {
    let names = [];
    try { names = fsApi.readdirSync(require('path').join(dirAbs, sub)); } catch (_) { names = []; }
    for (const n of names) res.push(`${sub}/${n}`);
  }
  return res;
}

// Tên nhóm motion dùng được trong sân khấu: chỉ chữ, số, gạch dưới, gạch ngang. Nhóm Idle giữ nguyên tên.
const isIdle = g => /^idle$/i.test(g);
function groupName(g) {
  return isIdle(g) ? 'Idle' : String(g).replace(/[^\w.-]/g, '_');
}

// model3.json đầy đủ cho sân khấu: khai báo gốc + biểu cảm/motion trong thư mục model.
// Bản gốc không bị sửa. Không có đường dẫn ổ đĩa nào trong kết quả ngoài đường dẫn tương đối của file.
function composeModel3(base, files) {
  const out = registerFolderFiles(base, files);
  const motions = out.FileReferences.Motions;
  if (motions) {
    const renamed = {};
    for (const [g, list] of Object.entries(motions)) {
      const name = groupName(g);
      renamed[name] = (renamed[name] || []).concat(list);
    }
    out.FileReferences.Motions = renamed;
  }
  return out;
}

// Các nhóm motion mà AI được chọn (mọi nhóm trừ Idle), sắp theo tên.
function motionGroupsOf(model3) {
  const m = (model3 && model3.FileReferences && model3.FileReferences.Motions) || {};
  return Object.keys(m).filter(g => !isIdle(g) && Array.isArray(m[g]) && m[g].length).sort();
}

module.exports = { registerFolderFiles, folderFileList, composeModel3, motionGroupsOf };
