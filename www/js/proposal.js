/* 제안서 PDF: 표지(3D 큰 그림·받는 분·핵심 숫자·인사말·우리 회사) → 3D 투시도 → 평면도(가로로 긴 도면은 가로 쪽)
   → 물량 집계(두 단) → 견적서(견적 화면과 같은 표) → 현장 사진(핀 번호·제목·메모·사진).
   쪽마다 200dpi 그림으로 그려 JPEG로 넣음 (도면 PDF·견적서와 같은 방식: 한글 글꼴을 따로 넣지 않아도 됨) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const DPI = 200;
  const PX = (mm) => Math.round((mm / 25.4) * DPI);
  const PT = (px) => (px / DPI) * 72;
  const PORTRAIT = { W: PX(210), H: PX(297) }, LANDSCAPE = { W: PX(297), H: PX(210) };
  const M = 130;                    // 쪽 여백 (약 16mm)
  const TOP = 260, FOOT = 190;      // 머리글 아래·바닥글 위 (내용 칸)
  const INK = '#1f2937', MUTE = '#6b7280', FAINT = '#9ca3af', LINE = '#e5e7eb', SOFT = '#f3f4f6', ACCENT = '#c54b08', PIN = '#0b7285';
  const LOGO_KEY = 'company:logo';  // 이미지 정리(image:…)에 걸리지 않는 열쇠
  const COVER_H = 840;              // 표지 큰 그림 높이

  const FONT = () => getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'sans-serif';
  const projectName = () => (App.projects && App.projects.current ? App.projects.current.name : '도면');
  const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면';
  const defaultTitle = () => (App.modes.is('event') ? '행사 제안서' : '인테리어 공사 제안서');
  const settings = () => {
    const p = App.current.proposal;
    return p && typeof p === 'object' ? p : {};
  };

  /* ── 그리기 도구 ── */
  function pen(ctx) {
    const f = FONT();
    const font = (size, weight = 400) => { ctx.font = `${weight} ${size}px ${f}`; };
    /** 한 줄 글자. maxW를 넘으면 끝을 줄임표로 */
    const text = (s, x, y, size, weight = 400, color = INK, align = 'left', maxW = 0) => {
      font(size, weight);
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      let v = String(s == null ? '' : s);
      if (maxW) while (v.length > 1 && ctx.measureText(v).width > maxW) v = `${v.slice(0, -2)}…`;
      ctx.fillText(v, x, y);
      return ctx.measureText(v).width;
    };
    /** 여러 줄로 나눔: 띄어쓰기에서 먼저 끊고, 한 낱말이 너무 길면 글자 단위로 */
    const wrap = (s, size, maxW, weight = 400) => {
      font(size, weight);
      const out = [];
      String(s || '').split(/\r?\n/).forEach((para) => {
        let line = '';
        for (const word of para.split(/(\s+)/)) {
          if (!word) continue;
          const next = line + word;
          if (ctx.measureText(next).width <= maxW) { line = next; continue; }
          if (line.trim()) out.push(line.trimEnd());
          line = word.trimStart();
          while (line && ctx.measureText(line).width > maxW) {
            let n = line.length;
            while (n > 1 && ctx.measureText(line.slice(0, n)).width > maxW) n--;
            out.push(line.slice(0, n));
            line = line.slice(n);
          }
        }
        out.push(line.trimEnd());
      });
      while (out.length && !out[out.length - 1]) out.pop();
      return out;
    };
    const round = (x, y, w, h, r) => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
    };
    /** 그림을 칸에 넣음. cover: 칸을 꽉 채우고 넘치는 쪽을 자름, 아니면 다 보이게 (남는 곳은 연회색) */
    const image = (img, x, y, w, h, o = {}) => {
      ctx.save();
      round(x, y, w, h, o.r == null ? 16 : o.r);
      ctx.clip();
      ctx.fillStyle = o.bg || SOFT;
      ctx.fillRect(x, y, w, h);
      if (img) {
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        const k = o.cover ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
        const dw = iw * k, dh = ih * k;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      }
      ctx.restore();
    };
    return { ctx, font, text, wrap, round, image };
  }

  /** 내용 쪽의 머리글(묶음 번호·이름, 도면 이름)과 바닥글(쪽 번호·제안서 이름) */
  function frame(ctx, W, H, d, section, no, total) {
    const P = pen(ctx);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(M, M - 8, 64, 8);
    P.text(section.no, M, M + 40, 30, 800, ACCENT);
    P.text(section.title, M + 64, M + 40, 40, 800, INK);
    P.text(projectName(), W - M, M + 40, 26, 600, MUTE, 'right', W * 0.45);
    ctx.fillStyle = LINE;
    ctx.fillRect(M, M + 82, W - 2 * M, 3);
    P.text(`${no} / ${total}`, W / 2, H - 70, 24, 400, MUTE, 'center');
    P.text(`${d.co.name ? `${d.co.name} · ` : ''}${d.title}`, W - M, H - 70, 20, 400, FAINT, 'right', W * 0.4);
    return P;
  }

  /* ── 표지 ── */
  const CARD_H = 170;
  /** 표지 자리 계산 (그리기 전에 3D 큰 그림 높이를 정하려고 따로): 제목 줄 → 큰 그림 → 받는 분 → 인사말 → 핵심 숫자.
      인사말이 길면 큰 그림을 줄여 자리를 냄 (인사말은 8줄까지) */
  function coverMetrics(ctx, W, H, d) {
    const P = pen(ctx);
    let size = 92;
    P.font(size, 800);
    while (size > 56 && ctx.measureText(d.title).width > W - 2 * M) { size -= 4; P.font(size, 800); }
    const bar = 340 + 92 + size * 0.5 + 56 + 62;   // 주황 막대 자리
    const hy = bar + 70;
    const intro = d.intro ? P.wrap(d.intro, 30, W - 2 * M) : [];
    const shownIntro = Math.min(intro.length, 8);
    const below = 80 + (d.to ? 84 : 0) + (shownIntro ? shownIntro * 50 + 34 : 0) + (d.figures.length ? CARD_H : 0);
    const hh = Math.max(560, Math.min(COVER_H, Math.floor(H - 320 - hy - below)));
    return { size, bar, hy, hh, intro };
  }
  function drawCover(ctx, W, H, d) {
    const P = pen(ctx);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    // 맨 위: 로고(없으면 상호)와 날짜
    if (d.logo) {
      const iw = d.logo.naturalWidth || d.logo.width, ih = d.logo.naturalHeight || d.logo.height;
      const k = Math.min(380 / iw, 130 / ih);
      ctx.drawImage(d.logo, M, M, iw * k, ih * k);
    } else if (d.co.name) {
      P.text(d.co.name, M, M + 45, 36, 800, INK, 'left', W * 0.55);
    }
    P.text(d.date, W - M, M + 45, 28, 500, MUTE, 'right');
    // 제목
    const L = coverMetrics(ctx, W, H, d);
    let y = 340;
    ctx.save();
    if ('letterSpacing' in ctx) ctx.letterSpacing = '8px';
    P.text('PROPOSAL', M, y, 28, 800, ACCENT);
    ctx.restore();
    y += 92;
    P.text(d.title, M, y, L.size, 800, INK, 'left', W - 2 * M);
    y += L.size * 0.5 + 56;
    P.text(projectName(), M, y, 48, 600, '#374151', 'left', W - 2 * M);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(M, L.bar, 140, 10);
    // 큰 그림: 3D면 쪽 너비 가득, 평면도면 흰 칸 안에
    const hy = L.hy, hh = L.hh;
    if (d.hero) {
      ctx.drawImage(d.hero, 0, hy, W, hh);
    } else if (d.plan) {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, hy, W, hh);
      d.plan(ctx, { x: M, y: hy + 30, width: W - 2 * M, height: hh - 60 }, 2.2);
    } else {
      ctx.fillStyle = SOFT;
      ctx.fillRect(0, hy, W, hh);
    }
    y = hy + hh + 80;
    // 받는 분
    if (d.to) {
      P.text(`${d.to} 귀하`, M, y, 46, 800, INK, 'left', W - 2 * M);
      y += 84;
    }
    // 인사말: 핵심 숫자 칸이 들어갈 자리를 남기고 (넘치면 마지막 줄 끝을 줄임표로)
    const bottom = H - 320;
    if (L.intro.length) {
      const room = Math.max(0, Math.min(8, Math.floor((bottom - (d.figures.length ? CARD_H : 0) - y) / 50)));
      const shown = L.intro.slice(0, room);
      shown.forEach((l, i) => {
        const cut = i === room - 1 && L.intro.length > room;
        P.text(cut ? `${l.slice(0, Math.max(1, l.length - 1))}…` : l, M, y + i * 50, 30, 400, '#374151', 'left', W - 2 * M);
      });
      if (shown.length) y += shown.length * 50 + 34;
    }
    // 핵심 숫자
    if (d.figures.length && y - 26 + CARD_H <= bottom + 1) {
      const n = d.figures.length, gap = 24, cw = (W - 2 * M - gap * (n - 1)) / n, top = y - 26;
      d.figures.forEach(([label, value], i) => {
        const x = M + i * (cw + gap);
        ctx.fillStyle = SOFT;
        P.round(x, top, cw, CARD_H, 18);
        ctx.fill();
        P.text(label, x + 30, top + 52, 26, 600, MUTE, 'left', cw - 60);
        let vs = n > 3 ? 40 : 46;
        P.font(vs, 800);
        while (vs > 28 && ctx.measureText(value).width > cw - 60) { vs -= 2; P.font(vs, 800); }
        P.text(value, x + 30, top + 115, vs, 800, INK, 'left', cw - 60);
      });
    }
    // 아래: 우리 회사
    const co = d.co;
    if (co.name || co.owner || co.phone || co.biz) {
      ctx.fillStyle = LINE;
      ctx.fillRect(M, H - 290, W - 2 * M, 3);
      P.text(co.name || '', M, H - 225, 34, 800, INK, 'left', W - 2 * M);
      const info = [co.owner && `대표 ${co.owner}`, co.phone && `연락처 ${co.phone}`, co.biz && `사업자번호 ${co.biz}`].filter(Boolean).join('   ·   ');
      P.text(info, M, H - 165, 26, 500, MUTE, 'left', W - 2 * M);
    }
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, H - 36, W, 36);
  }

  /* ── 3D 투시도 ── */
  function draw3d(ctx, W, H, d, shots, no, total) {
    const P = frame(ctx, W, H, d, d.sec.d3, no, total);
    const cw = W - 2 * M;
    let y = TOP + 20;
    P.image(shots[0].canvas, M, y, cw, 1000, { cover: true });
    P.text(shots[0].label, M, y + 1000 + 38, 26, 700, '#374151');
    y += 1000 + 90;
    const sw = (cw - 30) / 2;
    shots.slice(1, 3).forEach((s, i) => {
      const x = M + i * (sw + 30);
      P.image(s.canvas, x, y, sw, 560, { cover: true });
      P.text(s.label, x, y + 560 + 38, 26, 700, '#374151');
    });
    P.text('도면 그대로 만든 3D 그림입니다. 실제 자재·색과 다를 수 있습니다.', M, H - FOOT + 40, 22, 400, FAINT);
  }

  /* ── 평면도 ── */
  function drawPlanPage(ctx, W, H, d, rect, no, total) {
    const P = frame(ctx, W, H, d, d.sec.plan, no, total);
    const f = FONT();
    const box = { x: M, y: TOP + 20, width: W - 2 * M, height: H - TOP - 20 - FOOT };
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    const inner = { x: box.x + 24, y: box.y + 24, width: box.width - 48, height: box.height - 110 };
    const scale = App.exporter.drawPlan(ctx, inner, rect, 2.5);
    App.exporter.scaleBar(ctx, box.x + 36, box.y + box.height - 34, scale, Math.round(Math.min(W, H) * 0.12), `600 26px ${f}`);
    P.text(`단위 ${App.settings.lengthUnit}, ${App.settings.areaUnit}`, box.x + box.width - 30, box.y + box.height - 44, 24, 500, MUTE, 'right');
  }

  /* ── 물량 집계: 두 단으로 흘려 담기 ── */
  const SUM = { size: 25, row: 46, title: 66, gap: 34, colGap: 70 };
  /** 줄 높이 배율 k로 흘려 담기. 돌려주는 값: { pages: [{ cols: [[항목], [항목]] }], colW, S(쓴 크기), tail(마지막 쪽에 쓴 높이) } */
  function flowSummary(blocks, W, H, k) {
    const S = { size: Math.round(SUM.size * Math.min(1, k + 0.04)), row: Math.round(SUM.row * k), title: Math.round(SUM.title * k), gap: Math.round(SUM.gap * k), colGap: SUM.colGap };
    const colW = (W - 2 * M - S.colGap) / 2, colH = H - TOP - 30 - FOOT;
    const pages = [];
    let page = null, col = 0, y = 0;
    const newCol = () => {
      if (!page || col === 1) { page = { cols: [[], []] }; pages.push(page); col = 0; } else col = 1;
      y = 0;
    };
    newCol();
    blocks.forEach((b) => {
      const rows = b.rows;
      // 제목만 단 끝에 남지 않게: 제목 + 두 줄이 안 들어가면 다음 단으로
      if (y > 0 && y + S.title + S.row * Math.min(2, rows.length) > colH) newCol();
      page.cols[col].push({ kind: 'title', text: b.title, sub: b.sub || '', y });
      y += S.title;
      rows.forEach((r) => {
        if (y + S.row > colH) {
          newCol();
          page.cols[col].push({ kind: 'title', text: `${b.title} (이어서)`, sub: '', y, cont: true });
          y += S.title;
        }
        page.cols[col].push({ kind: 'row', r, y });
        y += S.row;
      });
      y += S.gap;
    });
    return { pages, colW, S, tail: col * colH + y };
  }
  /** 마지막 쪽에 조금만 넘치면 줄 간격을 줄여 한 쪽 덜 쓰게 (글자는 거의 그대로) */
  function planSummary(blocks, W, H) {
    const base = flowSummary(blocks, W, H, 1);
    if (base.pages.length < 2) return base;
    for (const k of [0.94, 0.88]) {
      const t = flowSummary(blocks, W, H, k);
      if (t.pages.length < base.pages.length) return t;
    }
    return base;
  }
  function drawSummaryPage(ctx, W, H, d, layout, k, no, total) {
    const P = frame(ctx, W, H, d, d.sec.summary, no, total);
    const top = TOP + 30, S = layout.S;
    layout.pages[k].cols.forEach((items, c) => {
      const x0 = M + c * (layout.colW + S.colGap), x1 = x0 + layout.colW;
      items.forEach((it) => {
        const y = top + it.y;
        if (it.kind === 'title') {
          const tw = P.text(it.text, x0, y + 30, 29, 800, it.cont ? MUTE : ACCENT, 'left', layout.colW);
          if (it.sub && !it.cont) P.text(it.sub, x0 + tw + 16, y + 32, 19, 400, FAINT, 'left', layout.colW - tw - 16);
          ctx.fillStyle = it.cont ? LINE : ACCENT;
          ctx.fillRect(x0, y + S.title - 8, layout.colW, it.cont ? 2 : 3);
          return;
        }
        const r = it.r;
        const strong = r.cls === 'total' || r.cls === 'subtotal' || r.cls === 'head';
        if (r.cls === 'total') {
          ctx.fillStyle = SOFT;
          ctx.fillRect(x0, y, layout.colW, S.row);
          ctx.fillStyle = INK;
          ctx.fillRect(x0, y, layout.colW, 2);
        } else {
          ctx.fillStyle = LINE;
          ctx.fillRect(x0, y + S.row - 1.5, layout.colW, 1.5);
        }
        const cy = y + S.row / 2;
        const indent = r.cls === 'sub' ? 28 : 0;
        P.font(S.size, 800);
        const vw = r.value ? ctx.measureText(r.value.text).width : 0;
        const lw = P.text(r.label, x0 + 8 + indent, cy, S.size, strong ? 800 : 400, strong ? INK : '#374151', 'left', layout.colW - vw - 40 - indent);
        if (r.note) {
          const room = layout.colW - vw - 40 - indent - lw - 14;
          if (room > 80) P.text(r.note, x0 + 8 + indent + lw + 14, cy + 1, 18, 400, FAINT, 'left', room);
        }
        if (r.value) P.text(r.value.text, x1 - 8, cy, S.size, 800, INK, 'right');
      });
    });
  }

  /* ── 현장 사진: 핀마다 제목·메모, 사진은 두 칸씩 ── */
  const PH = { cellH: 500, cap: 54, rowGap: 26, head: 92, memo: 42, intro: 70 };
  function planPhotos(ctx, pins, W, H) {
    const P = pen(ctx);
    const cw = W - 2 * M, colH = H - TOP - 30 - FOOT;
    const pages = [];
    let page = null, y = 0;
    const newPage = () => { page = { items: [] }; pages.push(page); y = 0; };
    newPage();
    page.items.push({ kind: 'intro', y });
    y += PH.intro;
    pins.forEach((pin) => {
      // 메모는 10줄까지 (넘치면 마지막 줄 끝을 줄임표로)
      const all = pin.memo ? P.wrap(pin.memo, 26, cw - 100) : [];
      const memo = all.slice(0, 10);
      if (all.length > 10) memo[9] = `${memo[9].slice(0, Math.max(1, memo[9].length - 1))}…`;
      const head = PH.head + memo.length * PH.memo + 14;
      const photos = pin.photos || [];
      const rowH = PH.cellH + PH.cap + PH.rowGap;
      if (y > 0 && y + head + (photos.length ? rowH : 60) > colH) newPage();
      page.items.push({ kind: 'pin', pin, memo, y });
      y += head;
      if (!photos.length) { page.items.push({ kind: 'none', y }); y += 60; }
      for (let i = 0; i < photos.length; i += 2) {
        if (y + rowH > colH) {
          newPage();
          page.items.push({ kind: 'pin', pin, memo: [], y, cont: true });
          y += PH.head;
        }
        page.items.push({ kind: 'row', pin, from: i, y });
        y += rowH;
      }
      y += 30;
    });
    return pages;
  }
  function drawPhotoPage(ctx, W, H, d, pages, k, no, total) {
    const P = frame(ctx, W, H, d, d.sec.photos, no, total);
    const top = TOP + 30, cw = W - 2 * M, sw = (cw - 30) / 2;
    pages[k].items.forEach((it) => {
      const y = top + it.y;
      if (it.kind === 'intro') {
        P.text('도면의 번호 핀 자리에서 찍은 사진입니다. 핀 번호는 평면도의 번호와 같습니다.', M, y + 24, 26, 400, MUTE, 'left', cw);
      } else if (it.kind === 'pin') {
        const n = App.photos.numberOf(it.pin.id);
        ctx.fillStyle = PIN;
        ctx.beginPath();
        ctx.arc(M + 32, y + 40, 32, 0, Math.PI * 2);
        ctx.fill();
        P.text(String(n), M + 32, y + 41, n > 99 ? 24 : 30, 800, '#ffffff', 'center');
        const count = (it.pin.photos || []).length;
        const first = (it.pin.photos || [])[0];
        const date = first && first.at && !it.cont ? App.photos.dateText(first.at) : '';
        P.font(24, 400);
        const dw = date ? ctx.measureText(date).width + 30 : 0;
        P.font(24, 600);
        const countText = `사진 ${count}장`, kw = ctx.measureText(countText).width + 20;
        // 제목이 길면 줄여서 ‘사진 N장’·날짜와 겹치지 않게
        const tw = P.text(`${App.photos.title(it.pin)}${it.cont ? ' (이어서)' : ''}`, M + 86, y + 40, 36, 800, INK, 'left', Math.max(120, cw - 86 - kw - dw));
        P.text(countText, M + 86 + tw + 20, y + 42, 24, 600, MUTE);
        if (date) P.text(date, W - M, y + 42, 24, 400, MUTE, 'right');
        it.memo.forEach((l, i) => P.text(l, M + 86, y + PH.head + i * PH.memo, 26, 400, '#374151', 'left', cw - 100));
      } else if (it.kind === 'none') {
        P.text('사진이 아직 없습니다.', M + 86, y + 24, 24, 400, FAINT);
      } else if (it.kind === 'row') {
        const n = App.photos.numberOf(it.pin.id);
        const photos = it.pin.photos || [];
        for (let j = 0; j < 2 && it.from + j < photos.length; j++) {
          const ph = photos[it.from + j], x = M + j * (sw + 30);
          const img = App.images.get(ph.id);
          P.image(img, x, y, sw, PH.cellH, { bg: SOFT });
          if (!img) P.text('이 기기에서 사진을 찾지 못했습니다', x + sw / 2, y + PH.cellH / 2, 24, 400, FAINT, 'center');
          const lw = P.text(`${n}-${it.from + j + 1}`, x, y + PH.cellH + 30, 24, 800, INK);
          if (ph.at) P.text(App.photos.dateText(ph.at), x + lw + 16, y + PH.cellH + 30, 22, 400, MUTE, 'left', sw - lw - 16);
        }
      }
    });
  }

  /* ── 표지의 핵심 숫자 ── */
  function figures(s, t, pins) {
    const out = [];
    if (App.modes.is('event')) {
      const b = App.summary.blocks('all').find((x) => x.title === '행사 요약');
      if (b) b.rows.filter((r) => r.value).slice(0, 3).forEach((r) => out.push([r.label.replace(/\s*\(어림\)/, ''), r.value.text]));
    } else {
      if (s.rooms.length) {
        out.push(['바닥 면적', App.units.formatArea(s.arch.floor)]);
        out.push(['방', `${s.rooms.length}개`]);
      }
      if (s.arch.walls && out.length < 2) out.push(['벽 길이', App.units.formatLength(s.arch.wallLength)]);
    }
    if (t && t.total) out.push(['견적 합계', `${t.total.toLocaleString('ko-KR')}원`]);
    const n = pins.reduce((k, p) => k + (p.photos || []).length, 0);
    if (n && out.length < 4) out.push(['현장 사진', `${n}장`]);
    return out.slice(0, 4);
  }

  /* ── 로고 ── */
  async function logoData() {
    try {
      const r = await App.storage.blobs.get(LOGO_KEY);
      return r && typeof r.data === 'string' ? r.data : null;
    } catch (_) {
      return null;
    }
  }
  const loadImage = (src) => new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  /** 로고 파일 고르기 → 긴 쪽 600px PNG(투명 그대로)로 줄임. 돌려주는 값: data URL 또는 null(취소·실패). 저장은 saveLogo */
  function pickLogo() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.hidden = true;
      document.body.appendChild(input);
      let done = false;
      const finish = (v) => { if (done) return; done = true; input.remove(); resolve(v); };
      input.addEventListener('cancel', () => finish(null));
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) { finish(null); return; }
        const url = URL.createObjectURL(file);
        const img = await loadImage(url);
        URL.revokeObjectURL(url);
        if (!img) { App.ui.toast('그림 파일을 읽지 못했습니다.'); finish(null); return; }
        const k = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        finish(c.toDataURL('image/png'));
      });
      input.click();
    });
  }

  /** 로고 저장(data URL) 또는 지우기(null) */
  async function saveLogo(data) {
    try {
      if (data) await App.storage.blobs.put(LOGO_KEY, { data });
      else await App.storage.blobs.remove(LOGO_KEY);
      return true;
    } catch (_) {
      App.ui.toast('로고를 저장하지 못했습니다.');
      return false;
    }
  }

  /** 이 기기에서 3D(WebGL)를 실제로 쓸 수 있는지 (한 번만 알아봄) */
  let glOk = null;
  function webgl() {
    if (App.view3d && App.view3d.renderer) return true;
    if (glOk == null) {
      try {
        const g = document.createElement('canvas').getContext('webgl') || document.createElement('canvas').getContext('experimental-webgl');
        glOk = !!g;
        const lose = g && g.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } catch (_) {
        glOk = false;
      }
    }
    return glOk;
  }

  /* ── 만들기 ── */
  const PARTS = ['d3', 'plan', 'summary', 'estimate', 'photos'];
  let running = false;

  /** o: { title, intro, to, parts: { d3, plan, summary, estimate, photos }, noSave }
      돌려주는 값: { blob, name, pages: [{ kind, w, h }], skipped: [] } 또는 null */
  async function build(o = {}) {
    if (running) return null;
    running = true;
    try {
      return await buildNow(o);
    } finally {
      running = false;
      App.ui.busy(false);
    }
  }
  async function buildNow(o) {
    const parts = { d3: true, plan: true, summary: true, estimate: true, photos: true, ...(o.parts || {}) };
    const title = (o.title || '').trim() || defaultTitle();
    const to = o.to != null ? String(o.to).trim() : App.current.estimateTo || '';
    const step = async (msg) => { App.ui.busy(msg); await new Promise((r) => setTimeout(r, 20)); };
    await step('제안서를 준비하는 중…');
    // 그림 미리 읽기: 벽·현수막 사진(3D), 현장 사진
    await App.images.loadAll([...App.doc.all()]);
    const s = App.summary.compute();
    const pins = App.photos ? App.photos.all().filter((p) => App.layers.visible(p)) : [];
    const est = App.estimate.layout();
    const t = est ? est.t : null;
    const skipped = [];
    const co = App.estimate.company();
    const logo = await loadImage(await logoData());
    const rect = App.exporter.planRect();
    const n = { no: 1 };
    const sec = {};
    const nextSec = (key, label) => { sec[key] = { no: String(++n.no).padStart(2, '0'), title: label }; };
    const d = {
      title, to, co, logo, hero: null, sec,
      // 핵심 숫자: 넣지 않기로 한 견적서·현장 사진의 숫자는 표지에도 안 씀
      figures: figures(s, parts.estimate ? t : null, parts.photos ? pins : []),
      intro: o.intro != null ? String(o.intro).trim() : settings().intro || '',
      date: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
      plan: rect ? (ctx, box, k) => App.exporter.drawPlan(ctx, box, rect, k) : null,
    };
    // 3D 그림 (표지 큰 그림은 표지 자리에 맞는 높이로)
    let shots = null;
    if (parts.d3 || !rect) {
      await step('3D 그림을 만드는 중…');
      const heroH = coverMetrics(document.createElement('canvas').getContext('2d'), PORTRAIT.W, PORTRAIT.H, d).hh;
      const heroShot = App.view3d && App.view3d.stills ? App.view3d.stills([{ yaw: -0.75, pitch: 0.5, box: [0.92, 0.95, -0.95] }], PORTRAIT.W, heroH) : null;
      if (heroShot) {
        d.hero = heroShot[0];
        if (parts.d3) {
          const big = App.view3d.stills([{ yaw: -0.6, pitch: 0.62 }], PORTRAIT.W - 2 * M, 1000);
          const small = App.view3d.stills([{ yaw: -0.6 + Math.PI, pitch: 0.55 }, { yaw: 0, pitch: 1.5 }], Math.round((PORTRAIT.W - 2 * M - 30) / 2), 560);
          if (big && small) shots = [{ canvas: big[0], label: '조감도' }, { canvas: small[0], label: '반대쪽에서' }, { canvas: small[1], label: '위에서' }];
        }
      }
      if (parts.d3 && !shots) skipped.push('3D 투시도');
    }
    // 쪽 계획: { kind, W, H, draw(ctx, no, total) }
    const jobs = [{ kind: 'cover', ...PORTRAIT, draw: (ctx) => drawCover(ctx, PORTRAIT.W, PORTRAIT.H, d) }];
    if (shots) {
      nextSec('d3', '3D 투시도');
      jobs.push({ kind: '3d', ...PORTRAIT, draw: (ctx, no, total) => draw3d(ctx, PORTRAIT.W, PORTRAIT.H, d, shots, no, total) });
    }
    if (parts.plan) {
      if (rect) {
        nextSec('plan', '평면도');
        // 도면이 더 크게 들어가는 쪽 방향으로 (도면 칸: 쪽 − 여백 − 머리글·바닥글 − 축척 줄)
        const rw = rect.maxX - rect.minX, rh = rect.maxY - rect.minY;
        const fit = (S) => Math.min((S.W - 2 * M - 48) / rw, (S.H - TOP - 20 - FOOT - 110) / rh);
        const S = fit(LANDSCAPE) > fit(PORTRAIT) * 1.04 ? LANDSCAPE : PORTRAIT;
        jobs.push({ kind: 'plan', ...S, draw: (ctx, no, total) => drawPlanPage(ctx, S.W, S.H, d, rect, no, total) });
      } else skipped.push('평면도');
    }
    const scratch = document.createElement('canvas').getContext('2d');
    if (parts.summary) {
      // 현장 사진 목록은 사진 쪽에 따로 나오므로 뺌
      const blocks = App.summary.blocks('all').filter((b) => !(parts.photos && pins.length && b.title === '현장 사진'));
      if (blocks.length) {
        nextSec('summary', '물량 집계');
        const L = planSummary(blocks, PORTRAIT.W, PORTRAIT.H);
        L.pages.forEach((_, k) => jobs.push({ kind: 'summary', ...PORTRAIT, draw: (ctx, no, total) => drawSummaryPage(ctx, PORTRAIT.W, PORTRAIT.H, d, L, k, no, total) }));
      } else skipped.push('물량 집계');
    }
    if (parts.estimate) {
      if (est) {
        for (let k = 0; k < est.count; k++) jobs.push({ kind: 'estimate', W: est.W, H: est.H, draw: (ctx, no, total) => est.draw(ctx, k, { page: no, pages: total, footer: `${co.name ? `${co.name} · ` : ''}${title}` }) });
      } else skipped.push('견적서');
    }
    if (parts.photos) {
      if (pins.length) {
        nextSec('photos', '현장 사진');
        const pages = planPhotos(scratch, pins, PORTRAIT.W, PORTRAIT.H);
        pages.forEach((_, k) => jobs.push({ kind: 'photos', ...PORTRAIT, draw: (ctx, no, total) => drawPhotoPage(ctx, PORTRAIT.W, PORTRAIT.H, d, pages, k, no, total) }));
      } else skipped.push('현장 사진');
    }
    // 그리기 → JPEG
    const out = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      await step(`제안서를 만드는 중… (${i + 1}/${jobs.length}쪽)`);
      canvas.width = j.W;
      canvas.height = j.H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      j.draw(ctx, i + 1, jobs.length);
      out.push({ jpeg: App.exporter.jpegBytes(canvas, j.kind === 'photos' || j.kind === '3d' || j.kind === 'cover' ? 0.88 : 0.9), w: j.W, h: j.H, pw: PT(j.W), ph: PT(j.H), kind: j.kind });
    }
    const blob = App.exporter.pdfFromPages(out, PT(PORTRAIT.W), PT(PORTRAIT.H));
    const name = `제안서_${safeName(projectName())}_${App.exporter.stamp()}.pdf`;
    if (!o.noSave) {
      App.ui.busy(false);
      App.exporter.saved(App.exporter.download(name, blob, 'application/pdf'), `‘${name}’을 저장했습니다 (${out.length}쪽).${skipped.length ? ` 빠진 것: ${skipped.join(', ')}` : ''}`);
    }
    return { blob, name, pages: out.map((p) => ({ kind: p.kind, w: p.w, h: p.h })), skipped };
  }

  /* ── 고르는 창 ── */
  async function open() {
    if (running) return false;
    const st = settings();
    const co = App.estimate.company();
    const pins = App.photos ? App.photos.all().filter((p) => App.layers.visible(p)) : [];
    const nPhotos = pins.reduce((k, p) => k + (p.photos || []).length, 0);
    const est = App.estimate.layout();
    const t = est ? est.t : null;
    const can3d = !!(App.view3d && App.view3d.stills && webgl());
    // 처음 값: 3D·평면·물량은 넣고, 견적서는 단가를 넣었을 때, 사진은 핀이 있을 때. 사람이 바꾼 것만 이 도면에 기억
    const def = { d3: can3d, plan: true, summary: true, estimate: !!(t && t.priced), photos: pins.length > 0 };
    const parts = { ...def, ...(st.parts || {}) };
    if (!pins.length) parts.photos = false;
    if (!est) parts.estimate = false;
    if (!can3d) parts.d3 = false;
    let logo = await logoData(), logoChanged = false;
    const check = (key, label, sub, disabled = false) => `
      <label class="check-row"><input type="checkbox" data-part="${key}" ${parts[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${label}<small>${sub}</small></span></label>`;
    const r = await App.ui.dialog({
      title: '제안서 만들기 (PDF)',
      html: `
        <p class="dialog-note">표지와 3D 그림, 평면도, 물량, 견적, 현장 사진을 A4 한 묶음으로 만듭니다. 고객에게 바로 보낼 수 있습니다.</p>
        <div class="field"><label class="field-label" for="ppTitle">제목</label><div class="field-box"><input id="ppTitle" type="text" maxlength="40" value="${esc(st.title || defaultTitle())}" autocomplete="off"></div></div>
        <div class="field"><label class="field-label" for="ppTo">받는 분 <small>견적서와 같이 씀</small></label><div class="field-box"><input id="ppTo" type="text" maxlength="40" value="${esc(App.current.estimateTo || '')}" placeholder="예: ○○건설 김대리" autocomplete="off"></div></div>
        <div class="field"><label class="field-label" for="ppIntro">인사말 <small>표지에 들어감 · 비워도 됨</small></label><textarea id="ppIntro" class="field-text" rows="3" maxlength="400" placeholder="예: 현장 실측을 바탕으로 공간 구성과 예상 물량·비용을 정리했습니다.">${esc(st.intro || '')}</textarea></div>
        <div class="pp-parts">
          <div class="field-label">넣을 내용</div>
          ${check('d3', '3D 투시도', can3d ? '조감도·반대쪽·위에서 (표지 큰 그림도 3D)' : '이 기기에서는 3D를 쓸 수 없습니다', !can3d)}
          ${check('plan', '평면도', '도면 전체 · 가로로 긴 도면은 가로 쪽')}
          ${check('summary', '물량 집계', '집계 ‘전체’ 보기 내용')}
          ${check('estimate', '견적서', est ? (t && t.priced ? `단가를 넣은 ${t.priced}줄 · 합계 ${t.total.toLocaleString('ko-KR')}원` : '단가가 없어 물량 내역서로 들어감') : '넣을 항목이 없습니다', !est)}
          ${check('photos', '현장 사진', pins.length ? `핀 ${pins.length}곳 · 사진 ${nPhotos}장` : '사진 도구로 꽂은 핀이 없습니다', !pins.length)}
        </div>
        <details class="est-info pp-co" ${co.name ? '' : 'open'}>
          <summary><span class="pp-co-t">우리 회사</span><small>표지·견적서 공급자 칸 · 이 기기</small></summary>
          <div class="pp-logo">
            <div class="pp-logo-box">${logo ? `<img src="${logo}" alt="회사 로고">` : '<span>로고 없음</span>'}</div>
            <button type="button" class="btn" data-act="pp-logo">${logo ? '로고 바꾸기' : '로고 고르기'}</button>
            <button type="button" class="btn" data-act="pp-logo-del" ${logo ? '' : 'hidden'}>빼기</button>
          </div>
          <div class="field-grid">
            <div class="field"><label class="field-label" for="ppCo">상호</label><div class="field-box"><input id="ppCo" type="text" data-co="name" value="${esc(co.name || '')}" autocomplete="organization"></div></div>
            <div class="field"><label class="field-label" for="ppOwner">대표</label><div class="field-box"><input id="ppOwner" type="text" data-co="owner" value="${esc(co.owner || '')}" autocomplete="name"></div></div>
            <div class="field"><label class="field-label" for="ppPhone">연락처</label><div class="field-box"><input id="ppPhone" type="tel" data-co="phone" value="${esc(co.phone || '')}" autocomplete="tel"></div></div>
            <div class="field"><label class="field-label" for="ppBiz">사업자번호</label><div class="field-box"><input id="ppBiz" type="text" inputmode="numeric" data-co="biz" value="${esc(co.biz || '')}" autocomplete="off"></div></div>
          </div>
        </details>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: 'PDF 만들기', primary: true }],
      onOpen(body) {
        const box = body.querySelector('.pp-logo-box');
        const setLogo = (data) => {
          logo = data;
          box.innerHTML = data ? `<img src="${data}" alt="회사 로고">` : '<span>로고 없음</span>';
          body.querySelector('[data-act="pp-logo"]').textContent = data ? '로고 바꾸기' : '로고 고르기';
          body.querySelector('[data-act="pp-logo-del"]').hidden = !data;
        };
        body.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-act]');
          if (!b) return;
          // 로고는 ‘PDF 만들기’를 누를 때 저장 (취소하면 그대로)
          if (b.dataset.act === 'pp-logo') {
            const data = await pickLogo();
            if (data) { setLogo(data); logoChanged = true; }
          } else if (b.dataset.act === 'pp-logo-del') {
            setLogo(null);
            logoChanged = true;
          }
        });
      },
    });
    if (r.id !== 'ok') return false;
    const body = r.body;
    const val = (sel) => (body.querySelector(sel) ? body.querySelector(sel).value.trim() : '');
    // 고른 것 저장: 제목·인사말·넣을 내용은 이 도면, 받는 분은 견적서와 같이, 회사 정보는 이 기기
    const chosen = {}, keep = {};
    PARTS.forEach((k) => {
      const c = body.querySelector(`[data-part="${k}"]`);
      const on = !!(c && !c.disabled);
      chosen[k] = on && c.checked;
      // 못 고르게 막힌 것은 전에 기억한 대로, 고를 수 있던 것은 처음 값과 다를 때만 기억 (나중에 사진·단가가 생기면 처음 값을 따르게)
      if (!on) { if (st.parts && typeof st.parts[k] === 'boolean') keep[k] = st.parts[k]; } else if (c.checked !== def[k]) keep[k] = c.checked;
    });
    App.current.proposal = { title: val('#ppTitle'), intro: val('#ppIntro'), parts: keep };
    if (logoChanged) await saveLogo(logo);
    App.current.estimateTo = val('#ppTo');
    const nextCo = { ...App.estimate.company() };
    body.querySelectorAll('[data-co]').forEach((inp) => { nextCo[inp.dataset.co] = inp.value.trim(); });
    App.estimate.saveCompany(nextCo);
    if (App.projects && App.projects.saveNow) App.projects.saveNow();
    const res = await build({ title: App.current.proposal.title, intro: App.current.proposal.intro, to: App.current.estimateTo, parts: chosen });
    return !!res;
  }

  App.proposal = { open, build, pickLogo, saveLogo, LOGO_KEY };
})();
