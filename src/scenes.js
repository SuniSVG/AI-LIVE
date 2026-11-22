'use strict';

// Nền sân khấu. File nằm trong renderer/backgrounds/. 'none' = nền tối mặc định.
const SCENES = Object.freeze({
  'thien-cung': Object.freeze({ id: 'thien-cung', name: 'Thiên cung giữa biển mây', file: 'backgrounds/thien-cung.jpg' }),
  none: Object.freeze({ id: 'none', name: 'Nền tối (mặc định)', file: null })
});
const SCENE_IDS = Object.freeze(Object.keys(SCENES));

module.exports = { SCENES, SCENE_IDS };
