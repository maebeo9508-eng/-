'use strict';
// assets/manifest.js 에 등록된 PNG를 불러와, 코드 그림 대신 사용합니다.
G.Assets = (function () {
  const sheets = {}; // key -> { state -> {img, frames, fps} , scale }
  const icons = {}; // key -> img
  let pending = 0;

  function loadImg(src, ok) {
    const img = new Image();
    pending++;
    img.onload = () => { pending--; ok(img); };
    img.onerror = () => { pending--; console.warn('[몽글타워] 에셋을 불러오지 못했어요:', src); };
    img.src = src;
  }

  function load() {
    const m = window.ASSET_MANIFEST || {};
    for (const key in m) {
      const def = m[key];
      if (def.src) {
        loadImg(def.src, (img) => {
          icons[key] = img;
          // 타이틀 로고 이미지가 있으면 글자 로고 대신 사용
          if (key === 'ui_logo') {
            const h1 = document.querySelector('.logo h1');
            if (h1) h1.innerHTML = `<img src="${img.src}" alt="몽글타워" style="max-width:min(86vw,520px);display:block;margin:0 auto">`;
          }
        });
        continue;
      }
      for (const state in def) {
        const a = def[state];
        if (!a || !a.src) continue;
        loadImg(a.src, (img) => {
          sheets[key] = sheets[key] || { scale: def.scale || 1 };
          sheets[key][state] = { img, frames: a.frames || 1, fps: a.fps || 8 };
        });
      }
    }
  }

  const FALLBACK = { walk: ['walk', 'idle'], idle: ['idle', 'walk'], attack: ['attack', 'walk', 'idle'], hurt: ['hurt', 'idle', 'walk'] };

  // 스프라이트를 그렸으면 true. (x, y)는 발밑 중심, h는 그림 높이(월드 단위)
  function draw(ctx, key, state, t, x, y, h, flip, alpha) {
    const s = sheets[key];
    if (!s) return false;
    let a = null;
    for (const st of FALLBACK[state] || [state, 'idle', 'walk']) { if (s[st]) { a = s[st]; break; } }
    if (!a) return false;
    const fw = a.img.width / a.frames, fh = a.img.height;
    const f = Math.floor(t * a.fps) % a.frames;
    const hh = h * s.scale, ww = hh * (fw / fh);
    ctx.save();
    if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(a.img, f * fw, 0, fw, fh, -ww / 2, -hh, ww, hh);
    ctx.restore();
    return true;
  }

  function has(key) { return !!sheets[key]; }
  function icon(key) { return icons[key] || null; }

  return { load, draw, has, icon, get pending() { return pending; } };
})();
