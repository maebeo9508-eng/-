'use strict';
// assets/manifest.js 에 등록된 PNG를 불러와, 코드 그림 대신 사용합니다.
// 동작(애니메이션)은 두 종류예요.
//  - 반복: idle(서 있기), walk(걷기) — 개체의 시계에 맞춰 계속 돌아감
//  - 한 번: attack(공격), hurt(피격), ult(궁극기), cast(보스 기술), die(기절) — 행동한 순간 처음 프레임부터 한 번 재생
G.Assets = (function () {
  const sheets = {}; // key -> { scale, shadow, [state]: { img, white, frames, fps, loop, anchor } }
  const icons = {}; // key -> img
  let pending = 0;

  const LOOPING = { idle: true, walk: true };
  // 그 동작 그림이 없을 때 대신 쓸 동작
  const FALLBACK = {
    idle: ['idle', 'walk'],
    walk: ['walk', 'idle'],
    attack: ['attack'],
    hurt: ['hurt'],
    ult: ['ult', 'attack'],
    cast: ['cast', 'attack'],
    die: ['die', 'hurt'],
  };

  function loadImg(src, ok) {
    const img = new Image();
    pending++;
    img.onload = () => { pending--; ok(img); };
    img.onerror = () => { pending--; console.warn('[몽글타워] 에셋을 불러오지 못했어요:', src); };
    img.src = src;
  }

  // 맞았을 때 하얗게 번쩍이는 용도의 실루엣
  function whiteOf(img) {
    try {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, c.width, c.height);
      return c;
    } catch (e) { return null; }
  }

  function load() {
    // manifest.auto.js(가져오기 도구가 자동 작성) 위에 manifest.js(직접 작성)를 덮어써요
    const m = Object.assign({}, window.ASSET_MANIFEST_AUTO || {}, window.ASSET_MANIFEST || {});
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
        if (!a || typeof a !== 'object' || !a.src) continue;
        loadImg(a.src, (img) => {
          sheets[key] = sheets[key] || { scale: def.scale || 1, shadow: def.shadow !== false };
          sheets[key][state] = {
            img, white: whiteOf(img), frames: a.frames || 1, fps: a.fps || 8,
            loop: a.loop != null ? !!a.loop : !!LOOPING[state],
            anchor: a.anchor != null ? a.anchor : 1, // 발이 프레임 위에서 몇 % 지점에 있는지 (1 = 맨 아래)
          };
        });
      }
    }
  }

  function pick(s, state) {
    for (const st of FALLBACK[state] || [state]) if (s[st]) return s[st];
    return null;
  }

  function blit(ctx, s, a, local, x, y, h, flip, alpha, flash) {
    const fw = a.img.width / a.frames, fh = a.img.height;
    const n = Math.floor(local * a.fps);
    const f = a.loop ? ((n % a.frames) + a.frames) % a.frames : Math.min(a.frames - 1, Math.max(0, n));
    const hh = h * s.scale, ww = hh * (fw / fh);
    ctx.save();
    if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(a.img, f * fw, 0, fw, fh, -ww / 2, -hh * a.anchor, ww, hh);
    if (flash > 0 && a.white) {
      ctx.globalAlpha *= Math.min(1, flash * 8);
      ctx.drawImage(a.white, f * fw, 0, fw, fh, -ww / 2, -hh * a.anchor, ww, hh);
    }
    ctx.restore();
  }

  // 단순 그리기 (마을 장면·초상화). (x, y)는 발밑 중심, h는 그림 높이(월드 단위)
  function draw(ctx, key, state, t, x, y, h, flip, alpha) {
    const s = sheets[key];
    if (!s) return false;
    const a = pick(s, state) || pick(s, 'idle');
    if (!a) return false;
    blit(ctx, s, a, t, x, y, h, flip, alpha, 0);
    return true;
  }

  // 한 번 재생하는 동작 시작 (공격·피격·궁극기 등)
  function trigger(ent, state, force) {
    if (!ent) return;
    const cur = ent.oneShot;
    // 막 시작해서 아직 한 번도 그려지지 않은 동작도 재생 중으로 봐요
    const playing = cur && ((ent.t || 0) - cur.start) < Math.max(cur.dur, cur.drawn ? 0 : 0.05);
    if (!force && playing) {
      if (cur.state === state) return; // 같은 동작이 아직 재생 중이면 처음부터 다시 하지 않아요
      if (state === 'hurt') return; // 피격은 공격·궁극기 등을 끊지 않아요
    }
    ent.oneShot = { state, start: ent.t || 0, dur: 0 };
  }

  // 개체 그리기: 한 번 재생 중인 동작이 있으면 그것, 아니면 기본 동작(base)
  function drawEnt(ctx, key, ent, base, x, y, h, flip, alpha, flash) {
    const s = sheets[key];
    if (!s) return false;
    const t = ent.t || 0;
    const os = ent.oneShot;
    if (os) {
      const a = pick(s, os.state);
      const el = t - os.start;
      const dur = a ? a.frames / a.fps : 0;
      os.dur = dur;
      os.drawn = true;
      if (el < dur) {
        shadow(ctx, s, x, y, h);
        blit(ctx, s, a, el, x, y, h, flip, alpha, flash);
        return true;
      }
      ent.oneShot = null; // 다 재생했거나, 그 동작 그림이 없으면 기본 동작으로
    }
    const a = pick(s, base) || pick(s, 'idle');
    if (!a) return false;
    let local = t;
    if (base === 'die') local = t - (ent.downAt || 0);
    shadow(ctx, s, x, y, h);
    blit(ctx, s, a, local, x, y, h, flip, alpha, flash);
    return true;
  }

  function shadow(ctx, s, x, y, h) {
    if (!s.shadow) return;
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.03, h * 0.3, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,20,60,0.2)';
    ctx.fill();
  }

  // 그 동작을 한 번 재생하는 데 걸리는 시간(초). 그림이 없으면 0
  function duration(key, state) {
    const s = sheets[key];
    const a = s && s[state];
    return a ? a.frames / a.fps : 0;
  }

  function has(key) { return !!sheets[key]; }
  function hasState(key, state) { return !!(sheets[key] && sheets[key][state]); }
  function icon(key) { return icons[key] || null; }

  return { load, draw, drawEnt, trigger, duration, has, hasState, icon, get pending() { return pending; } };
})();
