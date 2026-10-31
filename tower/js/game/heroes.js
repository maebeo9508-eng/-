'use strict';
// 주인공별 필살기와 컷인 연출
G.Heroes = (function () {
  const U = G.U, TAU = U.TAU;
  const C = () => G.Combat;
  const R = () => G.Run.st;

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

  // 컷인은 너무 잦으면 흐름을 끊으니, 직전 컷인과 2.5초 이상 떨어졌을 때만 크게 보여 줘요
  function cutin(name, skill, look, key, color) {
    const st = R();
    G.Sfx.play('skill');
    if (st.time - (st.lastCutin || -9) < 2.5) {
      const p = st.player;
      G.Fx.text(p.x, p.y - 40, `${name}: ${skill}!`, '#fff3b0', 13, { force: true, life: 1 });
      return;
    }
    st.lastCutin = st.time;
    st.cutin = { name, skill, img: G.Scene.portraitImg(look, key === 'mochi' ? 'hero' : key), t: 0.85, max: 0.85, color: color || '#ffd166' };
    st.slowmo = 0.3;
  }

  function castUlt(p) {
    const st = R(), rs = st.rs;
    G.Assets.trigger(p, 'ult', true);
    const base = rs.atk * 1.15;
    const o = { skill: true, proc: true };
    switch (p.hero) {
      case 'mochi':
        for (let i = 0; i < 8; i++) {
          st.timers.push({ t: i * 0.08, fn: () => {
            if (p.dead) return;
            C().blast(p.x, p.y, 74 * rs.size, base * 1.2, o);
            st.swings.push({ x: p.x, y: p.y, ang: (i / 8) * TAU, arc: TAU, r: 74 * rs.size, t: 0.16, max: 0.16, color: i % 2 ? '#ffffff' : '#ffb3c6', spin: true });
            G.Sfx.play('swing');
          } });
        }
        G.Fx.shake(4);
        break;
      case 'mungchi':
        p.shieldT = 4;
        p.invuln = Math.max(p.invuln, 4);
        for (const e of st.enemies) {
          if (e.dead || e.boss) continue;
          const d = U.dist(p.x, p.y, e.x, e.y);
          if (d < 130) { const a = U.angleTo(p.x, p.y, e.x, e.y); e.kx += Math.cos(a) * 420; e.ky += Math.sin(a) * 420; }
        }
        C().blast(p.x, p.y, 110, base * 1.5, o);
        G.Fx.ring(p.x, p.y, 10, 130, '#9fc5e8', 0.6, 6);
        G.Sfx.play('shield');
        break;
      case 'bopul':
        for (let i = 0; i < 12; i++) {
          st.timers.push({ t: i * 0.1, fn: () => {
            if (p.dead) return;
            const e = randomEnemy(st);
            if (e) G.Run.fireProj({ x: p.x, y: p.y, ang: U.angleTo(p.x, p.y, e.x, e.y), type: 'arrow', speed: 520, dmg: base * 0.9, life: 1.2, pierce: 1, r: 5, skill: true, color: '#f6c1d0' });
          } });
        }
        break;
      case 'poksin':
        C().heal(p.maxHp * 0.3, true);
        for (const e of st.enemies) {
          if (e.dead || U.dist(e.x, e.y, p.x, p.y) > 160) continue;
          e.slowT = 3; e.slowAmt = 0.7;
          G.Fx.text(e.x, e.y - e.r - 6, 'Zzz', '#d8ccff', 11, { force: true });
        }
        G.Fx.ring(p.x, p.y, 10, 160, '#d8ccff', 0.6, 5);
        G.Sfx.play('heal');
        break;
      case 'gombang': {
        const e = densest(st, p);
        if (!e) break;
        p.swing = null;
        p.leap = { sx: p.x, sy: p.y, tx: e.x, ty: e.y + e.r * 0.5, t: 0, dur: 0.45, fn: () => {
          C().blast(p.x, p.y, 90, base * 3, o);
          for (const x of st.enemies) if (!x.dead && !x.boss && U.dist(x.x, x.y, p.x, p.y) < 90) C().freeze(x, 1.2);
          G.Fx.shake(9);
          G.Fx.ring(p.x, p.y, 8, 95, '#ffd8a8', 0.4, 6);
          G.Fx.burst(p.x, p.y, ['#ffffff', '#e8dcc0'], 18, 200, 5);
          G.Sfx.play('slam');
        } };
        break;
      }
      case 'toseul': {
        const e = densest(st, p);
        if (e) G.Run.addZone({ kind: 'circle', friendly: true, x: e.x, y: e.y, r: 100, warn: 0.55, dmg: base * 2.6, color: '#ffb3c6', big: true, skill: true, slow: 0.55 });
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
        C().heal(p.maxHp * 0.4, true);
        p.invuln = Math.max(p.invuln, 3);
        p.shieldT = Math.max(p.shieldT, 3);
        G.Fx.ring(p.x, p.y, 10, 200, '#fff3b0', 0.7, 6);
        G.Sfx.play('legend');
        break;
      case 'tobi':
        for (let i = 0; i < 6; i++) {
          st.timers.push({ t: i * 0.16, fn: () => {
            const e = randomEnemy(st);
            if (e) G.Run.addZone({ kind: 'circle', friendly: true, x: e.x + U.rand(-12, 12), y: e.y + U.rand(-12, 12), r: 50, warn: 0.35, dmg: base * 1.9, color: '#ff9f1c', meteor: true, skill: true, burn: true });
          } });
        }
        break;
      case 'daram':
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU;
          st.allies.push({ kind: 'turret', x: U.clamp(p.x + Math.cos(a) * 40, 20, st.arena.w - 20), y: U.clamp(p.y + Math.sin(a) * 40, 20, st.arena.h - 20), r: 9, t: 0, life: 8, cd: 0.2, face: 1, atk: base * 0.5 });
        }
        G.Fx.burst(p.x, p.y, '#f2c14e', 16, 120, 3);
        break;
      case 'yeoul': {
        const e = densest(st, p);
        const a0 = e ? U.angleTo(p.x, p.y, e.x, e.y) : p.aim;
        for (let i = -2; i <= 2; i++) G.Run.fireProj({ x: p.x, y: p.y, ang: a0 + i * 0.12, type: 'lightarrow', speed: 620, dmg: base * 2.3, life: 1.2, pierce: 99, r: 7, skill: true });
        G.Sfx.play('zap');
        break;
      }
      case 'luna':
        for (let i = 0; i < 10; i++) {
          st.timers.push({ t: i * 0.15, fn: () => {
            const e = randomEnemy(st);
            if (e) G.Run.addZone({ kind: 'circle', friendly: true, x: e.x + U.rand(-10, 10), y: e.y + U.rand(-10, 10), r: 36, warn: 0.45, dmg: base * 1.4, color: '#ffe66d', star: true, skill: true });
          } });
        }
        break;
    }
  }

  return { cutin, castUlt, densest, randomEnemy };
})();
