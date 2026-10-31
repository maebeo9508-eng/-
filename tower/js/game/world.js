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
      const y = 150 + rnd() * (h - 300);
      // 위쪽 포탈 자리와 시작 지점, 중앙 통로는 비워 둡니다
      if (Math.abs(x - w / 2) < 46 && y > h - 190) continue;
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

  function freePoint(arena, avoidX, avoidY, minDist, pad, yMax) {
    for (let i = 0; i < 40; i++) {
      const x = U.rand(pad, arena.w - pad), y = U.rand(pad, Math.min(arena.h - pad, yMax || arena.h));
      if (avoidX != null && U.dist(x, y, avoidX, avoidY) < minDist) continue;
      if (inObstacle(x, y, pad + 4, arena)) continue;
      return { x, y };
    }
    return { x: arena.w / 2, y: arena.h * 0.3 };
  }

  // 바닥을 오프스크린 캔버스에 한 번만 그려 둡니다 (던전 돌바닥 · 나무 바닥 · 동굴)
  function renderGround(arena, stage, res) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(arena.w * res);
    cv.height = Math.ceil(arena.h * res);
    const ctx = cv.getContext('2d');
    ctx.scale(res, res);
    const tile = G.Assets.icon('tile_' + stage.id);
    const rnd = U.rng(arena.seed + 99);
    if (tile) {
      // PNG 바닥 타일 (이음매 없는 정사각 타일 권장, 96단위 크기로 반복)
      for (let y = 0; y < arena.h; y += 96) for (let x = 0; x < arena.w; x += 96) ctx.drawImage(tile, x, y, 96, 96);
    } else if (stage.floor === 'planks') planks(ctx, arena, stage, rnd);
    else if (stage.floor === 'cave') cave(ctx, arena, stage, rnd);
    else stones(ctx, arena, stage, rnd);
    const n = tile ? 0 : Math.floor((arena.w * arena.h) / 7000);
    for (let i = 0; i < n; i++) deco(ctx, stage, rnd() * arena.w, rnd() * arena.h, rnd);
    // 벽 아래 그림자
    const g = ctx.createLinearGradient(0, 0, 0, 46);
    g.addColorStop(0, 'rgba(10,6,20,0.45)');
    g.addColorStop(1, 'rgba(10,6,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, arena.w, 46);
    for (const [x0, dir] of [[0, 1], [arena.w, -1]]) {
      const gs = ctx.createLinearGradient(x0, 0, x0 + dir * 22, 0);
      gs.addColorStop(0, 'rgba(10,6,20,0.3)');
      gs.addColorStop(1, 'rgba(10,6,20,0)');
      ctx.fillStyle = gs;
      ctx.fillRect(dir > 0 ? 0 : arena.w - 22, 0, 22, arena.h);
    }
    arena.ground = cv;
    arena.walls = renderWalls(arena, stage, res);
    return cv;
  }

  // 돌바닥: 크기가 조금씩 다른 판석, 금, 이 빠진 모서리
  function stones(ctx, arena, stage, rnd) {
    const T = 26;
    ctx.fillStyle = U.shade(stage.ground[0], -0.25);
    ctx.fillRect(0, 0, arena.w, arena.h);
    for (let row = 0, y = 0; y < arena.h; row++, y += T) {
      const off = row % 2 ? T / 2 : 0;
      for (let x = -off; x < arena.w; x += T) {
        const base = stage.ground[(Math.floor(x / T) + row) & 1];
        ctx.fillStyle = U.shade(base, (rnd() - 0.5) * 0.12);
        U.roundRect(ctx, x + 1, y + 1, T - 2, T - 2, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x + 2, y + 2, T - 4, 2);
        if (rnd() < 0.12) {
          ctx.strokeStyle = 'rgba(20,14,30,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const cx = x + 4 + rnd() * (T - 8), cy = y + 4 + rnd() * (T - 8);
          ctx.moveTo(cx, cy); ctx.lineTo(cx + 5 - rnd() * 10, cy + 6); ctx.lineTo(cx + 2 - rnd() * 4, cy + 11);
          ctx.stroke();
        }
      }
    }
  }

  // 나무 바닥: 엇갈린 판자와 나뭇결
  function planks(ctx, arena, stage, rnd) {
    const H = 18;
    for (let row = 0, y = 0; y < arena.h; row++, y += H) {
      let x = -(rnd() * 60);
      while (x < arena.w) {
        const len = 50 + rnd() * 50;
        ctx.fillStyle = U.shade(stage.ground[row & 1], (rnd() - 0.5) * 0.14);
        ctx.fillRect(x, y, len - 1.5, H - 1.5);
        ctx.strokeStyle = 'rgba(30,18,10,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 4, y + H * 0.45); ctx.quadraticCurveTo(x + len * 0.5, y + H * (0.3 + rnd() * 0.4), x + len - 6, y + H * 0.55); ctx.stroke();
        if (rnd() < 0.3) { ctx.fillStyle = 'rgba(30,18,10,0.3)'; ctx.beginPath(); ctx.arc(x + len - 6, y + H / 2, 1.3, 0, TAU); ctx.fill(); }
        x += len;
      }
    }
  }

  // 동굴 바닥: 울퉁불퉁한 흙과 바위
  function cave(ctx, arena, stage, rnd) {
    ctx.fillStyle = stage.ground[0];
    ctx.fillRect(0, 0, arena.w, arena.h);
    const n = Math.floor((arena.w * arena.h) / 900);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = U.shade(stage.ground[i & 1], (rnd() - 0.5) * 0.18);
      ctx.beginPath();
      ctx.ellipse(rnd() * arena.w, rnd() * arena.h, 8 + rnd() * 18, 6 + rnd() * 12, rnd() * TAU, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < n / 3; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(20,12,24,0.25)' : 'rgba(255,255,255,0.1)';
      ctx.beginPath(); ctx.arc(rnd() * arena.w, rnd() * arena.h, 1 + rnd() * 2.5, 0, TAU); ctx.fill();
    }
  }

  function deco(ctx, stage, x, y, rnd) {
    const k = rnd();
    ctx.save();
    ctx.translate(x, y);
    switch (stage.deco) {
      case 'moss':
        ctx.fillStyle = k < 0.5 ? 'rgba(110,170,80,0.45)' : 'rgba(140,190,90,0.35)';
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse((rnd() - 0.5) * 14, (rnd() - 0.5) * 8, 4 + rnd() * 6, 3 + rnd() * 3, 0, 0, TAU); ctx.fill(); }
        break;
      case 'bones':
        ctx.rotate(rnd() * TAU);
        ctx.fillStyle = 'rgba(240,232,215,0.75)';
        U.roundRect(ctx, -6, -1.4, 12, 2.8, 1.4); ctx.fill();
        for (const sx of [-6, 6]) for (const sy of [-1.6, 1.6]) { ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, TAU); ctx.fill(); }
        if (k < 0.15) { ctx.beginPath(); ctx.arc(10, -6, 5, 0, TAU); ctx.fill(); }
        break;
      case 'web':
        ctx.strokeStyle = 'rgba(235,235,245,0.35)'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); }
        for (let r = 4; r <= 10; r += 3) { ctx.moveTo(r, 0); for (let i = 1; i <= 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
        ctx.stroke();
        break;
      case 'frost':
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.arc(0, 0, 1.2 + k * 2, 0, TAU); ctx.fill();
        if (k > 0.75) { ctx.strokeStyle = 'rgba(230,248,255,0.6)'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke(); } }
        break;
      case 'ember':
        if (k < 0.35) {
          ctx.strokeStyle = 'rgba(255,120,50,0.6)'; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(-3, 2); ctx.lineTo(2, -2); ctx.lineTo(9, 1); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,220,120,0.6)'; ctx.lineWidth = 0.7; ctx.stroke();
        } else { ctx.fillStyle = 'rgba(255,160,80,0.45)'; ctx.beginPath(); ctx.arc(0, 0, 1.2 + k * 1.5, 0, TAU); ctx.fill(); }
        break;
      case 'page':
        ctx.rotate(rnd() * TAU);
        ctx.fillStyle = 'rgba(240,230,210,0.5)'; ctx.fillRect(-4, -5, 8, 10);
        ctx.fillStyle = 'rgba(80,60,110,0.35)'; ctx.fillRect(-3, -3, 6, 1); ctx.fillRect(-3, 0, 6, 1);
        break;
      case 'straw':
        ctx.strokeStyle = 'rgba(230,200,110,0.55)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a = rnd() * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 3); }
        ctx.stroke();
        break;
      case 'puddle':
        ctx.fillStyle = 'rgba(120,210,220,0.35)';
        ctx.beginPath(); ctx.ellipse(0, 0, 8 + k * 10, 4 + k * 4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(-3, -1, 3, 1, 0, 0, TAU); ctx.fill();
        break;
      case 'shard':
        ctx.rotate(rnd() * TAU);
        ctx.fillStyle = k < 0.3 ? 'rgba(255,243,176,0.7)' : 'rgba(230,220,255,0.55)';
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(2.5, 0); ctx.lineTo(0, 5); ctx.lineTo(-2.5, 0); ctx.closePath(); ctx.fill();
        break;
      case 'dream':
        ctx.fillStyle = k < 0.3 ? 'rgba(255,107,214,0.35)' : 'rgba(195,166,255,0.3)';
        G.Fx.star(ctx, 0, 0, 2 + k * 3, rnd());
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  // 위쪽 벽은 벽돌 면이 보이는 높은 벽(3/4 시점), 옆·아래는 낮은 돌담
  const TOP = 46;
  function renderWalls(arena, stage, res) {
    const W = WALL, c = stage.wall;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((arena.w + W * 2) * res);
    cv.height = Math.ceil((arena.h + TOP + W) * res);
    const ctx = cv.getContext('2d');
    ctx.scale(res, res);
    ctx.translate(W, TOP);
    const rnd = U.rng(arena.seed + 7);
    // 위쪽 벽돌 면
    ctx.fillStyle = U.shade(c, -0.2);
    ctx.fillRect(-W, -TOP, arena.w + W * 2, TOP);
    const BH = 11, BW = 26;
    for (let row = 0, y = -TOP + 8; y < 0; row++, y += BH) {
      for (let x = -W - (row % 2 ? BW / 2 : 0); x < arena.w + W; x += BW) {
        ctx.fillStyle = U.shade(c, (rnd() - 0.5) * 0.18);
        ctx.fillRect(x + 1, y + 1, BW - 2, BH - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + 1, y + 1, BW - 2, 1.5);
      }
    }
    ctx.fillStyle = U.shade(c, 0.18);
    ctx.fillRect(-W, -TOP, arena.w + W * 2, 8);
    // 옆·아래 돌담
    ctx.fillStyle = U.shade(c, -0.08);
    ctx.fillRect(-W, 0, W, arena.h + W);
    ctx.fillRect(arena.w, 0, W, arena.h + W);
    ctx.fillRect(-W, arena.h, arena.w + W * 2, W);
    ctx.fillStyle = U.shade(c, 0.12);
    ctx.fillRect(-W, 0, W - 4, arena.h);
    ctx.fillRect(arena.w + 4, 0, W - 4, arena.h);
    ctx.fillRect(-W, arena.h + 4, arena.w + W * 2, W - 4);
    ctx.strokeStyle = U.shade(c, -0.3);
    ctx.lineWidth = 1;
    for (let y = 14; y < arena.h; y += 22) {
      ctx.beginPath(); ctx.moveTo(-W, y); ctx.lineTo(-4, y); ctx.moveTo(arena.w + 4, y); ctx.lineTo(arena.w + W, y); ctx.stroke();
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = G.Art.OL;
    ctx.strokeRect(0, 0, arena.w, arena.h);
    ctx.strokeRect(-W, -TOP, arena.w + W * 2, arena.h + TOP + W);
    // 횃불 자리
    arena.torches = [];
    const n = Math.max(2, Math.round(arena.w / 130));
    for (let i = 0; i < n; i++) arena.torches.push({ x: ((i + 0.5) / n) * arena.w, y: -TOP * 0.45 });
    for (const t of arena.torches) {
      ctx.fillStyle = '#5a4a40';
      ctx.fillRect(t.x - 2.5, t.y, 5, 12);
      ctx.fillStyle = '#8a7060';
      ctx.fillRect(t.x - 5, t.y - 3, 10, 5);
    }
    return cv;
  }

  function drawWalls(ctx, arena, stage, t) {
    if (arena.walls) ctx.drawImage(arena.walls, -WALL, -TOP, arena.w + WALL * 2, arena.h + TOP + WALL);
    for (const tc of arena.torches || []) G.Art.flame(ctx, tc.x, tc.y - 4, 7, (t || 0) + tc.x);
  }

  return { makeArena, collide, inObstacle, freePoint, renderGround, drawWalls, WALL, TOP };
})();
