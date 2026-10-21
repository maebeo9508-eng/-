'use strict';
// 몬스터 행동 패턴 15종. 모두 "예고 → 공격" 순서라 눈으로 보고 피할 수 있어요.
G.AI = (function () {
  const U = G.U, TAU = U.TAU;
  const C = () => G.Combat;
  const R = () => G.Run.st;

  // 노릴 팀원 고르기: 도발 중인 탱커가 우선, 아니면 가장 가까운 팀원 (0.6초마다 다시 고름)
  function target(e) {
    const st = R();
    const s = e.s;
    const cur = s.tg;
    const valid = cur && (cur === st.player ? !cur.dead : !cur.down && st.allies.includes(cur));
    if (valid && st.time < (s.tgUntil || 0)) return cur;
    let best = null, bd = Infinity;
    for (const t of st.taunters || []) {
      const d = U.dist(e.x, e.y, t.x, t.y);
      if (d < (t.tauntT > 0 ? 600 : 160) && d < bd) { bd = d; best = t; }
    }
    if (!best) {
      for (const u of G.Team.members(st)) {
        const d = U.dist2(e.x, e.y, u.x, u.y);
        if (d < bd) { bd = d; best = u; }
      }
    }
    s.tg = best || st.player;
    s.tgUntil = st.time + 0.6;
    return s.tg;
  }

  function steer(e, tx, ty, spd, dt, fly) {
    const st = R();
    let dx = tx - e.x, dy = ty - e.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    if (!fly) {
      // 앞을 막는 장애물을 옆으로 비켜 갑니다
      for (const o of st.arena.obstacles) {
        const ox = o.x - e.x, oy = o.y - e.y;
        const od = Math.hypot(ox, oy);
        if (od > o.r + e.r + 40 || od < 1) continue;
        const ahead = (ox * dx + oy * dy) / od;
        if (ahead < 0.3) continue;
        const side = ox * dy - oy * dx > 0 ? 1 : -1;
        const px = -dy * side, py = dx * side;
        dx += px * 0.9 * ahead;
        dy += py * 0.9 * ahead;
      }
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
    }
    const m = C().speedMul(e);
    e.x += dx * spd * m * dt;
    e.y += dy * spd * m * dt;
    e.moving = spd * m > 1;
    if (Math.abs(dx) > 0.15) e.face = dx < 0 ? -1 : 1;
  }

  function faceTo(e, x) { e.face = x < e.x ? -1 : 1; }

  function shootAt(e, tg, def) {
    const a = U.angleTo(e.x, e.y, tg.x, tg.y);
    C().fan(e.x, e.y, a, def.count || 1, def.spread || 0.3, def.proj, e.atk * 0.9);
    e.squash = 0.18;
    G.Sfx.play('shoot');
  }

  // 원래 행동에 원거리 공격이 붙은 몬스터용
  function sideShoot(e, dt, tg) {
    const def = e.def;
    if (!def.proj || e.ai === 'shooter') return;
    e.cd -= dt;
    if (e.cd <= 0 && U.dist2(e.x, e.y, tg.x, tg.y) < 280 * 280) {
      e.cd = def.cd || 2.5;
      shootAt(e, tg, def);
    }
  }

  const A = {
    chase(e, dt) {
      const tg = target(e);
      steer(e, tg.x, tg.y, e.spd, dt);
      sideShoot(e, dt, tg);
    },

    shooter(e, dt) {
      const tg = target(e), def = e.def;
      const d = U.dist(e.x, e.y, tg.x, tg.y);
      const range = def.range || 180;
      if (e.s.wind > 0) {
        e.s.wind -= dt;
        e.moving = false;
        faceTo(e, tg.x);
        if (e.s.wind <= 0) { shootAt(e, tg, def); e.cd = def.cd; }
        return;
      }
      if (d > range) steer(e, tg.x, tg.y, e.spd, dt);
      else if (d < range * 0.55) steer(e, e.x * 2 - tg.x, e.y * 2 - tg.y, e.spd * 0.9, dt);
      else {
        e.s.strafe = e.s.strafe || (Math.random() < 0.5 ? 1 : -1);
        if (Math.random() < dt * 0.4) e.s.strafe *= -1;
        const a = U.angleTo(tg.x, tg.y, e.x, e.y) + e.s.strafe * 0.6;
        steer(e, tg.x + Math.cos(a) * d, tg.y + Math.sin(a) * d, e.spd * 0.6, dt);
        faceTo(e, tg.x);
      }
      e.cd -= dt;
      if (e.cd <= 0 && d < range + 50) e.s.wind = 0.35;
    },

    dasher(e, dt) {
      const tg = target(e), s = e.s, def = e.def;
      s.state = s.state || 'go';
      if (s.state === 'go') {
        steer(e, tg.x, tg.y, e.spd, dt, e.look.float);
        e.cd -= dt;
        if (e.cd <= 0 && U.dist2(e.x, e.y, tg.x, tg.y) < 170 * 170) {
          s.state = 'wind'; s.t = 0.5;
          s.a = U.angleTo(e.x, e.y, tg.x, tg.y);
          G.Run.addZone({ kind: 'line', x: e.x, y: e.y, ang: s.a, len: (def.dashSpd || 300) * (def.dashT || 0.45), w: e.r * 1.6, warn: 0.5, active: 0, dmg: 0, follow: e, ghost: true });
        }
      } else if (s.state === 'wind') {
        s.t -= dt; e.moving = false; e.squash = 0.12;
        if (s.t <= 0) { s.state = 'dash'; s.t = def.dashT || 0.45; e.dashing = true; }
      } else if (s.state === 'dash') {
        s.t -= dt;
        const sp = (def.dashSpd || 300) * C().speedMul(e);
        e.x += Math.cos(s.a) * sp * dt; e.y += Math.sin(s.a) * sp * dt;
        e.moving = true; e.face = Math.cos(s.a) < 0 ? -1 : 1;
        if (Math.random() < 0.5) G.Fx.burst(e.x, e.y + e.r * 0.6, '#ffffff', 1, 20, 3);
        if (s.t <= 0) { s.state = 'rest'; s.t = 0.6; e.dashing = false; }
      } else {
        s.t -= dt; e.moving = false;
        if (s.t <= 0) { s.state = 'go'; e.cd = U.rand(1.2, 2); }
      }
    },

    jumper(e, dt) {
      const tg = target(e), s = e.s;
      if (s.jump) {
        const j = s.jump;
        j.t += dt;
        const k = Math.min(1, j.t / j.dur);
        e.x = U.lerp(j.sx, j.tx, k); e.y = U.lerp(j.sy, j.ty, k);
        e.hop = Math.sin(k * Math.PI) * 34;
        e.moving = true;
        if (k >= 1) {
          s.jump = null; e.hop = 0; e.squash = 0.3;
          G.Fx.burst(e.x, e.y + e.r * 0.8, '#ffffff', 6, 70, 3);
          G.Fx.ring(e.x, e.y + e.r * 0.5, 4, e.r + 26, 'rgba(255,255,255,0.8)', 0.25, 3);
          for (const u of G.Team.members(R())) if (U.dist(e.x, e.y, u.x, u.y) < e.r + 26 + u.r) G.Run.hurtUnit(u, e.atk);
          e.cd = U.rand(1.0, 1.6);
        }
        return;
      }
      steer(e, tg.x, tg.y, e.spd * 0.35, dt);
      e.cd -= dt;
      if (e.cd <= 0 && U.dist2(e.x, e.y, tg.x, tg.y) < 230 * 230) {
        const a = U.angleTo(e.x, e.y, tg.x, tg.y);
        const dist = Math.min(110, U.dist(e.x, e.y, tg.x, tg.y));
        s.jump = { t: 0, dur: 0.5, sx: e.x, sy: e.y, tx: e.x + Math.cos(a) * dist, ty: e.y + Math.sin(a) * dist };
        G.Run.addZone({ kind: 'circle', x: s.jump.tx, y: s.jump.ty, r: e.r + 26, warn: 0.5, dmg: 0, ghost: true });
      }
    },

    flyer(e, dt) {
      const tg = target(e), s = e.s;
      s.ph = (s.ph || Math.random() * 6) + dt * 3;
      const a = U.angleTo(e.x, e.y, tg.x, tg.y);
      const d = U.dist(e.x, e.y, tg.x, tg.y);
      const want = e.def.proj ? 120 : 0;
      const dir = d > want ? 1 : -0.6;
      const wob = Math.sin(s.ph) * 1.1;
      steer(e, e.x + Math.cos(a) * dir * 50 - Math.sin(a) * wob * 40, e.y + Math.sin(a) * dir * 50 + Math.cos(a) * wob * 40, e.spd, dt, true);
      if (e.def.proj) {
        e.cd -= dt;
        if (e.cd <= 0 && d < 300) { e.cd = e.def.cd; shootAt(e, tg, e.def); }
      }
    },

    blinker(e, dt) {
      const tg = target(e), s = e.s, def = e.def;
      s.state = s.state || 'idle';
      e.moving = false;
      faceTo(e, tg.x);
      if (s.state === 'idle') {
        e.cd -= dt;
        if (e.cd <= 0) { s.state = 'out'; s.t = 0.3; }
      } else if (s.state === 'out') {
        s.t -= dt; e.alpha = Math.max(0.1, s.t / 0.3); e.invuln = true;
        if (s.t <= 0) {
          const a = Math.random() * TAU, dist = U.rand(100, 170);
          e.x = U.clamp(tg.x + Math.cos(a) * dist, 30, R().arena.w - 30);
          e.y = U.clamp(tg.y + Math.sin(a) * dist, 30, R().arena.h - 30);
          G.World.collide(e, R().arena);
          s.state = 'in'; s.t = 0.35;
          G.Fx.burst(e.x, e.y, e.look.color, 8, 80, 3, { shape: 'star' });
        }
      } else if (s.state === 'in') {
        s.t -= dt; e.alpha = 1 - Math.max(0, s.t / 0.35) * 0.8;
        if (s.t <= 0) {
          e.alpha = 1; e.invuln = false; s.state = 'idle'; e.cd = def.cd;
          if ((def.count || 1) >= 5) C().ring(e.x, e.y, def.count, def.proj, e.atk * 0.85, Math.random());
          else shootAt(e, tg, def);
        }
      }
    },

    turret(e, dt) {
      const def = e.def;
      e.moving = false;
      faceTo(e, target(e).x);
      e.cd -= dt;
      if (e.cd <= 0.4 && !e.s.warned) { e.s.warned = true; e.squash = -0.15; }
      if (e.cd <= 0) {
        e.cd = def.cd; e.s.warned = false;
        e.s.off = (e.s.off || 0) + Math.PI / def.ring;
        C().ring(e.x, e.y, def.ring, def.proj, e.atk * 0.85, e.s.off);
        e.squash = 0.25;
        G.Sfx.play('shoot');
      }
    },

    burrower(e, dt) {
      const tg = target(e), s = e.s;
      s.state = s.state || 'under';
      if (s.t == null) s.t = 1.5;
      if (s.state === 'under') {
        e.burrowed = true; e.alpha = 0;
        steer(e, tg.x, tg.y, e.spd * 1.5, dt);
        s.t -= dt;
        if (Math.random() < 0.4) G.Fx.burst(e.x, e.y + 6, '#d9b77a', 1, 30, 3);
        if (s.t <= 0 || U.dist2(e.x, e.y, tg.x, tg.y) < 26 * 26) {
          s.state = 'emerge'; s.t = 0.55;
          G.Run.addZone({ kind: 'circle', x: e.x, y: e.y, r: 38, warn: 0.55, dmg: e.atk * 1.2 });
        }
      } else if (s.state === 'emerge') {
        s.t -= dt; e.moving = false;
        if (s.t <= 0) {
          s.state = 'up'; s.t = 1.8; e.burrowed = false; e.alpha = 1; e.squash = 0.3;
          G.Fx.burst(e.x, e.y, '#d9b77a', 10, 120, 4);
        }
      } else {
        steer(e, tg.x, tg.y, e.spd * 0.45, dt);
        s.t -= dt;
        if (s.t <= 0) { s.state = 'under'; s.t = U.rand(1.4, 2.2); }
      }
    },

    tank(e, dt) {
      const tg = target(e), s = e.s, def = e.def;
      if (s.wind > 0) {
        s.wind -= dt; e.moving = false; e.squash = 0.15;
        if (s.wind <= 0) {
          C().ring(e.x, e.y, def.ring || 8, def.proj || { type: 'ball', color: '#ffffff', speed: 110 }, e.atk * 0.8, Math.random());
          G.Fx.ring(e.x, e.y + e.r * 0.5, 5, 50, 'rgba(255,255,255,0.8)', 0.3, 4);
          G.Fx.shake(2);
          G.Sfx.play('slam');
        }
        return;
      }
      steer(e, tg.x, tg.y, e.spd, dt);
      e.cd -= dt;
      if (e.cd <= 0) { e.cd = def.cd || 3.5; s.wind = 0.55; }
    },

    bomber(e, dt) {
      const tg = target(e), s = e.s, def = e.def;
      if (s.fuse != null) {
        s.fuse -= dt; e.moving = false;
        e.flash = Math.sin(s.fuse * 40) > 0 ? 0.05 : 0;
        e.squash = -0.2 * (1 - s.fuse / 0.65);
        if (s.fuse <= 0 && !s.exploded) {
          s.exploded = true;
          G.Fx.burst(e.x, e.y, ['#ff9f1c', '#ffd166', '#ffffff'], 18, 200, 5);
          G.Fx.ring(e.x, e.y, 5, def.radius, '#ffb347', 0.3, 5);
          G.Fx.shake(4);
          G.Sfx.play('boom');
          for (const u of G.Team.members(R())) if (U.dist(e.x, e.y, u.x, u.y) < def.radius + u.r) G.Run.hurtUnit(u, e.atk);
          if (def.ring) C().ring(e.x, e.y, def.ring, def.proj, e.atk * 0.6, 0);
          e.exp *= 0.5;
          C().kill(e, { self: true });
        }
        return;
      }
      steer(e, tg.x, tg.y, e.spd, dt);
      if (U.dist2(e.x, e.y, tg.x, tg.y) < 38 * 38) {
        s.fuse = 0.65;
        G.Run.addZone({ kind: 'circle', x: e.x, y: e.y, r: def.radius, warn: 0.65, dmg: 0, ghost: true });
      }
    },

    trailer(e, dt) {
      const tg = target(e), s = e.s;
      steer(e, tg.x, tg.y, e.spd, dt);
      s.trail = (s.trail || 0) - dt;
      if (s.trail <= 0) {
        s.trail = 0.4;
        G.Run.addHazard(e.x, e.y + e.r * 0.4, 16, 2.6, e.atk * 0.5, e.def.trail === 'ink' ? 'ink' : 'fire');
      }
    },

    nova(e, dt) {
      const tg = target(e), s = e.s, def = e.def;
      if (s.wind > 0) {
        s.wind -= dt; e.moving = false; e.squash = -0.1;
        return;
      }
      const d = U.dist(e.x, e.y, tg.x, tg.y);
      if (d > 70) steer(e, tg.x, tg.y, e.spd, dt, e.look.float);
      else e.moving = false;
      e.cd -= dt;
      if (e.cd <= 0 && d < def.radius + 30) {
        e.cd = def.cd; s.wind = 0.75;
        G.Run.addZone({ kind: 'circle', x: e.x, y: e.y, r: def.radius, warn: 0.75, dmg: e.atk, color: '#9be7ff', follow: e });
      }
    },

    laser(e, dt) {
      const tg = target(e), s = e.s, def = e.def;
      if (s.wind > 0) { s.wind -= dt; e.moving = false; faceTo(e, tg.x); return; }
      const d = U.dist(e.x, e.y, tg.x, tg.y);
      if (d > 220) steer(e, tg.x, tg.y, e.spd, dt, e.look.float);
      else if (d < 120) steer(e, e.x * 2 - tg.x, e.y * 2 - tg.y, e.spd, dt, e.look.float);
      else e.moving = false;
      e.cd -= dt;
      if (e.cd <= 0 && d < def.range) {
        e.cd = def.cd; s.wind = 1.1;
        G.Run.addZone({ kind: 'line', x: e.x, y: e.y, ang: U.angleTo(e.x, e.y, tg.x, tg.y), len: def.range + 60, w: 12, warn: 0.85, active: 0.3, dmg: e.atk * 1.1, follow: e, track: tg, lock: 0.3, color: '#ff4d6d' });
      }
    },

    ambusher(e, dt) {
      const tg = target(e), s = e.s, def = e.def;
      if (!s.awake) {
        e.moving = false;
        e.look = Object.assign({}, def.look, { eyes: 'sleepy', mouth: 'none', acc: [] });
        if (U.dist2(e.x, e.y, tg.x, tg.y) < 100 * 100 || e.hp < e.maxHp) {
          s.awake = true; e.look = def.look; e.squash = -0.4; e.cd = 0.6;
          G.Fx.text(e.x, e.y - e.r - 6, '깜짝!', '#ffd166', 13, { force: true });
        }
        return;
      }
      steer(e, tg.x, tg.y, e.spd * 0.6, dt);
      e.cd -= dt;
      if (e.cd <= 0) { e.cd = def.cd; C().ring(e.x, e.y, def.ring, def.proj, e.atk * 0.8, Math.random()); e.squash = 0.25; }
    },

    charger(e, dt) {
      const tg = target(e), s = e.s;
      s.state = s.state || 'go';
      if (s.state === 'go') {
        const d = U.dist(e.x, e.y, tg.x, tg.y);
        steer(e, tg.x, tg.y, d > 150 ? e.spd : e.spd * 0.4, dt);
        e.cd -= dt;
        if (e.cd <= 0 && d < 240) {
          s.state = 'wind'; s.t = 0.65; s.a = U.angleTo(e.x, e.y, tg.x, tg.y);
          G.Run.addZone({ kind: 'line', x: e.x, y: e.y, ang: s.a, len: 300, w: e.r * 1.8, warn: 0.65, active: 0, dmg: 0, follow: e, ghost: true });
        }
      } else if (s.state === 'wind') {
        s.t -= dt; e.moving = false; e.squash = 0.15; e.face = Math.cos(s.a) < 0 ? -1 : 1;
        if (s.t <= 0) { s.state = 'run'; s.t = 0.9; e.dashing = true; }
      } else if (s.state === 'run') {
        s.t -= dt;
        const sp = 340 * C().speedMul(e);
        e.x += Math.cos(s.a) * sp * dt; e.y += Math.sin(s.a) * sp * dt;
        e.moving = true;
        const ox = e.x, oy = e.y;
        const hitWall = G.World.collide(e, R().arena);
        const blocked = Math.abs(ox - e.x) + Math.abs(oy - e.y) > 0.5;
        if (s.t <= 0 || hitWall || blocked) {
          s.state = 'stun'; s.t = 0.7; e.dashing = false;
          if (hitWall || blocked) { G.Fx.shake(3); G.Fx.burst(e.x, e.y, '#ffffff', 8, 100, 3, { shape: 'star' }); }
        }
      } else {
        s.t -= dt; e.moving = false;
        if (s.t <= 0) { s.state = 'go'; e.cd = U.rand(1.5, 2.5); }
      }
    },
  };

  function update(e, dt) {
    if (e.frozenT > 0) { e.moving = false; return; }
    (A[e.ai] || A.chase)(e, dt);
  }

  return { update, target, steer, faceTo };
})();
