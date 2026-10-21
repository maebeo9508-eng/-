'use strict';
// 시작점: 화면 크기, 게임 루프, 화면 전환
G.View = { w: 0, h: 0, dpr: 1, scale: 1, vw: 320, vh: 600 };

G.Main = (function () {
  const $ = (id) => document.getElementById(id);
  let canvas, ctx;
  let screen = 'title';
  let last = 0, t = 0;

  function resize() {
    const V = G.View;
    V.w = window.innerWidth;
    V.h = window.innerHeight;
    V.dpr = Math.min(2, window.devicePixelRatio || 1);
    // 세로 화면에서는 가로 320 단위, 가로 화면에서는 세로 400 단위가 보이도록
    V.scale = Math.min(V.w / 320, V.h / 400);
    V.vw = V.w / V.scale;
    V.vh = V.h / V.scale;
    canvas.width = Math.round(V.w * V.dpr);
    canvas.height = Math.round(V.h * V.dpr);
    const st = G.Run.st;
    if (st && st.active && st.arena) G.World.renderGround(st.arena, st.stage, Math.min(2.5, V.scale * V.dpr));
  }

  function loop(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000 || 0);
    last = now;
    t += dt;
    G.Input.update();
    if (screen === 'run' && G.Run.st) {
      // 배속: 한 프레임에 여러 번 나눠서 진행 (충돌이 빠지지 않게)
      const steps = G.Run.st.speed || 1;
      for (let i = 0; i < steps && G.Run.st; i++) G.Run.update(dt);
      if (G.Run.st) G.Scene.drawRun(ctx, G.Run.st, t);
    } else {
      const panel = $('panel');
      const areaH = screen === 'camp' && panel ? panel.getBoundingClientRect().top + 20 : G.View.h * 0.8;
      G.Scene.drawCamp(ctx, t, areaH);
    }
    requestAnimationFrame(loop);
  }

  function show(id) {
    for (const s of ['title', 'camp']) $(s).classList.toggle('hidden', s !== id);
  }

  function newGame() {
    const s = G.Save.data;
    if (s.started) return;
    s.started = true;
    const w = G.Loot.makeItem('weapon', 1, 0, { wtype: 'sword', theme: 0 });
    const a = G.Loot.makeItem('armor', 1, 0, { variant: 0, theme: 0 });
    w.isNew = a.isNew = false;
    s.inv.push(w, a);
    s.eq.weapon = w.id;
    s.eq.armor = a.id;
    G.Save.persist();
  }

  function devBoost() {
    const s = G.Save.data;
    if (s.devDone) return;
    s.devDone = true;
    s.gold += 500000; s.gems += 5000; s.shards += 3000;
    s.checkpoint = Math.max(s.checkpoint, 90);
    s.best = Math.max(s.best, 90);
    for (const k in G.COMPANIONS) s.comps.owned[k] = s.comps.owned[k] || 1;
    for (const k in G.PETS) s.pets.owned[k] = s.pets.owned[k] || 1;
    for (let i = 1; i <= 9; i++) s.cleared[i] = true;
    s.chapters = 12;
    s.comps.team = ['gombang', 'tobi', 'pengpeng'];
    for (const sl of G.SLOTS) {
      const it = G.Loot.makeItem(sl, 60, 4);
      s.inv.push(it);
    }
    G.Save.persist();
  }

  function startFromTitle() {
    G.Sfx.init();
    const s = G.Save.data;
    if (!s.seen.prologue) {
      s.seen.prologue = true;
      G.Save.persist();
      $('title').classList.add('hidden');
      G.UI.dialogue(G.STORY.prologue, () => toCamp());
      return;
    }
    toCamp();
  }

  function toCamp() {
    screen = 'camp';
    G.Run.st = null;
    G.HUD.hide();
    G.Input.reset();
    G.Fx.clear();
    show('camp');
    G.Camp.render();
  }

  function startRun(floor) {
    G.Sfx.init();
    G.UI.fade(() => {
      show(null);
      screen = 'run';
      G.Input.reset();
      G.Run.start(floor);
      G.Sfx.play('portal');
    });
  }

  function boot() {
    canvas = $('game');
    ctx = canvas.getContext('2d');
    G.Save.load();
    newGame();
    if (G.dev) devBoost();
    G.Assets.load();
    G.Input.init(canvas);
    G.UI.init();
    G.HUD.init();
    G.Input.onKey = (code) => {
      if (G.UI.onKey(code)) return;
      if (screen !== 'run' || !G.Run.st || G.UI.modalOpen()) return;
      const st = G.Run.st;
      if (code === 'Space' || code === 'ShiftLeft') G.Player.dash();
      else if (code === 'KeyQ' || code === 'KeyJ') G.Player.skill(0);
      else if (code === 'KeyR') G.Player.potion();
      else if (code === 'KeyP') G.UI.pause();
      else if (code === 'KeyT') G.Actions.toggleAuto();
      else if (code === 'KeyF') G.Actions.toggleSpeed();
      else if (/^Digit[1-4]$/.test(code)) { const u = G.HUD.units(st)[+code.slice(5) - 1]; if (u) G.Team.useUlt(u); }
    };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && screen === 'run' && G.Run.st && G.Run.st.active && !G.UI.modalOpen()) G.UI.pause();
      if (document.hidden) G.Save.persist();
    });
    // iOS 더블탭 확대 방지
    document.addEventListener('dblclick', (e) => e.preventDefault());
    resize();
    show('title');
    requestAnimationFrame((n) => { last = n; loop(n); });
  }

  return { boot, toCamp, startRun, startFromTitle, newGame, get screen() { return screen; } };
})();

G.Actions.titleStart = () => G.Main.startFromTitle();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', G.Main.boot);
else G.Main.boot();
