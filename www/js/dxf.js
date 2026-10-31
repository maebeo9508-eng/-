/* DXF 읽기 (ASCII DXF, R12 ~ 최신). 외부 라이브러리 없이 필요한 것만:
   LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE, ELLIPSE, SPLINE, SOLID, TEXT, MTEXT, ATTRIB, INSERT(블록), DIMENSION
   결과는 선(꺾은선)과 글자 목록. 좌표는 DXF 단위 그대로(y 위쪽이 +), 단위 변환은 부르는 쪽에서 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  // $INSUNITS → mm
  const UNITS = {
    0: { mm: 1, label: '단위 없음' },
    1: { mm: 25.4, label: 'inch' },
    2: { mm: 304.8, label: 'ft' },
    4: { mm: 1, label: 'mm' },
    5: { mm: 10, label: 'cm' },
    6: { mm: 1000, label: 'm' },
    14: { mm: 100, label: 'dm' },
  };
  const CODEPAGES = { ANSI_949: 'euc-kr', ANSI_932: 'shift_jis', ANSI_936: 'gbk', ANSI_950: 'big5', ANSI_1252: 'windows-1252', ANSI_1251: 'windows-1251' };
  const MAX_POINTS = 3000000; // 너무 큰 도면은 여기서 끊고 알림
  const MAX_DEPTH = 12;       // 블록 안의 블록

  /** 파일 바이트 → 글자. UTF-8(2007 이후)이 아니면 $DWGCODEPAGE(한글 도면은 보통 ANSI_949)로 */
  function decode(buffer) {
    const bytes = new Uint8Array(buffer);
    if (/^AutoCAD Binary DXF/.test(String.fromCharCode(...bytes.subarray(0, 18)))) {
      throw new Error('바이너리 DXF는 읽을 수 없습니다. CAD에서 ‘ASCII DXF’로 다시 저장해 주세요.');
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (_) {
      const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200000));
      const m = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/i.exec(head);
      const enc = (m && CODEPAGES[m[1].toUpperCase()]) || 'euc-kr';
      try {
        return new TextDecoder(enc).decode(bytes);
      } catch (_) {
        return new TextDecoder('euc-kr').decode(bytes);
      }
    }
  }

  /** 코드·값 쌍으로 나눔 */
  function tokenize(text) {
    const lines = text.split(/\r\n|\r|\n/);
    const n = Math.floor(lines.length / 2);
    const codes = new Int32Array(n);
    const values = new Array(n);
    let k = 0;
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const c = parseInt(lines[i], 10);
      if (Number.isNaN(c)) {
        i -= 1; // 빈 줄 등으로 어긋나면 한 줄 밀어서 다시 맞춤
        continue;
      }
      codes[k] = c;
      values[k] = lines[i + 1];
      k++;
    }
    return { codes: codes.subarray(0, k), values: values.slice(0, k), length: k };
  }

  /** 개체 하나: { type, pairs: [[code, value], ...] } 목록으로 나눔 (구역별) */
  function readSections(tok) {
    const sections = {};
    let i = 0;
    const { codes, values, length } = tok;
    while (i < length) {
      if (codes[i] === 0 && values[i].trim() === 'SECTION' && codes[i + 1] === 2) {
        const name = values[i + 1].trim();
        i += 2;
        const ents = [];
        let cur = null;
        while (i < length && !(codes[i] === 0 && values[i].trim() === 'ENDSEC')) {
          if (codes[i] === 0) {
            cur = { type: values[i].trim(), pairs: [] };
            ents.push(cur);
          } else if (cur) {
            cur.pairs.push([codes[i], values[i]]);
          } else {
            (sections[`${name}:head`] = sections[`${name}:head`] || []).push([codes[i], values[i]]);
          }
          i++;
        }
        sections[name] = ents;
      }
      i++;
    }
    return sections;
  }

  const num = (v, d = 0) => {
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : d;
  };
  /** 개체의 코드 값 (처음 나온 것) */
  function getter(e) {
    const map = new Map();
    for (const [c, v] of e.pairs) if (!map.has(c)) map.set(c, v);
    return {
      n: (c, d = 0) => (map.has(c) ? num(map.get(c), d) : d),
      s: (c, d = '') => (map.has(c) ? map.get(c).trim() : d),
      raw: (c) => map.get(c),
      has: (c) => map.has(c),
    };
  }

  function headerVars(sections) {
    const pairs = [];
    (sections.HEADER || []).forEach((e) => pairs.push(...e.pairs));
    const head = sections['HEADER:head'] || [];
    const all = [...head, ...pairs];
    const vars = {};
    for (let i = 0; i < all.length; i++) {
      if (all[i][0] === 9) {
        const name = all[i][1].trim();
        if (i + 1 < all.length) vars[name] = all[i + 1][1].trim();
      }
    }
    return vars;
  }

  /** 꺼지거나 얼린 레이어. ignoreOff: '꺼짐'(색 번호 음수)은 믿지 않고 얼림만 봄 */
  function hiddenLayers(sections, ignoreOff) {
    const hidden = new Set();
    (sections.TABLES || []).forEach((e) => {
      if (e.type !== 'LAYER') return;
      const g = getter(e);
      const name = g.s(2);
      if (!name) return;
      if ((!ignoreOff && g.n(62, 7) < 0) || (g.n(70, 0) & 1)) hidden.add(name);
    });
    return hidden;
  }

  /* ── 2D 변환 행렬 [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f ── */
  const I = [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const angleOf = (m) => Math.atan2(m[1], m[0]);

  /** 원호를 꺾은선으로: 중심, 반지름, 시작·끝 각(라디안, 반시계) */
  function arcPoints(cx, cy, r, a0, a1, out) {
    let sweep = a1 - a0;
    while (sweep <= 0) sweep += Math.PI * 2;
    const steps = Math.max(4, Math.ceil(sweep / (Math.PI / 18)));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (sweep * k) / steps;
      out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    return out;
  }

  /** 볼록(bulge)이 있는 꺾은선 꼭짓점 → 점 목록 */
  function bulgePoints(verts, closed) {
    const out = [];
    const n = verts.length;
    for (let k = 0; k < n; k++) {
      const v = verts[k];
      if (k === n - 1 && !closed) {
        out.push(v.x, v.y);
        break;
      }
      const w = verts[(k + 1) % n];
      if (!v.b) {
        out.push(v.x, v.y);
        continue;
      }
      // bulge = tan(사잇각/4). 부호: +면 반시계
      const theta = 4 * Math.atan(v.b);
      const chord = Math.hypot(w.x - v.x, w.y - v.y);
      if (chord < 1e-9) {
        out.push(v.x, v.y);
        continue;
      }
      const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
      const mx = (v.x + w.x) / 2, my = (v.y + w.y) / 2;
      const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
      const dir = v.b > 0 ? 1 : -1;
      const nx = -(w.y - v.y) / chord, ny = (w.x - v.x) / chord;
      const sgn = Math.abs(theta) > Math.PI ? -1 : 1;
      const cx = mx + nx * h * dir * sgn, cy = my + ny * h * dir * sgn;
      const a0 = Math.atan2(v.y - cy, v.x - cx);
      const steps = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 18)));
      for (let s = 0; s < steps; s++) {
        const a = a0 + (theta * s) / steps;
        out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
    }
    if (closed && out.length >= 2) out.push(out[0], out[1]);
    return out;
  }

  /** MTEXT 서식 코드를 지우고 줄바꿈만 남김 */
  function plainMText(s) {
    return s
      .replace(/\\P/g, '\n')
      .replace(/\\~/g, ' ')
      .replace(/\\[ACFHQTWfhcpq][^;]*;/g, '')
      .replace(/\\S([^;]*?)[\^#/]([^;]*);/g, '$1/$2')
      .replace(/\\[LlOoKkX]/g, '')
      .replace(/\\\\/g, '\\')
      .replace(/[{}]/g, '');
  }
  /** 특수 기호(%%c 지름 등)와 \U+XXXX */
  function plainText(s) {
    return s
      .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%%/g, '%')
      .replace(/%%[uUoO]/g, '');
  }

  /** 꺾은선·글자를 모으는 그릇. hidden: 숨길 레이어 이름 */
  function collector(hidden) {
    const polylines = [];
    const texts = [];
    const stats = { lines: 0, texts: 0, skipped: {}, truncated: false, hiddenLayers: [...hidden], hiddenSkipped: 0, paperSkipped: 0, xrefs: [], source: 'model' };
    let points = 0;
    return {
      polylines, texts, stats,
      skip(t) { stats.skipped[t] = (stats.skipped[t] || 0) + 1; },
      addPoly(pts, m) {
        if (pts.length < 4) return;
        if (points > MAX_POINTS) { stats.truncated = true; return; }
        const buf = [];
        for (let k = 0; k < pts.length; k += 2) {
          const p = apply(m, pts[k], pts[k + 1]);
          if (Number.isFinite(p[0]) && Number.isFinite(p[1])) buf.push(p[0], p[1]); // 깨진 좌표는 뺌
        }
        if (buf.length < 4) return;
        points += buf.length / 2;
        polylines.push(Float64Array.from(buf));
        stats.lines++;
      },
      addText(str, x, y, h, rot, ha, va, m) {
        const t = plainText(str).trim();
        if (!t || !(h > 0)) return;
        const p = apply(m, x, y);
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(h * scaleOf(m))) return;
        texts.push({ x: p[0], y: p[1], h: h * scaleOf(m), rot: rot + angleOf(m), text: t, ha, va });
        stats.texts++;
      },
    };
  }

  /** 블록 삽입 변환: 블록 기준점(bx, by) → 원점, 배율, 회전(라디안), 배열 간격(ox, oy), 삽입점(ix, iy) */
  function insertMatrix(ix, iy, sx, sy, rot, bx, by, ox = 0, oy = 0) {
    const cos = Math.cos(rot), sin = Math.sin(rot);
    return [sx * cos, sx * sin, -sy * sin, sy * cos,
      ix + ox * cos - oy * sin - (bx * sx * cos - by * sy * sin),
      iy + ox * sin + oy * cos - (bx * sx * sin + by * sy * cos)];
  }

  /**
   * DXF 글자 → { polylines: [Float64Array(x0,y0,x1,y1,...)], texts: [{ x, y, h, rot, text, ha, va }], units, insunits, stats }
   */
  function parse(text, opts = {}) {
    const tok = tokenize(text);
    const sections = readSections(tok);
    if (!sections.ENTITIES) throw new Error('DXF 파일이 아니거나 내용(ENTITIES)이 없습니다.');
    const vars = headerVars(sections);
    const insunits = parseInt(vars.$INSUNITS || '0', 10) || 0;
    const hidden = opts.includeHidden ? new Set() : hiddenLayers(sections, opts.ignoreOff);

    // 블록: 이름 → { base, ents }. 외부 참조(XREF) 블록은 내용이 다른 파일에 있음
    const blocks = new Map();
    const xrefs = [];
    let curBlock = null;
    (sections.BLOCKS || []).forEach((e) => {
      if (e.type === 'BLOCK') {
        const g = getter(e);
        curBlock = { name: g.s(2), base: [g.n(10), g.n(20)], ents: [] };
        blocks.set(curBlock.name, curBlock);
        if (g.n(70, 0) & 4) xrefs.push(g.s(1) || g.s(2));
      } else if (e.type === 'ENDBLK') {
        curBlock = null;
      } else if (curBlock) {
        curBlock.ents.push(e);
      }
    });

    const { polylines, texts, stats, skip, addPoly, addText } = collector(hidden);
    stats.xrefs = xrefs;

    /** 개체 목록을 변환 m으로 그림. 폴리라인은 뒤따르는 VERTEX를 함께 읽음 */
    function walk(ents, m0, depth) {
      let m = m0;
      for (let k = 0; k < ents.length; k++) {
        const e = ents[k];
        const g = getter(e);
        if (g.n(67, 0) === 1 && !opts.includePaper) { // 도면 배치(paper space)
          if (depth === 0) stats.paperSkipped++;
          continue;
        }
        if (hidden.has(g.s(8, '0'))) {
          stats.hiddenSkipped++;
          continue;
        }
        // 뒤집힌 개체(돌출 방향 Z가 음수): 개체 좌표계의 x가 반대. LINE은 도면 좌표 그대로
        const om = m;
        if (g.n(230, 1) < 0 && e.type !== 'LINE') m = mul(m, [-1, 0, 0, 1, 0, 0]);
        switch (e.type) {
          case 'LINE':
            addPoly([g.n(10), g.n(20), g.n(11), g.n(21)], m);
            break;
          case 'LWPOLYLINE': {
            const verts = [];
            for (const [c, v] of e.pairs) {
              if (c === 10) verts.push({ x: num(v), y: 0, b: 0 });
              else if (c === 20 && verts.length) verts[verts.length - 1].y = num(v);
              else if (c === 42 && verts.length) verts[verts.length - 1].b = num(v);
            }
            addPoly(bulgePoints(verts, (g.n(70, 0) & 1) === 1), m);
            break;
          }
          case 'POLYLINE': {
            const flags = g.n(70, 0);
            const verts = [];
            while (k + 1 < ents.length && ents[k + 1].type === 'VERTEX') {
              const vg = getter(ents[++k]);
              verts.push({ x: vg.n(10), y: vg.n(20), b: vg.n(42, 0) });
            }
            if (k + 1 < ents.length && ents[k + 1].type === 'SEQEND') k++;
            if (flags & (16 | 64)) { skip('3D 면'); break; } // 메시·폴리페이스
            addPoly(bulgePoints(verts, (flags & 1) === 1), m);
            break;
          }
          case 'ARC': {
            const pts = arcPoints(g.n(10), g.n(20), g.n(40), (g.n(50) * Math.PI) / 180, (g.n(51) * Math.PI) / 180, []);
            addPoly(pts, m);
            break;
          }
          case 'CIRCLE':
            addPoly(arcPoints(g.n(10), g.n(20), g.n(40), 0, Math.PI * 2, []), m);
            break;
          case 'ELLIPSE': {
            const cx = g.n(10), cy = g.n(20), mx = g.n(11), my = g.n(21), ratio = g.n(40, 1);
            let t0 = g.n(41, 0), t1 = g.n(42, Math.PI * 2);
            while (t1 <= t0) t1 += Math.PI * 2;
            const steps = Math.max(8, Math.ceil((t1 - t0) / (Math.PI / 24)));
            const pts = [];
            for (let s = 0; s <= steps; s++) {
              const t = t0 + ((t1 - t0) * s) / steps;
              const c = Math.cos(t), sn = Math.sin(t);
              pts.push(cx + mx * c - my * ratio * sn, cy + my * c + mx * ratio * sn);
            }
            addPoly(pts, m);
            break;
          }
          case 'SPLINE': {
            // 맞춤점이 있으면 그 점들을, 없으면 조정점을 이음 (근사)
            const fit = [], ctrl = [];
            for (const [c, v] of e.pairs) {
              if (c === 11) fit.push(num(v), 0);
              else if (c === 21 && fit.length) fit[fit.length - 1] = num(v);
              else if (c === 10) ctrl.push(num(v), 0);
              else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1] = num(v);
            }
            addPoly(fit.length >= 4 ? fit : ctrl, m);
            break;
          }
          case 'SOLID':
          case 'TRACE':
            addPoly([g.n(10), g.n(20), g.n(11), g.n(21), g.n(13, g.n(12)), g.n(23, g.n(22)), g.n(12), g.n(22), g.n(10), g.n(20)], m);
            break;
          case 'TEXT':
          case 'ATTRIB': {
            if (e.type === 'ATTRIB' && (g.n(70, 0) & 1)) break; // 숨긴 속성
            const ha = g.n(72, 0), va = g.n(e.type === 'TEXT' ? 73 : 74, 0);
            const aligned = (ha || va) && g.has(11);
            const between = (ha === 3 || ha === 5) && g.has(11); // 맞춤·채움: 두 점 사이 가운데
            const x = between ? (g.n(10) + g.n(11)) / 2 : aligned ? g.n(11) : g.n(10);
            const y = between ? (g.n(20) + g.n(21)) / 2 : aligned ? g.n(21) : g.n(20);
            addText(g.raw(1) || '', x, y, g.n(40, 1), (g.n(50, 0) * Math.PI) / 180,
              ha === 1 || ha === 3 || ha === 4 || ha === 5 ? 'center' : ha === 2 ? 'right' : 'left',
              ha === 4 ? 'middle' : va === 3 ? 'top' : va === 2 ? 'middle' : 'alphabetic', m);
            break;
          }
          case 'MTEXT': {
            let str = '';
            for (const [c, v] of e.pairs) if (c === 3 || c === 1) str += v;
            const att = g.n(71, 1);
            const rot = g.has(11) ? Math.atan2(g.n(21), g.n(11)) : (g.n(50, 0) * Math.PI) / 180;
            addText(plainMText(str), g.n(10), g.n(20), g.n(40, 1), rot,
              [, 'left', 'center', 'right'][((att - 1) % 3) + 1], att <= 3 ? 'top' : att <= 6 ? 'middle' : 'bottom', m);
            break;
          }
          case 'INSERT':
          case 'DIMENSION': {
            const b = blocks.get(g.s(2));
            if (!b) { skip('없는 블록'); break; }
            if (depth >= MAX_DEPTH) { skip('블록 겹침'); break; }
            if (e.type === 'DIMENSION') {
              walk(b.ents, m, depth + 1); // 치수 블록은 이미 도면 좌표
              break;
            }
            const cols = Math.max(1, g.n(70, 1)), rows = Math.max(1, g.n(71, 1));
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                const local = insertMatrix(g.n(10), g.n(20), g.n(41, 1), g.n(42, 1), (g.n(50, 0) * Math.PI) / 180,
                  b.base[0], b.base[1], c * g.n(44, 0), r * g.n(45, 0));
                walk(b.ents, mul(m, local), depth + 1);
              }
            }
            // INSERT 뒤에 붙은 속성 글자
            while (k + 1 < ents.length && (ents[k + 1].type === 'ATTRIB' || ents[k + 1].type === 'SEQEND')) {
              const a = ents[++k];
              if (a.type === 'ATTRIB') walk([a], m, depth);
            }
            break;
          }
          case 'VERTEX':
          case 'SEQEND':
          case 'ATTDEF':
          case 'VIEWPORT':
          case 'POINT':
            break;
          default:
            skip(e.type);
        }
        m = om;
      }
    }
    walk(sections.ENTITIES, I, 0);
    // 모형 공간 개체가 ENTITIES가 아니라 *Model_Space 블록에만 적힌 파일도 있음. 배치를 고르면 *Paper_Space도
    const fromBlock = (re, source) => {
      if (polylines.length || texts.length) return;
      const b = [...blocks.values()].find((x) => re.test(x.name || ''));
      if (b && b.ents.length) {
        walk(b.ents, I, 0);
        if (polylines.length || texts.length) stats.source = source;
      }
    };
    fromBlock(/^\*model_space$/i, 'modelBlock');
    if (opts.includePaper) {
      if (polylines.length || texts.length) stats.source = 'paper';
      else fromBlock(/^\*paper_space/i, 'paper');
    }

    return { polylines, texts, insunits, units: UNITS[insunits] || UNITS[0], stats };
  }

  App.dxf = { parse, decode, UNITS };
})();
