# 안드로이드 앱(APK) 만들기 — Capacitor 안내

현장도면은 `www/` 폴더 하나로 된 웹앱입니다. 서버 없이 기기 안에서만 동작하고, 경로는 모두 상대 경로라서
Capacitor로 그대로 감싸면 안드로이드 앱이 됩니다. 실제 빌드는 함께 진행하기로 했으니, 아래는 준비물과 순서입니다.

## 1. 지금 준비된 것

| 파일 | 내용 |
|---|---|
| `www/` | 앱 전체 (index.html, css, js, lib, icons, manifest.json, sw.js) |
| `capacitor.config.json` | 앱 이름 `현장도면`, 웹 폴더 `www`. **appId**(`kr.hyeonjang.domyeon`)는 구글 플레이에 올리기 전에 회사 도메인으로 바꾸세요. 한 번 올리면 못 바꿉니다. |
| `package.json` | Capacitor 8과 플러그인 2개(파일 저장 `@capacitor/filesystem`, 공유 `@capacitor/share`) |
| `www/icons/icon-512.png` | 앱 아이콘 원본 (안드로이드용 크기는 아래 4단계에서 자동 생성) |

앱 안에서 달라지는 점은 이미 코드에 들어 있습니다.

- **파일 내보내기**(집계표 CSV, PNG, PDF, 백업 JSON): 앱 안에서는 브라우저 다운로드가 안 되므로
  파일을 앱 임시 폴더에 쓰고 **공유 창**을 띄웁니다. 거기서 ‘내 파일에 저장’, 카카오톡, 드라이브 등을 고르면 됩니다.
- **파일 불러오기**(DWG·DXF, 백업 JSON): 안드로이드 파일 고르기 창이 그대로 열립니다.
- **뒤로 버튼**: 열린 창·메뉴·그리기·서랍을 하나씩 닫고, 마지막엔 한 번 더 눌러야 앱이 닫힙니다.
- **서비스 워커**(오프라인 저장)는 앱 안에서는 쓰지 않습니다. 앱 파일이 이미 기기 안에 있기 때문입니다.
- **저장**: 도면은 앱 안 저장소(localStorage·IndexedDB)에 자동 저장됩니다. **앱을 지우면 함께 지워지니** 중요한 도면은 백업 파일로 받아 두세요.

## 2. PC에 설치할 것

1. **Node.js** LTS (22 이상 권장) — https://nodejs.org
2. **Android Studio** 최신판 — https://developer.android.com/studio (설치하면 JDK와 안드로이드 SDK가 같이 깔립니다)
3. 휴대폰: 설정 → 휴대전화 정보 → 소프트웨어 정보 → ‘빌드번호’ 7번 누르기 → 개발자 옵션 → **USB 디버깅** 켜기

버전 요구가 바뀌어 설치 중에 다른 버전을 요구하면 그 안내를 따르세요.

## 3. 처음 한 번

저장소 폴더(이 파일이 있는 폴더의 위)에서:

```bash
npm install                 # package.json의 Capacitor 설치
npx cap add android         # android/ 폴더 생성
npx cap sync android        # www/ 내용을 안드로이드 프로젝트로 복사
```

## 4. 아이콘

```bash
npx @capacitor/assets generate --iconBackgroundColor '#c54b08' --android
```

`assets/icon.png`(1024×1024 권장)를 찾으므로, 처음에는 `www/icons/icon-512.png`를 `assets/icon.png`로 복사해 쓰거나
더 큰 원본을 만들어 넣으세요.

## 5. 빌드와 설치

```bash
npx cap open android        # Android Studio가 열림
```

- 휴대폰을 USB로 연결 → 위쪽 ▶(Run)을 누르면 휴대폰에 바로 설치됩니다.
- APK 파일: 메뉴 **Build → Build App Bundle(s) / APK(s) → Build APK(s)** → `android/app/build/outputs/apk/debug/app-debug.apk`
- 구글 플레이용: **Build → Generate Signed App Bundle / APK** (서명 키를 만들고 잘 보관해야 다음 업데이트를 올릴 수 있습니다)

## 6. 고친 뒤 다시 넣기

`www/` 안을 고친 뒤에는 꼭:

```bash
npx cap sync android
```

그리고 버전을 올립니다.

- `www/js/settings.js`의 `APP_VERSION`, `www/sw.js`의 `VERSION` (웹 주소로 쓰는 사람의 오프라인 저장분이 새것으로 바뀜)
- `android/app/build.gradle`의 `versionCode`(1씩 올림)와 `versionName`

## 7. 휴대폰에서 문제를 볼 때

PC 크롬 주소창에 `chrome://inspect` → 연결된 휴대폰의 앱 → **inspect**. 앱 화면과 콘솔 오류를 PC에서 볼 수 있습니다.
(디버그 빌드에서만 보입니다. 필요하면 `capacitor.config.json`의 `webContentsDebuggingEnabled`를 잠깐 `true`로)

## 8. 라이선스 (꼭 확인)

DWG를 바로 여는 기능에 **GNU LibreDWG(GPL v3)** 를 넣었습니다 (`www/lib/libredwg/`, 출처는 같은 폴더의 README.md).
GPL 라이브러리를 함께 담아 **APK를 다른 사람에게 배포**(플레이 스토어 포함)하면,

- 앱 전체 소스를 GPL v3로 공개하고(요청하는 사람이 받을 수 있게),
- 앱 안이나 설명에 GPL과 LibreDWG 사용을 표시해야 합니다 (앱의 설정 → 정보에 표시되어 있음).

회사 안에서만 쓰는 경우(외부 배포 없음)는 이 의무가 생기지 않습니다. 소스를 공개하기 어렵다면,
`www/lib/libredwg/`와 `www/js/dwg*.js`를 빼고 DWG는 DXF로 바꿔 여는 방식으로 돌아갈 수 있습니다.
