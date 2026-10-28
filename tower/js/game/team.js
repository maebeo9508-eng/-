'use strict';
// 팀 전투: 팀원 목록, 모찌 자동 전투 AI, 위험 회피, 궁극기, 자동 진행
G.Team = (function () {
  const U = G.U, TAU = U.TAU;
  const C = () => G.Combat;
  const R = () => G.Run.st;

  function comps(st) { return (st || R()).allies.filter((a) => a.kind === 'comp'); }

  // 살아 있는 팀원 (모찌 + 쓰러지지 않은 동료)
  function members(st) {
    st = st || R();
    const out = [];
    if (!st.player.dead) out.push(st.player);
    for (const a of st.allies) if (a.kind === 'comp' && !a.down) out.push(a);
    return out;
  }

  // 아이템을 줍고 문을 여는 대표 (모찌가 쓰러지면 동료가 대신)
  function leader(st) {
    st = st || R();
    if (!st.player.dead) return st.player;
    return st.allies.find((a) => a.kind === 'comp' && !a.down) || st.player;
  }

  function centroid(st) {
    const m = members(st);
    if (!m.length) return { x: st.player.x, y: st.player.y };
    let x = 0, y = 0, w = 0;
    for (const u of m) {
      const k = u === st.player ? 2 : 1;
      x += u.x * k; y += u.y * k; w += k;
    }
    return { x: x / w, y: y / w };
  }

  // 팀 평균 체력 비율 (쓰러진 친구는 0)
  function hpRatio(st) {
    st = st || R();
    let s = st.player.dead ? 0 : st.player.hp / st.player.maxHp, n = 1;
    for (const a of comps(st)) { s += a.down ? 0 : a.hp / a.maxHp; n++; }
    return s / n;
  }

  function healAll(frac, show) {
    const st = R();
    C().heal(st.player.maxHp * frac, show);
    for (const a of comps(st)) {
      if (a.down) continue;
      const before = a.hp;
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * frac);
      if (show && a.hp - before >= 1) G.Fx.text(a.x, a.y - 22, '+' + U.fmt(a.hp - before), '#7ee081', 11, { force: true });
    }
  }

  function revive(u, frac) {
    const st = R();
    if (u === st.player) {
      if (!u.dead) return;
      u.dead = false;
      u.hp = u.maxHp * frac;
      u.invuln = 1.5;
    } else {
      if (!u.down) return;
      u.down = false;
      u.hp = u.maxHp * frac;
      u.reviveT = 0;
    }
    G.Fx.burst(u.x, u.y, ['#fff3b0', '#ffffff'], 14, 120, 4, { shape: 'star' });
    G.Fx.text(u.x, u.y - 26, '부활!', '#fff3b0', 13, { force: true });
  }

  function reviveAll(frac) {
    const st = R();
    revive(st.player, frac);
    for (const a of comps(st)) revive(a, frac);
  }

  // ── 위험 회피: 예고 원·선, 불 장판, 날아오는 탄환에서 멀어지는 방향 ──
  function danger(st, x, y, r) {
    let fx = 0, fy = 0;
    for (const z of st.zones) {
      if (z.friendly) continue;
      if (z.kind === 'circle') {
        if (z.t >= z.warn) continue;
        const d = U.dist(x, y, z.x, z.y), lim = z.r + r + 8;
        if (d < lim) {
          const k = 2 + (1 - d / lim) * 2;
          fx += ((x - z.x) / (d || 1)) * k; fy += ((y - z.y) / (d || 1)) * k;
        }
      } else if (z.kind === 'line' || z.kind === 'rotline') {
        if (z.t >= z.warn + (z.active || 0)) continue;
        const ex = z.x + Math.cos(z.ang) * z.len, ey = z.y + Math.sin(z.ang) * z.len;
        if (G.Player.segDist(x, y, z.x, z.y, ex, ey) < z.w / 2 + r + 10) {
          const nx = -Math.sin(z.ang), ny = Math.cos(z.ang);
          const side = (x - z.x) * nx + (y - z.y) * ny >= 0 ? 1 : -1;
          fx += nx * side * 3; fy += ny * side * 3;
        }
      } else if (z.kind === 'hazard' && z.type !== 'ink') {
        const d = U.dist(x, y, z.x, z.y);
        if (d < z.r + r + 4) { fx += ((x - z.x) / (d || 1)) * 1.5; fy += ((y - z.y) / (d || 1)) * 1.5; }
      }
    }
    for (const b of st.eprojs) {
      const dx = x - b.x, dy = y - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 80) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      if ((dx * b.vx + dy * b.vy) / sp < 0) continue; // 멀어지는 탄환은 무시
      const nx = -b.vy / sp, ny = b.vx / sp;
      const side = dx * nx + dy * ny >= 0 ? 1 : -1;
      const k = 40 / Math.max(14, d);
      fx += nx * side * k; fy += ny * side * k;
    }
    return { x: fx, y: fy };
  }

  function walls(st, x, y) {
    const a = st.arena, m = 36;
    let fx = 0, fy = 0;
    if (x < m) fx += ((m - x) / m) * 1.4;
    if (x > a.w - m) fx -= ((x - (a.w - m)) / m) * 1.4;
    if (y < m) fy += ((m - y) / m) * 1.4;
    if (y > a.h - m) fy -= ((y - (a.h - m)) / m) * 1.4;
    return { x: fx, y: fy };
  }

  // ── 모찌 자동 전투 ──────────────────────────────────────
  function mochiMove(st) {
    const p = st.player, rs = st.rs, W = rs.weapon;
    let fx = 0, fy = 0;
    if (st.phase === 'fight') {
      const e = G.Allies.nearestEnemy(p.x, p.y, 2000);
      if (e) {
        const melee = W.kind === 'melee' || W.kind === 'slam' || W.kind === 'thrust';
        const want = melee ? W.range * rs.size * 0.7 + e.r : Math.min(W.range * 0.55, 160);
        const d = U.dist(p.x, p.y, e.x, e.y);
        const tx = (e.x - p.x) / (d || 1), ty = (e.y - p.y) / (d || 1);
        if (d > want + 8) { fx += tx; fy += ty; }
        else if (d < want - 22) { fx -= tx * 0.9; fy -= ty * 0.9; }
        p.aiSide = p.aiSide || 1;
        if (Math.random() < 0.006) p.aiSide *= -1;
        fx += -ty * 0.35 * p.aiSide; fy += tx * 0.35 * p.aiSide;
        if (!melee) {
          for (const o of st.enemies) {
            if (o.dead || o.burrowed) continue;
            const dd = U.dist(p.x, p.y, o.x, o.y);
            if (dd < 70 && dd > 0.1) { fx -= ((o.x - p.x) / dd) * (70 - dd) / 35; fy -= ((o.y - p.y) / dd) * (70 - dd) / 35; }
          }
        }
      }
    } else {
      const tx = st.arena.w / 2, ty = st.arena.h * 0.62;
      if (U.dist(p.x, p.y, tx, ty) > 30) { fx = (tx - p.x) / 100; fy = (ty - p.y) / 100; }
    }
    const dz = danger(st, p.x, p.y, p.r);
    fx += dz.x * 1.6; fy += dz.y * 1.6;
    const w = walls(st, p.x, p.y);
    fx += w.x; fy += w.y;
    if (Math.hypot(dz.x, dz.y) > 2.6) p.wantDash = true;
    const l = Math.hypot(fx, fy);
    if (l < 0.12) return [0, 0];
    const m = Math.min(1, l);
    return [(fx / l) * m, (fy / l) * m];
  }

  // ── 궁극기 ──────────────────────────────────────────────
  function anyEnemy(st) { return st.enemies.some((e) => !e.dead && e.spawnT <= 0 && !e.burrowed); }

  function randomEnemy(st) {
    const list = st.enemies.filter((e) => !e.dead && !e.burrowed && e.spawnT <= 0);
    return list.length ? U.pick(list) : null;
  }

  function densest(st, near) {
    let best = null, bc = -1;
    for (const e of st.enemies) {
      if (e.dead || e.burrowed || e.spawnT > 0) continue;
      let c = e.boss ? 3 : 0;
      for (const o of st.enemies) if (!o.dead && U.dist2(e.x, e.y, o.x, o.y) < 90 * 90) c++;
      if (near) c -= U.dist(e.x, e.y, near.x, near.y) / 200;
      if (c > bc) { bc = c; best = e; }
    }
    return best;
  }

  function ultInfo(u) {
    const st = R();
    if (u === st.player) {
      const d = G.ACTIVE_SKILLS[G.Save.data.skills.eq[0]];
      return { name: d ? d.name : '', icon: d ? d.icon : '', ready: !u.dead && st.skillCd[0] <= 0, pct: st.skillCd[0] > 0 ? 1 - st.skillCd[0] / st.skillCdMax[0] : 1 };
    }
    return { name: u.def.ult.name, icon: u.def.ult.icon, ready: !u.down && u.ult >= 1, pct: u.ult };
  }

  // AUTO일 때 지금 쓰기 좋은 순간인지
  function wantsUlt(u) {
    const st = R();
    if (st.phase !== 'fight' || !anyEnemy(st)) return false;
    if (u === st.player) {
      const k = G.Save.data.skills.eq[0];
      if (k === 'heal') return hpRatio(st) < 0.65;
      if (k === 'shield') return hpRatio(st) < 0.7 || st.eprojs.length > 6;
      return !!G.Allies.nearestEnemy(u.x, u.y, k === 'spin' || k === 'frost' ? 110 : 280);
    }
    switch (u.key) {
      case 'poksin': return hpRatio(st) < 0.7;
      case 'pengpeng': return hpRatio(st) < 0.6 || st.player.dead || comps(st).some((a) => a.down);
      case 'mungchi': return !!st.boss || st.enemies.filter((e) => !e.dead && U.dist(e.x, e.y, u.x, u.y) < 170).length >= 3;
      default: return !!G.Allies.nearestEnemy(u.x, u.y, 320);
    }
  }

  // 컷인은 너무 잦으면 흐름을 끊으니, 직전 컷인과 2.5초 이상 떨어졌을 때만 크게 보여 줘요
  function cutin(name, skill, look, key, color) {
    const st = R();
    G.Sfx.play('skill');
    if (st.time - (st.lastCutin || -9) < 2.5) {
      const u = G.Team.leader(st);
      G.Fx.text(u.x, u.y - 40, `${name}: ${skill}!`, '#fff3b0', 13, { force: true, life: 1 });
      return;
    }
    st.lastCutin = st.time;
    st.cutin = { name, skill, img: G.Scene.portraitImg(look, key), t: 0.85, max: 0.85, color: color || '#ffd166' };
    st.slowmo = 0.3;
  }

  // 카드를 누르거나 AUTO가 부를 때
  function useUlt(u) {
    const st = R();
    if (!st || !st.active || st.paused || st.phase !== 'fight') return false;
    if (u === st.player) return G.Player.skill(0);
    if (u.down || u.ult < 1) return false;
    u.ult = 0;
    cutin(u.def.name, u.def.ult.name, u.look, u.key, '#7ed9c3');
    castUlt(u);
    return true;
  }

  function castUlt(u) {
    const st = R(), rs = st.rs;
    G.Assets.trigger(u, 'ult', true);
    const base = rs.atk * (1 + 0.12 * (u.lv - 1));
    const o = { ally: true, skill: true, proc: true, unit: u };
    switch (u.key) {
      case 'mungchi':
        for (const m of members(st)) { m.bubble = Math.max(m.bubble || 0, 1); G.Fx.ring(m.x, m.y, 6, 30, '#9fc5e8', 0.4, 3); }
        u.tauntT = 4;
        G.Fx.ring(u.x, u.y, 10, 160, '#9fc5e8', 0.6, 6);
        G.Sfx.play('shield');
        break;
      case 'bopul':
        for (let i = 0; i < 12; i++) {
          st.timers.push({ t: i * 0.1, fn: () => {
            if (u.down) return;
            const e = randomEnemy(st);
            if (e) G.Run.fireProj({ x: u.x, y: u.y, ang: U.angleTo(u.x, u.y, e.x, e.y), type: 'arrow', speed: 520, dmg: base * 0.9, life: 1.2, pierce: 1, r: 5, ally: true, skill: true, src: u });
          } });
        }
        break;
      case 'poksin':
        healAll(0.25, true);
        for (const e of st.enemies) {
          if (e.dead || U.dist(e.x, e.y, u.x, u.y) > 150) continue;
          e.slowT = 2.5; e.slowAmt = 0.65;
          G.Fx.text(e.x, e.y - e.r - 6, 'Zzz', '#d8ccff', 11, { force: true });
        }
        G.Fx.ring(u.x, u.y, 10, 150, '#d8ccff', 0.6, 5);
        G.Sfx.play('heal');
        break;
      case 'gombang': {
        const e = densest(st, u);
        if (!e) break;
        u.leap = { sx: u.x, sy: u.y, tx: e.x, ty: e.y + e.r * 0.5, t: 0, dur: 0.45, fn: () => {
          C().blast(u.x, u.y, 85, base * 3, o);
          for (const x of st.enemies) if (!x.dead && !x.boss && U.dist(x.x, x.y, u.x, u.y) < 85) C().freeze(x, 1.2);
          u.tauntT = 3;
          G.Fx.shake(9);
          G.Fx.ring(u.x, u.y, 8, 90, '#ffd8a8', 0.4, 6);
          G.Fx.burst(u.x, u.y, ['#ffffff', '#e8dcc0'], 18, 200, 5);
          G.Sfx.play('slam');
        } };
        break;
      }
      case 'toseul': {
        const e = densest(st, u);
        if (e) G.Run.addZone({ kind: 'circle', friendly: true, x: e.x, y: e.y, r: 100, warn: 0.55, dmg: base * 2.4, color: '#ffb3c6', big: true, skill: true, ally: true, slow: 0.55 });
        break;
      }
      case 'neogul':
        for (let i = 0; i < 10; i++) {
          st.timers.push({ t: i * 0.09, fn: () => {
            const e = randomEnemy(st);
            if (!e) return;
            G.Fx.burst(e.x, e.y, ['#ffd166', '#ffffff'], 4, 90, 2.5);
            const alive = !e.dead;
            C().hitEnemy(e, base, o);
            if (alive && e.dead) G.Run.drop('gold', e.x, e.y, Math.ceil((2 + st.floor * 0.5) * (1 + rs.goldP)));
          } });
        }
        break;
      case 'pengpeng':
        reviveAll(0.4);
        healAll(0.4, true);
        G.Fx.ring(u.x, u.y, 10, 200, '#fff3b0', 0.7, 6);
        G.Sfx.play('legend');
        break;
      case 'tobi':
        for (let i = 0; i < 6; i++) {
          st.timers.push({ t: i * 0.16, fn: () => {
            const e = randomEnemy(st);
            if (e) G.Run.addZone({ kind: 'circle', friendly: true, x: e.x + U.rand(-12, 12), y: e.y + U.rand(-12, 12), r: 50, warn: 0.35, dmg: base * 1.8, color: '#ff9f1c', meteor: true, skill: true, ally: true, burn: true });
          } });
        }
        break;
      case 'daram':
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU;
          st.allies.push({ kind: 'turret', x: U.clamp(u.x + Math.cos(a) * 40, 20, st.arena.w - 20), y: U.clamp(u.y + Math.sin(a) * 40, 20, st.arena.h - 20), r: 9, t: 0, life: 8, cd: 0.2, face: 1, atk: base * 0.45, owner: u });
        }
        G.Fx.burst(u.x, u.y, '#f2c14e', 16, 120, 3);
        break;
      case 'yeoul': {
        const e = densest(st, u);
        const a0 = e ? U.angleTo(u.x, u.y, e.x, e.y) : -Math.PI / 2;
        for (let i = -2; i <= 2; i++) G.Run.fireProj({ x: u.x, y: u.y, ang: a0 + i * 0.12, type: 'lightarrow', speed: 620, dmg: base * 2.2, life: 1.2, pierce: 99, r: 7, ally: true, skill: true, src: u });
        G.Sfx.play('zap');
        break;
      }
      case 'luna':
        for (let i = 0; i < 10; i++) {
          st.timers.push({ t: i * 0.15, fn: () => {
            const e = randomEnemy(st);
            if (e) G.Run.addZone({ kind: 'circle', friendly: true, x: e.x + U.rand(-10, 10), y: e.y + U.rand(-10, 10), r: 36, warn: 0.45, dmg: base * 1.3, color: '#ffe66d', star: true, skill: true, ally: true });
          } });
        }
        break;
    }
  }

  // ── 자동 진행 ───────────────────────────────────────────
  function autoAbility(choices) {
    return choices.slice().sort((a, b) => b.rar - a.rar)[0];
  }

  function autoDoor(st) {
    const types = st.portals.map((p) => p.type);
    const hp = hpRatio(st);
    const order = hp < 0.45
      ? ['rest', 'boss', 'shop', 'treasure', 'shrine', 'battle', 'danger']
      : hp > 0.75
        ? ['boss', 'danger', 'treasure', 'shrine', 'battle', 'rest', 'shop']
        : ['boss', 'treasure', 'shrine', 'battle', 'rest', 'danger', 'shop'];
    for (const t of order) {
      const i = types.indexOf(t);
      if (i >= 0) return st.portals[i];
    }
    return st.portals.find((p) => p.type !== 'home') || st.portals[0];
  }

  function autoPotion(st) {
    if (st.potions > 0 && st.phase === 'fight' && hpRatio(st) < 0.35 && st.time > (st.lastPotion || -9) + 3) {
      st.lastPotion = st.time;
      G.Player.potion();
    }
  }

  return {
    comps, members, leader, centroid, hpRatio, healAll, revive, reviveAll, danger, walls, mochiMove,
    ultInfo, wantsUlt, useUlt, castUlt, cutin, densest, randomEnemy, autoAbility, autoDoor, autoPotion,
  };
})();
