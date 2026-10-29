# LibreDWG (웹어셈블리) — DWG를 DXF로 바꾸기

- 가져온 곳: npm 패키지 `@cadview/dwg` 0.2.0의 `dist/libredwg.js`, `dist/libredwg.wasm`
  (https://www.npmjs.com/package/@cadview/dwg)
- 원본 라이브러리: GNU LibreDWG (https://github.com/LibreDWG/libredwg, https://www.gnu.org/software/libredwg/)
- 라이선스: GNU GPL v3 (같은 폴더의 `LICENSE`)

두 파일은 고치지 않고 그대로 넣었습니다. 앱은 DWG 파일을 열 때만 이 파일들을 읽고
(`js/dwg.js` → 작업자 `js/dwg-worker.js`), DWG를 DXF 글자로 바꾼 뒤 앱의 DXF 읽기(`js/dxf.js`)로 그립니다.
R13(AC1012)부터 2018(AC1032) 형식까지 읽을 수 있습니다.

GPL 라이브러리를 함께 배포하므로, 이 앱을 외부에 배포(APK 등)할 때는 앱 소스 전체를
GPL v3 조건으로 공개해야 합니다. 라이브러리 소스는 위 주소에서 받을 수 있습니다.
