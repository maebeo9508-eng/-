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
  /** 큰 파일(영상 등)은 조각으로 나눠 씀: 한꺼번에 base64로 바꾸면 수백 MB가 되어 앱이 멈출 수 있음.
      조각 크기는 3의 배수라 조각마다 따로 base64로 바꿔 이어 붙여도 같은 파일이 됨 */
  const CHUNK = 3 * 1024 * 1024;
  async function writeNative(P, filename, blob) {
    if (blob.size <= CHUNK || !P.Filesystem.appendFile) {
      return P.Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: 'CACHE' });
    }
    const n = Math.ceil(blob.size / CHUNK);
    let res = null;
    try {
      for (let i = 0; i < n; i++) {
        App.ui.busy(`파일을 저장하는 중… ${Math.round((i / n) * 100)}%`);
        const data = await blobToBase64(blob.slice(i * CHUNK, (i + 1) * CHUNK));
        if (i === 0) res = await P.Filesystem.writeFile({ path: filename, data, directory: 'CACHE' });
        else await P.Filesystem.appendFile({ path: filename, data, directory: 'CACHE' });
      }
    } finally {
      App.ui.busy(false);
    }
    return res;
  }
  function nativeSave(filename, blob) {
    const P = nativePlugins();
    if (!P) return false;
    (async () => {
      try {
        const res = await writeNative(P, filename, blob);
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
    const view = fitView(box, rect, k);
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
  /** drawPlan의 보기: box(그림 px) 안에 rect(도면 mm)를 맞춘 배율·위치 (화면 1px = 그림 k px) */
  function fitView(box, rect, k) {
    const view = Object.create(Object.getPrototypeOf(App.plan.view));
    Object.assign(view, { scale: 1, ox: 0, oy: 0 });
    view.fitRect(rect, { x: box.x / k, y: box.y / k, width: box.width / k, height: box.height / k });
    return view;
  }
  /** drawPlan과 같은 맞춤의 도면 → 그림 변환 (drawPlan은 배율만 돌려주므로 따로): 그린 도면 위에 번호·표시를 얹을 때.
      돌려주는 값: { scale(도면 1mm가 그림 몇 px), toPage(p) → { x, y } (그림 px) } */
  function planTransform(box, rect, k = 2) {
    const v = fitView(box, rect, k);
    return { scale: v.scale * k, toPage: (p) => ({ x: (p.x * v.scale + v.ox) * k, y: (p.y * v.scale + v.oy) * k }) };
  }
  exporter.planTransform = planTransform; // 안전관리계획서 배치도의 안전 요원 번호 자리

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
    ctx.textAlign = 'left'; // 앞에서 오른쪽 맞춤으로 쓴 글자가 있어도 막대 오른쪽에
    ctx.fillText(bar.text, x + w + about / 15, y + about / 40);
    ctx.restore();
  }

  const FONT = () => getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'sans-serif';
  const projectName = () => { const n = App.projects && App.projects.current ? App.projects.current.name : '도면'; const pv = App.phaseView ? App.phaseView() : ''; return pv ? `${n} (${pv === 'demo' ? '철거도' : '신설도'})` : n; };
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

  /** 캔버스 → JPEG 바이트 (PDF에 넣을 것) */
  function jpegBytes(canvas, q = 0.9) {
    const data = canvas.toDataURL('image/jpeg', q);
    const bin = atob(data.slice(data.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /** JPEG 한 장짜리 PDF 만들기 */
  function pdfFromJpeg(jpeg, imgW, imgH, pageW, pageH) {
    return pdfFromPages([{ jpeg, w: imgW, h: imgH }], pageW, pageH);
  }
  /** 쪽마다 JPEG 한 장을 꽉 채운 PDF. pages: [{ jpeg(Uint8Array), w, h, pw?, ph? }], pageW·pageH: 포인트(1/72인치).
      쪽마다 pw·ph를 주면 그 쪽만 그 크기 (가로 쪽 섞기) */
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
    pages.forEach((p, i) => {
      const k = pageNo(i);
      const pw = p.pw || pageW, ph = p.ph || pageH;
      const content = `q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im0 Do Q`;
      obj(k, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 ${k + 1} 0 R >> >> /Contents ${k + 2} 0 R >>`);
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
    const jpeg = jpegBytes(canvas, 0.92);
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


  /* ── 현장 배치도 (인쇄용 한 장): 큰 도면 + 방위표·축척 + 옆(또는 아래) 칸에 주요 시설·물건·부스 배정 + 표제란 ── */
  const natural = (a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true });
  /** 옆 칸에 넣을 묶음들: [{ title, rows: [[왼쪽, 오른쪽]] }] */
  function layoutSections(o = {}) {
    // 배치도는 도면에 보이는 것만 (숨긴 레이어는 도면에서도 빠지므로 목록도 같게)
    const vis = (e) => App.layers.visible(e);
    const all = [...App.doc.all()].filter(vis);
    const items = all.filter((e) => e.type === 'item');
    const n0 = (v) => Math.round(v).toLocaleString('ko-KR');
    const out = [];
    if (App.modes.is('event')) {
      const count = (k) => items.filter((e) => e.kind === k).length;
      const r = App.safety ? App.safety.run() : null;
      const fac = [];
      const seats = items.reduce((t, it) => t + ((it.category === 'event' && App.catalog.seats(it)) || { count: 0 }).count, 0);
      if (seats) fac.push(['좌석', `${n0(seats)}석`]);
      if (r && r.expected) fac.push([r.auto ? '수용 인원 (어림)' : '예상 인원', `${n0(r.expected)}명`]);
      [['이동식 화장실', '칸'], ['의무실 텐트', '곳'], ['구급차', '대'], ['소화기', '개'], ['안내 키오스크', '개'], ['데스크', '개']].forEach(([k, u]) => { const n = count(k); if (n) fac.push([k, `${n}${u}`]); });
      const exits = r ? r.data.exits.filter((x) => x.routes.some(vis)).length : 0;
      if (exits) fac.push(['비상구', `${exits}곳`]);
      const routes = all.filter((e) => e.type === 'route');
      if (routes.length) fac.push(['동선', `${routes.length}개`]);
      if (fac.length) out.push({ title: '주요 시설', rows: fac });
      // 물건: 종류별 개수 (많은 것부터)
      const by = new Map();
      items.filter((e) => e.category === 'event').forEach((e) => { const k = e.kind === '사람' ? '사람' : e.kind; by.set(k, (by.get(k) || 0) + (e.kind === '사람' ? e.count || 1 : e.kind === '주차 구획' ? e.count || 1 : 1)); });
      const kinds = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, k === '주차 구획' ? `${n}칸` : k === '사람' ? `${n}명` : `${n}개`]);
      if (kinds.length) out.push({ title: '놓은 물건', rows: kinds });
      if (o.booths !== false && App.booths) {
        const bs = App.booths.all().filter((e) => e.boothNo && vis(e)).sort((a, b) => natural(a.boothNo, b.boothNo));
        if (bs.length) out.push({ title: `부스 배정 (${bs.length}개)`, rows: bs.map((e) => [e.boothNo, e.exhibitor || '—']), dense: true });
      }
    } else {
      const rooms = all.filter((e) => e.type === 'room' && !e.issue).map((r) => [r.name || '이름 없음', App.units.formatArea(App.model.TYPES.room.area ? App.model.TYPES.room.area(r) : App.measure.room(r).floor)]);
      if (rooms.length) out.push({ title: `방 (${rooms.length}개)`, rows: rooms });
      const cnt = (t) => all.filter((e) => e.type === t).length;
      const misc = [['문', cnt('door')], ['창문', cnt('window')], ['기둥', cnt('column')], ['가구·설비', items.length]].filter(([, n]) => n).map(([k, n]) => [k, `${n}개`]);
      if (misc.length) out.push({ title: '문·창문·설비', rows: misc });
    }
    return out;
  }
  /** 방위표 (위가 북쪽) */
  function northArrow(ctx, x, y, size, font) {
    ctx.save();
    ctx.fillStyle = '#212529';
    ctx.strokeStyle = '#212529';
    ctx.lineWidth = Math.max(2, size / 22);
    ctx.beginPath();
    ctx.moveTo(x, y - size / 2); ctx.lineTo(x + size * 0.28, y + size / 2); ctx.lineTo(x, y + size * 0.28); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - size / 2); ctx.lineTo(x - size * 0.28, y + size / 2); ctx.lineTo(x, y + size * 0.28); ctx.closePath();
    ctx.stroke();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', x, y - size / 2 - size * 0.08);
    ctx.restore();
  }
  /** 묶음들을 칸 rect 안에 단으로 흘려 씀. 다 못 넣으면 끝에 ‘… 외 N개’ */
  function drawSections(ctx, rect, sections, f, cols = 1) {
    const T = 30, R = 24, LH = 36, gapS = 26, colGap = 30;
    const colW = (rect.width - colGap * (cols - 1)) / cols;
    let col = 0, y = rect.y;
    const fit = (t, max) => { if (ctx.measureText(t).width <= max) return t; let s = t; while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1); return `${s}…`; };
    const nextCol = () => { col++; y = rect.y; return col < cols; };
    for (const sec of sections) {
      if (y + T + LH > rect.y + rect.height && !nextCol()) return false;
      const x0 = rect.x + col * (colW + colGap);
      ctx.fillStyle = '#c54b08';
      ctx.fillRect(x0, y, 36, 5);
      ctx.fillStyle = '#212529';
      ctx.font = `800 ${T}px ${f}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(sec.title, x0, y + 12);
      y += T + 26;
      const sub = sec.dense && colW > 520 ? 2 : 1; // 부스 목록은 칸이 넓으면 두 줄씩
      const sw = (colW - (sub - 1) * 20) / sub;
      for (let i = 0; i < sec.rows.length; i += sub) {
        if (y + LH > rect.y + rect.height && !nextCol()) return false;
        const xc = rect.x + col * (colW + colGap);
        // 마지막 단의 마지막 줄인데 더 남았으면: 이 줄에 ‘… 외 N개’를 쓰고 끝
        const lastRow = col === cols - 1 && y + 2 * LH > rect.y + rect.height;
        if (lastRow && i + sub < sec.rows.length) {
          ctx.font = `600 ${R}px ${f}`;
          ctx.fillStyle = '#868e96';
          ctx.textAlign = 'left';
          ctx.fillText(`… 외 ${sec.rows.length - i}개`, xc, y);
          return false;
        }
        for (let k = 0; k < sub && i + k < sec.rows.length; k++) {
          const [l, r] = sec.rows[i + k], xs = xc + k * (sw + 20);
          ctx.font = `600 ${R}px ${f}`;
          ctx.fillStyle = '#343a40';
          ctx.textAlign = 'left';
          const lw = Math.min(ctx.measureText(l).width, sw * 0.6);
          ctx.fillText(fit(l, sw * 0.6), xs, y);
          ctx.font = `500 ${R}px ${f}`;
          ctx.fillStyle = '#495057';
          ctx.textAlign = 'right';
          ctx.fillText(fit(r, sw - lw - 16), xs + sw, y);
        }
        ctx.strokeStyle = '#eef0f2';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(xc, y + LH - 7); ctx.lineTo(xc + colW, y + LH - 7); ctx.stroke();
        y += LH;
      }
      y += gapS;
    }
    return true;
  }
  /* ── 설치 체크리스트 (A4 세로, 여러 쪽): 구역(방)마다 품목·수량과 반입·설치·점검·철거 확인 칸, 끝에 행사 전 안전 확인.
     묶음은 집계의 ‘구역별’(인테리어 모드는 ‘방별’)과 같음. o.visibleOnly: 숨긴 레이어를 늘 뺌 (배치도에 붙일 때).
     돌려주는 값: [{ jpeg, w, h, pw, ph }] (없으면 빈 목록) ── */
  const CHECK_STEPS = ['반입', '설치', '점검', '철거'];
  function checklistPages(o = {}) {
    const groups = App.summary.checklist(o);
    if (!groups.length) return [];
    const event = App.modes.is('event');
    const [mmW, mmH] = [PAPER.A4[1], PAPER.A4[0]]; // 세로
    const W = Math.round((mmW / 25.4) * DPI), H = Math.round((mmH / 25.4) * DPI);
    const f = FONT(), m = 96, RH = 46, x0 = m, x1 = W - m;
    // 칸: 품목 | 수량 | 반입·설치·점검·철거 | 비고
    const noteW = 250, stepW = 98, qtyW = 150;
    const xNote = x1 - noteW, xStep = xNote - stepW * CHECK_STEPS.length, xQty = xStep - qtyW;
    const pages = [], heads = []; // heads: 쪽마다 그린 묶음 제목 (시험·확인용)
    let ctx = null, y = 0;
    const fit = (t, max) => { if (ctx.measureText(t).width <= max) return t; let s = String(t); while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1); return `${s}…`; };
    const bottom = H - m - 70; // 아래는 쪽 번호·담당 칸
    const newPage = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#c54b08';
      ctx.fillRect(m, m, 70, 9);
      if (!pages.length) {
        ctx.font = `800 30px ${f}`;
        ctx.fillText('설치 체크리스트', m, m + 22);
        ctx.fillStyle = '#212529';
        ctx.font = `800 54px ${f}`;
        ctx.fillText(fit(projectName(), x1 - x0), m, m + 62);
        const r = event && App.safety ? App.safety.run() : null;
        ctx.fillStyle = '#495057';
        ctx.font = `500 24px ${f}`;
        ctx.fillText([new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }), r && r.expected ? `${r.auto ? '수용 인원 (어림)' : '예상 인원'} ${r.expected.toLocaleString('ko-KR')}명` : '', `${event ? '구역' : '방'}마다 반입 → 설치 → 점검 → 철거 순서로 확인하고 ✓ 표시합니다`].filter(Boolean).join(' · '), m, m + 136);
        y = m + 200;
      } else {
        ctx.font = `700 26px ${f}`;
        ctx.fillText('설치 체크리스트', m, m + 22);
        ctx.fillStyle = '#495057';
        ctx.font = `500 24px ${f}`;
        ctx.fillText(fit(projectName(), x1 - x0 - 260), m + 230, m + 23);
        y = m + 86;
      }
      pages.push(canvas);
      heads.push([]);
    };
    const line = (yy, color = '#dee2e6', w = 1.5) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); };
    const box = (cx, cy, s = 28) => { ctx.strokeStyle = '#495057'; ctx.lineWidth = 2.5; ctx.strokeRect(Math.round(cx - s / 2), Math.round(cy - s / 2), s, s); };
    /** 묶음 제목 + 표 머리 (쪽이 넘어가면 다시 그림) */
    const heading = (g, again) => {
      ctx.fillStyle = '#212529';
      ctx.font = `800 32px ${f}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const title = fit(`${g.title}${again ? ' (이어서)' : ''}`, x1 - x0 - 20);
      heads[heads.length - 1].push(`${g.title}${again ? ' (이어서)' : ''}`);
      ctx.fillText(title, x0, y);
      if (g.sub && !again) {
        const tw = ctx.measureText(title).width;
        ctx.fillStyle = '#868e96';
        ctx.font = `500 22px ${f}`;
        ctx.fillText(fit(g.sub, x1 - x0 - tw - 30), x0 + tw + 18, y + 8);
      }
      y += 48;
      ctx.fillStyle = '#f1f3f5';
      ctx.fillRect(x0, y, x1 - x0, RH - 6);
      ctx.fillStyle = '#495057';
      ctx.font = `700 22px ${f}`;
      ctx.textBaseline = 'middle';
      const cy = y + (RH - 6) / 2;
      (g.cols || [['품목', x0 + 12, 'left'], ['수량', xStep - 16, 'right'], ...CHECK_STEPS.map((t, i) => [t, xStep + stepW * (i + 0.5), 'center']), ['비고', xNote + 14, 'left']]).forEach(([t, x, align]) => { ctx.textAlign = align; ctx.fillText(t, x, cy); });
      y += RH - 6;
    };
    newPage();
    groups.forEach((g) => {
      // 제목·표 머리·(분류 줄)·첫 줄이 한 쪽에 같이 있게
      if (y + 48 + (RH - 6) + (g.rows[0] && g.rows[0].cat ? 34 : 0) + RH > bottom) newPage();
      heading(g, false);
      let cat = null;
      g.rows.forEach((r) => {
        // 분류가 바뀌면 작은 소제목 줄 (분류 줄과 그 첫 줄은 한 쪽에)
        const sub = r.cat && r.cat !== cat ? 34 : 0;
        if (y + sub + RH > bottom) { newPage(); heading(g, true); }
        if (sub) {
          cat = r.cat;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillStyle = '#c54b08';
          ctx.font = `700 20px ${f}`;
          ctx.fillText(r.cat, x0 + 12, y + sub / 2 + 3);
          y += sub;
        }
        const cy = y + RH / 2;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#212529';
        ctx.font = `600 25px ${f}`;
        ctx.fillText(fit(r.label, xQty - x0 - 24), x0 + 12, cy);
        ctx.textAlign = 'right';
        ctx.font = `700 25px ${f}`;
        ctx.fillText(r.text, xStep - 16, cy);
        CHECK_STEPS.forEach((_, i) => box(xStep + stepW * (i + 0.5), cy));
        y += RH;
        line(y);
      });
      y += 34;
    });
    // 행사 전 안전 확인 (조감도 모드): 안전 점검의 줄마다 확인 칸
    const checks = event && App.safety ? App.safety.run().checks.filter((c) => c.id !== 'expected') : [];
    if (checks.length) {
      const g = { title: '행사 전 안전 확인', sub: '안전 점검의 어림값 · 현장에서 다시 확인', cols: [['항목', x0 + 12, 'left'], ['내용', x0 + 250, 'left'], ['확인', x1 - 50, 'center']] };
      if (y + 48 + (RH - 6) + RH + 26 > bottom) newPage(); // 첫 줄이 두 줄짜리여도 제목과 같은 쪽에
      heading(g, false);
      checks.forEach((c) => {
        // 내용은 두 줄까지
        ctx.font = `500 23px ${f}`;
        const max = x1 - 110 - (x0 + 250), words = String(c.print || c.value || '').split(' ');
        const lines = [''];
        words.forEach((w) => { const t = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w; if (ctx.measureText(t).width <= max || !lines[lines.length - 1]) lines[lines.length - 1] = t; else lines.push(w); });
        const shown = lines.slice(0, 2);
        if (lines.length > 2) shown[1] = fit(`${shown[1]} ${lines.slice(2).join(' ')}`, max);
        const h = shown.length > 1 ? RH + 26 : RH;
        if (y + h > bottom) { newPage(); heading(g, true); }
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#212529';
        ctx.font = `700 24px ${f}`;
        ctx.fillText(c.title, x0 + 12, y + h / 2);
        ctx.fillStyle = '#343a40';
        ctx.font = `500 23px ${f}`;
        shown.forEach((t, i) => ctx.fillText(fit(t, max), x0 + 250, y + h / 2 + (i - (shown.length - 1) / 2) * 30));
        box(x1 - 50, y + h / 2);
        y += h;
        line(y);
      });
    }
    // 쪽마다 아래에 담당·확인 칸과 쪽 번호
    pages.forEach((canvas, i) => {
      const c = canvas.getContext('2d');
      c.textBaseline = 'alphabetic';
      c.fillStyle = '#495057';
      c.font = `500 22px ${f}`;
      c.textAlign = 'left';
      c.fillText('담당 ________________    확인 ________________    날짜 ____ . ____ . ____', m, H - m);
      c.textAlign = 'right';
      c.fillText(`${i + 1} / ${pages.length}`, x1, H - m);
    });
    const pt = (mm) => (mm / 25.4) * 72;
    return pages.map((canvas, i) => ({ jpeg: jpegBytes(canvas, 0.9), w: W, h: H, pw: pt(mmW), ph: pt(mmH), groups: heads[i] }));
  }
  /** 설치 체크리스트만 PDF로 */
  function checklistPdf() {
    const pages = checklistPages();
    if (!pages.length) { App.ui.toast('체크리스트에 넣을 물건이 없습니다. 먼저 물건을 놓으세요.'); return false; }
    const blob = pdfFromPages(pages, pages[0].pw, pages[0].ph);
    const name = `${safeName(projectName())}_설치체크리스트_${exporter.stamp()}.pdf`;
    exporter.saved(exporter.download(name, blob, 'application/pdf'), `‘${name}’을 저장했습니다. (A4 세로 ${pages.length}쪽 · ${App.modes.is('event') ? '구역' : '방'}마다 반입·설치·점검·철거 확인 칸)`);
    return { name, pages: pages.length, blob, groups: App.summary.checklist() };
  }

  /** 현장 배치도 PDF. o: { paper: 'A4'|'A3', booths, checklist(설치 체크리스트 쪽을 뒤에 붙임) } */
  function layoutPdf(o = {}) {
    const paper = o.paper === 'A4' ? 'A4' : 'A3';
    const rect = planRect();
    if (!rect) { App.ui.toast('그린 것이 없습니다.'); return false; }
    const tall = rect.maxY - rect.minY > (rect.maxX - rect.minX) * 1.15;
    const [a, b] = PAPER[paper];
    const [mmW, mmH] = tall ? [b, a] : [a, b];
    const W = Math.round((mmW / 25.4) * DPI), H = Math.round((mmH / 25.4) * DPI);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const f = FONT();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const m = Math.round(Math.min(W, H) * 0.035);
    // 머리글
    ctx.fillStyle = '#c54b08';
    ctx.fillRect(m, m, 70, 9);
    ctx.fillStyle = '#c54b08';
    ctx.font = `800 30px ${f}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(App.modes.is('event') ? '현장 배치도' : '평면 배치도', m, m + 22);
    ctx.fillStyle = '#212529';
    ctx.font = `800 58px ${f}`;
    ctx.fillText(projectName(), m, m + 62);
    const top = m + 150;
    // 도면 칸과 옆(아래) 칸
    const side = tall ? { x: m, y: Math.round(H * 0.72), width: W - 2 * m, height: H - m - Math.round(H * 0.72) } : { x: Math.round(W * 0.72), y: top, width: W - m - Math.round(W * 0.72), height: H - m - top };
    const box = tall ? { x: m, y: top, width: W - 2 * m, height: side.y - top - 30 } : { x: m, y: top, width: side.x - m - 34, height: H - m - top };
    ctx.strokeStyle = '#ced4da';
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    const scale = drawPlan(ctx, { x: box.x + 24, y: box.y + 24, width: box.width - 48, height: box.height - 100 }, rect, 2.6);
    scaleBar(ctx, box.x + 34, box.y + box.height - 30, scale, Math.round(Math.min(W, H) * 0.12), `600 26px ${f}`);
    northArrow(ctx, box.x + box.width - 60, box.y + 92, 70, `800 30px ${f}`);
    // 축척 (이 종이 크기로 인쇄했을 때)
    // 인쇄 축척: 실제 비율을 유효 숫자 두 자리로 (자로 재도 맞게)
    const pxPerMm = DPI / 25.4, ratio = pxPerMm / scale;
    const mag = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, ratio))) - 1);
    const N = Math.max(1, Math.round(ratio / mag) * mag);
    // 표제란 (옆 칸 아래)
    const tb = { h: 250 };
    const tbRect = { x: side.x, y: side.y + side.height - tb.h, width: tall ? Math.min(side.width, 900) : side.width, height: tb.h };
    if (tall) tbRect.x = side.x + side.width - tbRect.width;
    ctx.strokeStyle = '#495057';
    ctx.lineWidth = 3;
    ctx.strokeRect(tbRect.x, tbRect.y, tbRect.width, tbRect.height);
    const co = App.estimate ? App.estimate.company() : {};
    const rowsTB = [['행사·현장', projectName()], ['날짜', new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })], ['축척', `약 1:${N.toLocaleString('ko-KR')} (${paper} ${tall ? '세로' : '가로'} 인쇄)`], ['작성', co && co.name ? `${co.name}${co.phone ? ` · ${co.phone}` : ''}` : '현장도면']];
    const rh = tb.h / rowsTB.length;
    rowsTB.forEach(([k, v], i) => {
      const y = tbRect.y + i * rh;
      if (i) { ctx.strokeStyle = '#ced4da'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tbRect.x, y); ctx.lineTo(tbRect.x + tbRect.width, y); ctx.stroke(); }
      ctx.fillStyle = '#868e96';
      ctx.font = `600 22px ${f}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(k, tbRect.x + 18, y + rh / 2);
      ctx.fillStyle = '#212529';
      ctx.font = `700 24px ${f}`;
      let t = String(v);
      const max = tbRect.width - 180;
      while (t.length > 1 && ctx.measureText(t).width > max) t = t.slice(0, -1);
      ctx.fillText(t === String(v) ? t : `${t}…`, tbRect.x + 150, y + rh / 2);
    });
    // 묶음들
    const secRect = tall ? { x: side.x, y: side.y, width: side.width - tbRect.width - 40, height: side.height } : { x: side.x, y: side.y, width: side.width, height: side.height - tb.h - 34 };
    const sections = layoutSections(o);
    const done = sections.length ? drawSections(ctx, secRect, sections, f, tall ? 2 : 1) : true;
    if (!done && App.modes.is('event')) {
      ctx.fillStyle = '#868e96';
      ctx.font = `500 20px ${f}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('전체 목록은 집계표 CSV·부스 배정표 CSV에 있습니다.', secRect.x, secRect.y + secRect.height + 24);
    }
    const jpeg = jpegBytes(canvas, 0.92);
    const pt = (mm) => (mm / 25.4) * 72;
    // 설치 체크리스트 쪽(A4 세로)을 뒤에 붙임
    const extra = o.checklist ? checklistPages({ visibleOnly: true }) : []; // 도면처럼 보이는 것만
    const blob = pdfFromPages([{ jpeg, w: W, h: H }, ...extra], pt(mmW), pt(mmH));
    const name = `${safeName(projectName())}_배치도_${exporter.stamp()}.pdf`;
    exporter.saved(exporter.download(name, blob, 'application/pdf'), `‘${name}’을 저장했습니다. (${paper} ${tall ? '세로' : '가로'}, 약 1:${N.toLocaleString('ko-KR')}${extra.length ? ` · 설치 체크리스트 ${extra.length}쪽` : ''})`);
    return { name, paper, tall, scale: N, sections: sections.map((x) => x.title), done, blob, W, H, pages: 1 + extra.length };
  }
  async function layoutDialog() {
    let paper = 'A3';
    const hasBooths = App.modes.is('event') && App.booths && App.booths.all().some((e) => e.boothNo);
    const hasItems = App.summary.checklist({ visibleOnly: true }).length > 0;
    const r = await App.ui.dialog({
      title: App.modes.is('event') ? '현장 배치도 (PDF)' : '평면 배치도 (PDF)',
      html: `
        <p>현장에 붙이거나 나눠 줄 배치도를 종이 한 장에 담습니다: 큰 도면(방위표·축척), ${App.modes.is('event') ? '주요 시설·놓은 물건·부스 배정' : '방 목록·문·창문'}, 표제란. 도면이 세로로 길면 세로로 놓습니다.</p>
        <div class="seg-inline" role="radiogroup" aria-label="종이 크기">
          <button type="button" class="seg-btn" role="radio" data-paper="A3" aria-checked="true">A3 (현장 게시용)</button>
          <button type="button" class="seg-btn" role="radio" data-paper="A4" aria-checked="false">A4</button>
        </div>
        ${hasBooths ? '<label class="check-row"><input type="checkbox" id="lyBooths" checked><span>부스 배정 목록 넣기<small>번호·업체 (길면 일부만, 전체는 배정표 CSV)</small></span></label>' : ''}
        ${hasItems ? `<label class="check-row"><input type="checkbox" id="lyCheck"><span>설치 체크리스트 쪽 붙이기<small>${App.modes.is('event') ? '구역' : '방'}마다 품목·수량과 반입·설치·점검·철거 확인 칸 (A4 세로, 뒤쪽에)</small></span></label>` : ''}
        <p class="props-meta">표제란의 ‘작성’에는 견적서의 우리 회사 정보가 들어갑니다. 숨긴 레이어는 빠집니다.</p>`,
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
    const booths = !r.body.querySelector('#lyBooths') || r.body.querySelector('#lyBooths').checked;
    const checklist = !!(r.body.querySelector('#lyCheck') && r.body.querySelector('#lyCheck').checked);
    App.ui.busy('배치도를 만드는 중…');
    await new Promise((res) => setTimeout(res, 30));
    try {
      return layoutPdf({ paper, booths, checklist });
    } finally {
      App.ui.busy(false);
    }
  }
  Object.assign(exporter, { exportPng, exportPdf, pdfDialog, pdfFromJpeg, pdfFromPages, planRect, drawPlan, scaleBar, jpegBytes, layoutPdf, layoutDialog, layoutSections, checklistPages, checklistPdf });
  App.exporter = exporter;
})();
