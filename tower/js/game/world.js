'use strict';
// 층(방) 생성, 충돌, 바닥 그림
G.World = (function () {
  const U = G.U, TAU = U.TAU;
  const WALL = 24;

  // 세로 휴대폰 화면에 방 전체가 거의 다 보이도록 맞춘 크기
  const SIZES = {
    battle: [380, 620],
    danger: [400, 660],
    boss: [400, 620],
    small: [340, 460],
  };

  function makeArena(room, floor, stage) {
    const key = room === 'battle' || room === 'danger' || room === 'boss' ? room : 'small';
    const [w, h] = SIZES[key];
    const a = { w, h, obstacles: [], ground: null, seed: (floor * 7919 + 13) >>> 0 };
    const rnd = U.rng(a.seed);
    const count = key === 'small' ? 2 : key === 'boss' ? 3 : 3 + Math.floor(rnd() * 3);
    let guard = 0;
    while (a.obstacles.length < count && guard++ < 300) {
      const r = 15 + rnd() * 10;
      const x = 50 + rnd() * (w - 100);
      const y = 90 + rnd() * (h - 220);
      // 시작 지점과 포탈 자리, 중앙 통로는 비워 둡니다
      if (Math.abs(x - w / 2) < 46 && (y > h - 170 || y < 150)) continue;
      if (key === 'small' && Math.abs(x - w / 2) < 90) continue;
      if (key === 'boss' && U.dist(x, y, w / 2, h * 0.35) < 120) continue;
      let ok = true;
      for (const o of a.obstacles) if (U.dist(x, y, o.x, o.y) < o.r + r + 60) { ok = false; break; }
      if (!ok) continue;
      a.obstacles.push({ x, y, r, kind: stage.obstacles[Math.floor(rnd() * stage.obstacles.length)], seed: Math.floor(rnd() * 100) });
    }
    return a;
  }

  // 원형 개체를 장애물/벽 밖으로 밀어냅니다
  function collide(e, arena, noObstacles) {
    const r = e.r;
    if (!noObstacles) {
      for (const o of arena.obstacles) {
        const dx = e.x - o.x, dy = e.y - o.y;
        const d = Math.hypot(dx, dy), min = o.r + r * 0.85;
        if (d < min && d > 0.001) {
          e.x = o.x + (dx / d) * min;
          e.y = o.y + (dy / d) * min;
        }
      }
    }
    let hit = false;
    if (e.x < r) { e.x = r; hit = true; }
    if (e.x > arena.w - r) { e.x = arena.w - r; hit = true; }
    if (e.y < r) { e.y = r; hit = true; }
    if (e.y > arena.h - r) { e.y = arena.h - r; hit = true; }
    return hit;
  }

  function inObstacle(x, y, pad, arena) {
    for (const o of arena.obstacles) if (U.dist(x, y, o.x, o.y) < o.r + pad) return o;
    return null;
  }

  function freePoint(arena, avoidX, avoidY, minDist, pad) {
    for (let i = 0; i < 40; i++) {
      const x = U.rand(pad, arena.w - pad), y = U.rand(pad, arena.h - pad);
      if (avoidX != null && U.dist(x, y, avoidX, avoidY) < minDist) continue;
      if (inObstacle(x, y, pad + 4, arena)) continue;
      return { x, y };
    }
    return { x: arena.w / 2, y: arena.h * 0.3 };
  }

  // 바닥을 오프스크린 캔버스에 한 번만 그려 둡니다
  function renderGround(arena, stage, res) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(arena.w * res);
    cv.height = Math.ceil(arena.h * res);
    const ctx = cv.getContext('2d');
    ctx.scale(res, res);
    const T = 48;
    const tile = G.Assets.icon('tile_' + stage.id);
    if (tile) {
      // PNG 바닥 타일 (이음매 없는 정사각 타일 권장, 96단위 크기로 반복)
      for (let y = 0; y < arena.h; y += 96) for (let x = 0; x < arena.w; x += 96) ctx.drawImage(tile, x, y, 96, 96);
    } else {
      for (let y = 0; y < arena.h; y += T) {
        for (let x = 0; x < arena.w; x += T) {
          ctx.fillStyle = ((x / T + y / T) & 1) ? stage.ground[0] : stage.ground[1];
          ctx.fillRect(x, y, T, T);
        }
      }
    }
    const rnd = U.rng(arena.seed + 99);
    const n = tile ? 0 : Math.floor((arena.w * arena.h) / 5200);
    for (let i = 0; i < n; i++) deco(ctx, stage, rnd() * arena.w, rnd() * arena.h, rnd);
    // 가장자리 그림자
    const g = ctx.createLinearGradient(0, 0, 0, 40);
    g.addColorStop(0, 'rgba(40,20,60,0.22)');
    g.addColorStop(1, 'rgba(40,20,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, arena.w, 40);
    arena.ground = cv;
    return cv;
  }

  function deco(ctx, stage, x, y, rnd) {
    const k = rnd();
    ctx.save();
    ctx.translate(x, y);
    switch (stage.deco) {
      case 'flower':
        if (k < 0.5) {
          ctx.fillStyle = U.pick(['#ffffff', '#ffd6e0', '#fff3b0']);
          for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * 3, Math.sin(a) * 3, 2.4, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#ffc94d'; ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, TAU); ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(80,150,70,0.5)'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(-3, 3); ctx.lineTo(-1, -3); ctx.moveTo(0, 3); ctx.lineTo(1, -4); ctx.moveTo(3, 3); ctx.lineTo(3.5, -2); ctx.stroke();
        }
        break;
      case 'sprinkle':
        ctx.rotate(rnd() * TAU);
        ctx.fillStyle = U.pick(['#ff6b8b', '#7ed9c3', '#ffd166', '#8ecbff', '#b9a6ff']);
        U.roundRect(ctx, -4, -1.3, 8, 2.6, 1.3); ctx.fill();
        break;
      case 'pebble':
        ctx.fillStyle = k < 0.5 ? 'rgba(170,130,70,0.35)' : 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(0, 0, 3 + k * 4, 2 + k * 2, 0, 0, TAU); ctx.fill();
        break;
      case 'snow':
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(0, 0, 1.5 + k * 2, 0, TAU); ctx.fill();
        if (k > 0.8) { ctx.strokeStyle = 'rgba(150,200,240,0.6)'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke(); } }
        break;
      case 'ember':
        if (k < 0.3) {
          ctx.strokeStyle = 'rgba(255,120,60,0.45)'; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-2, 2); ctx.lineTo(3, -2); ctx.lineTo(9, 1); ctx.stroke();
        } else { ctx.fillStyle = 'rgba(255,170,90,0.55)'; ctx.beginPath(); ctx.arc(0, 0, 1.5 + k * 1.5, 0, TAU); ctx.fill(); }
        break;
      case 'page':
        ctx.rotate(rnd() * TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-4, -5, 8, 10);
        ctx.fillStyle = 'rgba(155,132,214,0.4)'; ctx.fillRect(-3, -3, 6, 1); ctx.fillRect(-3, 0, 6, 1);
        break;
      case 'bolt':
        ctx.strokeStyle = 'rgba(90,130,125,0.4)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(0, 0, 3 + k * 2, 0, TAU); ctx.stroke();
        break;
      case 'bubble':
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, 2 + k * 4, 0, TAU); ctx.stroke();
        break;
      case 'star':
        ctx.fillStyle = k < 0.2 ? 'rgba(255,240,170,0.9)' : 'rgba(255,255,255,0.5)';
        G.Fx.star(ctx, 0, 0, 1.5 + k * 2.5, rnd());
        ctx.fill();
        break;
      case 'dream':
        ctx.fillStyle = k < 0.3 ? 'rgba(255,107,214,0.35)' : 'rgba(195,166,255,0.3)';
        G.Fx.star(ctx, 0, 0, 2 + k * 3, rnd());
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  function drawWalls(ctx, arena, stage) {
    const c = stage.wall;
    ctx.fillStyle = c;
    ctx.fillRect(-WALL, -WALL, arena.w + WALL * 2, WALL);
    ctx.fillRect(-WALL, arena.h, arena.w + WALL * 2, WALL);
    ctx.fillRect(-WALL, 0, WALL, arena.h);
    ctx.fillRect(arena.w, 0, WALL, arena.h);
    ctx.fillStyle = U.shade(c, 0.25);
    ctx.fillRect(-WALL, -WALL, arena.w + WALL * 2, 6);
    ctx.lineWidth = 3;
    ctx.strokeStyle = G.Art.OL;
    ctx.strokeRect(0, 0, arena.w, arena.h);
    ctx.strokeRect(-WALL, -WALL, arena.w + WALL * 2, arena.h + WALL * 2);
    // 벽 위 동글동글 장식
    ctx.fillStyle = U.shade(c, -0.12);
    for (let x = 14; x < arena.w; x += 36) {
      ctx.beginPath(); ctx.arc(x, -WALL / 2, 5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x, arena.h + WALL / 2, 5, 0, TAU); ctx.fill();
    }
  }

  return { makeArena, collide, inObstacle, freePoint, renderGround, drawWalls, WALL };
})();
