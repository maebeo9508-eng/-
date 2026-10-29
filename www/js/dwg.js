/* DWG 열기: LibreDWG 웹어셈블리(GPL v3, lib/libredwg)를 DWG를 열 때만 불러와
   작업자에서 DXF로 바꾼다. 앱 시작은 느려지지 않고, 그리는 것은 DXF와 같은 길(dxf.js)을 탐 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  // 파일 맨 앞 6글자: DWG 버전
  const VERSIONS = {
    AC1009: 'R12', AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004',
    AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018',
  };
  const MIN = 'AC1012';

  function version(buffer) {
    const b = new Uint8Array(buffer, 0, Math.min(6, buffer.byteLength));
    const v = String.fromCharCode(...b);
    return /^AC10\d\d$/.test(v) ? v : null;
  }

  /** 열기 전에 확인: DWG가 아니거나 너무 옛 버전이면 이유를 돌려줌 */
  function check(buffer) {
    const v = version(buffer);
    if (!v) return 'DWG 파일이 아닙니다. 확장자는 .dwg인데 내용이 다릅니다.';
    if (v < MIN) return `아주 옛 버전 DWG(${VERSIONS[v] || v})라 열 수 없습니다. 캐드에서 2000 이후 버전으로 다시 저장해 주세요.`;
    if (!VERSIONS[v]) return `아직 모르는 새 버전 DWG(${v})입니다. 캐드에서 2018 이하 버전 DWG나 DXF로 저장해 주세요.`;
    return null;
  }

  /** DWG 바이트 → DXF 바이트. 작업자는 읽을 때마다 새로 만들고 끝나면 닫아 메모리를 돌려줌 */
  function toDxf(buffer) {
    return new Promise((resolve, reject) => {
      let worker;
      try {
        worker = new Worker(new URL('js/dwg-worker.js', document.baseURI), { type: 'module' });
      } catch (e) {
        reject(new Error('NO_WORKER'));
        return;
      }
      worker.onmessage = (e) => {
        worker.terminate();
        if (e.data.ok) resolve(e.data.bytes.buffer);
        else reject(new Error(e.data.error));
      };
      worker.onerror = (e) => {
        worker.terminate();
        e.preventDefault();
        reject(new Error('NO_WORKER'));
      };
      worker.postMessage(buffer, [buffer]);
    });
  }

  App.dwg = { check, toDxf, version, VERSIONS };
})();
