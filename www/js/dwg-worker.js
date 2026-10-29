/* DWG 읽기 작업자: 큰 파일도 화면이 멈추지 않게 따로 돌린다.
   LibreDWG(GPL v3, lib/libredwg)로 DWG를 DXF로 바꿔 그 바이트를 돌려줌. 그리는 일은 dxf.js */
import createLibreDWG from '../lib/libredwg/libredwg.js';

let mod = null;
const quiet = () => {}; // 라이브러리 진행 기록은 화면 콘솔에 내지 않음

self.onmessage = async (e) => {
  try {
    if (!mod) mod = await createLibreDWG({ print: quiet, printErr: quiet });
    const id = `${Date.now()}`;
    const input = `/tmp/in_${id}.dwg`, output = `/tmp/out_${id}.dxf`;
    mod.FS.writeFile(input, new Uint8Array(e.data));
    let code;
    try {
      code = mod.ccall('convert', 'number', ['string', 'string'], [input, output]);
    } finally {
      try { mod.FS.unlink(input); } catch (_) { /* 이미 없음 */ }
    }
    if (code !== 0) throw new Error(`CODE_${code}`);
    const bytes = mod.FS.readFile(output);
    mod.FS.unlink(output);
    self.postMessage({ ok: true, bytes }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
