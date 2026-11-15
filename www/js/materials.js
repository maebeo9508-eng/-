/* 마감 자재 수량: 방마다 고른 바닥 모양·벽 마감·천장 마감으로 벽지 롤 수, 페인트 리터, 마루 박스, 타일 장 수를 계산.
   - 바닥은 '바닥 모양'을 직접 고른 방만. 바닥 마감재(프리셋)를 고른 방은 마감재 집계에 이미 들어가므로 두 번 세지 않음
   - 기준(1롤 면적, 로스 %, 1L당 면적, 박스 면적 …)은 이 기기에 저장되고 '자재 기준' 창에서 고침
   - 수량은 면적을 모두 더한 뒤 로스를 붙이고 올림 (방마다 올려서 더하지 않음) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY = 'hjdm.matBasis';

  /* 기준값. per: 단위 하나로 덮는 면적(㎡) — 페인트는 1L로 한 번 칠하는 면적, 장판은 폭(m) */
  const DEFAULTS = {
    silk: { name: '실크 벽지', unit: '롤', per: 16.5, loss: 15, note: '폭 1.06m × 15.6m' },
    paper: { name: '합지 벽지', unit: '롤', per: 6.6, loss: 10, note: '폭 0.53m × 12.5m' },
    paint: { name: '수성 페인트', unit: 'L', per: 11, loss: 5, coats: 2, can: 18, note: '1L로 한 번 칠하는 면적' },
    walltile: { name: '벽 타일 300×600', unit: '장', per: 0.18, loss: 10 },
    plank: { name: '강마루', unit: '박스', per: 3.3, loss: 7, note: '1박스 = 1평' },
    wide: { name: '원목 마루 (넓은 널)', unit: '박스', per: 2.6, loss: 8 },
    chevron: { name: '쉐브론 마루', unit: '박스', per: 1.6, loss: 12 },
    vinyl: { name: '장판', unit: 'm', per: 1.83, loss: 5, note: '폭 1.83m 롤, 필요한 길이' },
    deco: { name: '데코타일', unit: '박스', per: 3.3, loss: 5 },
    tile: { name: '포세린 타일 600각', unit: '장', per: 0.36, loss: 8 },
    tileL: { name: '포세린 타일 800각', unit: '장', per: 0.64, loss: 10 },
    tileS: { name: '욕실 바닥 타일 300각', unit: '장', per: 0.09, loss: 10 },
    marble: { name: '대리석 600각', unit: '장', per: 0.36, loss: 10 },
    carpet: { name: '카펫', unit: '㎡', per: 1, loss: 10 },
    concrete: { name: '바닥 코팅 (노출 콘크리트)', unit: '㎡', per: 1, loss: 0 },
    epoxy: { name: '에폭시 바닥', unit: '㎡', per: 1, loss: 0 },
  };
  const ORDER = Object.keys(DEFAULTS);
  /** 바닥 모양 → 자재 */
  const FLOOR = { oak: 'plank', walnut: 'plank', greywood: 'plank', wide: 'wide', chevron: 'chevron', vinyl: 'vinyl', deco: 'deco', tile: 'tile', 'tile-l': 'tileL', bath: 'tileS', marble: 'marble', carpet: 'carpet', concrete: 'concrete', epoxy: 'epoxy' };
  /** 벽·천장 마감 고르기: [값, 이름] */
  const WALL_WORKS = [['', '없음'], ['silk', '실크 벽지'], ['paper', '합지 벽지'], ['paint', '페인트'], ['walltile', '벽 타일']];
  const CEIL_WORKS = [['', '없음'], ['silk', '실크 벽지'], ['paper', '합지 벽지'], ['paint', '페인트']];

  function basis() {
    const saved = App.storage.read(KEY) || {};
    const out = {};
    ORDER.forEach((k) => {
      const d = DEFAULTS[k], s = saved[k] || {};
      const num = (v, def, min = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : def);
      out[k] = { ...d, per: num(s.per, d.per, 0.001), loss: num(s.loss, d.loss), coats: d.coats ? num(s.coats, d.coats, 1) : undefined, can: d.can ? num(s.can, d.can, 0.1) : undefined };
    });
    return out;
  }
  const saveBasis = (b) => {
    const out = {};
    ORDER.forEach((k) => { out[k] = { per: b[k].per, loss: b[k].loss, ...(b[k].coats ? { coats: b[k].coats } : {}), ...(b[k].can ? { can: b[k].can } : {}) }; });
    App.storage.write(KEY, out);
  };

  /** 면적(mm²) → 수량. 페인트는 L(0.5L 단위 올림), 장판은 m(0.1m 올림), ㎡는 소수 한 자리, 나머지는 올림 */
  function quantity(k, mm2, b = basis()) {
    const m = b[k], a = (mm2 / 1e6) * (1 + m.loss / 100);
    if (k === 'paint') return Math.ceil(((a * m.coats) / m.per) * 2) / 2;
    if (m.unit === 'm') return Math.ceil((a / m.per) * 10) / 10;
    if (m.unit === '㎡') return Math.round(a * 10) / 10;
    return Math.ceil(a / m.per - 1e-9);
  }

  /** 방 하나의 마감 자재 면적: [{ mat, part, area(mm²), look }] */
  function roomParts(r, q = App.measure.room(r)) {
    const out = [];
    if (r.issue) return out;
    const fl = r.floorLook && FLOOR[r.floorLook];
    // 바닥 마감재(프리셋)를 고른 방은 그 마감재 집계에 이미 들어가므로 바닥 모양으로 또 세지 않음
    const finished = (q.finishes || []).some((f) => f.target === 'floor');
    if (fl && !finished) out.push({ mat: fl, part: '바닥', area: q.clearArea, look: r.floorLook });
    if (r.wallWork && DEFAULTS[r.wallWork]) out.push({ mat: r.wallWork, part: '벽', area: q.paintArea != null ? q.paintArea : App.measure.wallFinishArea(r, 0) });
    if (r.ceilWork && DEFAULTS[r.ceilWork]) out.push({ mat: r.ceilWork, part: '천장', area: q.ceiling });
    return out.filter((p) => p.area > 0);
  }
  const lookName = (id) => ((App.catalog.FLOOR_LOOKS.find((l) => l.id === id) || {}).name || '');
  /** 같은 자재·같은 부위끼리 면적을 더한 줄: { key, mat, name, spec, part, area, qty, unit, rooms, note } */
  function lines(rooms, b = basis()) {
    const map = new Map();
    rooms.forEach((r) => {
      roomParts(r, r.q).forEach((p) => {
        // 바닥 마루는 색(오크·월넛…)이 달라도 같은 자재가 아니므로 이름으로 나눔, 벽·천장 도배는 같은 벽지끼리 합침
        const spec = p.part === '바닥' ? (p.mat === 'plank' ? lookName(p.look).replace(/^강마루 · /, '') : '바닥') : p.part;
        const key = `${p.mat}|${spec}`;
        const cur = map.get(key) || { key, mat: p.mat, name: b[p.mat].name, spec, part: p.part, area: 0, rooms: 0 };
        cur.area += p.area;
        cur.rooms++;
        map.set(key, cur);
      });
    });
    return [...map.values()].sort((x, y) => ORDER.indexOf(x.mat) - ORDER.indexOf(y.mat)).map((l) => {
      const m = b[l.mat];
      const qty = quantity(l.mat, l.area, b);
      const extra = l.mat === 'paint' ? ` · ${m.coats}회 칠 · ${m.can}L 통 ${Math.ceil(qty / m.can)}개` : '';
      return { ...l, qty, unit: m.unit, note: `${App.units.formatArea(l.area)}${m.loss ? ` · 로스 ${m.loss}%` : ''}${extra}` };
    });
  }

  /** 자재 기준 고치기 창 */
  function openBasis() {
    const b = basis();
    const unitLabel = (k) => (k === 'paint' ? '㎡/L (1회)' : k === 'vinyl' ? 'm (롤 폭)' : DEFAULTS[k].unit === '㎡' ? '' : `㎡/${DEFAULTS[k].unit}`);
    const rows = ORDER.filter((k) => DEFAULTS[k].unit !== '㎡').map((k) => `
      <tr data-mat="${k}">
        <th scope="row">${esc(b[k].name)}${b[k].note ? `<small>${esc(b[k].note)}</small>` : ''}</th>
        <td><input type="text" inputmode="decimal" data-f="per" value="${b[k].per}" aria-label="${esc(b[k].name)} 기준"><small>${esc(unitLabel(k))}</small></td>
        <td><input type="text" inputmode="decimal" data-f="loss" value="${b[k].loss}" aria-label="${esc(b[k].name)} 로스"><small>%</small></td>
        ${k === 'paint' ? `<td><input type="text" inputmode="decimal" data-f="coats" value="${b[k].coats}" aria-label="칠 횟수"><small>회</small> <input type="text" inputmode="decimal" data-f="can" value="${b[k].can}" aria-label="통 크기"><small>L 통</small></td>` : '<td></td>'}
      </tr>`).join('');
    App.ui.dialog({
      title: '자재 기준',
      html: `<p class="props-meta">벽지 한 롤로 바르는 면적, 박스·장 하나의 면적, 로스(여유분 %)입니다. 제품마다 다르니 쓰는 제품에 맞게 고치세요 (이 기기에 저장).</p>
        <div class="mat-wrap"><table class="mat-table"><thead><tr><th>자재</th><th>기준</th><th>로스</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`,
      actions: [{ id: 'reset', label: '처음 값으로' }, { id: 'cancel', label: '취소' }, { id: 'ok', label: '저장', primary: true }],
      onOpen(body) { body.dataset.keys = 'local'; },
    }).then((r) => {
      if (r.id === 'reset') { App.storage.remove(KEY); App.ui.toast('자재 기준을 처음 값으로 돌렸습니다.'); }
      else if (r.id === 'ok') {
        const nb = basis();
        r.body.querySelectorAll('tr[data-mat]').forEach((tr) => {
          tr.querySelectorAll('input[data-f]').forEach((i) => {
            const v = parseFloat(String(i.value).replace(/,/g, ''));
            if (Number.isFinite(v) && v >= (i.dataset.f === 'loss' ? 0 : 0.001) && v < 1e6) nb[tr.dataset.mat][i.dataset.f] = v;
          });
        });
        saveBasis(nb);
        App.ui.toast('자재 기준을 저장했습니다.');
      } else return;
      App.ui.emit('settings'); // 집계 다시 계산
      if (App.props) App.props.refresh();
    });
  }

  App.materials = { DEFAULTS, FLOOR, WALL_WORKS, CEIL_WORKS, basis, quantity, roomParts, lines, openBasis };
})();
