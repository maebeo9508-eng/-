'use strict';
// 주인공을 돕는 친구들: 펫, 분신, 태엽 포탑
G.Allies = (function () {
  const U = G.U;
  const C = () => G.Combat;
  const R = () => G.Run.st;

  function lvMul(lv) { return 1 + 0.12 * (lv - 1); }

  function create(st) {
    const save = G.Save.data;
    const list = [];
    const pk = save.pets.active;
    if (pk && G.PETS[pk]) {
      const def = G.PETS[pk];
      list.push({ kind: 'pet', key: pk, def, look: def.look, lv: save.pets.owned[pk] || 1, x: st.player.x - 24, y: st.player.y + 6, r: 8, t: 0, cd: 1, face: 1, moving: false });
    }
    return list;
  }

  // 층 시작 위치: 펫은 주인공 옆
  function formation(st) {
    const p = st.player;
    for (const a of st.allies) if (a.kind === 'pet') { a.x = p.x - 24; a.y = p.y + 8; }
  }

  function nearestEnemy(x, y, range) {
    let best = null, bd = range * range;
    for (const e of R().enemies) {
      if (e.dead || e.burrowed || e.spawnT > 0 || e.invuln) continue;
      const d2 = U.dist2(x, y, e.x, e.y);
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  function follow(a, tx, ty, spd, dt) {
    const d = U.dist(a.x, a.y, tx, ty);
    if (d > 6) {
      const k = Math.min(1, (spd * dt) / d) * Math.min(1, d / 30 + 0.3);
      a.x += (tx - a.x) * k;
      a.y += (ty - a.y) * k;
      a.moving = d > 10;
      if (Math.abs(tx - a.x) > 2) a.face = tx < a.x ? -1 : 1;
    } else a.moving = false;
  }

  function shoot(a, e, o) {
    const ang = U.angleTo(a.x, a.y, e.x, e.y);
    G.Run.fireProj(Object.assign({ x: a.x, y: a.y, ang, speed: 300, r: 5, life: 1.2, ally: true, pierce: 0 }, o));
    a.face = e.x < a.x ? -1 : 1;
    G.Assets.trigger(a, 'attack');
  }

  // ── 펫 ─────────────────────────────────────────────────
  function updatePet(a, dt) {
    const st = R(), rs = st.rs;
    const p = st.player;
    const dmgBase = rs.atk * lvMul(a.lv);
    const ab = a.def.ability;
    a.cd -= dt;
    const melee = ab === 'peck' || ab === 'scratch' || ab === 'gold';
    if (melee) {
      const e = nearestEnemy(p.x, p.y, 160);
      if (e) {
        follow(a, e.x - Math.sign(e.x - p.x || 1) * (e.r + 6), e.y, 260, dt);
        if (a.cd <= 0 && U.dist(a.x, a.y, e.x, e.y) < e.r + 16) {
          const m = ab === 'scratch' ? 0.22 : ab === 'gold' ? 0.25 : 0.35;
          C().hitEnemy(e, dmgBase * m, { ally: true, proc: false, color: '#ffe066' });
          a.cd = ab === 'scratch' ? 0.4 : ab === 'gold' ? 1.0 : 0.75;
          a.squash = 0.25;
          G.Assets.trigger(a, 'attack');
          if (ab === 'gold' && Math.random() < 0.2) G.Run.drop('gold', e.x, e.y, Math.ceil(1 + st.floor * 0.2));
        }
        return;
      }
    }
    follow(a, p.x - (p.face || 1) * 24, p.y - 10, 240, dt);
    if (ab === 'heal' && a.cd <= 0) {
      a.cd = 6;
      C().heal(p.maxHp * (0.02 + 0.003 * a.lv), true);
      G.Sfx.play('heal');
    } else if (ab === 'fireball' && a.cd <= 0) {
      const e = nearestEnemy(a.x, a.y, 260);
      if (e) { a.cd = 1.5; shoot(a, e, { type: 'fire', dmg: dmgBase * 0.55, speed: 260, burn: true, color: '#ff9f1c' }); }
    } else if (ab === 'feather' && a.cd <= 0) {
      const e = nearestEnemy(a.x, a.y, 260);
      if (e) { a.cd = 1.1; shoot(a, e, { type: 'feather', dmg: dmgBase * 0.35, speed: 340, pierce: 1, color: '#f2dcc2' }); }
    } else if (ab === 'shield' && a.cd <= 0) {
      a.cd = Math.max(6, 14 - 0.6 * a.lv);
      if (!(p.bubble > 0)) {
        p.bubble = 1;
        G.Fx.ring(p.x, p.y, 8, 30, '#fff3b0', 0.4, 3);
        G.Sfx.play('shield');
      }
    }
    if (ab === 'slowaura') {
      st.slowAura = { x: a.x, y: a.y, r: 85, amt: 0.2 + 0.015 * a.lv };
      if (a.cd <= 0) {
        a.cd = 1;
        for (const e of st.enemies) if (!e.dead && U.dist2(e.x, e.y, a.x, a.y) < 85 * 85) C().hitEnemy(e, dmgBase * 0.12, { ally: true, noCrit: true, color: '#d8ccff' });
      }
    }
  }

  function updateTurret(a, dt) {
    a.life -= dt;
    a.cd -= dt;
    if (a.cd <= 0) {
      const e = nearestEnemy(a.x, a.y, 240);
      if (e) { a.cd = 0.33; shoot(a, e, { type: 'ball', dmg: a.atk, speed: 340, color: '#ffd166', r: 4 }); }
    }
    if (a.life <= 0) { a.dead = true; G.Fx.burst(a.x, a.y, '#f2c14e', 8, 80, 3); }
  }

  function updateClone(a, dt) {
    const st = R(), p = st.player;
    a.life -= dt;
    a.cd -= dt;
    const off = a.idx ? 1 : -1;
    follow(a, p.x + off * 34, p.y - 6, 220, dt);
    if (a.cd <= 0) {
      const e = nearestEnemy(a.x, a.y, 260);
      if (e) { a.cd = 0.45; shoot(a, e, { type: 'orb', dmg: st.rs.atk * a.mul, speed: 300, color: '#ffffff', homing: 3, skill: true }); }
    }
    if (a.life <= 0) { a.dead = true; G.Fx.burst(a.x, a.y, '#ffffff', 10, 90, 3, { shape: 'star' }); }
  }

  function update(dt) {
    const st = R();
    st.slowAura = null;
    for (const a of st.allies) {
      a.t += dt;
      if (a.squash) a.squash = Math.max(0, a.squash - dt * 1.5);
      if (a.kind === 'pet') updatePet(a, dt);
      else if (a.kind === 'turret') updateTurret(a, dt);
      else if (a.kind === 'clone') updateClone(a, dt);
      if (a.kind === 'pet' || a.kind === 'clone') G.World.collide(a, st.arena, true);
    }
    st.allies = st.allies.filter((a) => !a.dead);
  }

  function draw(ctx, a) {
    if (a.kind === 'turret') {
      ctx.save();
      ctx.translate(a.x, a.y);
      G.Art.ell(ctx, 0, 8, 11, 4); ctx.fillStyle = 'rgba(40,20,60,0.2)'; ctx.fill();
      U.roundRect(ctx, -8, -4, 16, 12, 3); ctx.fillStyle = '#8a7a5f'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = G.Art.OL; ctx.stroke();
      ctx.rotate(a.t * 3);
      G.Art.gearPath(ctx, 8, 6); ctx.fillStyle = '#f2c14e'; ctx.fill(); ctx.stroke();
      ctx.restore();
      return;
    }
    const st = R();
    const clone = a.kind === 'clone';
    const look = clone ? st.player.look : a.look;
    const key = clone ? (st.player.hero === 'mochi' ? 'hero' : st.player.hero) : a.key;
    const alpha = clone ? 0.55 : 1;
    if (!G.Assets.drawEnt(ctx, key, a, a.moving ? 'walk' : 'idle', a.x, a.y + a.r, a.r * 2.6, a.face < 0, alpha, 0)) {
      G.Art.creature(ctx, look, a.x, a.y, a.r, { t: a.t, moving: a.moving, face: a.face, alpha, seed: 2, squash: a.squash });
    }
  }

  // 머리 위 작은 체력바
  function unitBar(ctx, x, y, k) {
    const w = 26;
    ctx.fillStyle = 'rgba(59,42,77,0.75)';
    U.roundRect(ctx, x - w / 2 - 1, y - 1, w + 2, 6, 3); ctx.fill();
    ctx.fillStyle = k < 0.3 ? '#ff6b6b' : '#7ee081';
    U.roundRect(ctx, x - w / 2, y, Math.max(0.1, w * k), 4, 2); ctx.fill();
  }

  return { create, formation, update, draw, nearestEnemy, unitBar };
})();
