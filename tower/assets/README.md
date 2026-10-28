# 에셋 폴더

- `sprites/` — 캐릭터·몬스터·펫·동료·보스 스프라이트 시트 (가로 한 줄). `tools/import_sprites.py` 가 만들어요
- `icons/` — 초상화, 스킬 아이콘, 장애물, 바닥 타일, 로고
- `manifest.auto.js` — 가져오기 도구가 자동으로 쓰는 등록 목록 (직접 고치지 않기)
- `manifest.js` — 손으로 등록·덮어쓰기. 여기에 쓴 내용이 자동 목록보다 우선해요
- `asset-plan.json` — AI로 만들 전체 목록 (프롬프트·동작·크기·비용). `tools/build-asset-plan.js` 가 만들어요
- `src/` — AI 원본 결과물 넣는 곳 (`src/<키>/base.png`, `src/<키>/<동작>.png` …). 용량이 커서 저장소에는 올리지 않아요
- `refs/` — 코드 그림 참고 이미지 (`tools/export-refs.js`). 언제든 다시 만들 수 있어서 저장소에는 올리지 않아요

등록하지 않은 것은 코드로 그린 기본 그림이 쓰여요. 만드는 방법은 [`docs/ASSET_PROMPTS.md`](../../docs/ASSET_PROMPTS.md), 전체 목록과 비용은 [`docs/ASSET_PLAN.md`](../../docs/ASSET_PLAN.md).
