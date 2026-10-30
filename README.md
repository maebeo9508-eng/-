# 현장도면 · 물량 집계

건설 현장에서 휴대폰으로 평면도를 그리고 벽·바닥·천장 면적, 다루끼·석고 자재, 문·창문, 전기·설비·가구 수량과
배관 길이를 자동으로 집계하는 앱입니다. 안목·벽 중심·바깥 치수를 한 번에 넣고, 3D로 돌려 볼 수 있습니다.
앱 전체는 `www/` 폴더에 있습니다 (순수 HTML·CSS·JavaScript, 빌드 도구·외부 라이브러리 없음).

- 실행: `www/index.html`을 웹 서버로 엽니다. 예: `python3 -m http.server 8080 --directory www` → http://localhost:8080
  (파일을 브라우저로 바로 열어도 대부분 동작하지만, DWG 열기와 오프라인 설치는 웹 주소로 열었을 때만 됩니다)
- 휴대폰 홈 화면에 추가하면(PWA) 인터넷 없이도 열립니다.
- 안드로이드 앱 만들기: [docs/CAPACITOR.md](docs/CAPACITOR.md)

## 폴더

| 경로 | 내용 |
|---|---|
| `www/index.html`, `css/style.css` | 화면 |
| `www/js/model.js`, `geom.js`, `rooms.js` | 도면 데이터, 기하, 방 인식 |
| `www/js/measure.js`, `catalog.js`, `summary.js` | 면적·자재·수량 계산, 벽 종류·프리셋·가구 목록, 집계표 |
| `www/js/joins.js`, `dims.js` | 벽 이음(T자·ㄱ자), 치수 자동 (안목·벽 중심·바깥) |
| `www/js/tools.js`, `snap.js`, `input.js`, `keys.js` | 그리기 도구, 스냅, 터치·마우스·키보드 |
| `www/js/draw.js`, `canvas.js` | 캔버스 그리기, 격자·눈금자 |
| `www/js/view3d.js` | 3D 보기 (WebGL) |
| `www/js/props.js`, `catalog-ui.js`, `settings.js`, `ui.js`, `edit.js` | 속성 패널, 목록 편집, 설정, 화면 구성, 편집 기능 |
| `www/js/storage.js`, `projects.js`, `export.js` | 자동 저장·도면 목록·백업, CSV·PNG·PDF 내보내기 |
| `www/js/dxf.js`, `dwg.js`, `dwg-worker.js`, `underlay.js` | DXF·DWG 불러오기와 밑그림 |
| `www/lib/libredwg/` | DWG 변환 모듈 (GNU LibreDWG, GPL v3) |
| `www/manifest.json`, `sw.js`, `icons/` | 홈 화면 설치·오프라인 |

`index.html`(저장소 맨 위)은 이 앱과 별개인 기존 페이지입니다.
