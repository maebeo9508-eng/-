# maebeo9508-eng 작은 웹 놀이터

| 프로젝트 | 열기 | 설명 |
|---|---|---|
| 🐱 몽글타워 | [`tower/index.html`](tower/index.html) | 고양이 모찌와 친구들이 백 층의 꿈의 탑을 오르는 팀파이트 관전형 모바일 로그라이크 |
| ㄱ 초성 변환기 | [`index.html`](index.html) | 한글 문장을 초성으로 바꿔 주는 도구 |

## 몽글타워

- **플레이**: `tower/index.html` 을 브라우저로 열면 바로 실행됩니다. (GitHub Pages를 켜면 `…/tower/` 주소로 휴대폰에서도 플레이)
- **기획서**: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — 팀 전투·궁극기·스테이지·몬스터·보스·장비·룬·특성·스킬·펫·동료 전체 설계
- **원작 소설**: [`docs/novel/`](docs/novel/README.md) — 『모찌와 백 층의 꿈』 프롤로그 + 10장 + 에필로그
- **그림체**: 귀여운 동물 친구들 + 도트 감성. 설정의 "도트 감성 화면"(기본 켜짐)이 모든 그림을 같은 픽셀 크기로 맞춰요
- **AI 에셋 계획**: [`docs/ASSET_PLAN.md`](docs/ASSET_PLAN.md) — 캐릭터 72명·동작 318개·아이콘 44개의 프롬프트, 단계별 크레딧 비용
- **에셋 제작 가이드**: [`docs/ASSET_PROMPTS.md`](docs/ASSET_PROMPTS.md) — ChatGPT · Gemini · AutoSprite 파이프라인, 애니메이션 규격
- **도구**: [`tower/tools/gallery.html`](tower/tools/gallery.html) 캐릭터 도감 · `export-refs.js` 참고 그림 · `import_sprites.py` AI 그림 자동 가져오기 · [`sprite-packer.html`](tower/tools/sprite-packer.html) 손으로 시트 만들기

### 로컬에서 실행

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000/tower/ 열기
```

`index.html` 을 파일로 바로 열어도 동작합니다. 소설 원고를 고쳤다면 `node tower/tools/build-novel.js` 로 게임 속 이야기 메뉴를 갱신하세요.
