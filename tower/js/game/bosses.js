'use strict';
// 보스 패턴 라이브러리. 보스는 패턴을 돌아가며 쓰고, 체력 50% 이하에서 분노 패턴이 추가됩니다.
G.Bosses = (function () {
  const U = G.U, TAU = U.TAU;
  const C = () => G.Combat;
  const R = () => G.Run.st;
  const P_ = () => R().player;

  function at(e, delay, fn) { e.s.events.push({ t: e.s.pt + delay, fn }); }
  const proj = (e, extra) => Object.assign({ type: 'ball', color: e.def.bullet || '#ff8fab', speed: 125, r: 6 }, extra || {});
  const dmg = (e, m) => e.atk * (m || 1);
  const N = (e, a, b) => (e.s.rage ? b : a);

  const PAT = {
    ring: {
      dur: 1.6,
      start(e) {
        const n = N(e, 14, 20), off = Math.random();
        at(e, 0.35, () => { C().ring(e.x, e.y, n, proj(e), dmg(e, 0.8), off); e.squash = 0.25; G.Sfx.play('shoot'); });
        at(e, 0.95, () => { C().ring(e.x, e.y, n, proj(e), dmg(e, 0.8), off + Math.PI / n); e.squash = 0.25; });
      },
    },
    slam: {
      dur: 1.7,
      start(e) {
        const p = P_();
        const tx = U.clamp(p.x, e.r, R().arena.w - e.r), ty = U.clamp(p.y, e.r, R().arena.h - e.r);
        G.Run.addZone({ kind: 'circle', x: tx, y: ty, r: 72, warn: 0.85, dmg: dmg(e, 1.4), color: '#ff6b6b' });
        e.s.jump = { sx: e.x, sy: e.y, tx, ty, t: 0, dur: 0.85 };
        at(e, 0.85, () => {
          e.s.jump = null; e.hop = 0; e.squash = 0.35;
          C().ring(e.x, e.y, N(e, 10, 14), proj(e, { speed: 110 }), dmg(e, 0.7), Math.random());
          G.Fx.shake(9); G.Sfx.play('slam');
          G.Fx.burst(e.x, e.y + e.r * 0.7, '#ffffff', 16, 180, 5);
        });
      },
    },
    slam2: {
      dur: 3.2,
      start(e) { PAT.slam.start(e); at(e, 1.5, () => PAT.slam.start(e)); },
    },
    summon: {
      dur: 1.3,
      start(e) {
        e.squash = -0.2;
        const st = R();
        const alive = st.enemies.filter((x) => !x.dead && !x.boss).length;
        const n = Math.min(N(e, 3, 5), 12 - alive);
        for (let i = 0; i < n; i++) {
          const a = (i / Math.max(1, n)) * TAU + Math.random();
          const x = U.clamp(e.x + Math.cos(a) * (e.r + 40), 30, st.arena.w - 30);
          const y = U.clamp(e.y + Math.sin(a) * (e.r + 40), 30, st.arena.h - 30);
          C().queueSpawn(e.def.minion, x, y, {}, 0.7);
        }
        G.Fx.text(e.x, e.y - e.r - 10, '부하 소환!', '#ffd166', 13, { force: true });
      },
    },
    fan: {
      dur: 1.9,
      start(e) {
        for (const t of [0.3, 0.8, 1.3]) {
          at(e, t, () => {
            const p = P_();
            C().fan(e.x, e.y, U.angleTo(e.x, e.y, p.x, p.y), N(e, 5, 7), 0.9, proj(e, { speed: 160 }), dmg(e, 0.85));
            e.squash = 0.2; G.Sfx.play('shoot');
          });
        }
      },
    },
    nova: {
      dur: 1.6,
      start(e) {
        e.s.hold = 1.0;
        G.Run.addZone({ kind: 'circle', x: e.x, y: e.y, r: N(e, 120, 140), warn: 0.95, dmg: dmg(e, 1.3), color: '#b06cff', follow: e });
        at(e, 0.95, () => { G.Fx.shake(6); G.Sfx.play('boom'); e.squash = 0.3; });
      },
    },
    rain: {
      dur: 2.0,
      start(e) {
        const st = R(), p = P_();
        const n = N(e, 7, 10);
        for (let i = 0; i < n; i++) {
          const pt = i === 0 ? { x: p.x, y: p.y } : G.World.freePoint(st.arena, null, null, 0, 30);
          at(e, i * 0.08, () => G.Run.addZone({ kind: 'circle', x: pt.x, y: pt.y, r: 40, warn: 1.0, dmg: dmg(e, 1.2), color: '#ff9f1c', meteor: true }));
        }
      },
    },
    spiral: {
      dur: 2.7,
      start(e) {
        const base = Math.random() * TAU, arms = N(e, 2, 3);
        for (let t = 0.2; t < 2.35; t += 0.09) {
          at(e, t, () => {
            for (let k = 0; k < arms; k++) C().bullet(e.x, e.y, base + t * 2.6 + (k * TAU) / arms, proj(e, { speed: 120 }), dmg(e, 0.7));
          });
        }
        at(e, 0.2, () => G.Sfx.play('shoot'));
      },
    },
    laser: {
      dur: 1.7,
      start(e) {
        e.s.hold = 1.3;
        G.Run.addZone({ kind: 'line', x: e.x, y: e.y, ang: 0, len: 760, w: 18, warn: 0.9, active: 0.35, dmg: dmg(e, 1.3), follow: e, track: P_(), lock: 0.3, color: '#ff4d6d' });
      },
    },
    laser3: {
      dur: 1.8,
      start(e) {
        e.s.hold = 1.4;
        for (const off of [-0.5, 0, 0.5]) {
          G.Run.addZone({ kind: 'line', x: e.x, y: e.y, ang: 0, len: 760, w: 16, warn: 1.0, active: 0.35, dmg: dmg(e, 1.2), follow: e, track: P_(), trackOff: off, lock: 0.3, color: '#ff4d6d' });
        }
      },
    },
    teleport: {
      dur: 1.4,
      start(e) {
        e.s.fade = -1;
        at(e, 0.35, () => {
          const p = P_();
          const pt = G.World.freePoint(R().arena, p.x, p.y, 170, e.r + 10);
          G.Fx.burst(e.x, e.y, e.look.color, 14, 140, 4, { shape: 'star' });
          e.x = pt.x; e.y = pt.y;
          e.s.fade = 1;
        });
        at(e, 0.75, () => { C().ring(e.x, e.y, N(e, 12, 16), proj(e), dmg(e, 0.8), Math.random()); e.s.fade = 0; e.alpha = 1; });
      },
    },
    charge: {
      dur: 2.1,
      start(e) {
        const p = P_();
        const a = U.angleTo(e.x, e.y, p.x, p.y);
        e.s.hold = 0.7;
        G.Run.addZone({ kind: 'line', x: e.x, y: e.y, ang: a, len: 520, w: e.r * 1.7, warn: 0.7, active: 0, dmg: 0, follow: e, ghost: true });
        at(e, 0.7, () => { e.s.charge = { a, t: 0.95 }; e.dashing = true; });
      },
    },
    breath: {
      dur: 2.1,
      start(e) {
        e.s.hold = 1.8;
        const p = P_();
        const a0 = U.angleTo(e.x, e.y, p.x, p.y);
        for (let t = 0.3; t < 1.7; t += 0.07) {
          at(e, t, () => C().bullet(e.x, e.y, a0 + Math.sin(t * 4.5) * 0.55, { type: 'fire', color: '#ff9f1c', speed: 190, r: 6 }, dmg(e, 0.6)));
        }
      },
    },
    clock: {
      dur: 3.5,
      start(e) {
        e.s.hold = 3.3;
        const a = Math.random() * TAU;
        const spin = N(e, 1.1, 1.5);
        G.Run.addZone({ kind: 'rotline', follow: e, ang: a, spin, len: 340, w: 14, warn: 0.9, active: 2.4, dmg: dmg(e, 1.0), color: '#ffe66d' });
        G.Run.addZone({ kind: 'rotline', follow: e, ang: a + Math.PI * 0.66, spin: spin * 0.7, len: 250, w: 14, warn: 0.9, active: 2.4, dmg: dmg(e, 1.0), color: '#ffe66d' });
      },
    },
  };

  function init(e) {
    e.s = { idle: 1.6, events: [], pt: 0, pat: null, order: [], rage: false, hold: 0, fade: 0 };
  }

  function nextPattern(e) {
    const s = e.s;
    if (!s.order.length) {
      const list = e.def.patterns.concat(s.rage ? e.def.rage : []);
      s.order = U.shuffle(list.slice());
    }
    s.pat = s.order.shift();
    s.pt = 0;
    s.events = [];
    PAT[s.pat].start(e);
  }

  function update(e, dt) {
    const s = e.s, p = P_();
    if (!s.rage && e.hp < e.maxHp * 0.5) {
      s.rage = true;
      s.order = [];
      if (e.def.rageLook) e.look = e.def.rageLook;
      G.Fx.text(e.x, e.y - e.r - 14, '화가 났다!', '#ff4d6d', 16, { force: true });
      G.Fx.ring(e.x, e.y, e.r, e.r * 3, '#ff4d6d', 0.5, 6);
      G.Fx.shake(8);
      G.Sfx.play('boss');
    }
    if (e.frozenT > 0) return;

    if (s.jump) {
      const j = s.jump;
      j.t += dt;
      const k = Math.min(1, j.t / j.dur);
      e.x = U.lerp(j.sx, j.tx, k); e.y = U.lerp(j.sy, j.ty, k);
      e.hop = Math.sin(k * Math.PI) * 90;
      e.moving = true;
    }
    if (s.charge) {
      const c = s.charge;
      c.t -= dt;
      e.x += Math.cos(c.a) * 430 * dt; e.y += Math.sin(c.a) * 430 * dt;
      e.face = Math.cos(c.a) < 0 ? -1 : 1;
      e.moving = true;
      const ox = e.x, oy = e.y;
      const wall = G.World.collide(e, R().arena);
      if (c.t <= 0 || wall || Math.abs(ox - e.x) + Math.abs(oy - e.y) > 0.5) {
        s.charge = null; e.dashing = false;
        if (wall) {
          G.Fx.shake(8); G.Sfx.play('slam');
          C().ring(e.x, e.y, N(e, 10, 14), proj(e), dmg(e, 0.7), Math.random());
        }
      }
    }
    if (s.fade < 0) e.alpha = Math.max(0.05, e.alpha - dt * 4);
    else if (s.fade > 0) e.alpha = Math.min(1, e.alpha + dt * 3);
    e.invuln = e.alpha < 0.5;

    if (s.pat) {
      s.pt += dt;
      for (let i = s.events.length - 1; i >= 0; i--) {
        if (s.pt >= s.events[i].t) { const ev = s.events[i]; s.events.splice(i, 1); ev.fn(); }
      }
      if (s.hold > 0) { s.hold -= dt; e.moving = !!(s.jump || s.charge); }
      else if (!s.jump && !s.charge) idleMove(e, dt, p, 0.45);
      if (s.pt >= PAT[s.pat].dur && !s.events.length && !s.jump && !s.charge) {
        s.pat = null;
        s.idle = s.rage ? U.rand(0.35, 0.6) : U.rand(0.7, 1.1);
      }
    } else {
      idleMove(e, dt, p, 1);
      s.idle -= dt;
      if (s.idle <= 0) nextPattern(e);
    }
    G.AI.faceTo(e, p.x);
  }

  function idleMove(e, dt, p, mul) {
    const d = U.dist(e.x, e.y, p.x, p.y);
    if (d > 110) G.AI.steer(e, p.x, p.y, e.spd * mul, dt, true);
    else e.moving = false;
  }

  return { init, update, PAT };
})();
