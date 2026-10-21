'use strict';
// 펫과 동료(그리고 분신·포탑)의 행동
G.Allies = (function () {
  const U = G.U, TAU = U.TAU;
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
    const ck = save.comps.active;
    if (ck && G.COMPANIONS[ck]) {
      const def = G.COMPANIONS[ck];
      const a = { kind: 'comp', key: ck, def, look: def.look, lv: save.comps.owned[ck] || 1, x: st.player.x + 28, y: st.player.y + 6, r: 11, t: 0, cd: 1, cd2: 3, face: 1, moving: false, down: false, downT: 0, flash: 0, contactCd: 0 };
      a.maxHp = st.rs.maxHp * def.hpMul * 0.45 * lvMul(a.lv);
      a.hp = a.maxHp;
      list.push(a);
    }
    return list;
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
  }

  function hurt(a, dmg) {
    if (a.kind !== 'comp' || a.down) return;
    a.hp -= dmg * 0.6;
    a.flash = 0.12;
    if (a.hp <= 0) {
      a.down = true; a.downT = 8; a.hp = 0;
      G.Fx.text(a.x, a.y - 20, '기절!', '#ffffff', 12, { force: true });
    }
  }

  // ── 펫 ─────────────────────────────────────────────────
  function updatePet(a, dt) {
    const st = R(), p = st.player, rs = st.rs;
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
          if (ab === 'gold' && Math.random() < 0.2) G.Run.drop('gold', e.x, e.y, Math.ceil(1 + st.floor * 0.2));
        }
        return;
      }
    }
    follow(a, p.x - p.face * 24, p.y - 10, 240, dt);
    if (ab === 'heal' && a.cd <= 0) {
      a.cd = 6;
      C().heal(p.maxHp * (0.025 + 0.004 * a.lv), true);
      G.Sfx.play('heal');
    } else if (ab === 'fireball' && a.cd <= 0) {
      const e = nearestEnemy(a.x, a.y, 260);
      if (e) { a.cd = 1.5; shoot(a, e, { type: 'fire', dmg: dmgBase * 0.55, speed: 260, burn: true, color: '#ff9f1c' }); }
    } else if (ab === 'feather' && a.cd <= 0) {
      const e = nearestEnemy(a.x, a.y, 260);
      if (e) { a.cd = 1.1; shoot(a, e, { type: 'feather', dmg: dmgBase * 0.35, speed: 340, pierce: 1, color: '#f2dcc2' }); }
    } else if (ab === 'shield' && a.cd <= 0) {
      a.cd = Math.max(6, 14 - 0.6 * a.lv);
      if (p.bubble < 1) { p.bubble = 1; G.Fx.ring(p.x, p.y, 8, 30, '#fff3b0', 0.4, 3); G.Sfx.play('shield'); }
    }
    if (ab === 'slowaura') {
      st.slowAura = { x: a.x, y: a.y, r: 85, amt: 0.2 + 0.015 * a.lv };
      if (a.cd <= 0) {
        a.cd = 1;
        for (const e of st.enemies) if (!e.dead && U.dist2(e.x, e.y, a.x, a.y) < 85 * 85) C().hitEnemy(e, dmgBase * 0.12, { ally: true, noCrit: true, color: '#d8ccff' });
      }
    }
  }

  // ── 동료 ───────────────────────────────────────────────
  function updateComp(a, dt) {
    const st = R(), p = st.player, rs = st.rs, def = a.def;
    if (a.flash > 0) a.flash -= dt;
    if (a.down) {
      a.downT -= dt;
      a.moving = false;
      if (a.downT <= 0) { a.down = false; a.hp = a.maxHp * 0.5; G.Fx.burst(a.x, a.y, '#ffffff', 10, 90, 3, { shape: 'star' }); }
      return;
    }
    if (def.taunt) st.taunter = a;
    const atk = rs.atk * def.atkMul * lvMul(a.lv);
    a.cd -= dt;
    a.cd2 -= dt;
    const fromPlayer = U.dist(a.x, a.y, p.x, p.y);
    switch (def.ai) {
      case 'melee': {
        const e = nearestEnemy(p.x, p.y, 240);
        if (e && fromPlayer < 300) {
          const d = U.dist(a.x, a.y, e.x, e.y);
          if (d > e.r + def.range * 0.7) follow(a, e.x, e.y, 150, dt);
          else a.moving = false;
          if (a.cd <= 0 && d < e.r + def.range + 4) {
            a.cd = 1 / def.rate;
            a.squash = 0.25;
            if (def.aoe) {
              G.Fx.ring(e.x, e.y, 6, def.aoe, '#ffffff', 0.2, 3);
              C().blast(e.x, e.y, def.aoe, atk, { ally: true, proc: false, color: '#ffd8a8' });
            } else C().hitEnemy(e, atk, { ally: true, color: '#ffd8a8' });
            if (def.goldP && e.dead && Math.random() < 0.4) G.Run.drop('gold', e.x, e.y, Math.ceil(1 + st.floor * 0.2));
          }
        } else follow(a, p.x + p.face * 28, p.y + 8, 170, dt);
        break;
      }
      case 'ranged':
      case 'healer': {
        follow(a, p.x - p.face * 30, p.y + 14, 170, dt);
        const e = nearestEnemy(a.x, a.y, def.range);
        if (e && a.cd <= 0) {
          a.cd = 1 / def.rate;
          a.squash = 0.2;
          const o = { dmg: atk, ally: true };
          if (def.proj === 'cream') Object.assign(o, { type: 'cream', speed: 220, aoe: def.aoe, slow: def.slow, color: '#fff6ee', r: 7 });
          else if (def.proj === 'fireball') Object.assign(o, { type: 'fire', speed: 230, aoe: def.aoe, color: '#ff9f1c', r: 7 });
          else if (def.proj === 'arrow') Object.assign(o, { type: 'arrow', speed: 480, pierce: def.pierce, color: '#ffffff' });
          else Object.assign(o, { type: 'orb', speed: 260, color: '#fff3b0', homing: 4 });
          shoot(a, e, o);
        }
        if (def.ai === 'healer' && a.cd2 <= 0) {
          a.cd2 = 5;
          C().heal(p.maxHp * def.heal * lvMul(a.lv) * 0.9, true);
          for (const o of st.allies) if (o.kind === 'comp' && !o.down) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.15);
          G.Fx.ring(a.x, a.y, 10, 60, '#fff3b0', 0.5, 4);
          G.Sfx.play('heal');
        }
        break;
      }
      case 'turret': {
        follow(a, p.x - p.face * 30, p.y + 14, 170, dt);
        if (a.cd2 <= 0 && nearestEnemy(a.x, a.y, 260)) {
          a.cd2 = 9;
          st.allies.push({ kind: 'turret', x: a.x + 14, y: a.y, r: 9, t: 0, life: 7, cd: 0.4, face: 1, atk, owner: a });
          G.Fx.burst(a.x + 14, a.y, '#f2c14e', 8, 80, 3);
        }
        break;
      }
      case 'star': {
        follow(a, p.x - p.face * 30, p.y + 14, 170, dt);
        if (a.cd <= 0 && nearestEnemy(p.x, p.y, def.range)) {
          a.cd = 1 / def.rate;
          a.squash = 0.2;
          const targets = st.enemies.filter((e) => !e.dead && !e.burrowed && U.dist2(e.x, e.y, p.x, p.y) < def.range * def.range);
          for (let i = 0; i < 3 && targets.length; i++) {
            const e = U.pick(targets);
            G.Run.addZone({ kind: 'circle', friendly: true, x: e.x + U.rand(-10, 10), y: e.y + U.rand(-10, 10), r: 34, warn: 0.55, dmg: atk, color: '#ffe66d', star: true, ally: true });
          }
        }
        break;
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
    st.taunter = null;
    st.slowAura = null;
    for (const a of st.allies) {
      a.t += dt;
      if (a.squash) a.squash = Math.max(0, a.squash - dt * 1.5);
      if (a.kind === 'pet') updatePet(a, dt);
      else if (a.kind === 'comp') updateComp(a, dt);
      else if (a.kind === 'turret') updateTurret(a, dt);
      else if (a.kind === 'clone') updateClone(a, dt);
      if (a.kind !== 'turret') G.World.collide(a, st.arena, a.kind === 'pet' || a.kind === 'clone');
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
    const look = a.kind === 'clone' ? G.HERO_LOOK : a.look;
    const key = a.kind === 'clone' ? 'hero' : a.key;
    const flip = a.face < 0;
    const alpha = a.kind === 'clone' ? 0.55 : a.down ? 0.55 : 1;
    if (!G.Assets.draw(ctx, key, a.moving ? 'walk' : 'idle', a.t, a.x, a.y + a.r, a.r * 2.6, flip, alpha)) {
      const L = a.down ? Object.assign({}, look, { eyes: 'x', mouth: 'o' }) : look;
      G.Art.creature(ctx, L, a.x, a.y, a.r, { t: a.t, moving: a.moving, face: a.face, flash: a.flash, alpha, seed: 2, squash: a.squash });
    }
    if (a.kind === 'comp') {
      const w = 24, k = a.hp / a.maxHp;
      ctx.fillStyle = 'rgba(59,42,77,0.7)';
      ctx.fillRect(a.x - w / 2, a.y - a.r * 2.1, w, 4);
      ctx.fillStyle = a.down ? '#a8a3b5' : '#7ee081';
      ctx.fillRect(a.x - w / 2, a.y - a.r * 2.1, w * (a.down ? 1 - a.downT / 8 : k), 4);
    }
  }

  return { create, update, draw, hurt, nearestEnemy };
})();
