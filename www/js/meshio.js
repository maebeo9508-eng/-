/* 3D 모델 파일 읽기·쓰기 (라이브러리 없음): GLB·glTF 2.0, OBJ(+MTL), STL → 앱에서 쓰는 삼각형 모형.
   모형(model): { groups: [{ pos, nor, uv, col, idx, color, alpha, tex, repeat }], bbox: { min, max } }
   - pos: Float32Array(xyz…), nor: Float32Array|null, uv: Float32Array|null, col: Float32Array(rgb…)|null (꼭짓점 색), idx: Uint32Array|null(없으면 차례대로 세 개씩)
   - color: [r, g, b] (0~1, 화면 색), alpha, tex: { canvas }|{ url }|null (바탕 그림), repeat: 무늬가 되풀이됨
   - 읽은 직후에는 파일의 단위·축 그대로 (glTF는 m·위가 +y). place()가 단위·축을 맞추고 바닥 가운데를 원점으로 옮김 (mm, 위 +y, 앞 +z)
   큰 모형은 reduce()로 삼각형 수를 줄임 (격자 묶기: 같은 칸의 꼭짓점을 하나로). 그림(텍스처)은 줄일 때 꼭짓점 색으로 굽는다.
   저장은 pack()(자리 16비트·법선 8비트), 백업 파일은 toJSON()(base64). */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const MAX_FILE = 120 * 1024 * 1024;   // 이보다 큰 파일은 읽지 않음
  const VIEW_TRIS = 200000;             // 자세히 보기(설계 화면·미리보기)에 쓰는 삼각형 상한
  const PLACE_TRIS = 14000;             // 도면에 놓는 사물의 삼각형 상한 (여러 개 놓아도 가볍게)
  const TEX_SIDE = 1024;                // 바탕 그림 긴 변

  const fail = (msg) => { const e = new Error(msg); e.friendly = true; return e; };
  const extOf = (name) => (String(name || '').match(/\.([a-z0-9]+)$/i) || [0, ''])[1].toLowerCase();
  const baseName = (name) => { let s = String(name || '').split(/[\\/]/).pop(); try { s = decodeURIComponent(s); } catch (_) { /* 그대로 */ } return s; };
  const utf8 = (bytes) => new TextDecoder('utf-8').decode(bytes);
  /** 선형 색(glTF) → 화면 색 */
  const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055);
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  /* ── 4×4 행렬 (열 우선, glTF와 같음) ── */
  const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mul4(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function nodeMatrix(n) {
    if (Array.isArray(n.matrix) && n.matrix.length === 16) return n.matrix.slice();
    const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return [
      (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
      2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
      2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1,
    ];
  }
  /** 법선용 3×3 (여인수 행렬: 크기가 축마다 달라도 맞음)과 뒤집힘 여부 */
  function normalMatrix(m) {
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    return { n: [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d], flip: det < 0 };
  }

  /* ── 모형 모으기: 재질마다 한 묶음 ── */
  class Builder {
    constructor() { this.map = new Map(); }
    group(key, init) {
      let g = this.map.get(key);
      if (!g) {
        g = { pos: [], nor: [], uv: [], col: [], idx: [], n: 0, noNor: false, noUv: false, noCol: false, color: [0.8, 0.8, 0.8], alpha: 1, tex: null, repeat: false, ...init };
        this.map.set(key, g);
      }
      return g;
    }
    /** 삼각형 묶음 하나를 더함. pos: 숫자들(xyz), idx: 번호들 또는 null */
    add(g, pos, nor, uv, col, idx) {
      const n = pos.length / 3, base = g.n;
      for (let i = 0; i < pos.length; i++) g.pos.push(pos[i]);
      if (nor) for (let i = 0; i < nor.length; i++) g.nor.push(nor[i]); else { g.noNor = true; for (let i = 0; i < n * 3; i++) g.nor.push(0); }
      if (uv) for (let i = 0; i < uv.length; i++) g.uv.push(uv[i]); else { g.noUv = true; for (let i = 0; i < n * 2; i++) g.uv.push(0); }
      if (col) for (let i = 0; i < col.length; i++) g.col.push(col[i]); else { g.noCol = true; for (let i = 0; i < n * 3; i++) g.col.push(1); }
      if (idx) for (let i = 0; i + 2 < idx.length; i += 3) g.idx.push(base + idx[i], base + idx[i + 1], base + idx[i + 2]);
      else for (let i = 0; i + 2 < n; i += 3) g.idx.push(base + i, base + i + 1, base + i + 2);
      g.n += n;
    }
    finish() {
      const groups = [];
      this.map.forEach((g) => {
        if (!g.idx.length) return;
        const hasCol = g.col.some((v) => v !== 1);
        groups.push({
          pos: Float32Array.from(g.pos), nor: g.noNor ? null : Float32Array.from(g.nor),
          uv: g.tex && !g.noUv ? Float32Array.from(g.uv) : null, col: hasCol ? Float32Array.from(g.col) : null,
          idx: Uint32Array.from(g.idx), color: g.color.slice(0, 3), alpha: g.alpha, tex: g.noUv ? null : g.tex, repeat: !!g.repeat,
        });
      });
      return finalize({ groups });
    }
  }
  const triCount = (g) => (g.idx ? g.idx.length : g.pos.length / 3) / 3;
  function bboxOf(groups) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    groups.forEach((g) => {
      const p = g.pos;
      for (let i = 0; i < p.length; i += 3) {
        for (let k = 0; k < 3; k++) { const v = p[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
      }
    });
    if (min[0] === Infinity) return { min: [0, 0, 0], max: [0, 0, 0] };
    return { min, max };
  }
  function finalize(model) {
    model.groups = model.groups.filter((g) => g.pos.length >= 9 && triCount(g) >= 1);
    // 숫자가 아닌 값(깨진 파일)은 0으로
    model.groups.forEach((g) => { const p = g.pos; for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) p[i] = 0; });
    model.bbox = bboxOf(model.groups);
    return model;
  }
  const stats = (model) => ({
    tris: Math.round(model.groups.reduce((t, g) => t + triCount(g), 0)),
    verts: model.groups.reduce((t, g) => t + g.pos.length / 3, 0),
    groups: model.groups.length,
    textured: model.groups.filter((g) => g.tex && g.uv).length,
    size: [0, 1, 2].map((k) => model.bbox.max[k] - model.bbox.min[k]),
  });

  /* ── 그림(텍스처) 읽기 ── */
  async function decodeImage(bytes, mime) {
    if (typeof document === 'undefined') return null;
    const blob = new Blob([bytes], { type: mime || 'image/png' });
    let src = null;
    try {
      if (window.createImageBitmap) src = await createImageBitmap(blob);
    } catch (_) { src = null; }
    if (!src) {
      src = await new Promise((resolve) => {
        const url = URL.createObjectURL(blob), img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      });
    }
    if (!src) return null;
    const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
    if (!sw || !sh) return null;
    const k = Math.min(1, TEX_SIDE / Math.max(sw, sh));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(sw * k));
    cv.height = Math.max(1, Math.round(sh * k));
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    if (src.close) src.close();
    return { canvas: cv };
  }
  function dataUriBytes(uri) {
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri);
    if (!m) return null;
    if (m[2]) {
      const bin = atob(m[3]);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return { bytes: out, mime: m[1] };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime: m[1] };
  }

  /* ── glTF 2.0 / GLB ── */
  const COMP = { 5120: [1, 'getInt8'], 5121: [1, 'getUint8'], 5122: [2, 'getInt16'], 5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'] };
  const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
  const TYPE_N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

  function splitGLB(buffer) {
    const dv = new DataView(buffer);
    if (buffer.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw fail('GLB 파일이 아닙니다.');
    if (dv.getUint32(4, true) !== 2) throw fail('glTF 1.0 파일은 열 수 없습니다. glTF 2.0(GLB)으로 다시 내려받거나 변환하세요.');
    let off = 12, json = null, bin = null;
    const end = Math.min(buffer.byteLength, dv.getUint32(8, true) || buffer.byteLength);
    while (off + 8 <= end) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      off += 8;
      if (off + len > buffer.byteLength) break;
      if (type === 0x4e4f534a) json = JSON.parse(utf8(new Uint8Array(buffer, off, len)));
      else if (type === 0x004e4942 && !bin) bin = new Uint8Array(buffer, off, len);
      off += len;
    }
    if (!json) throw fail('GLB 파일의 내용을 읽지 못했습니다.');
    return { json, bin };
  }

  /** gltf(JSON)와 버퍼들에서 모형을 만듦. res(name) → Uint8Array|null (같이 고른 파일) */
  async function parseGLTF(gltf, bin, res, warnings, decode = decodeImage) {
    const need = gltf.extensionsRequired || [], used = gltf.extensionsUsed || [];
    if (need.includes('KHR_draco_mesh_compression')) throw fail('Draco로 압축된 파일이라 열 수 없습니다. 압축하지 않은 GLB로 다시 내려받거나, 블렌더 같은 프로그램에서 ‘압축 없음’으로 내보내세요.');
    if (need.includes('EXT_meshopt_compression')) throw fail('Meshopt로 압축된 파일이라 열 수 없습니다. 압축하지 않은 GLB로 다시 내려받아 주세요.');
    const buffers = (gltf.buffers || []).map((b, i) => {
      if (b.uri == null) return i === 0 ? bin : null;
      if (/^data:/.test(b.uri)) { const d = dataUriBytes(b.uri); return d ? d.bytes : null; }
      return res ? res(b.uri) : null;
    });
    const views = gltf.bufferViews || [], accs = gltf.accessors || [];
    const missing = new Set();
    function read(i, asIndex) {
      const a = accs[i];
      if (!a) return null;
      const n = TYPE_N[a.type] || 1, comp = COMP[a.componentType];
      if (!comp) return null;
      const out = asIndex ? new Uint32Array(a.count * n) : new Float32Array(a.count * n);
      const fill = (viewIndex, byteOffset, componentType, count, into, per, plain = false) => {
        const bv = views[viewIndex];
        if (!bv) return false;
        if (bv.extensions && bv.extensions.EXT_meshopt_compression) throw fail('Meshopt로 압축된 파일이라 열 수 없습니다. 압축하지 않은 GLB로 다시 내려받아 주세요.');
        const buf = buffers[bv.buffer];
        if (!buf) { missing.add((gltf.buffers[bv.buffer] || {}).uri || 'bin'); return false; }
        const [size, fn] = COMP[componentType];
        const stride = bv.byteStride || size * per, base = buf.byteOffset + (bv.byteOffset || 0) + (byteOffset || 0);
        if ((bv.byteOffset || 0) + (byteOffset || 0) + (count - 1) * stride + size * per > buf.byteLength) return false;
        const dv = new DataView(buf.buffer, base);
        const k = a.normalized && NORM[componentType] && !asIndex && !plain ? 1 / NORM[componentType] : 0;
        for (let v = 0; v < count; v++) {
          for (let c = 0; c < per; c++) {
            const val = dv[fn](v * stride + c * size, true);
            into[v * per + c] = k ? Math.max(-1, val * k) : val;
          }
        }
        return true;
      };
      if (a.bufferView != null && !fill(a.bufferView, a.byteOffset, a.componentType, a.count, out, n)) return null;
      if (a.sparse && a.sparse.count > 0) {
        const s = a.sparse, ids = new Uint32Array(s.count), vals = new Float32Array(s.count * n);
        const ok1 = fill(s.indices.bufferView, s.indices.byteOffset, s.indices.componentType, s.count, ids, 1, true);
        const ok2 = fill(s.values.bufferView, s.values.byteOffset, a.componentType, s.count, vals, n);
        if (ok1 && ok2) for (let k = 0; k < s.count; k++) for (let c = 0; c < n; c++) out[ids[k] * n + c] = vals[k * n + c];
      }
      return out;
    }

    // 그림: 쓰는 것만, 한 번씩
    const texCache = new Map();
    async function texture(info) {
      if (!info || info.index == null) return null;
      const t = (gltf.textures || [])[info.index];
      if (!t) return null;
      const ext = t.extensions || {};
      const src = t.source != null ? t.source : (ext.EXT_texture_webp || ext.EXT_texture_avif || {}).source;
      if (src == null) { if (ext.KHR_texture_basisu) warnings.add('압축 그림(KTX2)은 읽지 못해 색으로만 보입니다.'); return null; }
      if (texCache.has(src)) return texCache.get(src);
      const im = (gltf.images || [])[src];
      let out = null;
      try {
        let bytes = null, mime = im && im.mimeType;
        if (im && im.bufferView != null) {
          const bv = views[im.bufferView], buf = bv && buffers[bv.buffer];
          if (buf) bytes = new Uint8Array(buf.buffer, buf.byteOffset + (bv.byteOffset || 0), bv.byteLength);
        } else if (im && im.uri) {
          if (/^data:/.test(im.uri)) { const d = dataUriBytes(im.uri); if (d) { bytes = d.bytes; mime = mime || d.mime; } }
          else if (res) { bytes = res(im.uri); if (!bytes) missing.add(baseName(im.uri)); }
        }
        if (bytes) out = await decode(bytes, mime || 'image/png');
      } catch (_) { out = null; }
      const sampler = (gltf.samplers || [])[t.sampler] || {};
      if (out) out.repeat = (sampler.wrapS || 10497) !== 33071 || (sampler.wrapT || 10497) !== 33071;
      texCache.set(src, out);
      return out;
    }

    const B = new Builder();
    const mats = gltf.materials || [];
    const matInfo = [];
    for (let i = 0; i <= mats.length; i++) {
      const m = mats[i] || {};
      const pbr = m.pbrMetallicRoughness || {}, sg = (m.extensions || {}).KHR_materials_pbrSpecularGlossiness;
      const f = (sg && sg.diffuseFactor) || pbr.baseColorFactor || [1, 1, 1, 1];
      const ti = (sg && sg.diffuseTexture) || pbr.baseColorTexture || null;
      const tex = ti ? await texture(ti) : null; // eslint-disable-line no-await-in-loop
      const tt = ti && ti.extensions && ti.extensions.KHR_texture_transform;
      const blend = m.alphaMode === 'BLEND';
      matInfo.push({
        color: [toSrgb(f[0]), toSrgb(f[1]), toSrgb(f[2])], alpha: blend ? (f[3] == null ? 1 : f[3]) : 1, tex, set: (ti && ti.texCoord) || 0,
        tt: tt ? { o: tt.offset || [0, 0], s: tt.scale || [1, 1], r: tt.rotation || 0 } : null,
      });
    }

    let drawn = 0, skipped = 0;
    function prim(p, M) {
      const mode = p.mode == null ? 4 : p.mode;
      if (p.extensions && p.extensions.KHR_draco_mesh_compression) throw fail('Draco로 압축된 파일이라 열 수 없습니다. 압축하지 않은 GLB로 다시 내려받거나, 블렌더 같은 프로그램에서 ‘압축 없음’으로 내보내세요.');
      if (mode !== 4 && mode !== 5 && mode !== 6) { skipped++; return; }
      const A = p.attributes || {};
      const pos = read(A.POSITION);
      if (!pos || pos.length < 9) { skipped++; return; }
      const mi = p.material != null && mats[p.material] ? p.material : mats.length;
      const info = matInfo[mi];
      let nor = A.NORMAL != null ? read(A.NORMAL) : null;
      let uv = info.tex ? read(A[`TEXCOORD_${info.set}`]) : null;
      let col = null;
      if (A.COLOR_0 != null) {
        const c = read(A.COLOR_0), per = TYPE_N[(accs[A.COLOR_0] || {}).type] || 3;
        if (c) { col = new Float32Array((c.length / per) * 3); for (let i = 0, j = 0; i < c.length; i += per, j += 3) { col[j] = toSrgb(c[i]); col[j + 1] = toSrgb(c[i + 1]); col[j + 2] = toSrgb(c[i + 2]); } }
      }
      let idx = p.indices != null ? read(p.indices, true) : null;
      const count = pos.length / 3;
      if (!idx) { idx = new Uint32Array(count); for (let i = 0; i < count; i++) idx[i] = i; }
      if (mode === 5) { // 띠
        const t = [];
        for (let i = 0; i + 2 < idx.length; i++) (i % 2 ? t.push(idx[i + 1], idx[i], idx[i + 2]) : t.push(idx[i], idx[i + 1], idx[i + 2]));
        idx = Uint32Array.from(t);
      } else if (mode === 6) { // 부채
        const t = [];
        for (let i = 1; i + 1 < idx.length; i++) t.push(idx[0], idx[i], idx[i + 1]);
        idx = Uint32Array.from(t);
      }
      // 번호가 꼭짓점 수를 넘는 삼각형은 버림 (깨진 파일)
      for (let i = 0; i < idx.length; i++) if (idx[i] >= count) { idx = idx.filter((v, k) => { const b = k - (k % 3); return idx[b] < count && idx[b + 1] < count && idx[b + 2] < count; }); break; }
      // 자리·법선을 장면 좌표로
      const { n: N, flip } = normalMatrix(M);
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        pos[i] = M[0] * x + M[4] * y + M[8] * z + M[12];
        pos[i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
        pos[i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
      }
      if (nor && nor.length === pos.length) {
        for (let i = 0; i < nor.length; i += 3) {
          const x = nor[i], y = nor[i + 1], z = nor[i + 2];
          let a = N[0] * x + N[1] * y + N[2] * z, b = N[3] * x + N[4] * y + N[5] * z, c = N[6] * x + N[7] * y + N[8] * z;
          if (flip) { a = -a; b = -b; c = -c; }
          const l = Math.hypot(a, b, c) || 1;
          nor[i] = a / l; nor[i + 1] = b / l; nor[i + 2] = c / l;
        }
      } else nor = null;
      if (flip) for (let i = 0; i + 2 < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      if (uv && uv.length / 2 !== count) uv = null;
      if (uv && info.tt) {
        const { o, s, r } = info.tt, cr = Math.cos(r), sr = Math.sin(r);
        for (let i = 0; i < uv.length; i += 2) {
          const u = uv[i] * s[0], v = uv[i + 1] * s[1];
          uv[i] = cr * u + sr * v + o[0];
          uv[i + 1] = -sr * u + cr * v + o[1];
        }
      }
      if (col && col.length !== pos.length) col = null;
      const g = B.group(`m${mi}`, { color: info.color, alpha: info.alpha, tex: info.tex, repeat: !!(info.tex && info.tex.repeat) });
      B.add(g, pos, nor, uv, col, idx);
      drawn++;
    }
    const nodes = gltf.nodes || [], meshes = gltf.meshes || [];
    const seen = new Set();
    function walk(i, parent, depth) {
      const n = nodes[i];
      if (!n || depth > 64 || seen.has(i)) return;
      seen.add(i);
      const M = mul4(parent, nodeMatrix(n));
      if (n.mesh != null && meshes[n.mesh]) (meshes[n.mesh].primitives || []).forEach((p) => prim(p, M));
      (n.children || []).forEach((c) => walk(c, M, depth + 1));
      seen.delete(i);
    }
    const scene = (gltf.scenes || [])[gltf.scene || 0] || (gltf.scenes || [])[0];
    const roots = scene && scene.nodes ? scene.nodes : nodes.map((_, i) => i).filter((i) => !nodes.some((n) => (n.children || []).includes(i)));
    roots.forEach((r) => walk(r, IDENT, 0));
    if (!drawn && meshes.length && !nodes.length) meshes.forEach((m) => (m.primitives || []).forEach((p) => prim(p, IDENT))); // 노드가 없는 파일
    if (missing.size) warnings.add(`같이 있어야 하는 파일을 찾지 못했습니다: ${[...missing].slice(0, 4).join(', ')} — 모델 파일과 함께 골라 주세요.`);
    if (skipped && drawn) warnings.add('선·점으로 된 부분은 빼고 읽었습니다.');
    if (used.includes('KHR_materials_transmission')) warnings.add('유리 재질은 단순한 색으로 보입니다.');
    const model = B.finish();
    if (!model.groups.length) throw fail(missing.size ? `모델의 데이터 파일(${[...missing][0]})이 없습니다. .gltf와 .bin, 그림 파일을 함께 골라 주세요.` : '이 파일에는 그릴 수 있는 면(삼각형)이 없습니다.');
    return model;
  }

  /* ── OBJ (+MTL) ── */
  function parseMTL(text) {
    const out = new Map();
    let cur = null;
    text.split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line || line[0] === '#') return;
      const sp = line.search(/\s/), key = (sp < 0 ? line : line.slice(0, sp)).toLowerCase(), rest = sp < 0 ? '' : line.slice(sp + 1).trim();
      if (key === 'newmtl') { cur = { color: [0.8, 0.8, 0.8], alpha: 1, map: '' }; out.set(rest, cur); return; }
      if (!cur) return;
      if (key === 'kd') { const v = rest.split(/\s+/).map(Number); if (v.length >= 3 && v.every(Number.isFinite)) cur.color = [v[0], v[1], v[2]]; }
      else if (key === 'd') { const v = Number(rest.split(/\s+/)[0]); if (Number.isFinite(v)) cur.alpha = v; }
      else if (key === 'tr') { const v = Number(rest.split(/\s+/)[0]); if (Number.isFinite(v)) cur.alpha = 1 - v; }
      else if (key === 'map_kd') {
        // 옵션(-s 1 1 1 등)을 빼고 남은 것이 파일 이름 (빈칸이 든 이름도 있음)
        const parts = rest.split(/\s+/);
        let i = 0;
        while (i < parts.length && parts[i][0] === '-') { i++; while (i < parts.length - 1 && /^[-+]?[\d.]+$/.test(parts[i])) i++; }
        cur.map = parts.slice(i).join(' ');
      }
    });
    return out;
  }
  async function parseOBJ(text, mtls, res, warnings, decode = decodeImage) {
    const V = [], VT = [], VN = [], VC = [];
    const B = new Builder();
    const texCache = new Map();
    const groups = new Map(); // 재질 이름 → { g, map(꼭짓점 열쇠 → 번호), pos…, idx }
    let cur = null, anyColor = false;
    const use = (name) => {
      let e = groups.get(name);
      if (!e) { e = { name, pos: [], nor: [], uv: [], col: [], idx: [], map: new Map(), noNor: false, noUv: false }; groups.set(name, e); }
      cur = e;
    };
    use('');
    const vert = (tok) => {
      let id = cur.map.get(tok);
      if (id != null) return id;
      const p = tok.split('/');
      const fix = (s, n) => { const i = parseInt(s, 10); return Number.isFinite(i) ? (i < 0 ? n + i : i - 1) : -1; };
      const vi = fix(p[0], V.length / 3), ti = p[1] ? fix(p[1], VT.length / 2) : -1, ni = p[2] ? fix(p[2], VN.length / 3) : -1;
      if (vi < 0 || vi * 3 + 2 >= V.length) return -1;
      id = cur.pos.length / 3;
      cur.pos.push(V[vi * 3], V[vi * 3 + 1], V[vi * 3 + 2]);
      if (anyColor) cur.col.push(VC[vi * 3] ?? 1, VC[vi * 3 + 1] ?? 1, VC[vi * 3 + 2] ?? 1);
      if (ti >= 0 && ti * 2 + 1 < VT.length) cur.uv.push(VT[ti * 2], 1 - VT[ti * 2 + 1]); else { cur.uv.push(0, 0); cur.noUv = true; }
      if (ni >= 0 && ni * 3 + 2 < VN.length) cur.nor.push(VN[ni * 3], VN[ni * 3 + 1], VN[ni * 3 + 2]); else { cur.nor.push(0, 0, 0); cur.noNor = true; }
      cur.map.set(tok, id);
      return id;
    };
    const mtlNames = [];
    let from = 0;
    const len = text.length;
    while (from < len) {
      let to = text.indexOf('\n', from);
      if (to < 0) to = len;
      let line = text.slice(from, to);
      from = to + 1;
      while (line.endsWith('\\') && from < len) { // 줄 이어 쓰기
        let t2 = text.indexOf('\n', from);
        if (t2 < 0) t2 = len;
        line = line.slice(0, -1) + ' ' + text.slice(from, t2);
        from = t2 + 1;
      }
      const c0 = line.charCodeAt(0);
      if (c0 === 118 /* v */) {
        const p = line.trim().split(/\s+/);
        if (p[0] === 'v') {
          V.push(+p[1] || 0, +p[2] || 0, +p[3] || 0);
          if (p.length >= 7) { anyColor = true; while (VC.length < V.length - 3) VC.push(1); VC.push(+p[4], +p[5], +p[6]); }
        } else if (p[0] === 'vt') VT.push(+p[1] || 0, +p[2] || 0);
        else if (p[0] === 'vn') VN.push(+p[1] || 0, +p[2] || 0, +p[3] || 0);
      } else if (c0 === 102 /* f */ && (line.charCodeAt(1) === 32 || line.charCodeAt(1) === 9)) {
        const p = line.trim().split(/\s+/);
        const ids = [];
        for (let i = 1; i < p.length; i++) { const id = vert(p[i]); if (id >= 0) ids.push(id); }
        for (let i = 1; i + 1 < ids.length; i++) cur.idx.push(ids[0], ids[i], ids[i + 1]);
      } else if (c0 === 117 /* u */ && line.startsWith('usemtl')) use(line.slice(6).trim());
      else if (c0 === 109 /* m */ && line.startsWith('mtllib')) mtlNames.push(line.slice(6).trim());
    }
    if (!V.length) throw fail('OBJ 파일에서 꼭짓점을 찾지 못했습니다.');
    const lib = new Map();
    (mtls || []).forEach((t) => parseMTL(t).forEach((m, name) => lib.set(name, m)));
    if (!lib.size && mtlNames.length && res) mtlNames.forEach((n) => { const b = res(n); if (b) parseMTL(utf8(b)).forEach((m, name) => lib.set(name, m)); });
    let lostTex = 0;
    for (const e of groups.values()) {
      if (!e.idx.length) continue;
      const m = lib.get(e.name) || {};
      let tex = null;
      if (m.map && res) {
        if (texCache.has(m.map)) tex = texCache.get(m.map);
        else {
          const bytes = res(m.map);
          if (bytes) { try { tex = await decode(bytes, `image/${extOf(m.map) === 'jpg' ? 'jpeg' : extOf(m.map) || 'png'}`); } catch (_) { tex = null; } } // eslint-disable-line no-await-in-loop
          else lostTex++;
          if (tex) tex.repeat = true;
          texCache.set(m.map, tex);
        }
      } else if (m.map) lostTex++;
      const g = B.group(`o:${e.name}`, { color: tex ? [1, 1, 1] : m.color || [0.8, 0.8, 0.8], alpha: m.alpha == null ? 1 : m.alpha, tex, repeat: !!tex });
      B.add(g, e.pos, e.noNor ? null : e.nor, tex && !e.noUv ? e.uv : null, anyColor && e.col.length === e.pos.length ? e.col : null, e.idx);
    }
    if (lostTex) warnings.add('재질의 그림 파일을 찾지 못해 색으로만 보입니다. OBJ·MTL과 그림 파일을 함께 고르면 그림까지 읽습니다.');
    else if (mtlNames.length && !lib.size) warnings.add('재질 파일(.mtl)이 없어 한 가지 색으로 보입니다. OBJ와 MTL을 함께 고르면 색까지 읽습니다.');
    const model = B.finish();
    if (!model.groups.length) throw fail('OBJ 파일에 그릴 수 있는 면이 없습니다.');
    return model;
  }

  /* ── STL (2진·글자) ── */
  function parseSTL(buffer) {
    const dv = new DataView(buffer), size = buffer.byteLength;
    const n = size >= 84 ? dv.getUint32(80, true) : 0;
    const head = utf8(new Uint8Array(buffer, 0, Math.min(size, 512)));
    const binary = size >= 84 && 84 + n * 50 === size && n > 0;
    let pos;
    if (binary || !/^\s*solid/i.test(head)) {
      const count = Math.min(n, Math.floor((size - 84) / 50));
      if (count < 1) throw fail('STL 파일을 읽지 못했습니다.');
      pos = new Float32Array(count * 9);
      for (let t = 0; t < count; t++) {
        const o = 84 + t * 50 + 12;
        for (let k = 0; k < 9; k++) pos[t * 9 + k] = dv.getFloat32(o + k * 4, true);
      }
    } else {
      const text = utf8(new Uint8Array(buffer));
      const re = /vertex\s+([-+]?[\d.]+(?:[eE][-+]?\d+)?)\s+([-+]?[\d.]+(?:[eE][-+]?\d+)?)\s+([-+]?[\d.]+(?:[eE][-+]?\d+)?)/g;
      const out = [];
      let m;
      while ((m = re.exec(text))) out.push(+m[1], +m[2], +m[3]);
      if (out.length < 9) throw fail('STL 파일에서 면을 찾지 못했습니다.');
      pos = Float32Array.from(out.slice(0, out.length - (out.length % 9)));
    }
    return finalize({ groups: [{ pos, nor: null, uv: null, col: null, idx: null, color: [0.72, 0.74, 0.78], alpha: 1, tex: null, repeat: false }] });
  }

  /* ── 법선: 맞닿은 면끼리 꺾인 각이 작으면 둥글게, 크면 각지게 (꼭짓점을 삼각형마다 따로 둠) ── */
  function withNormals(g, angle = 42) {
    const pos = g.pos, idx = g.idx, tris = Math.floor(triCount(g));
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { if (pos[i + k] < min[k]) min[k] = pos[i + k]; if (pos[i + k] > max[k]) max[k] = pos[i + k]; }
    const Q = 131071, sc = [0, 1, 2].map((k) => Q / Math.max(1e-9, max[k] - min[k]));
    const keyOf = (i) => Math.round((pos[i] - min[0]) * sc[0]) + Math.round((pos[i + 1] - min[1]) * sc[1]) * 131072 + Math.round((pos[i + 2] - min[2]) * sc[2]) * 17179869184;
    const slot = new Map();
    let slots = 0;
    const P = new Float32Array(tris * 9), N = new Float32Array(tris * 9), FN = new Float32Array(tris * 3), FA = new Float32Array(tris * 3), S = new Uint32Array(tris * 3);
    const UV = g.uv ? new Float32Array(tris * 6) : null, C = g.col ? new Float32Array(tris * 9) : null;
    for (let t = 0; t < tris; t++) {
      const v = [idx ? idx[t * 3] : t * 3, idx ? idx[t * 3 + 1] : t * 3 + 1, idx ? idx[t * 3 + 2] : t * 3 + 2];
      for (let c = 0; c < 3; c++) {
        const s = v[c] * 3;
        P[t * 9 + c * 3] = pos[s]; P[t * 9 + c * 3 + 1] = pos[s + 1]; P[t * 9 + c * 3 + 2] = pos[s + 2];
        if (UV) { UV[t * 6 + c * 2] = g.uv[v[c] * 2]; UV[t * 6 + c * 2 + 1] = g.uv[v[c] * 2 + 1]; }
        if (C) { C[t * 9 + c * 3] = g.col[s]; C[t * 9 + c * 3 + 1] = g.col[s + 1]; C[t * 9 + c * 3 + 2] = g.col[s + 2]; }
        const k = keyOf(s);
        let id = slot.get(k);
        if (id == null) { id = slots++; slot.set(k, id); }
        S[t * 3 + c] = id;
      }
      const o = t * 9;
      const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2], vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // 길이 = 넓이×2 (넓은 면이 더 세게)
      const l = Math.hypot(nx, ny, nz) || 1;
      FA[t * 3] = nx; FA[t * 3 + 1] = ny; FA[t * 3 + 2] = nz;
      FN[t * 3] = nx / l; FN[t * 3 + 1] = ny / l; FN[t * 3 + 2] = nz / l;
    }
    // 같은 자리에 모이는 면들 (자리마다 면 목록)
    const start = new Uint32Array(slots + 1);
    for (let i = 0; i < S.length; i++) start[S[i] + 1]++;
    for (let i = 0; i < slots; i++) start[i + 1] += start[i];
    const fill = start.slice(0, slots), faces = new Uint32Array(S.length);
    for (let t = 0; t < tris; t++) for (let c = 0; c < 3; c++) faces[fill[S[t * 3 + c]]++] = t;
    const cos = Math.cos((angle * Math.PI) / 180);
    for (let t = 0; t < tris; t++) {
      const fx = FN[t * 3], fy = FN[t * 3 + 1], fz = FN[t * 3 + 2];
      for (let c = 0; c < 3; c++) {
        // 이 면과 꺾인 각이 작은 이웃 면만 모아 둥글게 (각진 모서리의 큰 면에 끌려가지 않게)
        const sl = S[t * 3 + c];
        let x = 0, y = 0, z = 0;
        const from = start[sl], to = Math.min(start[sl + 1], from + 64);
        for (let k = from; k < to; k++) {
          const f = faces[k] * 3;
          if (FN[f] * fx + FN[f + 1] * fy + FN[f + 2] * fz >= cos) { x += FA[f]; y += FA[f + 1]; z += FA[f + 2]; }
        }
        const l = Math.hypot(x, y, z);
        if (l > 1e-12) { x /= l; y /= l; z /= l; } else { x = fx; y = fy; z = fz; }
        N[t * 9 + c * 3] = x; N[t * 9 + c * 3 + 1] = y; N[t * 9 + c * 3 + 2] = z;
      }
    }
    return { ...g, pos: P, nor: N, uv: UV, col: C, idx: null };
  }
  /** 법선이 없는 묶음에 법선을 만들어 넣음 */
  function ensureNormals(model) {
    model.groups = model.groups.map((g) => (g.nor && g.nor.length === g.pos.length ? g : withNormals(g)));
    return model;
  }

  /* ── 삼각형 줄이기: 격자 묶기 ── */
  function texPixels(tex) {
    if (!tex || !tex.canvas || typeof tex.canvas.getContext !== 'function') return tex && tex.pixels ? tex : null;
    try {
      const cv = tex.canvas, d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
      return { pixels: d.data, w: cv.width, h: cv.height };
    } catch (_) { return null; }
  }
  /** 꼭짓점 색 (묶음 색 × 꼭짓점 색 × 그림 색) — 그림을 색으로 구움 */
  function bakedColors(g) {
    const n = g.pos.length / 3, out = new Float32Array(n * 3);
    const px = g.uv ? texPixels(g.tex) : null;
    for (let i = 0; i < n; i++) {
      let r = g.color[0], gr = g.color[1], b = g.color[2];
      if (g.col) { r *= g.col[i * 3]; gr *= g.col[i * 3 + 1]; b *= g.col[i * 3 + 2]; }
      if (px) {
        let u = g.uv[i * 2], v = g.uv[i * 2 + 1];
        u -= Math.floor(u); v -= Math.floor(v);
        const o = (Math.min(px.h - 1, Math.floor(v * px.h)) * px.w + Math.min(px.w - 1, Math.floor(u * px.w))) * 4;
        r *= px.pixels[o] / 255; gr *= px.pixels[o + 1] / 255; b *= px.pixels[o + 2] / 255;
      }
      out[i * 3] = r; out[i * 3 + 1] = gr; out[i * 3 + 2] = b;
    }
    return out;
  }
  function clusterGroup(g, colors, min, cell) {
    const pos = g.pos, n = pos.length / 3;
    const slot = new Map(), sum = [], cnt = [];
    const id = new Uint32Array(n);
    const inv = 1 / cell;
    for (let i = 0; i < n; i++) {
      const k = Math.floor((pos[i * 3] - min[0]) * inv) + Math.floor((pos[i * 3 + 1] - min[1]) * inv) * 131072 + Math.floor((pos[i * 3 + 2] - min[2]) * inv) * 17179869184;
      let s = slot.get(k);
      if (s == null) { s = cnt.length; slot.set(k, s); cnt.push(0); sum.push(0, 0, 0, 0, 0, 0); }
      id[i] = s;
      cnt[s]++;
      const o = s * 6;
      sum[o] += pos[i * 3]; sum[o + 1] += pos[i * 3 + 1]; sum[o + 2] += pos[i * 3 + 2];
      sum[o + 3] += colors[i * 3]; sum[o + 4] += colors[i * 3 + 1]; sum[o + 5] += colors[i * 3 + 2];
    }
    const tris = Math.floor(triCount(g)), idx = g.idx, out = [];
    const seen = new Set();
    for (let t = 0; t < tris; t++) {
      const a = id[idx ? idx[t * 3] : t * 3], b = id[idx ? idx[t * 3 + 1] : t * 3 + 1], c = id[idx ? idx[t * 3 + 2] : t * 3 + 2];
      if (a === b || b === c || a === c) continue;
      // 같은 세 점의 삼각형은 한 번만 (돌려 놓은 차례는 같은 것으로)
      const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi;
      const key = lo + mid * 2097152 + hi * 4398046511104;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a, b, c);
    }
    const m = cnt.length, P = new Float32Array(m * 3), C = new Float32Array(m * 3);
    for (let s = 0; s < m; s++) {
      const k = 1 / cnt[s], o = s * 6;
      P[s * 3] = sum[o] * k; P[s * 3 + 1] = sum[o + 1] * k; P[s * 3 + 2] = sum[o + 2] * k;
      C[s * 3] = sum[o + 3] * k; C[s * 3 + 1] = sum[o + 4] * k; C[s * 3 + 2] = sum[o + 5] * k;
    }
    return { pos: P, col: C, idx: Uint32Array.from(out) };
  }
  /** 삼각형 수를 max 아래로. 이미 적으면 그대로(같은 것), 줄이면 그림은 꼭짓점 색으로 바뀜 */
  function reduce(model, max) {
    const total = stats(model).tris;
    if (total <= max) return model;
    const b = model.bbox, ext = [0, 1, 2].map((k) => Math.max(1e-9, b.max[k] - b.min[k]));
    let area = 0;
    model.groups.forEach((g) => {
      const p = g.pos, idx = g.idx, tris = Math.floor(triCount(g));
      for (let t = 0; t < tris; t++) {
        const a = (idx ? idx[t * 3] : t * 3) * 3, q = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3, c = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3;
        const ux = p[q] - p[a], uy = p[q + 1] - p[a + 1], uz = p[q + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      }
    });
    const baked = model.groups.map(bakedColors);
    const minCell = Math.max(...ext) / 120000; // 열쇠 한 축이 17비트를 넘지 않게
    let cell = Math.max(minCell, Math.sqrt((area * 2) / max) || Math.max(...ext) / 60);
    let best = null;
    for (let pass = 0; pass < 7; pass++) {
      const groups = model.groups.map((g, i) => ({ ...clusterGroup(g, baked[i], b.min, cell), color: [1, 1, 1], alpha: g.alpha }));
      const count = groups.reduce((t, g) => t + g.idx.length / 3, 0);
      if (count <= max) { best = groups; if (count >= max * 0.55 || pass >= 5) break; cell = Math.max(minCell, cell * Math.max(0.6, Math.sqrt(count / (max * 0.8)))); if (cell === minCell) break; }
      else { if (best) break; cell *= Math.min(2.2, Math.max(1.12, Math.sqrt(count / (max * 0.8)))); }
    }
    if (!best) best = model.groups.map((g, i) => ({ ...clusterGroup(g, baked[i], b.min, Math.max(...ext) / 12), color: [1, 1, 1], alpha: g.alpha }));
    const out = { groups: best.filter((g) => g.idx.length >= 3).map((g) => withNormals({ pos: g.pos, nor: null, uv: null, col: g.col, idx: g.idx, color: g.color, alpha: g.alpha, tex: null, repeat: false })) };
    out.reduced = true;
    return finalize(out);
  }

  /* ── 단위·축 맞추기: 바닥 가운데가 원점, mm, 위 +y, 앞 +z ── */
  /** o: { scale(파일 단위 → mm), up: 'y'|'z'(파일에서 위쪽인 축), turn: 0|90|180|270 (위에서 봐서 시계 방향) } */
  function place(model, o = {}) {
    const s = o.scale || 1, zup = o.up === 'z', turn = (((o.turn || 0) % 360) + 360) % 360;
    const rot = (x, y, z) => {
      let a = x, b = y, c = z;
      if (zup) { b = z; c = -y; }       // 위가 z인 파일: (x, y, z) → (x, z, −y)
      if (turn === 90) { const t = a; a = -c; c = t; }
      else if (turn === 180) { a = -a; c = -c; }
      else if (turn === 270) { const t = a; a = c; c = -t; }
      return [a, b, c];
    };
    const groups = model.groups.map((g) => {
      const P = new Float32Array(g.pos.length), N = g.nor ? new Float32Array(g.nor.length) : null;
      for (let i = 0; i < P.length; i += 3) {
        const p = rot(g.pos[i], g.pos[i + 1], g.pos[i + 2]);
        P[i] = p[0] * s; P[i + 1] = p[1] * s; P[i + 2] = p[2] * s;
        if (N) { const q = rot(g.nor[i], g.nor[i + 1], g.nor[i + 2]); N[i] = q[0]; N[i + 1] = q[1]; N[i + 2] = q[2]; }
      }
      return { ...g, pos: P, nor: N };
    });
    const b = bboxOf(groups);
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y0 = b.min[1];
    groups.forEach((g) => { const P = g.pos; for (let i = 0; i < P.length; i += 3) { P[i] -= cx; P[i + 1] -= y0; P[i + 2] -= cz; } });
    const out = finalize({ groups });
    if (model.reduced) out.reduced = true;
    return out;
  }
  /** 단위 어림: 파일 숫자의 가장 긴 변으로. STL은 거의 mm, glTF는 m */
  function guessUnit(format, size) {
    const m = Math.max(size[0], size[1], size[2]);
    if (format === 'glb' || format === 'gltf') return m > 400 ? 'mm' : m > 40 ? 'cm' : 'm';
    if (format === 'stl') return m < 3 ? 'm' : 'mm';
    return m < 30 ? 'm' : m < 400 ? 'cm' : 'mm';
  }
  const UNIT_MM = { mm: 1, cm: 10, m: 1000, inch: 25.4 };

  /* ── 파일 묶음 읽기 ── */
  /** files: [{ name, buffer(ArrayBuffer) }] — 모델 파일 하나와 (있으면) .bin·.mtl·그림 파일들.
      돌려주는 값: { model(파일 단위 그대로, 자세히 보기 상한으로 줄임), format, name, tris(원래 삼각형 수), unit(어림), up(어림), warnings[] } */
  async function parse(files, o = {}) {
    const list = [...files].filter((f) => f && f.buffer);
    const main = list.find((f) => ['glb', 'gltf', 'obj', 'stl'].includes(extOf(f.name)));
    if (!main) {
      const e = extOf((list[0] || {}).name);
      if (['fbx', 'skp', '3ds', 'max', 'blend', 'dae', 'usdz', '3mf', 'ply', 'step', 'stp', 'igs', 'iges'].includes(e)) throw fail(`.${e} 파일은 바로 열 수 없습니다. GLB(glTF)·OBJ·STL로 내려받거나 변환해서 넣어 주세요. (스케치업·블렌더·3ds Max 모두 GLB나 OBJ로 내보낼 수 있습니다)`);
      throw fail('3D 모델 파일(GLB·glTF·OBJ·STL)을 골라 주세요.');
    }
    if (main.buffer.byteLength > MAX_FILE) throw fail(`파일이 너무 큽니다 (${Math.round(main.buffer.byteLength / 1048576)}MB). ${Math.round(MAX_FILE / 1048576)}MB까지 읽습니다.`);
    const byName = new Map();
    list.forEach((f) => byName.set(baseName(f.name).toLowerCase(), f));
    const res = (name) => { const f = byName.get(baseName(name).toLowerCase()); return f ? new Uint8Array(f.buffer) : null; };
    const warnings = new Set();
    const format = extOf(main.name);
    let model, up = 'y';
    if (format === 'glb') { const { json, bin } = splitGLB(main.buffer); model = await parseGLTF(json, bin, res, warnings, o.decode); }
    else if (format === 'gltf') {
      let json;
      try { json = JSON.parse(utf8(new Uint8Array(main.buffer))); } catch (_) { throw fail('glTF 파일의 내용을 읽지 못했습니다.'); }
      if (!json.asset || parseFloat(json.asset.version) < 2) throw fail('glTF 1.0 파일은 열 수 없습니다. glTF 2.0으로 다시 내려받거나 변환하세요.');
      model = await parseGLTF(json, null, res, warnings, o.decode);
    } else if (format === 'obj') {
      const mtls = list.filter((f) => extOf(f.name) === 'mtl').map((f) => utf8(new Uint8Array(f.buffer)));
      model = await parseOBJ(utf8(new Uint8Array(main.buffer)), mtls, res, warnings, o.decode);
    } else { model = parseSTL(main.buffer); up = 'z'; }
    const tris = stats(model).tris;
    if (!(tris > 0)) throw fail('이 파일에는 그릴 수 있는 면이 없습니다.');
    const size = [0, 1, 2].map((k) => model.bbox.max[k] - model.bbox.min[k]);
    if (!(Math.max(...size) > 0)) throw fail('모델의 크기가 0입니다.');
    // 위쪽 축 어림: OBJ는 대개 y, 눕혀 놓은 것처럼 y가 아주 얇고 z가 크면 z
    if (format === 'obj' && size[1] < Math.min(size[0], size[2]) * 0.02) up = 'z';
    const view = ensureNormals(reduce(model, o.viewTris || VIEW_TRIS));
    if (tris > (o.viewTris || VIEW_TRIS)) warnings.add(`삼각형 ${tris.toLocaleString('ko-KR')}개를 ${stats(view).tris.toLocaleString('ko-KR')}개로 줄였습니다 (그림은 색으로 바뀜).`);
    return { model: view, format, name: baseName(main.name).replace(/\.[a-z0-9]+$/i, ''), tris, unit: guessUnit(format, size), up, warnings: [...warnings] };
  }

  /* ── 저장용으로 줄여 담기 ── */
  function texUrl(tex) {
    if (!tex) return null;
    if (tex.url) return tex.url;
    const cv = tex.canvas;
    if (!cv || typeof cv.toDataURL !== 'function') return null;
    let alpha = false;
    try {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 4 * 53) if (d[i] < 250) { alpha = true; break; }
    } catch (_) { /* 불투명으로 봄 */ }
    return alpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.86);
  }
  /** 모형 → 저장 모양: 자리 16비트(전체 상자 기준), 법선 8비트, 색 8비트 */
  function pack(model) {
    const m = ensureNormals({ groups: model.groups.slice(), bbox: model.bbox });
    const b = model.bbox, ext = [0, 1, 2].map((k) => Math.max(1e-9, b.max[k] - b.min[k]));
    return {
      v: 1, min: b.min.slice(), max: b.max.slice(),
      groups: m.groups.map((g) => {
        const n = g.pos.length / 3, pos = new Uint16Array(n * 3), nor = new Int8Array(n * 3);
        for (let i = 0; i < n * 3; i++) {
          pos[i] = Math.max(0, Math.min(65535, Math.round(((g.pos[i] - b.min[i % 3]) / ext[i % 3]) * 65535)));
          nor[i] = Math.max(-127, Math.min(127, Math.round(g.nor[i] * 127)));
        }
        let col = null;
        if (g.col) { col = new Uint8Array(n * 3); for (let i = 0; i < n * 3; i++) col[i] = Math.max(0, Math.min(255, Math.round(g.col[i] * 255))); }
        const tex = g.uv ? texUrl(g.tex) : null;
        return {
          pos, nor, col, uv: tex ? Float32Array.from(g.uv) : null,
          idx: g.idx ? (n <= 65535 ? Uint16Array.from(g.idx) : Uint32Array.from(g.idx)) : null,
          color: g.color.map((c) => Math.round(c * 1000) / 1000), alpha: g.alpha, tex, repeat: !!(tex && g.repeat),
          ...(g.mat != null ? { mat: g.mat } : {}),
        };
      }),
    };
  }
  function unpack(p) {
    const ext = [0, 1, 2].map((k) => p.max[k] - p.min[k]);
    const groups = p.groups.map((g) => {
      const n = g.pos.length / 3, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) { pos[i] = p.min[i % 3] + (g.pos[i] / 65535) * ext[i % 3]; nor[i] = g.nor[i] / 127; }
      let col = null;
      if (g.col) { col = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) col[i] = g.col[i] / 255; }
      return { pos, nor, col, uv: g.uv || null, idx: g.idx ? Uint32Array.from(g.idx) : null, color: g.color.slice(), alpha: g.alpha == null ? 1 : g.alpha, tex: g.tex ? { url: g.tex } : null, repeat: !!g.repeat, ...(g.mat != null ? { mat: g.mat } : {}) };
    });
    return { groups, bbox: { min: p.min.slice(), max: p.max.slice() } };
  }
  /* 백업 파일용: 숫자 배열을 base64로 */
  const TYPED = { u8: Uint8Array, i8: Int8Array, u16: Uint16Array, u32: Uint32Array, f32: Float32Array };
  const tagOf = (a) => Object.keys(TYPED).find((k) => a instanceof TYPED[k]);
  function b64(a) {
    const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s, tag) {
    const bin = atob(s), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const T = TYPED[tag];
    return new T(bytes.buffer, 0, Math.floor(bytes.byteLength / T.BYTES_PER_ELEMENT));
  }
  const enc = (a) => (a ? { t: tagOf(a), d: b64(a) } : null);
  const dec = (o) => (o && TYPED[o.t] && typeof o.d === 'string' ? unb64(o.d, o.t) : null);
  function toJSON(p) {
    return { v: 1, min: p.min, max: p.max, groups: p.groups.map((g) => ({ pos: enc(g.pos), nor: enc(g.nor), col: enc(g.col), uv: enc(g.uv), idx: enc(g.idx), color: g.color, alpha: g.alpha, tex: g.tex || null, repeat: !!g.repeat, ...(g.mat != null ? { mat: g.mat } : {}) })) };
  }
  function fromJSON(j) {
    if (!j || !Array.isArray(j.groups) || !Array.isArray(j.min) || !Array.isArray(j.max)) return null;
    const groups = j.groups.map((g) => ({ pos: dec(g.pos), nor: dec(g.nor), col: dec(g.col), uv: dec(g.uv), idx: dec(g.idx), color: Array.isArray(g.color) ? g.color.slice(0, 3).map(Number) : [0.8, 0.8, 0.8], alpha: Number.isFinite(g.alpha) ? g.alpha : 1, tex: typeof g.tex === 'string' && /^data:image\//.test(g.tex) ? g.tex : null, repeat: !!g.repeat, ...(Number.isFinite(g.mat) ? { mat: g.mat } : {}) }))
      .filter((g) => g.pos && g.nor && g.pos.length === g.nor.length && g.pos.length >= 9);
    if (!groups.length) return null;
    return { v: 1, min: j.min.slice(0, 3).map(Number), max: j.max.slice(0, 3).map(Number), groups };
  }
  /** 저장 모양이 차지하는 대략의 바이트 */
  const packedBytes = (p) => p.groups.reduce((t, g) => t + g.pos.byteLength + g.nor.byteLength + (g.col ? g.col.byteLength : 0) + (g.uv ? g.uv.byteLength : 0) + (g.idx ? g.idx.byteLength : 0) + (g.tex ? g.tex.length * 0.75 : 0), 0);

  /* ── 쓰기: GLB·OBJ·STL (설계한 것을 다른 프로그램에서 열 수 있게). 모형 단위는 mm ── */
  function writeGLB(model) {
    const m = ensureNormals({ groups: model.groups.slice(), bbox: model.bbox });
    const chunks = [];
    let offset = 0;
    const views = [], accessors = [], meshes = [], materials = [], nodes = [];
    const push = (typed, target) => {
      const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
      const pad = (4 - (bytes.length % 4)) % 4;
      views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
      chunks.push(bytes);
      if (pad) chunks.push(new Uint8Array(pad));
      offset += bytes.length + pad;
      return views.length - 1;
    };
    m.groups.forEach((g, gi) => {
      const n = g.pos.length / 3;
      const P = new Float32Array(n * 3);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n * 3; i++) { P[i] = g.pos[i] / 1000; const k = i % 3; if (P[i] < min[k]) min[k] = P[i]; if (P[i] > max[k]) max[k] = P[i]; }
      const attrs = {};
      accessors.push({ bufferView: push(P, 34962), componentType: 5126, count: n, type: 'VEC3', min, max });
      attrs.POSITION = accessors.length - 1;
      accessors.push({ bufferView: push(Float32Array.from(g.nor), 34962), componentType: 5126, count: n, type: 'VEC3' });
      attrs.NORMAL = accessors.length - 1;
      if (g.col) {
        const C = new Float32Array(n * 3);
        for (let i = 0; i < n * 3; i++) C[i] = toLinear(g.col[i]);
        accessors.push({ bufferView: push(C, 34962), componentType: 5126, count: n, type: 'VEC3' });
        attrs.COLOR_0 = accessors.length - 1;
      }
      const idx = g.idx ? Uint32Array.from(g.idx) : Uint32Array.from({ length: n }, (_, i) => i);
      accessors.push({ bufferView: push(idx, 34963), componentType: 5125, count: idx.length, type: 'SCALAR' });
      materials.push({ name: g.name || `재질 ${gi + 1}`, pbrMetallicRoughness: { baseColorFactor: [toLinear(g.color[0]), toLinear(g.color[1]), toLinear(g.color[2]), g.alpha == null ? 1 : g.alpha], metallicFactor: g.metal ? 0.8 : 0, roughnessFactor: g.metal ? 0.45 : 0.85 }, ...(g.alpha != null && g.alpha < 1 ? { alphaMode: 'BLEND' } : {}), doubleSided: true });
      meshes.push({ name: g.name || `부분 ${gi + 1}`, primitives: [{ attributes: attrs, indices: accessors.length - 1, material: gi, mode: 4 }] });
      nodes.push({ mesh: gi, name: g.name || `부분 ${gi + 1}` });
    });
    const json = { asset: { version: '2.0', generator: '현장도면' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: offset }] };
    let jb = new TextEncoder().encode(JSON.stringify(json));
    const jpad = (4 - (jb.length % 4)) % 4;
    if (jpad) { const t = new Uint8Array(jb.length + jpad); t.set(jb); t.fill(0x20, jb.length); jb = t; }
    const total = 12 + 8 + jb.length + 8 + offset;
    const out = new Uint8Array(total), dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true);
    out.set(jb, 20);
    let o = 20 + jb.length;
    dv.setUint32(o, offset, true); dv.setUint32(o + 4, 0x004e4942, true);
    o += 8;
    chunks.forEach((c) => { out.set(c, o); o += c.length; });
    return out;
  }
  function writeOBJ(model, name = 'model') {
    const m = ensureNormals({ groups: model.groups.slice(), bbox: model.bbox });
    const f = (v) => (Math.round(v * 1000) / 1000).toString();
    const obj = [`# 현장도면 (단위 mm)`, `mtllib ${name}.mtl`], mtl = ['# 현장도면'];
    let base = 1;
    m.groups.forEach((g, gi) => {
      const n = g.pos.length / 3, mat = `m${gi + 1}`;
      mtl.push(`newmtl ${mat}`, `Kd ${f(g.color[0])} ${f(g.color[1])} ${f(g.color[2])}`, `d ${f(g.alpha == null ? 1 : g.alpha)}`, '');
      obj.push(`o ${(g.name || `part${gi + 1}`).replace(/\s+/g, '_')}`);
      for (let i = 0; i < n; i++) obj.push(`v ${f(g.pos[i * 3])} ${f(g.pos[i * 3 + 1])} ${f(g.pos[i * 3 + 2])}`);
      for (let i = 0; i < n; i++) obj.push(`vn ${f(g.nor[i * 3])} ${f(g.nor[i * 3 + 1])} ${f(g.nor[i * 3 + 2])}`);
      obj.push(`usemtl ${mat}`);
      const tris = Math.floor(triCount(g));
      for (let t = 0; t < tris; t++) {
        const a = base + (g.idx ? g.idx[t * 3] : t * 3), b = base + (g.idx ? g.idx[t * 3 + 1] : t * 3 + 1), c = base + (g.idx ? g.idx[t * 3 + 2] : t * 3 + 2);
        obj.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
      }
      base += n;
    });
    return { obj: obj.join('\n') + '\n', mtl: mtl.join('\n') + '\n' };
  }
  /** STL(2진, mm, 위가 +z — 3D 프린터·CAD 관례) */
  function writeSTL(model) {
    const tris = stats(model).tris;
    const out = new Uint8Array(84 + tris * 50), dv = new DataView(out.buffer);
    dv.setUint32(80, tris, true);
    let o = 84;
    model.groups.forEach((g) => {
      const p = g.pos, n = Math.floor(triCount(g));
      for (let t = 0; t < n; t++) {
        const v = [0, 1, 2].map((c) => { const s = (g.idx ? g.idx[t * 3 + c] : t * 3 + c) * 3; return [p[s], -p[s + 2], p[s + 1]]; }); // (x, y, z) → (x, −z, y)
        const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], vx = v[2][0] - v[0][0], vy = v[2][1] - v[0][1], vz = v[2][2] - v[0][2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
        for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) dv.setFloat32(o + 12 + c * 12 + k * 4, v[c][k], true);
        o += 50;
      }
    });
    return out;
  }

  /* ── 상자·막대로 모형 만들기 (설계한 부재 → 모형) ── */
  /** boxes: [{ min: [x, y, z], max: [x, y, z], color: [r, g, b], name }] (mm, 위 +y) 또는 { corners: 8점 } (돌아간 막대) */
  function fromBoxes(boxes) {
    const groups = new Map();
    const quad = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]; // 앞·뒤·왼·오른·위·아래 (꼭짓점 번호는 아래 차례)
    boxes.forEach((b) => {
      const c = b.corners || (() => {
        const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
        return [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]];
      })();
      const key = `${(b.color || [0.8, 0.8, 0.8]).map((v) => Math.round(v * 255)).join(',')}|${b.alpha == null ? 1 : b.alpha}|${b.metal ? 1 : 0}|${b.mat == null ? '' : b.mat}`;
      let g = groups.get(key);
      if (!g) { g = { pos: [], color: (b.color || [0.8, 0.8, 0.8]).slice(), alpha: b.alpha == null ? 1 : b.alpha, metal: !!b.metal, name: b.group || '', mat: b.mat }; groups.set(key, g); }
      quad.forEach((q) => { [q[0], q[1], q[2], q[0], q[2], q[3]].forEach((i) => g.pos.push(c[i][0], c[i][1], c[i][2])); });
    });
    return ensureNormals(finalize({ groups: [...groups.values()].map((g) => ({ pos: Float32Array.from(g.pos), nor: null, uv: null, col: null, idx: null, color: g.color, alpha: g.alpha, tex: null, repeat: false, metal: g.metal, name: g.name, ...(g.mat != null ? { mat: g.mat } : {}) })) }));
  }

  App.meshio = {
    parse, place, reduce, ensureNormals, stats, pack, unpack, toJSON, fromJSON, packedBytes, guessUnit, UNIT_MM,
    writeGLB, writeOBJ, writeSTL, fromBoxes, bboxOf,
    VIEW_TRIS, PLACE_TRIS, MAX_FILE, extOf,
    _parseMTL: parseMTL, _splitGLB: splitGLB,
  };
})();
