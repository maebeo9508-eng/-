/* 설계 내보내기: 설계도면 PDF(도면 한 쪽 + 제원·부재표·재단 배치도), CAD 도면(DXF), 부재표 CSV, 3D 파일(GLB), 도면 그림(PNG).
   도면 쪽은 A4 가로(200dpi 2339×1654), 표 쪽은 A4 세로. 도면은 1:10·1:20 같은 맞춤 축척으로 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const D = () => App.design, DD = () => App.designDraw;
  const LAND = { W: 2339, H: 1654 }, PORT = { W: 1654, H: 2339 };
  const PT = (px) => (px / 200) * 72, PX_MM = 200 / 25.4;
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const INK = '#212529', MUTE = '#6b7680', LINE = '#ced4da', SOFT = '#f1f3f5', ACCENT = '#0b7285';
  const SCALES = [1, 2, 2.5, 4, 5, 8, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 250, 300, 400, 500];
  const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').trim() || '설계';
  const fmt = (v) => DD().fmt(v);
  const today = () => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const company = () => (App.estimate && App.estimate.company ? App.estimate.company() : {});
  const projectName = () => (App.projects && App.projects.current ? App.projects.current.name : '도면');
  const text = (ctx, t, x, y, size, weight = 500, color = INK, align = 'left', max = 0) => {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    let s = String(t);
    if (max > 0 && ctx.measureText(s).width > max) { while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1); s += '…'; }
    ctx.fillText(s, x, y);
  };
  const newCanvas = (S) => { const cv = document.createElement('canvas'); cv.width = S.W; cv.height = S.H; const c = cv.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, S.W, S.H); return cv; };

  /* ── 도면 쪽 (A4 가로) ── */
  function sheetCanvas(el, o = {}) {
    const cv = newCanvas(LAND), ctx = cv.getContext('2d'), W = LAND.W, H = LAND.H, M = 70, TB = 150;
    const area = { x: M, y: M, w: W - 2 * M, h: H - 2 * M - TB - 16 };
    // 그림 둘레에 치수선·그림 이름이 차지하는 자리(종이 픽셀)를 빼고 남는 곳에 맞는 표준 축척을 고름
    const spec = el.kind === 'model' ? [] : (D().build(el).spec || []);
    const F = DD().frame(el), Z = 2.25, E = { l: DD().EDGE.l * Z, r: DD().EDGE.r * Z, t: 14 * Z + (spec.length ? 44 + spec.length * 30 : 0), b: DD().EDGE.b * Z };
    const fw = Math.max(1, F.W), fh = Math.max(1, -F.top + F.base);
    const need = Math.max(fw / (Math.max(1, area.w - E.l - E.r) / PX_MM), fh / (Math.max(1, area.h - E.t - E.b) / PX_MM)); // 종이 1mm에 실물 몇 mm
    const N = SCALES.find((s) => s >= need) || Math.ceil(need / 100) * 100;
    const k = PX_MM / N;
    ctx.save();
    ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
    ctx.setTransform(k, 0, 0, k, area.x + (area.w - (E.l + fw * k + E.r)) / 2 + E.l, area.y + (area.h - (E.t + fh * k + E.b)) / 2 + E.t - F.top * k);
    const B = el.kind === 'model' ? null : D().build(el);
    DD().drawSheet(ctx, el, { px: Z / k, hidden: o.hidden !== false, dims: o.dims !== false, doors: o.doors !== false });
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 마감사양 (왼쪽 위)
    if (spec.length) {
      text(ctx, '마감사양', M + 10, M + 18, 24, 800, INK);
      spec.forEach((line, i) => text(ctx, `· ${line}`, M + 10, M + 54 + i * 30, 21, 500, MUTE, 'left', W * 0.6));
    }
    // 테두리와 표제란
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.strokeRect(M - 20, M - 20, W - 2 * M + 40, H - 2 * M + 40);
    const ty = H - M - TB + 20;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(M - 20, ty); ctx.lineTo(W - M + 20, ty); ctx.stroke();
    const cols = [0.36, 0.3, 0.17, 0.17];
    let cx = M - 20;
    const tw = W - 2 * M + 40;
    const co = company();
    const m = el.kind === 'model' && el.objId ? App.library.byId(el.objId) : null;
    const size = B ? B.size : m ? { w: m.w, d: m.d, h: m.h } : { w: 0, d: 0, h: 0 };
    const cells = [
      ['이름', el.name, (D().KINDS[el.kind] || {}).label || ''],
      ['전체 크기 (폭 × 깊이 × 높이)', `${fmt(size.w)} × ${fmt(size.d)} × ${fmt(size.h)} mm`, '치수 단위 mm · 3각법'],
      ['축척', `1 : ${N}`, 'A4 가로로 인쇄할 때'],
      ['작성', co.name || '현장도면', `${today()} · ${projectName()}`],
    ];
    cells.forEach(([label, value, sub], i) => {
      const w = tw * cols[i];
      if (i) { ctx.beginPath(); ctx.moveTo(cx, ty); ctx.lineTo(cx, H - M + 20); ctx.stroke(); }
      text(ctx, label, cx + 18, ty + 28, 20, 600, MUTE);
      text(ctx, value, cx + 18, ty + 72, i === 0 ? 38 : 30, 800, INK, 'left', w - 36);
      text(ctx, sub, cx + 18, ty + 116, 19, 500, MUTE, 'left', w - 36);
      cx += w;
    });
    return { canvas: cv, scale: N };
  }

  /* ── 표 쪽 (A4 세로): 제원 → 부재표 → 재단 배치도 ── */
  function bomCanvases(el) {
    if (el.kind === 'model') return [];
    const S = PORT, M = 110, pages = [];
    let cv = null, ctx = null, y = 0;
    const bottom = S.H - M - 40;
    const newPage = () => {
      cv = newCanvas(S); ctx = cv.getContext('2d');
      pages.push(cv);
      ctx.fillStyle = ACCENT; ctx.fillRect(M, M - 30, 80, 9);
      text(ctx, pages.length === 1 ? '부재표' : '부재표 (이어서)', M, M + 16, 40, 800);
      text(ctx, el.name, S.W - M, M + 16, 26, 600, MUTE, 'right', S.W * 0.5);
      ctx.fillStyle = LINE; ctx.fillRect(M, M + 52, S.W - 2 * M, 2);
      y = M + 90;
    };
    const need = (h) => { if (!cv || y + h > bottom) newPage(); };
    const heading = (t, sub = '') => {
      need(120);
      ctx.fillStyle = ACCENT; ctx.fillRect(M, y, 8, 34);
      text(ctx, t, M + 20, y + 18, 30, 800);
      if (sub) text(ctx, sub, M + 20 + ctx.measureText(t).width + 18, y + 20, 21, 500, MUTE, 'left', S.W - 2 * M - ctx.measureText(t).width - 60);
      y += 52;
    };
    /** 표: cols [{ w(비율), head, align }], rows [[칸…]] (줄에 total: true면 굵게) */
    const table = (cols, rows) => {
      const tw = S.W - 2 * M, RH = 46, xs = [];
      let x = M;
      cols.forEach((c) => { xs.push(x); x += tw * c.w; });
      const head = () => {
        ctx.fillStyle = SOFT; ctx.fillRect(M, y, tw, RH);
        cols.forEach((c, i) => text(ctx, c.head, c.align === 'right' ? xs[i] + tw * c.w - 14 : xs[i] + 14, y + RH / 2, 21, 700, MUTE, c.align || 'left'));
        ctx.fillStyle = INK; ctx.fillRect(M, y, tw, 2);
        y += RH;
      };
      need(RH * 3);
      head();
      rows.forEach((r) => {
        if (y + RH > bottom) { newPage(); head(); }
        const bold = r.total;
        if (bold) { ctx.fillStyle = '#f8f9fa'; ctx.fillRect(M, y, tw, RH); }
        (r.cells || r).forEach((cell, i) => { const c = cols[i]; text(ctx, cell, c.align === 'right' ? xs[i] + tw * c.w - 14 : xs[i] + 14, y + RH / 2, 23, bold || i === 0 ? 700 : 500, INK, c.align || 'left', tw * c.w - 24); });
        ctx.fillStyle = LINE; ctx.fillRect(M, y + RH - 1, tw, 1);
        y += RH;
      });
      ctx.fillStyle = INK; ctx.fillRect(M, y - 1, tw, 2);
      y += 34;
    };
    const B = D().build(el), b = D().bom(el);
    newPage();
    // 제원
    heading('제원');
    table([{ w: 0.26, head: '항목' }, { w: 0.34, head: '값' }, { w: 0.4, head: '덧말' }],
      [['전체 크기', `${fmt(B.size.w)} × ${fmt(B.size.d)} × ${fmt(B.size.h)} mm`, '폭 × 깊이 × 높이'], ...(B.info || []).map((r) => [r[0], r[1], r[2] || '']), ...((B.info || []).some((r) => r[0] === '무게') ? [] : [['무게', `약 ${b.kg} kg`, '철물 빼고 · 자재 무게 어림']])]);
    if (b.panels.length) {
      heading('판재', '재단 치수 (맞댐 이음 기준)');
      const rows = [];
      b.sheets.forEach((s) => {
        b.panels.filter((r) => r.g === s.g).forEach((r) => rows.push([r.n, s.mat, fmt(r.l), fmt(r.w), fmt(r.t), `${r.q}`]));
        rows.push({ total: true, cells: [`${s.mat} 원장`, `${s.sh} × ${s.sw}`, '', '', '', `${s.count}장`] });
      });
      table([{ w: 0.26, head: '이름' }, { w: 0.26, head: '자재' }, { w: 0.13, head: '길이', align: 'right' }, { w: 0.12, head: '폭', align: 'right' }, { w: 0.11, head: '두께', align: 'right' }, { w: 0.12, head: '수량', align: 'right' }], rows);
    }
    if (b.bars.length) {
      heading('각재·파이프', '자르는 길이');
      const rows = [];
      b.stocks.forEach((s) => {
        b.bars.filter((r) => r.m === s.m).forEach((r) => rows.push([r.n, s.mat, fmt(r.len), r.slant ? '끝을 각도에 맞춰' : '', `${r.q}`]));
        rows.push({ total: true, cells: [`원자재 ${s.stock / 1000}m`, `모두 ${(s.total / 1000).toFixed(1)}m · 약 ${s.kg}kg`, '', s.joined ? `긴 것 ${s.joined}개 이음` : `자투리 ${(s.waste / 1000).toFixed(1)}m`, `${s.count}본`] });
      });
      table([{ w: 0.24, head: '이름' }, { w: 0.34, head: '자재' }, { w: 0.13, head: '길이', align: 'right' }, { w: 0.17, head: '비고' }, { w: 0.12, head: '수량', align: 'right' }], rows);
    }
    if (b.led) {
      heading('전광판', '제품마다 다르니 사양서로 확인');
      table([{ w: 0.4, head: '항목' }, { w: 0.6, head: '값' }], [['LED 캐비닛', `${b.led.cab.name} mm × ${b.led.count}개 (${b.led.cols} × ${b.led.rows})`], ['화면', `${fmt(b.led.W)} × ${fmt(b.led.H)} mm · ${b.led.px[0].toLocaleString('ko-KR')} × ${b.led.px[1].toLocaleString('ko-KR')} px`], ['화면 무게', `약 ${Math.round(b.led.kgScreen)} kg`], ['최대 전력', `${(b.led.maxW / 1000).toFixed(1)} kW · 20A 회로 ${b.led.circuits}개 넘게`]]);
    }
    if (b.tops.length) {
      heading('상판', '길이 × 깊이 × 두께');
      table([{ w: 0.2, head: '이름' }, { w: 0.38, head: '자재' }, { w: 0.14, head: '길이', align: 'right' }, { w: 0.1, head: '깊이', align: 'right' }, { w: 0.08, head: '두께', align: 'right' }, { w: 0.1, head: '수량', align: 'right' }],
        b.tops.map((t) => [t.n, t.mat, fmt(t.l), fmt(t.w), fmt(t.t), `${t.q}`]));
    }
    if (b.hw.length || b.edge) {
      heading('철물·부속');
      table([{ w: 0.76, head: '이름' }, { w: 0.24, head: '수량', align: 'right' }], [...(b.edge ? [['엣지 밴딩 (보이는 마구리 · 여유 10% 더함)', `약 ${b.edge}m`]] : []), ...b.hw.map((h) => [h.n, `${h.q}개`])]);
    }
    if (b.spec.length) {
      heading('마감사양');
      table([{ w: 0.3, head: '곳' }, { w: 0.7, head: '마감' }], b.spec.map((t) => { const i = t.indexOf(':'); return i > 0 ? [t.slice(0, i), t.slice(i + 1).trim()] : [t, '']; }));
    }
    const c = D().cost(el);
    if (c.priced) { // 재료비: 단가를 적어 둔 줄이 있을 때만
      const won = (v) => `${Math.round(v).toLocaleString('ko-KR')}원`;
      heading('재료비', '적어 둔 단가로 계산 · 인건비·운반비는 빠짐');
      table([{ w: 0.46, head: '항목' }, { w: 0.14, head: '수량', align: 'right' }, { w: 0.18, head: '단가', align: 'right' }, { w: 0.22, head: '금액', align: 'right' }],
        [...c.lines.map((l) => [l.name, `${l.qty}${l.unit}`, l.price ? won(l.price) : '-', l.price ? won(l.amount) : '-']), { total: true, cells: ['재료비 합계', '', '', won(c.total)] }]);
    }
    // 재단 배치도: 원장마다 판을 놓은 그림 (어림)
    b.sheets.forEach((s) => {
      const tw = S.W - 2 * M, k = tw / (s.sw || D().SHEET_W), sh = (s.sh || D().SHEET_H) * k;
      s.layout.slice(0, 12).forEach((sheet, i) => {
        if (!cv || y + sh + (i === 0 ? 70 : 20) + 40 > bottom) newPage();
        if (i === 0) heading(`재단 배치도 — ${s.mat}`, `원장 ${s.sh} × ${s.sw} · ${s.count}장 · 톱날 3mm 어림 (결 방향은 따로 확인)`);
        ctx.fillStyle = '#fbfaf7'; ctx.fillRect(M, y, tw, sh);
        ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(M, y, tw, sh);
        sheet.rects.forEach((r) => {
          const x = M + r.x * k, yy = y + r.y * k, w = r.w * k, h = r.h * k;
          ctx.fillStyle = r.over ? '#ffe3e3' : '#f3e2c4'; ctx.fillRect(x, yy, w, h);
          ctx.strokeStyle = '#7a5a2b'; ctx.lineWidth = 1.5; ctx.strokeRect(x, yy, w, h);
          if (w > 70 && h > 34) {
            text(ctx, r.n, x + w / 2, yy + h / 2 - (h > 64 ? 13 : 0), Math.min(22, h * 0.34), 700, INK, 'center', w - 10);
            if (h > 64) text(ctx, `${fmt(r.w)} × ${fmt(r.h)}`, x + w / 2, yy + h / 2 + 14, 19, 500, MUTE, 'center', w - 10);
          }
        });
        text(ctx, `${i + 1} / ${s.count}`, M + tw - 10, y + sh - 18, 19, 600, MUTE, 'right');
        y += sh + 24;
      });
      if (s.layout.length > 12) { need(40); text(ctx, `… 외 ${s.layout.length - 12}장은 같은 방식`, M, y + 10, 21, 500, MUTE); y += 44; }
      y += 12;
    });
    // 막대 자르기: 원자재마다 토막
    b.stocks.forEach((s) => {
      const tw = S.W - 2 * M, k = tw / s.stock, bh = 42;
      s.layout.slice(0, 30).forEach((barCuts, i) => {
        if (!cv || y + bh + (i === 0 ? 70 : 12) + 30 > bottom) newPage();
        if (i === 0) heading(`자르기 — ${s.mat}`, `원자재 ${s.stock / 1000}m × ${s.count}본 · 톱날 3mm`);
        ctx.fillStyle = '#eef1f4'; ctx.fillRect(M, y, tw, bh);
        let x = M;
        barCuts.forEach((len) => {
          const w = Math.min(len * k, M + tw - x);
          ctx.fillStyle = '#cfd6dd'; ctx.fillRect(x, y, w, bh);
          ctx.strokeStyle = '#5c6670'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, bh);
          if (w > 56) text(ctx, fmt(len), x + w / 2, y + bh / 2, 19, 600, INK, 'center', w - 6);
          x += w + D().KERF * k;
        });
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(M, y, tw, bh);
        y += bh + 10;
      });
      if (s.layout.length > 30) { need(40); text(ctx, `… 외 ${s.layout.length - 30}본`, M, y + 10, 21, 500, MUTE); y += 44; }
      y += 22;
    });
    // 쪽 번호와 바닥글
    pages.forEach((p, i) => {
      const c = p.getContext('2d');
      text(c, `${el.name} · ${today()}`, M, S.H - M + 6, 19, 500, MUTE);
      text(c, `${i + 1} / ${pages.length}`, S.W / 2, S.H - M + 6, 21, 600, MUTE, 'center');
      text(c, '수량·무게는 어림 · 제작 전에 치수를 다시 확인하세요', S.W - M, S.H - M + 6, 19, 500, MUTE, 'right');
    });
    return pages;
  }

  /** 설계도면 PDF의 쪽들: [{ kind: 'sheet'|'bom', canvas, w, h }] */
  function pagesOf(els) {
    const out = [];
    els.forEach((el) => {
      const s = sheetCanvas(el, { hidden: App.current.designHidden !== false, dims: App.current.designDims !== false, doors: App.current.designDoors !== false });
      out.push({ kind: 'sheet', canvas: s.canvas, w: LAND.W, h: LAND.H, scale: s.scale, name: el.name });
      bomCanvases(el).forEach((cv) => out.push({ kind: 'bom', canvas: cv, w: PORT.W, h: PORT.H, name: el.name }));
    });
    return out;
  }
  async function exportPdf(o = {}) {
    const all = D().all(), cur = D().current();
    if (!cur) { App.ui.toast('설계물이 없습니다. ‘＋ 새 설계’로 만들어 주세요.'); return false; }
    let els = [cur];
    if (o.all) els = all;
    else if (all.length > 1 && !o.only) {
      const r = await App.ui.dialog({ title: '설계도면 PDF', html: `<p>설계물이 ${all.length}개 있습니다. 어느 것을 PDF로 만들까요?</p>`, actions: [{ id: 'cancel', label: '취소' }, { id: 'all', label: `모두 (${all.length}개)` }, { id: 'one', label: `‘${cur.name}’만`, primary: true }] });
      if (r.id === 'cancel') return false;
      if (r.id === 'all') els = all;
    }
    App.ui.busy('설계도면을 만드는 중…');
    try {
      await new Promise((res) => setTimeout(res, 30));
      const pages = pagesOf(els).map((p) => ({ jpeg: App.exporter.jpegBytes(p.canvas, 0.92), w: p.w, h: p.h, pw: PT(p.w), ph: PT(p.h), kind: p.kind }));
      const blob = App.exporter.pdfFromPages(pages, PT(LAND.W), PT(LAND.H));
      const name = `${safe(els.length > 1 ? projectName() : cur.name)}_설계도면_${App.exporter.stamp()}.pdf`;
      App.ui.busy(false);
      if (!o.noSave) App.exporter.saved(App.exporter.download(name, blob, 'application/pdf'), `‘${name}’을 저장했습니다 (${pages.length}쪽: 도면 A4 가로 + 부재표).`);
      return { name, blob, pages: pages.map((p) => ({ kind: p.kind, w: p.w, h: p.h })) };
    } finally {
      App.ui.busy(false);
    }
  }
  function exportPng(el = D().current()) {
    if (!el) { App.ui.toast('설계물이 없습니다.'); return false; }
    const { canvas } = sheetCanvas(el, { hidden: App.current.designHidden !== false, dims: App.current.designDims !== false, doors: App.current.designDoors !== false });
    const name = `${safe(el.name)}_설계도면_${App.exporter.stamp()}.png`;
    canvas.toBlob((blob) => { if (blob) App.exporter.saved(App.exporter.download(name, blob, 'image/png'), `‘${name}’을 저장했습니다.`); }, 'image/png');
    return name;
  }
  function exportCsv(el = D().current()) {
    if (!el || el.kind === 'model') { App.ui.toast('부재표가 있는 설계물을 골라 주세요.'); return false; }
    const rows = D().bomRows(el);
    const name = `${safe(el.name)}_부재표_${App.exporter.stamp()}.csv`;
    App.exporter.saved(App.exporter.download(name, App.exporter.csvText(rows), 'text/csv;charset=utf-8'), `‘${name}’을 저장했습니다. 엑셀에서 바로 열 수 있습니다.`);
    return { name, rows };
  }
  function exportGlb(el = D().current()) {
    if (!el || el.kind === 'model') return false;
    const model = D().toModel(el);
    if (!model) { App.ui.toast('내보낼 부재가 없습니다.'); return false; }
    const bytes = App.meshio.writeGLB(model);
    const name = `${safe(el.name)}_${App.exporter.stamp()}.glb`;
    App.exporter.saved(App.exporter.download(name, new Blob([bytes], { type: 'model/gltf-binary' }), 'model/gltf-binary'), `‘${name}’을 저장했습니다. 블렌더·스케치업·윈도우 3D 뷰어 등에서 열 수 있습니다.`);
    return { name, bytes: bytes.length };
  }

  /* ── CAD 도면 (DXF): 세 그림과 입체도의 테두리, 치수(선과 글자), 그림 이름 ── */
  function buildDxf(el) {
    const w = App.dxfout.writer();
    const O = DD().outlines(el, { doors: App.current.designDoors !== false }), V = O.views, s = O.size;
    const LAYER = { front: 'D-FRONT', top: 'D-TOP', side: 'D-SIDE', iso: 'D-ISO' };
    const P = (p) => ({ x: p[0], y: p[1] });
    O.lines.forEach((l) => w.poly(LAYER[l.view], l.pts.map(P), true, l.view === 'iso' ? { color: 8 } : null));
    const G = Math.max(260, Math.round(Math.max(s.w, s.h, s.d) * 0.24)), h = Math.max(18, Math.round(G / 9)), g1 = G * 0.22, g2 = G * 0.44;
    const dimH = (x0, x1, y, from) => {
      if (Math.abs(x1 - x0) < 0.5) return;
      w.line('D-DIMS', { x: x0, y: from }, { x: x0, y: y + h * 0.4 }, { color: 4 });
      w.line('D-DIMS', { x: x1, y: from }, { x: x1, y: y + h * 0.4 }, { color: 4 });
      w.line('D-DIMS', { x: x0, y }, { x: x1, y }, { color: 4 });
      w.text('D-DIMS', { x: (x0 + x1) / 2, y: y - h * 0.3 }, Math.min(h, Math.abs(x1 - x0) * 0.4 + 6), fmt(Math.abs(x1 - x0)).replace(/,/g, ''), { ha: 1 });
    };
    const dimV = (y0, y1, x, from) => {
      if (Math.abs(y1 - y0) < 0.5) return;
      w.line('D-DIMS', { x: from, y: y0 }, { x: x - h * 0.4, y: y0 }, { color: 4 });
      w.line('D-DIMS', { x: from, y: y1 }, { x: x - h * 0.4, y: y1 }, { color: 4 });
      w.line('D-DIMS', { x, y: y0 }, { x, y: y1 }, { color: 4 });
      w.text('D-DIMS', { x: x - h * 0.3, y: (y0 + y1) / 2 }, Math.min(h, Math.abs(y1 - y0) * 0.4 + 6), fmt(Math.abs(y1 - y0)).replace(/,/g, ''), { ha: 1, rot: 90 });
    };
    const cx = O.chains.x, cz = O.chains.z, cy = O.chains.y;
    const base = O.lift > 1 ? O.lift : 0; // 바닥에서 떠 있으면 바닥선과 아래 치수가 그만큼 내려감
    w.line('D-FLOOR', { x: -h, y: base }, { x: s.w + h, y: base }, { color: 8 });
    w.line('D-FLOOR', { x: V.side.x - h, y: base }, { x: V.side.x + s.d + h, y: base }, { color: 8 });
    if (cx) for (let i = 0; i + 1 < cx.length; i++) dimH(cx[i], cx[i + 1], base + g1, 0);
    dimH(0, s.w, base + (cx ? g2 : g1), 0);
    if (cz) for (let i = 0; i + 1 < cz.length; i++) dimV(-cz[i], -cz[i + 1], -g1, 0);
    dimV(0, -s.h, cz ? -g2 : -g1, 0);
    const ty = V.top.y + V.top.h;
    if (cy) for (let i = 0; i + 1 < cy.length; i++) dimV(ty - cy[i], ty - cy[i + 1], -g1, 0);
    dimV(ty, ty - s.d, cy ? -g2 : -g1, 0);
    if (O.sideChain && cy && cy.length > 2) { for (let i = 0; i + 1 < cy.length; i++) dimH(V.side.x + cy[i], V.side.x + cy[i + 1], base + g1, 0); dimH(V.side.x, V.side.x + s.d, base + g2, 0); }
    else dimH(V.side.x, V.side.x + s.d, base + g1, 0);
    O.labels.forEach((lb) => w.text('D-TEXT', { x: lb.x, y: lb.y }, Math.max(12, Math.min(h * 0.8, lb.w * 0.16)), lb.text, { ha: 1 }));
    O.spec.forEach((line, i) => w.text('D-TEXT', { x: 0, y: Math.min(V.top.y, V.iso.y) - h * 5 - i * h * 1.5 }, h, line));
    if (base > 0) { // 바닥에서 뜬 높이: 우측면도 오른쪽에
      const x = V.side.x + s.d + g1;
      w.line('D-DIMS', { x: V.side.x + s.d, y: 0 }, { x: x + h * 0.4, y: 0 }, { color: 4 });
      w.line('D-DIMS', { x, y: 0 }, { x, y: base }, { color: 4 });
      w.text('D-DIMS', { x: x + h * 0.5, y: base / 2 }, h, `바닥에서 ${fmt(base).replace(/,/g, '')}`);
    }
    ['front', 'top', 'side', 'iso'].forEach((k) => { const v = V[k]; w.text('D-TEXT', { x: v.x, y: v.y + v.h + (k === 'front' || k === 'side' ? base + g2 + h * 2.2 : h * 1.6) }, h, v.name); });
    w.text('D-TEXT', { x: 0, y: Math.min(V.top.y, V.iso.y) - h * 3 }, h * 1.4, `${el.name}  ${fmt(s.w)} x ${fmt(s.d)} x ${fmt(s.h)} mm`);
    return { text: App.dxfout.assemble(w), count: w.count, layers: [...w.used] };
  }
  function exportDxf(el = D().current()) {
    if (!el || el.kind === 'model') { App.ui.toast('부재로 된 설계물만 CAD 도면으로 내보낼 수 있습니다.'); return false; }
    const r = buildDxf(el);
    if (!r.count) { App.ui.toast('내보낼 부재가 없습니다.'); return false; }
    const name = `${safe(el.name)}_설계도면_${App.exporter.stamp()}.dxf`;
    App.exporter.saved(App.exporter.download(name, r.text, 'application/dxf'), `‘${name}’을 저장했습니다. 캐드에서 열면 1 = 1mm입니다.`);
    return { name, ...r };
  }

  App.designOut = { exportPdf, exportPng, exportCsv, exportGlb, exportDxf, buildDxf, pagesOf, sheetCanvas, bomCanvases, SCALES };
})();
