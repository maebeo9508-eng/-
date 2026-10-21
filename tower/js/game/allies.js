'use strict';
// 펫과 동료(그리고 분신·포탑)의 행동. 동료는 진형을 지키고, 예고된 공격을 피하며, 궁극기를 씁니다.
G.Allies = (function () {
  const U = G.U, TAU = U.TAU;
  const C = () => G.Combat;
  const R = () => G.Run.st;

  function lvMul(lv) { return 1 + 0.12 * (lv - 1); }

  function makeComp(st, key) {
    const save = G.Save.data;
    const def = G.COMPANIONS[key];
    const a = {
      kind: 'comp', key, def, look: def.look, lv: save.comps.owned[key] || 1,
      x: st.player.x, y: st.player.y, r: def.pos === 'front' ? 12 : 11, t: Math.random() * 5,
      cd: 0.5 + Math.random() * 0.5, cd2: 3, face: 1, moving: false, down: false, flash: 0,
      ult: 0.25, tauntT: 0, bubble: 0, cheerT: 0, reviveT: 0, side: Math.random() < 0.5 ? 1 : -1,
    };
    a.maxHp = compMaxHp(st, a);
    a.hp = a.maxHp;
    return a;
  }

  function compMaxHp(st, a) { return st.rs.maxHp * a.def.hpMul * 0.7 * lvMul(a.lv); }

  function create(st) {
    const save = G.Save.data;
    const list = [];
    const pk = save.pets.active;
    if (pk && G.PETS[pk]) {
      const def = G.PETS[pk];
      list.push({ kind: 'pet', key: pk, def, look: def.look, lv: save.pets.owned[pk] || 1, x: st.player.x - 24, y: st.player.y + 6, r: 8, t: 0, cd: 1, face: 1, moving: false });
    }
    for (const k of save.comps.team || []) if (G.COMPANIONS[k] && save.comps.owned[k] != null) list.push(makeComp(st, k));
    return list;
  }

  // 층 시작 진형: 앞줄은 위쪽(적 쪽), 뒷줄은 모찌 뒤
  function formation(st) {
    const p = st.player;
    const comps = st.allies.filter((a) => a.kind === 'comp');
    const front = comps.filter((a) => a.def.pos === 'front');
    const back = comps.filter((a) => a.def.pos !== 'front');
    front.forEach((a, i) => { a.x = p.x + (i - (front.length - 1) / 2) * 44; a.y = p.y - 44; });
    back.forEach((a, i) => { a.x = p.x + (i - (back.length - 1) / 2) * 52 + (back.length === 1 ? 40 : 0); a.y = p.y + 30; });
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

  // 방향 벡터로 이동 (크기 1 이하면 그만큼 천천히)
  function steerBy(a, fx, fy, spd, dt) {
    const l = Math.hypot(fx, fy);
    if (l < 0.15) { a.moving = false; return; }
    const k = Math.min(1, l);
    a.x += (fx / l) * spd * k * dt;
    a.y += (fy / l) * spd * k * dt;
    a.moving = true;
    if (Math.abs(fx) > 0.2) a.face = fx < 0 ? -1 : 1;
  }

  function shoot(a, e, o) {
    const ang = U.angleTo(a.x, a.y, e.x, e.y);
    G.Run.fireProj(Object.assign({ x: a.x, y: a.y, ang, speed: 300, r: 5, life: 1.2, ally: true, pierce: 0, src: a.kind === 'comp' ? a : null }, o));
    a.face = e.x < a.x ? -1 : 1;
  }

  function hurt(a, dmg) {
    if (a.kind !== 'comp' || a.down) return;
    const st = R(), rs = st.rs;
    if (a.bubble > 0) {
      a.bubble--;
      G.Fx.ring(a.x, a.y, 8, 30, '#9be7ff', 0.35, 3);
      return;
    }
    const red = Math.min(0.7, rs.def / (rs.def + 30 * G.S(st.floor)));
    let d = dmg * (1 - red) * (1 - rs.dmgRed) * (1 - rs.compRed);
    if (a.def.taunt) d *= 0.8;
    a.hp -= d;
    a.flash = 0.12;
    a.ult = Math.min(1, a.ult + 0.03);
    G.Fx.text(a.x, a.y - 20, '-' + U.fmt(d), '#ffb3c6', 10);
    if (a.hp <= 0) {
      a.down = true;
      a.hp = 0;
      a.reviveT = rs.compRevive || 0;
      G.Fx.text(a.x, a.y - 24, `${a.def.name} 기절!`, '#ffffff', 12, { force: true });
      G.Fx.burst(a.x, a.y, ['#ffffff', a.look.color], 10, 100, 3, { shape: 'star' });
      G.Sfx.play('hurt');
      if (!G.Team.members(st).length) G.Run.onTeamWipe();
    }
  }

  // ── 펫 ─────────────────────────────────────────────────
  function updatePet(a, dt) {
    const st = R(), rs = st.rs;
    const p = G.Team.leader(st);
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
    follow(a, p.x - (p.face || 1) * 24, p.y - 10, 240, dt);
    if (ab === 'heal' && a.cd <= 0) {
      a.cd = 6;
      G.Team.healAll(0.02 + 0.003 * a.lv, true);
      G.Sfx.play('heal');
    } else if (ab === 'fireball' && a.cd <= 0) {
      const e = nearestEnemy(a.x, a.y, 260);
      if (e) { a.cd = 1.5; shoot(a, e, { type: 'fire', dmg: dmgBase * 0.55, speed: 260, burn: true, color: '#ff9f1c' }); }
    } else if (ab === 'feather' && a.cd <= 0) {
      const e = nearestEnemy(a.x, a.y, 260);
      if (e) { a.cd = 1.1; shoot(a, e, { type: 'feather', dmg: dmgBase * 0.35, speed: 340, pierce: 1, color: '#f2dcc2' }); }
    } else if (ab === 'shield' && a.cd <= 0) {
      a.cd = Math.max(6, 14 - 0.6 * a.lv);
      // 보호막이 없는 팀원 중 체력이 가장 낮은 친구에게
      const list = G.Team.members(st).filter((u) => !(u.bubble > 0));
      if (list.length) {
        list.sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp);
        list[0].bubble = 1;
        G.Fx.ring(list[0].x, list[0].y, 8, 30, '#fff3b0', 0.4, 3);
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

  // ── 동료 ───────────────────────────────────────────────
  function updateComp(a, dt) {
    const st = R(), rs = st.rs, def = a.def;
    if (a.flash > 0) a.flash -= dt;
    if (a.cheerT > 0) a.cheerT -= dt;
    if (a.down) {
      a.moving = false;
      if (a.reviveT > 0) {
        a.reviveT -= dt;
        if (a.reviveT <= 0) G.Team.revive(a, 0.3);
      }
      return;
    }
    // 대지 강타 같은 도약
    if (a.leap) {
      const L = a.leap;
      L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      a.x = U.lerp(L.sx, L.tx, k); a.y = U.lerp(L.sy, L.ty, k);
      a.hop = Math.sin(k * Math.PI) * 50;
      if (k >= 1) { a.leap = null; a.hop = 0; L.fn(); }
      return;
    }
    if (a.tauntT > 0) a.tauntT -= dt;
    if (def.taunt || a.tauntT > 0) st.taunters.push(a);
    const atk = rs.atk * def.atkMul * lvMul(a.lv);
    a.cd -= dt * rs.aspd;
    a.cd2 -= dt;
    if (st.phase === 'fight') a.ult = Math.min(1, a.ult + (dt / def.ult.charge) * rs.ultRate * (1 + rs.cdr));
    if (a.ult >= 1 && st.auto && G.Team.wantsUlt(a)) G.Team.useUlt(a);
    const lead = G.Team.leader(st);
    let fx = 0, fy = 0;
    const fighting = st.phase === 'fight' && st.enemies.some((e) => !e.dead && !e.burrowed && e.spawnT <= 0);
    const front = def.pos === 'front';
    let tgt = null;
    if (fighting) {
      if (front) {
        // 앞줄: 팀에 가까운 적부터 막아섬
        const c = G.Team.centroid(st);
        tgt = nearestEnemy(c.x, c.y, 600) || nearestEnemy(a.x, a.y, 600);
        if (tgt) {
          const d = U.dist(a.x, a.y, tgt.x, tgt.y);
          const want = tgt.r + (def.range || 30) * 0.7;
          if (d > want) { fx += (tgt.x - a.x) / d; fy += (tgt.y - a.y) / d; }
        }
      } else {
        // 뒷줄: 가장 가까운 적과 거리를 두고, 리더 곁을 지킴
        tgt = nearestEnemy(a.x, a.y, def.range || 220);
        const near = nearestEnemy(a.x, a.y, 600);
        if (near) {
          const d = U.dist(a.x, a.y, near.x, near.y);
          const want = Math.min(150, (def.range || 200) * 0.7);
          const tx = (near.x - a.x) / (d || 1), ty = (near.y - a.y) / (d || 1);
          if (d < want - 20) { fx -= tx; fy -= ty; }
          else if (d > (def.range || 200) * 0.9) { fx += tx * 0.8; fy += ty * 0.8; }
          fx += -ty * 0.25 * a.side; fy += tx * 0.25 * a.side;
          if (Math.random() < 0.004) a.side *= -1;
        }
        const ld = U.dist(a.x, a.y, lead.x, lead.y);
        if (ld > 130) { fx += ((lead.x - a.x) / ld) * 0.8; fy += ((lead.y - a.y) / ld) * 0.8; }
      }
    } else {
      // 전투가 없으면 리더 곁 제자리로
      const comps = st.allies.filter((x) => x.kind === 'comp');
      const i = comps.indexOf(a);
      const ox = (i - (comps.length - 1) / 2) * 40;
      const oy = front ? -36 : 28;
      const tx = lead.x + ox, ty = lead.y + oy;
      const d = U.dist(a.x, a.y, tx, ty);
      if (d > 12) { fx = (tx - a.x) / Math.max(d, 40); fy = (ty - a.y) / Math.max(d, 40); }
    }
    // 팀원끼리 너무 붙지 않게
    for (const u of G.Team.members(st)) {
      if (u === a) continue;
      const d = U.dist(a.x, a.y, u.x, u.y);
      if (d < 24 && d > 0.01) { fx += ((a.x - u.x) / d) * 0.6; fy += ((a.y - u.y) / d) * 0.6; }
    }
    const dz = G.Team.danger(st, a.x, a.y, a.r);
    fx += dz.x * 1.8; fy += dz.y * 1.8;
    const w = G.Team.walls(st, a.x, a.y);
    fx += w.x; fy += w.y;
    steerBy(a, fx, fy, def.spd || 100, dt);
    if (tgt && a.cd <= 0 && Math.abs(tgt.x - a.x) > 2) a.face = tgt.x < a.x ? -1 : 1;

    // 공격
    switch (def.ai) {
      case 'melee': {
        if (!tgt) break;
        const d = U.dist(a.x, a.y, tgt.x, tgt.y);
        if (a.cd <= 0 && d < tgt.r + def.range + 4) {
          a.cd = 1 / def.rate;
          a.squash = 0.25;
          if (def.aoe) {
            G.Fx.ring(tgt.x, tgt.y, 6, def.aoe, '#ffffff', 0.2, 3);
            C().blast(tgt.x, tgt.y, def.aoe, atk, { ally: true, proc: true, color: '#ffd8a8', unit: a });
          } else C().hitEnemy(tgt, atk, { ally: true, proc: true, color: '#ffd8a8', unit: a });
          if (def.goldP && tgt.dead && Math.random() < 0.4) G.Run.drop('gold', tgt.x, tgt.y, Math.ceil(1 + st.floor * 0.2));
        }
        break;
      }
      case 'ranged':
      case 'healer': {
        if (tgt && a.cd <= 0) {
          a.cd = 1 / def.rate;
          a.squash = 0.2;
          const o = { dmg: atk, ally: true };
          if (def.proj === 'cream') Object.assign(o, { type: 'cream', speed: 220, aoe: def.aoe, slow: def.slow, color: '#fff6ee', r: 7 });
          else if (def.proj === 'fireball') Object.assign(o, { type: 'fire', speed: 230, aoe: def.aoe, color: '#ff9f1c', r: 7 });
          else if (def.proj === 'arrow') Object.assign(o, { type: 'arrow', speed: 480, pierce: def.pierce || 0, color: '#ffffff' });
          else Object.assign(o, { type: 'orb', speed: 260, color: '#fff3b0', homing: 4 });
          shoot(a, tgt, o);
        }
        if (def.ai === 'healer' && a.cd2 <= 0 && G.Team.hpRatio(st) < 0.95) {
          a.cd2 = 5;
          G.Team.healAll(def.heal * lvMul(a.lv), true);
          G.Fx.ring(a.x, a.y, 10, 60, '#fff3b0', 0.5, 4);
          G.Sfx.play('heal');
        }
        break;
      }
      case 'turret':
        if (a.cd2 <= 0 && fighting && nearestEnemy(a.x, a.y, 260)) {
          a.cd2 = 9;
          st.allies.push({ kind: 'turret', x: a.x + 14, y: a.y, r: 9, t: 0, life: 7, cd: 0.4, face: 1, atk, owner: a });
          G.Fx.burst(a.x + 14, a.y, '#f2c14e', 8, 80, 3);
        }
        break;
      case 'star':
        if (a.cd <= 0 && fighting) {
          const targets = st.enemies.filter((e) => !e.dead && !e.burrowed && U.dist2(e.x, e.y, a.x, a.y) < def.range * def.range);
          if (targets.length) {
            a.cd = 1 / def.rate;
            a.squash = 0.2;
            for (let i = 0; i < 3; i++) {
              const e = U.pick(targets);
              G.Run.addZone({ kind: 'circle', friendly: true, x: e.x + U.rand(-10, 10), y: e.y + U.rand(-10, 10), r: 34, warn: 0.55, dmg: atk, color: '#ffe66d', star: true, ally: true });
            }
          }
        }
        break;
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
    const st = R(), p = G.Team.leader(st);
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
    st.taunters = [];
    st.slowAura = null;
    for (const a of st.allies) {
      a.t += dt;
      if (a.squash) a.squash = Math.max(0, a.squash - dt * 1.5);
      if (a.kind === 'pet') updatePet(a, dt);
      else if (a.kind === 'comp') updateComp(a, dt);
      else if (a.kind === 'turret') updateTurret(a, dt);
      else if (a.kind === 'clone') updateClone(a, dt);
      if (a.kind === 'comp' && !a.down) G.World.collide(a, st.arena, !!a.leap);
      else if (a.kind === 'pet' || a.kind === 'clone') G.World.collide(a, st.arena, true);
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
    const alpha = a.kind === 'clone' ? 0.55 : a.down ? 0.5 : 1;
    const hop = (a.hop || 0) + (a.cheerT > 0 ? Math.abs(Math.sin(a.cheerT * 9)) * 10 : 0);
    if (a.kind === 'comp' && !a.down && a.ult >= 1) {
      // 궁극기 준비: 발밑이 반짝반짝
      const g = 0.5 + Math.sin(a.t * 8) * 0.5;
      G.Art.ell(ctx, a.x, a.y + a.r * 0.9, a.r * (1.3 + g * 0.2), a.r * 0.45);
      ctx.strokeStyle = `rgba(255,214,102,${0.5 + g * 0.5})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    if (!G.Assets.draw(ctx, key, a.down ? 'hurt' : a.moving ? 'walk' : 'idle', a.t, a.x, a.y - hop + a.r, a.r * 2.6, flip, alpha)) {
      const L = a.down ? Object.assign({}, look, { eyes: 'x', mouth: 'o' }) : look;
      G.Art.creature(ctx, L, a.x, a.y, a.r, { t: a.t, moving: a.moving, face: a.face, flash: a.flash, alpha, seed: 2, squash: a.squash, hop });
    }
    if (a.bubble > 0) {
      ctx.beginPath(); ctx.arc(a.x, a.y - hop, a.r + 7, 0, TAU);
      ctx.fillStyle = 'rgba(155,231,255,0.18)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(155,231,255,0.8)'; ctx.stroke();
    }
    if (a.tauntT > 0) {
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('💢', a.x + a.r, a.y - a.r * 1.6 - hop);
    }
    if (a.kind === 'comp') unitBar(ctx, a.x, a.y - a.r * 2.1 - hop, a.down ? 0 : a.hp / a.maxHp, a.down);
  }

  function unitBar(ctx, x, y, k, down) {
    const w = 26;
    ctx.fillStyle = 'rgba(59,42,77,0.75)';
    U.roundRect(ctx, x - w / 2 - 1, y - 1, w + 2, 6, 3); ctx.fill();
    ctx.fillStyle = down ? '#a8a3b5' : k < 0.3 ? '#ff6b6b' : '#7ee081';
    U.roundRect(ctx, x - w / 2, y, Math.max(0.1, w * k), 4, 2); ctx.fill();
  }

  return { create, formation, update, draw, hurt, nearestEnemy, compMaxHp, unitBar };
})();
