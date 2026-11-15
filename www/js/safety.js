/* 행사 안전 점검 (조감도 모드): 예상 인원으로 화장실·소화기·의료·인파 밀집·비상 대피를 어림해서 알려 줌.
   - 집계 ‘전체’의 ‘안전 점검’ 묶음, 점검 창(동선 도구 위쪽 막대·집계에서 열기)
   - 도면에 겹쳐 보기: 소화기가 닿는 거리(20m), 소화기에서 먼 불 쓰는 물건, 관람 구역의 밀집도, 비상구
   - 제안서 PDF의 ‘안전 점검’ 쪽
   기준은 현장에서 흔히 쓰는 어림값이며 법정 기준을 대신하지 않음 (창·제안서에 적어 둠) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const RULE = {
    perToilet: 100,          // 이동식 화장실 1칸에 100명 (반나절 행사 어림)
    reach: 20000,            // 소화기: 각 부분에서 20m 안 (mm, 직선거리로 어림)
    medicalAt: 1000,         // 1,000명 이상: 구급차·의무실
    careAt: 300,             // 300명 이상: 의무 인력·비상 대피 동선 권장
    densityOk: 2,            // 1㎡에 2명까지 여유
    densityBad: 4,           // 4명을 넘으면 위험 (밀려 넘어질 수 있음)
    flow: 80,                // 출구 폭 1m에 1분에 80명 빠져나감
    evacMin: 8,              // 8분 안에 다 나가면 여유
  };
  // 불이 날 수 있는 것 (전기·가스·조리·조명): 가까이에 소화기
  const FIRE = new Set(['푸드트럭', '발전기', '무대', '부스', '대형 텐트', '몽골텐트', '돔 텐트', '난로', '조명 타워', 'LED 스크린', '컨테이너', '매표소', '콘솔 데스크']);
  const MEDICAL = /의무|응급|구급/;
  const LV = { ok: { mark: '✓', word: '여유', cls: 'ok' }, warn: { mark: '!', word: '주의', cls: 'warn' }, bad: { mark: '✕', word: '위험', cls: 'bad' }, info: { mark: 'i', word: '참고', cls: 'info' } };
  const n0 = (v) => Math.round(v).toLocaleString('ko-KR');
  const n1 = (v) => (Math.round(v * 10) / 10).toLocaleString('ko-KR');

  /* ── 모으기 ── */
  function collect() {
    const vis = (e) => App.layers.visible(e);
    const all = [...App.doc.all()].filter(vis);
    const items = all.filter((e) => e.type === 'item');
    const zones = all.filter((e) => e.type === 'zone');
    const routes = all.filter((e) => e.type === 'route');
    const seats = items.reduce((t, it) => t + ((it.category === 'event' && App.catalog.seats(it)) || { count: 0 }).count, 0);
    const crowdZones = zones.filter((z) => z.crowd);
    const crowdArea = crowdZones.reduce((t, z) => t + App.model.TYPES.zone.area(z), 0) / 1e6; // ㎡
    const indoor = all.filter((e) => e.type === 'wall').length >= 3; // 벽으로 둘러싼 실내 행사장 (건물 화장실을 씀)
    return { items, zones, routes, seats, crowdZones, crowdArea, indoor };
  }
  /** 수용 인원 어림 (좌석 + 관람 구역 1㎡에 1명): 예상 인원을 안 넣었을 때 */
  const capacity = (c) => c.seats + Math.floor(c.crowdArea);
  /** 예상 인원: 넣은 값, 없으면 수용 인원 어림 */
  function expected(c = collect()) {
    const v = Number(App.current.expected);
    return v > 0 ? Math.round(v) : capacity(c);
  }
  const center = (it) => ({ x: it.x, y: it.y });

  /* ── 점검 ── 돌려주는 값: { expected, auto(예상 인원을 넣지 않음), checks: [{ id, title, level, value, detail, advice }], data } */
  let cache = null;
  function run() {
    // 같은 도면·같은 예상 인원·같은 레이어면 다시 셈하지 않음 (겹쳐 보기는 화면을 옮길 때마다 그림)
    const key = `${App.doc.version}|${App.current.expected || ''}|${(App.current.hiddenLayers || []).join(',')}|${App.modes.get()}`;
    if (cache && cache.key === key) return cache.r;
    const r = compute();
    cache = { key, r };
    return r;
  }
  function compute() {
    const c = collect();
    const N = expected(c);
    const auto = !(Number(App.current.expected) > 0);
    const checks = [];
    const data = { uncovered: [], extinguishers: [], density: null, exits: [], crowdZones: c.crowdZones };

    // 1) 인파 밀집: 서서 있을 사람을 관람·대기 구역 넓이로 나눔
    const standing = Math.max(0, N - c.seats);
    if (c.crowdZones.length && c.crowdArea > 0) {
      const d = standing / c.crowdArea;
      data.density = d;
      const level = d <= RULE.densityOk ? 'ok' : d <= RULE.densityBad ? 'warn' : 'bad';
      checks.push({
        id: 'density', title: '인파 밀집', level, value: `1㎡에 ${n1(d)}명`,
        detail: `서서 있을 사람 ${n0(standing)}명 ÷ 관람·대기 구역 ${n0(c.crowdArea)}㎡ (구역 ${c.crowdZones.length}곳)`,
        advice: level === 'ok' ? `여유 인원 ${n0(c.crowdArea * RULE.densityOk)}명까지 (1㎡에 ${RULE.densityOk}명)` : `관람 구역을 넓히거나 입장을 나눠 받으세요. 여유 ${n0(c.crowdArea * RULE.densityOk)}명 · 한계 ${n0(c.crowdArea * RULE.densityBad)}명`,
      });
    } else if (standing > 0) {
      checks.push({ id: 'density', title: '인파 밀집', level: 'warn', value: `서서 ${n0(standing)}명`, detail: '좌석보다 예상 인원이 많은데 서 있을 곳이 표시되지 않았습니다', advice: '영역을 고르고 ‘관람·대기 구역’에 체크하면 밀집도를 셉니다' });
    }

    // 2) 화장실
    const toilets = c.items.filter((it) => it.kind === '이동식 화장실').length;
    if (N > 0) {
      const need = Math.ceil(N / RULE.perToilet);
      if (c.indoor && !toilets) {
        // 실내 행사장: 건물 화장실을 쓰므로 칸 수만 알려 줌
        checks.push({ id: 'toilet', title: '화장실', level: 'info', value: `권장 ${need}칸`, detail: `실내 행사장 · ${RULE.perToilet}명에 1칸 어림 (예상 ${n0(N)}명)`, advice: '건물 화장실 칸 수가 모자라면 이동식 화장실을 더하세요' });
      } else {
        const level = toilets >= need ? 'ok' : toilets >= need / 2 ? 'warn' : 'bad';
        checks.push({ id: 'toilet', title: '화장실', level, value: `${toilets}칸 / 권장 ${need}칸`, detail: `${RULE.perToilet}명에 1칸 어림 (예상 ${n0(N)}명)`, advice: level === 'ok' ? '여성용을 더 많이 두면 줄이 짧아집니다' : `이동식 화장실 ${need - toilets}칸을 더 놓으세요` });
      }
    }

    // 3) 소화기: 불 쓰는 물건마다 20m 안에 소화기
    const ext = c.items.filter((it) => it.kind === '소화기');
    data.extinguishers = ext;
    const fire = c.items.filter((it) => FIRE.has(it.kind));
    if (fire.length) {
      const far = fire.filter((it) => !ext.some((e) => Math.hypot(e.x - it.x, e.y - it.y) <= RULE.reach));
      data.uncovered = far;
      const level = far.length ? 'bad' : 'ok';
      const names = [...new Set(far.map((it) => it.kind))].slice(0, 4).join(', ');
      checks.push({
        id: 'fire', title: '소화기', level, value: far.length ? `먼 곳 ${far.length}개` : `${ext.length}개 · 모두 20m 안`,
        detail: `불을 쓰는 물건 ${fire.length}개(무대·부스·텐트·푸드트럭·발전기 등)에서 20m 안 (직선거리)`,
        advice: far.length ? `${names}${far.length > 4 ? ' 등' : ''} 가까이에 소화기를 놓으세요 (도면에 겹쳐 보면 빨간 표시)` : '소화기 자리를 안내판·지도에도 적어 두세요',
      });
    } else if (N >= RULE.careAt && !ext.length) {
      checks.push({ id: 'fire', title: '소화기', level: 'warn', value: '없음', detail: '불 쓰는 물건은 없지만 사람이 많습니다', advice: '입구·안내 데스크 가까이에 소화기를 두세요' });
    }

    // 4) 의료·구급
    const medical = c.items.filter((it) => it.kind === '구급차' || MEDICAL.test(it.memo || '') || MEDICAL.test(it.text || ''))
      .concat(c.zones.filter((z) => MEDICAL.test(z.name || '')));
    if (N >= RULE.medicalAt) {
      checks.push({ id: 'medical', title: '의료·구급', level: medical.length ? 'ok' : 'bad', value: medical.length ? `${medical.length}곳` : '없음', detail: `예상 ${n0(N)}명 (1,000명 이상)`, advice: medical.length ? '구급차가 드나들 길(차량 동선)을 비워 두세요' : '구급차나 의무실(이름에 ‘의무’가 들어간 텐트·구역)을 두세요' });
    } else if (N >= RULE.careAt) {
      checks.push({ id: 'medical', title: '의료·구급', level: medical.length ? 'ok' : 'warn', value: medical.length ? `${medical.length}곳` : '없음', detail: `예상 ${n0(N)}명`, advice: medical.length ? '응급 연락처를 안내판에 적어 두세요' : '의무 인력이나 응급 키트를 둘 자리를 정하세요' });
    }

    // 5) 비상 대피: 비상 대피 동선의 끝 = 비상구, 폭으로 빠져나가는 시간 어림
    const evac = c.routes.filter((r) => r.kind === '비상 대피' && r.points.length >= 2);
    if (evac.length) {
      const W = evac.reduce((t, r) => t + (r.width || 1200), 0) / 1000; // m
      const longest = Math.max(...evac.map((r) => App.routes.length(r))) / 1000; // m
      const flowMin = N / Math.max(0.1, W * RULE.flow);
      const walkMin = longest / 1.3 / 60;
      const total = flowMin + walkMin;
      const blocked = evac.reduce((t, r) => t + App.routes.check(r).issues.length, 0);
      data.exits = evac.map((r) => ({ at: r.points[r.points.length - 1], from: r.points[r.points.length - 2], route: r }));
      const level = blocked ? 'bad' : total <= RULE.evacMin ? 'ok' : total <= RULE.evacMin * 1.5 ? 'warn' : 'bad';
      checks.push({
        id: 'evac', title: '비상 대피', level, value: `약 ${n1(total)}분`,
        detail: `비상구 ${evac.length}곳 · 출구 폭 합계 ${n1(W)}m · 가장 긴 대피 길 ${n0(longest)}m${blocked ? ` · 걸리는 곳 ${blocked}곳` : ''}`,
        advice: blocked ? '동선 체크에서 걸리는 곳을 먼저 치우세요' : total <= RULE.evacMin ? `${RULE.evacMin}분 안에 다 나갈 수 있는 어림입니다` : '비상구를 늘리거나 출구 폭(동선 속성의 통로 폭)을 넓히세요',
      });
    } else if (N >= RULE.careAt) {
      checks.push({ id: 'evac', title: '비상 대피', level: 'warn', value: '대피 동선 없음', detail: `예상 ${n0(N)}명`, advice: '동선 도구에서 ‘비상 대피’를 골라 자리에서 출구까지 그리세요 (끝이 비상구)' });
    }
    return { expected: N, auto, capacity: capacity(c), seats: c.seats, crowdArea: c.crowdArea, checks, data };
  }

  /* ── 집계 ‘전체’의 묶음 ── */
  function block() {
    if (!App.modes.is('event')) return null;
    const r = run();
    if (!r.checks.length) return null;
    const worst = r.checks.some((x) => x.level === 'bad') ? 'bad' : r.checks.some((x) => x.level === 'warn') ? 'warn' : 'ok';
    // 줄은 짧게 (자세한 까닭·할 일은 ‘자세히’ 창에)
    return {
      title: '안전 점검',
      sub: `예상 ${n0(r.expected)}명 기준${r.auto ? ' (수용 인원 어림)' : ''} · 어림값`,
      warn: worst !== 'ok',
      action: { act: 'safety-open', label: '자세히' },
      rows: r.checks.map((x) => ({ label: `${LV[x.level].mark} ${x.title}`, value: { text: x.value, num: null, unit: '' }, note: LV[x.level].word, cls: `item lv-${LV[x.level].cls}`, cat: '안전 점검' })),
    };
  }

  /* ── 점검 창 ── */
  function listHtml(r) {
    return r.checks.length ? r.checks.map((x) => `
      <div class="sf-row lv-${LV[x.level].cls}">
        <span class="sf-badge">${LV[x.level].mark} ${LV[x.level].word}</span>
        <div class="sf-body"><b>${esc(x.title)}</b> <span class="sf-val">${esc(x.value)}</span>
          <small>${esc(x.detail)}</small><p>${esc(x.advice)}</p></div>
      </div>`).join('') : '<p class="props-meta">점검할 것이 없습니다. 좌석·관람 구역·물건을 놓으면 점검합니다.</p>';
  }
  async function open() {
    if (!App.modes.is('event')) { App.ui.toast('안전 점검은 조감도(행사) 모드에서 씁니다.'); return; }
    const r0 = run();
    await App.ui.dialog({
      title: '행사 안전 점검',
      html: `
        <div class="field"><label class="field-label" for="sfExpected">예상 인원 <small>비우면 수용 인원 어림 ${n0(r0.capacity)}명</small></label>
          <div class="field-box"><input id="sfExpected" type="text" inputmode="numeric" autocomplete="off" value="${r0.auto ? '' : r0.expected}" placeholder="${n0(r0.capacity)}"><span class="field-unit">명</span></div></div>
        <label class="check-row"><input type="checkbox" id="sfView" ${App.current.safetyView ? 'checked' : ''}><span>도면에 겹쳐 보기<small>소화기 닿는 거리(20m)·먼 물건·관람 구역 밀집도·비상구</small></span></label>
        <div class="sf-list" aria-live="polite">${listHtml(r0)}</div>
        <p class="props-meta">현장에서 흔히 쓰는 어림 기준입니다: 화장실 ${RULE.perToilet}명에 1칸, 소화기 20m, 밀집 1㎡에 ${RULE.densityOk}명 여유·${RULE.densityBad}명 넘으면 위험, 출구 폭 1m에 1분 ${RULE.flow}명, 대피 ${RULE.evacMin}분. 법정 기준·인허가는 관할 기관에 확인하세요.</p>`,
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen(body) {
        const list = body.querySelector('.sf-list');
        body.querySelector('#sfExpected').addEventListener('input', (e) => {
          const v = Number(String(e.target.value).replace(/[^\d]/g, ''));
          App.current.expected = v > 0 ? v : null;
          list.innerHTML = listHtml(run());
          save();
        });
        body.querySelector('#sfView').addEventListener('change', (e) => {
          App.current.safetyView = e.target.checked;
          save();
          App.plan.requestRender();
        });
      },
    });
    if (App.summary && App.summary.render) App.summary.render();
  }
  const save = () => { if (App.projects && App.projects.saveNow) App.projects.saveNow(); };

  /* ── 도면에 겹쳐 그리기 (draw.js에서 도면 좌표계로 부름) ── */
  let forced = false; // 제안서 쪽: 설정과 상관없이 그림
  const showing = () => App.modes.is('event') && (forced || !!App.current.safetyView);
  function drawOverlay(plan) {
    if (!showing()) return;
    const r = run(), ctx = plan.ctx, k = 1 / plan.view.scale;
    ctx.save();
    // 관람 구역 밀집도: 여유 초록·주의 주황·위험 빨강
    if (r.data.density != null) {
      const d = r.data.density, col = d <= RULE.densityOk ? '47,158,68' : d <= RULE.densityBad ? '232,89,12' : '224,49,49';
      r.data.crowdZones.forEach((z) => {
        ctx.beginPath();
        z.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fillStyle = `rgba(${col},0.22)`;
        ctx.fill();
        ctx.setLineDash([8 * k, 5 * k]);
        ctx.lineWidth = 2.5 * k;
        ctx.strokeStyle = `rgba(${col},0.9)`;
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }
    // 소화기가 닿는 거리 20m
    r.data.extinguishers.forEach((e) => {
      ctx.beginPath();
      ctx.arc(e.x, e.y, RULE.reach, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(224,49,49,0.05)';
      ctx.fill();
      ctx.setLineDash([10 * k, 6 * k]);
      ctx.lineWidth = 1.5 * k;
      ctx.strokeStyle = 'rgba(224,49,49,0.55)';
      ctx.stroke();
      ctx.setLineDash([]);
    });
    // 소화기에서 먼 물건: 빨간 테두리
    r.data.uncovered.forEach((it) => {
      const b = App.model.TYPES.item.bounds(it);
      const pad = 6 * k;
      ctx.lineWidth = 3 * k;
      ctx.strokeStyle = '#e03131';
      ctx.strokeRect(b.minX - pad, b.minY - pad, b.maxX - b.minX + pad * 2, b.maxY - b.minY + pad * 2);
    });
    ctx.restore();
  }
  /** 화면 좌표계 글자 (밀집도 숫자, 비상구, 먼 물건 표시) */
  function drawLabels(plan) {
    if (!showing()) return;
    const r = run(), ctx = plan.ctx, v = plan.view;
    const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`;
    const placed = []; // 겹치면 글자 대신 작은 ! 표시 (붙어 있는 부스가 많을 때 글자가 겹쳐 안 보이지 않게)
    const tag = (x, y, text, bg, fg = '#fff', small = false) => {
      ctx.font = font(800, 12);
      const w = ctx.measureText(text).width + 12;
      const box = { x0: x - w / 2, x1: x + w / 2, y0: y - 10, y1: y + 10 };
      if (small && placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) {
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.fillStyle = fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', x, y + 0.5);
        return;
      }
      placed.push(box);
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 10, w, 20, 6); else ctx.rect(x - w / 2, y - 10, w, 20);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 0.5);
    };
    ctx.save();
    if (r.data.density != null) {
      const d = r.data.density, bg = d <= RULE.densityOk ? '#2f9e44' : d <= RULE.densityBad ? '#e8590c' : '#e03131';
      r.data.crowdZones.forEach((z) => {
        const c = App.geom.interiorPoint(z.points), p = v.toScreen(c.x, c.y);
        tag(p.x, p.y + 22, `1㎡에 ${n1(d)}명`, bg);
      });
    }
    r.data.uncovered.forEach((it) => {
      const p = v.toScreen(it.x, it.y);
      tag(p.x, p.y - 18, '소화기 멀음', '#e03131', '#fff', true);
    });
    r.data.exits.forEach((x) => {
      const p = v.toScreen(x.at.x, x.at.y);
      tag(p.x, p.y - 16, '비상구', '#2b8a3e');
    });
    ctx.restore();
  }
  /** fn을 부르는 동안 겹쳐 보기를 켬 (제안서의 안전 점검 쪽 도면) */
  function withOverlay(fn) {
    forced = true;
    try { return fn(); } finally { forced = false; }
  }

  App.safety = { RULE, LV, run, block, open, expected, drawOverlay, drawLabels, withOverlay, get showing() { return showing(); } };
})();
