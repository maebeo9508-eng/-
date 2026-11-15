/* 부스 배정 (조감도 모드): 부스·몽골텐트·푸드트럭 같은 칸에 번호(A-1)와 업체·이름을 붙임.
   번호 한 번에 매기기(가로줄·세로줄 순서), 배정표 CSV, 집계 ‘전체’의 부스 배정 묶음.
   번호·업체는 도면(이름표)과 3D 이름표, 제안서 물량 집계에 같이 나옴 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const KINDS = new Set(['부스', '몽골텐트', '돔 텐트', '푸드트럭', '컨테이너']); // 파는 칸이 되는 것 (테이블·파라솔은 앉는 자리라 뺌)
  const isBooth = (e) => !!e && e.type === 'item' && e.category === 'event' && KINDS.has(e.kind);
  // 숨긴 레이어: 집계와 같은 규칙 (‘숨긴 레이어는 집계에서도 빼기’를 켰을 때만 뺌)
  const all = () => { const ex = App.layers.excludeHidden(); return [...App.doc.all()].filter((e) => isBooth(e) && (!ex || App.layers.visible(e))); };
  /** 사람이 읽는 순서로: A-2가 A-10보다 앞 */
  const natural = (a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true });
  const label = (e) => [e.boothNo, e.exhibitor].filter(Boolean).join(' ');

  /** 줄로 묶기: rows=true면 가로줄(위→아래, 줄 안에서 왼→오), 아니면 세로줄. 돌려주는 값: [[부스…], …] (줄 순서)
      줄은 물건이 그 방향으로 차지하는 폭이 절반 넘게 겹치는 것끼리 (맞붙은 두 줄은 따로, 앞선을 맞춘 큰 텐트는 같은 줄) */
  function rowsOf(list, rows = true) {
    const key = rows ? 'y' : 'x', other = rows ? 'x' : 'y', dir = rows ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const T = App.model.TYPES.item;
    const span = (e) => { const h = Math.max(1, T.extent(e, dir)); return [e[key] - h, e[key] + h]; };
    const groups = [];
    [...list].sort((a, b) => a[key] - b[key]).forEach((e) => {
      const [lo, hi] = span(e), len = hi - lo;
      let best = null, bestR = 0;
      groups.forEach((g) => {
        const ov = Math.min(hi, g.hi) - Math.max(lo, g.lo);
        const r = ov / Math.min(len, g.minLen);
        if (r > bestR) { bestR = r; best = g; }
      });
      if (best && bestR >= 0.5) {
        best.list.push(e);
        best.lo = Math.min(best.lo, lo); best.hi = Math.max(best.hi, hi); best.minLen = Math.min(best.minLen, len);
      } else groups.push({ lo, hi, minLen: len, list: [e] });
    });
    return groups
      .map((g) => ({ at: g.list.reduce((t, e) => t + e[key], 0) / g.list.length, list: g.list.sort((a, b) => a[other] - b[other]) }))
      .sort((a, b) => a.at - b.at)
      .map((g) => g.list);
  }
  const order = (list, rows = true) => rowsOf(list, rows).flat();

  const HANGUL = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
  /** 줄마다 바뀌는 앞 글자: A → B … Z → AA → AB, 가 → 나 … 하 → 가2, 그 밖의 앞 글자는 뒤에 줄 번호 (겹치는 번호가 나오지 않게) */
  function rowPrefix(prefix, i) {
    const p = (prefix || 'A').trim() || 'A';
    if (/^[A-Za-z]+$/.test(p)) {
      // 엑셀 열 이름처럼: 앞 글자를 수로 바꿔 i만큼 더함
      const up = p.toUpperCase();
      let n = 0;
      for (const ch of up) n = n * 26 + (ch.charCodeAt(0) - 64);
      n += i;
      let out = '';
      while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
      return out;
    }
    const h = HANGUL.indexOf(p);
    if (h >= 0) { const k = h + i; return `${HANGUL[k % HANGUL.length]}${k >= HANGUL.length ? Math.floor(k / HANGUL.length) + 1 : ''}`; }
    return `${p}${i + 1}`;
  }
  /** 번호 매기기. o: { prefix, start, rows, perRowLetter(줄마다 글자 바꿈) }. 돌려주는 값: 매긴 개수 */
  function number(ids, o = {}) {
    const list = ids.map((id) => App.doc.get(id)).filter((e) => isBooth(e) && !e.locked);
    if (!list.length) return 0;
    const prefix = o.prefix == null ? 'A' : String(o.prefix).trim();
    const start = Math.max(0, Math.round(Number(o.start) || 1));
    const groups = rowsOf(list, o.rows !== false);
    App.doc.transact('부스 번호', () => {
      if (o.perRowLetter) {
        // 줄마다 A, B, C … (줄 안 번호는 첫 번호부터)
        groups.forEach((g, gi) => g.forEach((e, i) => App.doc.update(e.id, { boothNo: `${rowPrefix(prefix, gi)}-${start + i}` })));
      } else {
        groups.flat().forEach((e, i) => App.doc.update(e.id, { boothNo: prefix ? `${prefix}-${start + i}` : String(start + i) }));
      }
    });
    return list.length;
  }

  async function numberDialog() {
    const sel = App.selection.list().map((id) => App.doc.get(id)).filter(isBooth);
    const target = sel.length ? sel : all();
    if (!target.length) { App.ui.toast('부스(부스·몽골텐트·푸드트럭 등)가 없습니다.'); return 0; }
    const r = await App.ui.dialog({
      title: '부스 번호 매기기',
      html: `
        <p class="dialog-note">${sel.length ? `고른 부스 ${sel.length}개` : `모든 부스 ${target.length}개`}에 번호를 매깁니다. 지금 번호는 바뀝니다.</p>
        <div class="field-grid">
          <div class="field"><label class="field-label" for="bnPrefix">앞 글자</label><div class="field-box"><input id="bnPrefix" type="text" maxlength="4" autocomplete="off" value="A"></div></div>
          <div class="field"><label class="field-label" for="bnStart">첫 번호</label><div class="field-box"><input id="bnStart" type="text" inputmode="numeric" autocomplete="off" value="1"></div></div>
        </div>
        <div class="field"><span class="field-label">순서</span>
          <div class="seg seg-inline" role="radiogroup" id="bnOrder">
            <button type="button" class="seg-btn" role="radio" data-o="rows" aria-checked="true">가로줄 먼저 (위→아래)</button>
            <button type="button" class="seg-btn" role="radio" data-o="cols" aria-checked="false">세로줄 먼저 (왼→오른)</button>
          </div></div>
        <label class="check-row"><input type="checkbox" id="bnPerRow"><span>줄마다 글자 바꾸기<small>첫 줄 A-1, A-2 … 둘째 줄 B-1, B-2 …</small></span></label>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '번호 매기기', primary: true }],
      onOpen(body) {
        body.querySelector('#bnOrder').addEventListener('click', (e) => {
          const b = e.target.closest('[data-o]');
          if (b) body.querySelectorAll('[data-o]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        });
      },
    });
    if (r.id !== 'ok') return 0;
    const b = r.body;
    const n = number(target.map((e) => e.id), {
      prefix: b.querySelector('#bnPrefix').value, start: b.querySelector('#bnStart').value,
      rows: (b.querySelector('[data-o][aria-checked="true"]') || {}).dataset.o !== 'cols', perRowLetter: b.querySelector('#bnPerRow').checked,
    });
    App.ui.toast(n ? `부스 ${n}개에 번호를 매겼습니다. 속성에서 업체·이름을 넣으세요.` : '잠긴 부스는 바꾸지 않습니다.');
    return n;
  }

  /** 배정표 CSV: 번호·업체·종류·크기·메모 (번호 순서) */
  function csvRows() {
    const list = all().sort((a, b) => (a.boothNo && b.boothNo ? natural(a.boothNo, b.boothNo) : a.boothNo ? -1 : b.boothNo ? 1 : 0));
    const m = (v) => Math.round((v || 0) / 100) / 10;
    return [['번호', '업체·이름', '종류', '가로(m)', '세로(m)', '메모'], ...list.map((e) => [e.boothNo || '', e.exhibitor || '', e.kind, m(e.size), m(e.depth != null ? e.depth : e.size), e.memo || ''])];
  }
  function exportCsv() {
    const rows = csvRows();
    if (rows.length < 2) { App.ui.toast('부스가 없습니다.'); return false; }
    const name = `부스배정표_${((App.projects && App.projects.current && App.projects.current.name) || '도면').replace(/[\\/:*?"<>|]+/g, '_')}_${App.exporter.stamp()}.csv`;
    App.exporter.saved(App.exporter.download(name, App.exporter.csvText(rows), 'text/csv;charset=utf-8'), `‘${name}’을 저장했습니다 (부스 ${rows.length - 1}개).`);
    return true;
  }

  /** 집계 ‘전체’ 묶음: 번호를 매긴 부스가 있을 때 */
  function block() {
    if (!App.modes.is('event')) return null;
    const list = all();
    if (!list.length) return null;
    const numbered = list.filter((e) => e.boothNo).sort((a, b) => natural(a.boothNo, b.boothNo));
    if (!numbered.length) {
      // 아직 번호가 없으면: 아무것도 고르지 않고도 번호를 매길 수 있게
      return { title: '부스 배정', sub: `부스 ${list.length}개 · 번호 없음`, action: { act: 'booth-number', label: '번호 매기기' }, rows: [{ label: '번호를 매기면', value: { text: '배정표·업체 입력', num: null, unit: '' }, note: '부스·몽골텐트·푸드트럭 등', cls: 'sub', cat: '부스 배정' }] };
    }
    const filled = numbered.filter((e) => e.exhibitor).length;
    const row = (lbl, text, note = '', cls = '') => ({ label: lbl, value: { text, num: null, unit: '' }, note, cls, cat: '부스 배정' });
    return {
      title: '부스 배정', sub: `번호 ${numbered.length}개 · 업체 ${filled}곳 · 빈 부스 ${numbered.length - filled}개`,
      action: { act: 'booth-csv', label: '배정표 CSV' }, action2: { act: 'booth-number', label: '번호 매기기' },
      rows: numbered.slice(0, 80).map((e) => row(e.boothNo, e.exhibitor || '비어 있음', e.kind, e.exhibitor ? 'item' : 'sub'))
        .concat(numbered.length > 80 ? [row('…', `외 ${numbered.length - 80}개`, '배정표 CSV에 모두 있음')] : []),
    };
  }

  App.booths = { KINDS, isBooth, all, label, order, rowsOf, rowPrefix, number, numberDialog, csvRows, exportCsv, block };
})();
