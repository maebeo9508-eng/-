/* 도구·버튼 아이콘.
   Canvas 2D로 24×24 좌표계에 검은색으로 그린 뒤 CSS mask로 씌운다.
   그래서 아이콘 색은 글자색(currentColor)을 따라 테마·선택 상태에 맞춰 바뀐다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const SIZE = 24;
  const DENSITY = 3; // 고해상도 화면에서도 선명하게

  function path(c, pts, close = true) {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    if (close) c.closePath();
  }
  function stroke(c, pts, width) {
    c.lineWidth = width;
    path(c, pts, false);
    c.stroke();
  }
  function dot(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  const DRAW = {
    select(c) {
      path(c, [5, 3, 5, 19, 9.5, 15, 12.5, 21.5, 15, 20.4, 12, 14, 18, 14]);
      c.globalAlpha = 0.25; c.fill(); c.globalAlpha = 1;
      c.lineWidth = 1.7; c.stroke();
    },
    wall(c) {
      path(c, [4, 20, 4, 4, 20, 4, 20, 8.5, 8.5, 8.5, 8.5, 20]);
      c.fill();
    },
    room(c) {
      c.globalAlpha = 0.22; c.fillRect(5, 5, 14, 14); c.globalAlpha = 1;
      c.lineWidth = 2.6; c.strokeRect(4.3, 4.3, 15.4, 15.4);
    },
    door(c) {
      stroke(c, [2, 20, 6, 20], 2.6);
      stroke(c, [20, 20, 22, 20], 2.6);
      stroke(c, [6, 20, 6, 6], 2);
      c.lineWidth = 1.3;
      c.beginPath(); c.arc(6, 20, 14, -Math.PI / 2, 0); c.stroke();
    },
    window(c) {
      stroke(c, [2, 12, 5, 12], 2.6);
      stroke(c, [19, 12, 22, 12], 2.6);
      c.lineWidth = 1.6; c.strokeRect(5, 8.5, 14, 7);
      stroke(c, [5, 12, 19, 12], 1.6);
    },
    column(c) {
      c.lineWidth = 2; c.strokeRect(6, 6, 12, 12);
      stroke(c, [6, 6, 18, 18], 1.4);
      stroke(c, [18, 6, 6, 18], 1.4);
    },
    elec(c) {
      path(c, [13.5, 2, 5, 13.5, 11, 13.5, 9.5, 22, 19, 10, 13, 10, 14.8, 2]);
      c.fill();
    },
    mech(c) {
      c.lineWidth = 1.8;
      c.beginPath(); c.arc(12, 12, 9.2, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        c.beginPath();
        c.ellipse(12 + Math.cos(a) * 3.8, 12 + Math.sin(a) * 3.8, 3.6, 1.9, a + 0.35, 0, Math.PI * 2);
        c.fill();
      }
      dot(c, 12, 12, 1.5);
    },
    line(c) {
      stroke(c, [3.5, 18.5, 9, 9, 15, 15, 20.5, 5.5], 2);
      dot(c, 3.5, 18.5, 2.2);
      dot(c, 20.5, 5.5, 2.2);
    },
    zone(c) {
      path(c, [4, 7, 14, 3, 21, 10, 17.5, 21, 5, 18]);
      c.globalAlpha = 0.22; c.fill(); c.globalAlpha = 1;
      c.lineWidth = 1.7; c.setLineDash([3, 2.4]); c.stroke(); c.setLineDash([]);
    },
    text(c) {
      stroke(c, [5, 5.5, 19, 5.5], 2.4);
      stroke(c, [12, 5.5, 12, 19.5], 2.4);
      stroke(c, [8.5, 19.5, 15.5, 19.5], 1.8);
    },
    dim(c) {
      stroke(c, [3.5, 7, 3.5, 17], 1.5);
      stroke(c, [20.5, 7, 20.5, 17], 1.5);
      stroke(c, [3.5, 12, 20.5, 12], 1.5);
      path(c, [3.5, 12, 8, 9.6, 8, 14.4]); c.fill();
      path(c, [20.5, 12, 16, 9.6, 16, 14.4]); c.fill();
    },
    erase(c) {
      c.save();
      c.translate(12, 11);
      c.rotate(-Math.PI / 4);
      c.lineWidth = 1.8; c.strokeRect(-9, -4.5, 18, 9);
      c.fillRect(-9, -4.5, 7, 9);
      c.restore();
      stroke(c, [9, 21, 20, 21], 1.5);
    },
    undo(c) {
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(7, 18.5);
      c.lineTo(14, 18.5);
      c.arc(14, 13.25, 5.25, Math.PI / 2, -Math.PI / 2, true);
      c.lineTo(5.5, 8);
      c.stroke();
      stroke(c, [9.5, 4, 5.5, 8, 9.5, 12], 2);
    },
    redo(c) {
      c.translate(SIZE, 0);
      c.scale(-1, 1);
      DRAW.undo(c);
    },
    fit(c) {
      stroke(c, [4, 9, 4, 4, 9, 4], 2);
      stroke(c, [15, 4, 20, 4, 20, 9], 2);
      stroke(c, [20, 15, 20, 20, 15, 20], 2);
      stroke(c, [9, 20, 4, 20, 4, 15], 2);
      c.globalAlpha = 0.35; c.fillRect(8.5, 8.5, 7, 7); c.globalAlpha = 1;
    },
    gear(c) {
      const teeth = 8, ro = 10, ri = 7.4;
      c.beginPath();
      for (let k = 0; k < teeth; k++) {
        const a = (k * Math.PI * 2) / teeth;
        const pts = [[ri, a - 0.3], [ro, a - 0.17], [ro, a + 0.17], [ri, a + 0.3]];
        pts.forEach(([r, t], i) => {
          const x = 12 + Math.cos(t) * r, y = 12 + Math.sin(t) * r;
          if (k === 0 && i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        });
      }
      c.closePath();
      c.lineWidth = 1.8; c.stroke();
      c.beginPath(); c.arc(12, 12, 3, 0, Math.PI * 2); c.stroke();
    },
    file(c) {
      c.lineWidth = 1.8;
      path(c, [6, 3, 14, 3, 19, 8, 19, 21, 6, 21]); c.stroke();
      stroke(c, [14, 3, 14, 8, 19, 8], 1.8);
    },
    chevron(c) {
      stroke(c, [6, 9, 12, 15, 18, 9], 2.4);
    },
    ruler(c) {
      c.lineWidth = 1.7; c.strokeRect(2.5, 8, 19, 8);
      for (let i = 0; i < 5; i++) {
        const x = 6 + i * 3;
        stroke(c, [x, 8, x, i % 2 ? 11 : 12.5], 1.4);
      }
    },
  };

  const cache = new Map();

  function url(name) {
    if (cache.has(name)) return cache.get(name);
    const cv = document.createElement('canvas');
    cv.width = cv.height = SIZE * DENSITY;
    const c = cv.getContext('2d');
    c.scale(DENSITY, DENSITY);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.fillStyle = c.strokeStyle = '#000';
    if (DRAW[name]) DRAW[name](c);
    const u = cv.toDataURL('image/png');
    cache.set(name, u);
    return u;
  }

  /** root 안의 [data-icon] 요소에 아이콘을 씌운다 */
  function apply(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      el.style.setProperty('--ico', `url("${url(el.dataset.icon)}")`);
    });
  }

  App.icons = { apply, url };
})();
