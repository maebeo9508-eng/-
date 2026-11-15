/* 파일로 내보내기: 브라우저 다운로드, 앱(안드로이드·아이폰)과 아이폰 사파리에서는 공유 창 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  /** 엑셀에서 수식으로 읽히지 않게, 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감쌈 */
  function csvCell(v) {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /* ── 안드로이드·아이폰 앱(Capacitor) 안에서는 브라우저 다운로드가 안 되므로
     Filesystem 플러그인으로 앱 임시 폴더에 쓰고 Share 플러그인으로 공유 창을 띄움 (저장·카톡·드라이브 등) ── */
  function nativePlugins() {
    const C = window.Capacitor;
    if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
    const P = C.Plugins || {};
    return P.Filesystem ? P : null;
  }
  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  function nativeSave(filename, blob) {
    const P = nativePlugins();
    if (!P) return false;
    (async () => {
      try {
        const data = await blobToBase64(blob);
        const res = await P.Filesystem.writeFile({ path: filename, data, directory: 'CACHE' });
        if (P.Share) await P.Share.share({ title: filename, url: res.uri, dialogTitle: '파일 저장·보내기' });
        else App.ui.toast(`앱 안에 저장했습니다: ${filename}`);
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (!/cancel/i.test(msg)) App.ui.toast(`파일을 저장하지 못했습니다. ${msg}`);
      }
    })();
    return true;
  }

  /* ── 아이폰·아이패드의 사파리·홈 화면 앱: 내려받기 대신 공유 창 (파일에 저장·카톡·메일·이미지 저장) ── */
  const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function anchorDownload(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function webShare(filename, blob) {
    if (!App.platform.ios || !navigator.share || !navigator.canShare) return false;
    let file;
    try {
      file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (!navigator.canShare({ files: [file] })) return false;
    } catch (_) {
      return false;
    }
    navigator.share({ files: [file], title: filename }).catch((e) => {
      if (e && e.name === 'AbortError') return; // 공유 창을 그냥 닫음
      // 그림을 만드느라 버튼을 누른 지 오래되면 사파리가 막음 → 한 번 더 누르게
      askShare(file, blob);
    });
    return true;
  }
  function askShare(file, blob) {
    const close = () => { const b = document.querySelector('#dialogFoot [data-id="close"]'); if (b) b.click(); };
    App.ui.dialog({
      title: '파일이 준비됐습니다',
      html: `<p class="share-name">${escHtml(file.name)}</p>
        <button type="button" class="btn btn-primary share-now" id="shareNow">저장·보내기</button>
        <p class="props-meta">‘파일에 저장’을 고르면 아이폰 ‘파일’ 앱에 저장됩니다. 카톡·메일로 바로 보낼 수도 있습니다.</p>`,
      actions: [{ id: 'close', label: '닫기' }],
      onOpen(body) {
        body.querySelector('#shareNow').addEventListener('click', () => {
          navigator.share({ files: [file], title: file.name }).then(close).catch((e) => {
            if (e && e.name === 'AbortError') return;
            anchorDownload(file.name, blob);
            close();
          });
        });
      },
    });
  }

  const exporter = {
    /** 표 → CSV 글자. 엑셀이 한글을 UTF-8로 읽도록 맨 앞에 BOM */
    csvText(rows) {
      return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    },

    /** 파일 이름에 붙일 날짜: 20261029-1630 */
    stamp(d = new Date()) {
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    },

    /** 파일 내보내기. 돌려주는 값: 'download'(바로 내려받음) · 'share'(공유 창이 뜸 — 아직 저장 전) */
    download(filename, data, mime) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
      if (nativeSave(filename, blob)) return 'share'; // 안드로이드·아이폰 앱(Capacitor): 앱 안에 만든 뒤 공유 창
      if (webShare(filename, blob)) return 'share'; // 아이폰 사파리·홈 화면 앱: 공유 창
      anchorDownload(filename, blob);
      return 'download';
    },
    /** 내보낸 뒤 알림: 공유 창이 떴으면 아직 저장 전이므로 저장할 곳을 고르라고 */
    saved(how, text) {
      App.ui.toast(how === 'share' ? '공유 창에서 ‘파일에 저장’이나 보낼 앱을 고르세요.' : text);
    },
  };

  /* ── 도면 그림 (PNG·PDF 공용) ──
     지금 화면이 아니라 도면 전체를 흰 바탕·밝은 색으로 그림. 선택 표시는 빼고, 숨긴 레이어는 그대로 숨김 */
  const NO_SELECTION = { has: () => false, size: 0, list: () => [], onChange() {} };

  /** box(그림 픽셀) 안에 rect(도면 mm)를 맞춰 그림. k: 화면 1px을 그림 몇 px로 볼지 (글자·기호·선 굵기 배율)
      돌려주는 값: 도면 1mm가 그림 몇 px인지 */
  function drawPlan(ctx, box, rect, k = 2) {
    const real = App.plan, realSel = App.selection;
    const view = Object.create(Object.getPrototypeOf(real.view));
    Object.assign(view, { scale: 1, ox: 0, oy: 0 });
    const fake = {
      canvas: ctx.canvas, ctx, view, width: ctx.canvas.width / k, height: ctx.canvas.height / k, dpr: k,
      insets: { top: 0, right: 0, bottom: 0, left: 0 }, colors: {}, requestRender() {},
    };
    // 어두운 테마여도 인쇄용 밝은 색으로
    const root = document.documentElement;
    const theme = root.dataset.theme;
    root.dataset.theme = 'light';
    try {
      real.readTheme.call(fake);
    } finally {
      root.dataset.theme = theme;
    }
    view.fitRect(rect, { x: box.x / k, y: box.y / k, width: box.width / k, height: box.height / k });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.width, box.height);
    ctx.clip();
    App.plan = fake; // 기호·글자 최소 크기 계산이 이 그림의 배율을 쓰게
    App.selection = NO_SELECTION;
    App.exporting = true;
    try {
      // 조감도 물건의 색 그림을 이 그림 배율로 먼저 만들어 둠 (화면에 안 보이던 물건도 기호가 아니라 그림으로 나오게)
      if (App.sprites && App.sprites.available && App.settings.planPictures !== false) {
        const dry = document.createElement('canvas');
        dry.width = dry.height = 2;
        App.plan = { ...fake, canvas: dry, ctx: dry.getContext('2d') };
        try { App.draw.scene(App.plan); App.sprites.flush(); } catch (e) { console.warn('물건 그림 준비 실패', e); }
        App.plan = fake;
      }
      ctx.save();
      App.draw.scene(fake);
      ctx.restore();
    } finally {
      App.plan = real;
      App.selection = realSel;
      App.exporting = false;
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    return view.scale * k;
  }

  /** 도면 범위(여백 포함). 그린 것이 없으면 null */
  function planRect() {
    const b = App.doc.bounds([...App.doc.all()].filter((e) => {
      const t = App.model.TYPES[e.type];
      return t && !t.catalog && App.layers.visible(e);
    }).map((e) => e.id));
    if (!b) return null;
    const pad = Math.max(300, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.04);
    return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
  }

  /** 축척 막대: 화면에서 about px 안팎이 되는 1·2·5 단위 길이 */
  function scaleBar(ctx, x, y, scale, about, font) {
    const bar = App.units.niceBar(about, scale); // 화면 축척 막대와 같은 계산 (0.2 m, 2 ft …)
    const w = bar.mm * scale;
    ctx.save();
    ctx.strokeStyle = '#212529';
    ctx.fillStyle = '#212529';
    ctx.lineWidth = Math.max(1.5, about / 80);
    ctx.beginPath();
    ctx.moveTo(x, y - about / 14);
    ctx.lineTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y - about / 14);
    ctx.stroke();
    ctx.font = font;
    ctx.textBaseline = 'bottom';
    ctx.fillText(bar.text, x + w + about / 15, y + about / 40);
    ctx.restore();
  }

  const FONT = () => getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'sans-serif';
  const projectName = () => (App.projects && App.projects.current ? App.projects.current.name : '도면');
  const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면';
  const dateText = () => new Date().toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  /** 도면 PNG: 도면 전체, 긴 쪽 3,000px 안팎, 아래에 이름·날짜·축척 */
  function exportPng() {
    const rect = planRect();
    if (!rect) {
      App.ui.toast('그린 것이 없어 내보낼 그림이 없습니다.');
      return false;
    }
    const rw = rect.maxX - rect.minX, rh = rect.maxY - rect.minY;
    const k = 3000 / Math.max(rw, rh);
    const W = Math.max(1200, Math.round(rw * k)), plotH = Math.max(800, Math.round(rh * k)), foot = 90;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = plotH + foot;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = drawPlan(ctx, { x: 0, y: 0, width: W, height: plotH }, rect, 2);
    // 아래 정보 줄
    const f = FONT();
    ctx.fillStyle = '#f1f3f5';
    ctx.fillRect(0, plotH, W, foot);
    ctx.fillStyle = '#212529';
    ctx.font = `700 30px ${f}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(projectName(), 30, plotH + foot / 2 - 14);
    ctx.font = `22px ${f}`;
    ctx.fillStyle = '#495057';
    ctx.fillText(`${dateText()} · 단위 ${App.settings.lengthUnit}, ${App.settings.areaUnit}`, 30, plotH + foot / 2 + 20);
    scaleBar(ctx, W - 380, plotH + foot / 2 + 14, scale, 220, `600 22px ${f}`);
    const name = `${safeName(projectName())}_도면_${exporter.stamp()}.png`;
    canvas.toBlob((blob) => {
      exporter.saved(exporter.download(name, blob, 'image/png'), `‘${name}’을 저장했습니다.`);
    }, 'image/png');
    return true;
  }

  /* ── PDF: 도면 + 집계표 한 장. 페이지 전체를 200dpi 그림으로 그려 JPEG로 넣음 (한글 글꼴을 따로 넣지 않아도 됨) ── */
  const PAPER = { A4: [297, 210], A3: [420, 297] };
  const DPI = 200;

  /** 집계표 블록을 칸 안에 그림. 넘치면 글자를 줄이고, 그래도 넘치면 뒤를 줄임표로 */
  function drawSummary(ctx, x, y, w, h, blocks) {
    const f = FONT();
    const rowsOf = (b) => b.rows.length + 1;
    const total = blocks.reduce((n, b) => n + rowsOf(b), 0) + blocks.length * 0.6;
    let size = Math.max(18, Math.min(28, Math.floor(h / (total * 1.55))));
    const lh = size * 1.55;
    let cy = y;
    // 다 들어가면 끝까지, 아니면 맨 아래 한 줄은 '나머지는…' 문구 자리로 남김 (묶음 사이 틈까지 셈)
    const fits = blocks.reduce((n, b) => n + rowsOf(b), 0) * lh + Math.max(0, blocks.length - 1) * lh * 0.6 <= h + 0.5;
    const bottom = y + h - (fits ? 0 : lh);
    const room = () => cy + lh <= bottom + 0.5;
    let cut = false;
    ctx.textBaseline = 'middle';
    for (const b of blocks) {
      if (!room()) { cut = true; break; }
      ctx.font = `700 ${size * 1.05}px ${f}`;
      ctx.fillStyle = '#c54b08';
      ctx.textAlign = 'left';
      ctx.fillText(b.title, x, cy + lh / 2);
      cy += lh;
      for (const r of b.rows) {
        if (!room()) { cut = true; break; }
        const strong = r.cls === 'total' || r.cls === 'subtotal' || r.cls === 'head';
        if (r.cls === 'total') {
          ctx.strokeStyle = '#212529';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, cy + 1);
          ctx.lineTo(x + w, cy + 1);
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#dee2e6';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, cy + lh);
          ctx.lineTo(x + w, cy + lh);
          ctx.stroke();
        }
        ctx.font = `${strong ? 700 : 400} ${size}px ${f}`;
        ctx.fillStyle = strong ? '#212529' : '#495057';
        ctx.textAlign = 'left';
        const label = r.cls === 'sub' ? `  ${r.label}` : r.label;
        const valueW = r.value ? ctx.measureText(r.value.text).width : 0;
        let text = label;
        while (text.length > 1 && ctx.measureText(text).width > w - valueW - size) text = text.slice(0, -2) + '…';
        ctx.fillText(text, x, cy + lh / 2);
        if (r.value) {
          ctx.font = `700 ${size}px ${f}`;
          ctx.fillStyle = '#212529';
          ctx.textAlign = 'right';
          ctx.fillText(r.value.text, x + w, cy + lh / 2);
        }
        cy += lh;
      }
      if (cut) break;
      cy += lh * 0.6;
    }
    if (cut) {
      ctx.font = `${size}px ${f}`;
      ctx.fillStyle = '#868e96';
      ctx.textAlign = 'left';
      ctx.fillText('… 나머지는 집계표 CSV에서 보세요.', x, Math.min(cy, bottom) + lh / 2);
    }
    ctx.textAlign = 'left';
  }

  /** JPEG 한 장짜리 PDF 만들기 */
  function pdfFromJpeg(jpeg, imgW, imgH, pageW, pageH) {
    return pdfFromPages([{ jpeg, w: imgW, h: imgH }], pageW, pageH);
  }
  /** 쪽마다 JPEG 한 장을 꽉 채운 PDF. pages: [{ jpeg(Uint8Array), w, h }], pageW·pageH: 포인트(1/72인치) */
  function pdfFromPages(pages, pageW, pageH) {
    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let length = 0;
    const push = (chunk) => {
      const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
      parts.push(bytes);
      length += bytes.length;
    };
    const obj = (n, body) => {
      offsets[n] = length;
      push(`${n} 0 obj\n${body}\nendobj\n`);
    };
    // 1: 목록, 2: 쪽 묶음, 쪽마다 [쪽, 그림, 내용] 세 개씩 (3번부터)
    const n = pages.length;
    const pageNo = (i) => 3 + i * 3;
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageNo(i)} 0 R`).join(' ')}] /Count ${n} >>`);
    const content = `q ${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm /Im0 Do Q`;
    pages.forEach((p, i) => {
      const k = pageNo(i);
      obj(k, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 ${k + 1} 0 R >> >> /Contents ${k + 2} 0 R >>`);
      offsets[k + 1] = length;
      push(`${k + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream\nendobj\n');
      obj(k + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });
    const count = 3 + n * 3;
    const xref = length;
    let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let k = 1; k < count; k++) table += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`;
    push(table);
    push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  function exportPdf(paper = 'A4') {
    const [mmW, mmH] = PAPER[paper] || PAPER.A4;
    const W = Math.round((mmW / 25.4) * DPI), H = Math.round((mmH / 25.4) * DPI);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const f = FONT();
    const m = Math.round(W * 0.025);
    const head = Math.round(H * 0.07);
    // 머리글
    ctx.fillStyle = '#212529';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${Math.round(head * 0.45)}px ${f}`;
    ctx.fillText(projectName(), m, m + head * 0.45);
    ctx.font = `${Math.round(head * 0.24)}px ${f}`;
    ctx.fillStyle = '#495057';
    ctx.fillText(`${dateText()} · 단위 ${App.settings.lengthUnit}, ${App.settings.areaUnit} · 현장도면`, m, m + head * 0.85);
    ctx.fillStyle = '#c54b08';
    ctx.fillRect(m, m + head, W - 2 * m, 4);
    // 도면 (왼쪽) · 집계표 (오른쪽)
    const top = m + head + 24, bottom = H - m;
    const planW = Math.round((W - 2 * m) * 0.62);
    const box = { x: m, y: top, width: planW, height: bottom - top };
    const rect = planRect();
    ctx.strokeStyle = '#ced4da';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    if (rect) {
      const inner = { x: box.x + 20, y: box.y + 20, width: box.width - 40, height: box.height - 80 };
      const scale = drawPlan(ctx, inner, rect, 2.5); // 200dpi 인쇄에서 글자 3.5mm 안팎
      scaleBar(ctx, box.x + 30, box.y + box.height - 25, scale, Math.round(W * 0.08), `600 ${Math.round(head * 0.22)}px ${f}`);
    } else {
      ctx.font = `${Math.round(head * 0.3)}px ${f}`;
      ctx.fillStyle = '#868e96';
      ctx.fillText('그린 것이 없습니다.', box.x + 40, box.y + 80);
    }
    const sx = m + planW + Math.round(W * 0.02);
    const blocks = App.summary.blocks('all');
    if (blocks.length) drawSummary(ctx, sx, top, W - m - sx, bottom - top, blocks);
    // JPEG로 넣기
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const jpeg = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
    const pt = (mm) => (mm / 25.4) * 72;
    const blob = pdfFromJpeg(jpeg, W, H, pt(mmW), pt(mmH));
    const name = `${safeName(projectName())}_도면집계_${exporter.stamp()}.pdf`;
    exporter.saved(exporter.download(name, blob, 'application/pdf'), `‘${name}’을 저장했습니다. (${paper} 가로, 인쇄용)`);
    return true;
  }

  async function pdfDialog() {
    let paper = 'A4';
    const r = await App.ui.dialog({
      title: '도면 + 집계표 PDF',
      html: `
        <p>도면 전체와 집계표(전체 보기)를 종이 한 장(가로)에 담습니다.</p>
        <div class="seg-inline" role="radiogroup" aria-label="종이 크기">
          <button type="button" class="seg-btn" role="radio" data-paper="A4" aria-checked="true">A4</button>
          <button type="button" class="seg-btn" role="radio" data-paper="A3" aria-checked="false">A3 (더 크게)</button>
        </div>
        <p class="props-meta">숨긴 레이어는 도면에서도 빠집니다. 집계표가 길면 글자를 줄이고, 다 못 담으면 끝에 표시합니다.</p>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: 'PDF 만들기', primary: true }],
      onOpen(body) {
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-paper]');
          if (!b) return;
          paper = b.dataset.paper;
          body.querySelectorAll('[data-paper]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        });
      },
    });
    if (r.id !== 'ok') return false;
    App.ui.busy('PDF를 만드는 중…');
    await new Promise((res) => setTimeout(res, 30));
    try {
      return exportPdf(paper);
    } finally {
      App.ui.busy(false);
    }
  }

  Object.assign(exporter, { exportPng, exportPdf, pdfDialog, pdfFromJpeg, pdfFromPages, planRect });
  App.exporter = exporter;
})();
