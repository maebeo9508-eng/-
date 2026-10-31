# 몽글타워 에셋 제작 가이드 — ChatGPT · Gemini

게임은 지금도 **모든 캐릭터·몬스터·아이콘을 코드로 직접 그려서** 바로 플레이할 수 있습니다. 이 문서는 그 그림을 ChatGPT와 Gemini로 만든 고퀄리티 PNG로 하나씩 바꿔 나가는 방법입니다. 바꾸지 않은 것은 계속 코드 그림이 쓰이니, **주인공부터 하나씩** 교체해도 됩니다.

> 핵심 원칙: **스타일 기준 이미지 1장을 먼저 확정하고, 그 다음 모든 요청에 그 이미지를 첨부한다.** 이게 "에셋 통일"의 90%입니다.

## 0. 자동 파이프라인 (AI 생성 → 게임까지)

손으로 하나씩 하지 않고, 정해 둔 목록대로 AI가 만들고 도구가 게임에 넣는 흐름이에요. 72명 캐릭터의 프롬프트·동작·크기·비용은 [`ASSET_PLAN.md`](ASSET_PLAN.md) (원본 `tower/assets/asset-plan.json`)에 다 정리돼 있어요.

| 단계 | 도구 | 결과 |
|---|---|---|
| 참고 그림 | `node tower/tools/export-refs.js` | `tower/assets/refs/<키>.png` — 지금 코드 그림 (AI에게 모양·색을 알려 주는 용도) |
| 기본 그림 | ChatGPT 이미지 (`gpt_image_2_5`), 보스·바닥·로고는 Gemini (`nano_banana_pro`) | `tower/assets/src/<키>/base.png` |
| 동작 | AutoSprite (그림 → 동작) 또는 ChatGPT 이미지로 동작 시트 한 장 | `tower/assets/src/<키>/<동작>.png·gif·mp4` |
| 가져오기 | `python3 tower/tools/import_sprites.py` | 배경 제거·크기·발 위치 맞춤·도트 처리 → `tower/assets/sprites/`, `manifest.auto.js` 자동 등록, 초상화 자동 생성 |
| 확인 | `tower/tools/gallery.html` (캐릭터 도감) | 모든 캐릭터와 동작을 한 화면에서 재생 |

- 세 모델 모두 Higgsfield 를 통해 쓸 수 있어요 (ChatGPT·Gemini 이미지 모델, AutoSprite). 크레딧이 필요해요 — 비용표는 `ASSET_PLAN.md`
- 가져오기 도구는 가로 한 줄 시트, 빈칸 없는 격자(`<동작>.json` 에 `{"cols":4,"rows":2}`), 움직이는 GIF/WebP, 동영상, 낱장 폴더를 모두 읽어요
- 게임 안 **"도트 감성 화면"**(설정, 기본 켜짐)이 모든 그림을 같은 픽셀 크기로 맞춰 줘서, 다른 모델로 만든 그림도 한 세트처럼 보여요

---

## 1. 아트 디렉션 (스타일 바이블)

| 항목 | 규칙 |
|---|---|
| 키워드 | **귀여운 동물 주인공 + 판타지 던전 몬스터 + 도트 감성** (세피리아처럼 작은 동물들이 던전 탑을 오르는 느낌) · 동글동글 · 말랑말랑 |
| 주인공 | 12명 모두 귀여운 동물(고양이·털실 인형·곰·토끼·너구리·펭귄·다람쥐·여우). **빈손으로** 그리기 — 들고 있는 무기는 게임이 휘두르는 모습까지 따로 그려요 |
| 몬스터 | 해골·고블린·박쥐·슬라임·거미·오크·미믹·가고일 같은 판타지 몬스터를 동글동글 귀엽게. 몬스터의 무기(단검·뼈 칼·도끼·지팡이)는 그림에 함께 그려도 돼요 |
| 배경 | 던전: 이끼 낀 돌바닥, 납골당, 동굴, 얼음 동굴, 용암 갱도, 서고, 오크 요새, 가라앉은 신전, 수정 첨탑, 악몽의 왕좌 |
| 주의 | 다른 게임의 캐릭터를 따라 그리지 않도록 프롬프트에 게임·캐릭터 이름은 넣지 않기 |
| 몸 | 머리와 몸이 하나로 이어진 **동그란 덩어리**. 팔다리는 아주 짧거나 생략 |
| 외곽선 | 두껍고 균일한 **자두색 `#3B2A4D`** (검정 금지). 캐릭터 높이의 약 5~6% |
| 채색 | 파스텔 단색 + 아래쪽 그림자 1단 + 왼쪽 위 하얀 광택 1개 (그라데이션·질감 금지) |
| 얼굴 | 큰 까만 눈 + 하얀 반짝임 2개, 분홍 볼터치, 작은 ω 고양이 입 |
| 시점 | 살짝 위에서 내려다본 3/4 탑다운. 정면을 보되 **오른쪽으로 살짝 돌아선** 자세 |
| 배경 | **마젠타 `#FF00FF` 단색** (가져오기 도구가 가장자리부터 지워요. 투명 배경도 OK) |
| 방향 | 캐릭터는 **오른쪽을 바라보게**. 왼쪽은 게임이 자동으로 뒤집음 |
| 무기 | 주인공 12명은 **빈손**으로 그리기 (게임이 장착 무기와 휘두르는 궤적을 따로 그려 줌) |
| 금지 | 사실적 털, 얇은 선, 검정 외곽선, 3D 렌더 느낌, 긴 팔다리 애니 체형, 글자, 바닥 그림자, 배경 |

### 팔레트

| 이름 | HEX | 쓰임 |
|---|---|---|
| 외곽선 | `#3B2A4D` | 모든 외곽선, 눈동자 |
| 크림 | `#FFF7EC` | UI 바탕 |
| 모찌 화이트 | `#FFFAF3` | 주인공 털 |
| 딸기 핑크 | `#FF8FAB` | 강조, 볼터치 |
| 민트 | `#7ED9C3` | 회복, 긍정 |
| 버터 | `#FFD166` | 골드, 보상 |
| 하늘 | `#8ECBFF` | 대시, 얼음 |
| 라일락 | `#B9A6FF` | 마법, 룬 |
| 밤하늘 | `#2B2350` | 배경, 탑 |
| 위험 | `#FF4D6D` | 적 탄환 테두리, 예고 |

등급 색: 일반 `#A8A3B5` · 고급 `#5CC26A` · 희귀 `#4FA3FF` · 영웅 `#B06CFF` · 전설 `#FF9F1C` · 신화 `#FF4D6D`

---

## 2. 공통 스타일 프롬프트 (복사해서 매번 맨 앞에)

```
[STYLE] Cute chibi 2D mobile game sprite in a soft "mongle-mongle" style.
Round, chubby, blob-like body where the head and body are one rounded shape, tiny or no limbs.
Thick, uniform dark plum outline (#3B2A4D), about 5% of the character height. Never black outlines.
Flat pastel colors with exactly one soft cel-shade on the lower side and one small white glossy highlight on the upper-left.
Big shiny dark eyes with two white sparkles, small pink blush ovals, tiny ω-shaped mouth.
3/4 top-down view: camera slightly above, character facing the viewer and turned slightly to the right.
Full body, centered, feet near the bottom edge, generous empty margin around it.
Fully transparent background (if impossible, a flat pure #00FF00 green background).
No text, no ground shadow, no scenery, no gradients, no texture, no realistic details. Clean vector-like edges. 1024x1024.
```

**한국어로 대화할 때**는 위 영문 블록을 그대로 붙이고, 아래에 "위 스타일로 ○○를 그려줘"라고 한국어로 덧붙여도 잘 됩니다.

---

## 3. 작업 순서

### STEP 1 · 기준 이미지 만들기 (ChatGPT)
1. ChatGPT 새 대화에서 `[STYLE]` + **모찌 설명**(아래 5장 표)으로 생성
2. 마음에 들 때까지 고쳐 달라고 하기: "외곽선 더 두껍게", "몸을 더 동그랗게", "목도리를 더 크게"
3. 확정된 이미지를 **`style_ref.png`** 로 저장. 이게 앞으로 모든 요청에 붙일 기준 이미지
4. 같은 대화에서 "이 캐릭터의 정면/옆/뒤 3방향 시트"도 받아 두면 이후 포즈가 안정됩니다

### STEP 2 · 다른 캐릭터·몬스터 만들기 (ChatGPT 또는 Gemini)
- 매 요청마다 `style_ref.png` 를 첨부하고 이렇게 시작:

```
Match the exact art style of the attached reference image: same outline thickness and color,
same pastel flat shading, same eye style, same proportions and the same 3/4 top-down angle.
Draw a NEW character: <캐릭터 설명>.
Transparent background, full body, facing right, no text.
```

- 몬스터 10종을 한 번에 시키지 말고 **한 장에 한 캐릭터**. 한 스테이지(4종)는 같은 대화에서 이어서 만들면 색감이 맞습니다

### STEP 3 · 동작(애니메이션) 프레임 만들기 (Gemini 추천)
Gemini의 이미지 편집은 **같은 캐릭터를 유지한 채 포즈만 바꾸는** 데 강합니다. 캐릭터 이미지를 첨부하고 프레임을 한 장씩 요청하세요 (6장 템플릿 참고).
- 1프레임 만들 때마다 그 결과를 다시 첨부해서 다음 프레임을 요청하면 흔들림이 줄어듭니다
- 대안 A: "2×2 격자에 4가지 포즈" 한 장으로 받고 패커에서 칸 나누기
- 대안 B: Gemini 동영상 생성으로 2~3초 제자리 루프 영상을 만들고, 패커의 "동영상 → 프레임"으로 6~8장 추출 (초록 배경 요청 필수)

### STEP 4 · 게임으로 가져오기 (자동)
1. 결과물을 `tower/assets/src/<키>/` 에 `base.png`, `idle.png`, `walk.gif`… 처럼 동작 이름으로 넣기
2. `python3 tower/tools/import_sprites.py` 실행 → 배경 제거, 같은 캐릭터는 모든 동작에서 같은 크기, 발밑 정렬, 도트 처리 후 `tower/assets/sprites/` 에 저장하고 `tower/assets/manifest.auto.js` 에 자동 등록
3. 게임 새로고침 → 바로 반영. `tower/tools/gallery.html` 에서 동작을 하나씩 재생해 확인

손으로 하고 싶다면: `tower/tools/sprite-packer.html` 로 시트를 만들고 `tower/assets/manifest.js` 에 직접 등록해도 돼요 (`manifest.js` 가 자동 목록보다 우선).

```js
window.ASSET_MANIFEST = {
  hero: {
    idle:   { src: 'assets/sprites/hero_idle.png',   frames: 4, fps: 6 },
    walk:   { src: 'assets/sprites/hero_walk.png',   frames: 6, fps: 12 },
    attack: { src: 'assets/sprites/hero_attack.png', frames: 4, fps: 16 },
    hurt:   { src: 'assets/sprites/hero_hurt.png',   frames: 2, fps: 10 },
  },
  slime: { walk: { src: 'assets/sprites/slime_walk.png', frames: 4, fps: 8 } },
  icon_skill_spin: { src: 'assets/icons/skill_spin.png' },
};
```

> 애니메이션이 하나만 있어도 됩니다. `walk` 만 넣으면 idle 때도 walk를 쓰고, 없는 한 번 동작(attack·hurt…)은 건너뛰고 하얀 번쩍임으로 대신해요.
> 동작마다 `loop`(반복 여부, idle·walk 는 기본 반복), `anchor`(발밑이 프레임 위에서 몇 % 지점인지, 기본 1 = 맨 아래)를 줄 수 있어요. 캐릭터 단위로 `scale`(크기 보정), `shadow: false`(그림자 끄기)도 돼요.
> 팀 카드와 궁극기 컷인의 초상화는 각 캐릭터의 `idle` 첫 프레임을 자동으로 씁니다. 따로 그리고 싶다면 `icon_<키>` (예: `icon_mungchi`) 로 512×512 얼굴 그림을 등록하세요.

### 일관성을 지키는 요령
- 항상 같은 기준 이미지 첨부, 항상 `[STYLE]` 블록 포함
- "same character" "do not change the design" 같은 문장을 꼭 넣기
- 크기·위치 차이는 걱정하지 말기 — 패커가 발 위치와 크기를 맞춰 줍니다
- 색이 틀어지면 "use exactly these colors: #FFFAF3 body, #FF6B6B scarf"처럼 HEX로 지정
- 마음에 드는 결과가 나온 대화는 지우지 말고 계속 이어서 쓰기

---

## 4. 애니메이션 규격

| 상태(키) | 프레임 | fps | 반복 | 동작 설명 |
|---|---|---|---|---|
| `idle` | 4 | 6 | ○ | 숨쉬기. 1 기본 → 2 살짝 납작(아래로 3%) → 3 기본 → 4 살짝 길쭉(위로 3%) |
| `walk` | 6 | 12 | ○ | 통통 튀기. 1 착지(납작) → 2 웅크림 → 3 뛰어오름(길쭉) → 4 최고점 → 5 내려옴 → 6 착지 직전 |
| `attack` | 4 | 16 | × | 1 몸을 뒤로 젖힘 → 2 앞으로 확 내밂 → 3 최대로 내민 자세(눈 질끈) → 4 원래대로 |
| `hurt` | 2 | 10 | × | 1 움찔(눈 > <, 몸 납작) → 2 원래대로 |
| `ult` | 8 | 14 | × | 필살기 (주인공). 몸을 웅크렸다가 크게 펼치는 큰 동작. 없으면 `attack` 사용 |
| `cast` | 6 | 10 | × | 보스가 기술을 시작할 때. 앞발을 들고 힘을 모았다가 풀기. 없으면 `attack` 사용 |
| `die` | 6 | 10 | × | 기절. 비틀 → 쓰러짐 → 머리 위 별. 몬스터는 끝까지 재생하고 사라지고, 주인공은 마지막 프레임으로 누워 있어요 |

게임이 동작을 거는 순간: 공격할 때 `attack`, 맞을 때 `hurt`(공격 중에는 끊지 않음), 궁극기·스킬에 `ult`, 보스 패턴 시작에 `cast`, 보스 내려찍기 착지에 `attack`, 쓰러질 때 `die`.

- 원본 크기는 자유 (가져오기 도구가 게임 크기로 줄여요: 주인공 48px, 몬스터 40px, 펫 32px, 보스 112px). 모든 프레임에서 **발밑 위치 동일**하면 가장 좋아요
- 몬스터는 `walk` 하나(4프레임)만 있어도 충분. 보스는 `idle` + `attack`
- 떠다니는 몬스터(꿀벌·유령·박쥐 등)는 walk 대신 "위아래로 둥실" 4프레임
- 공격 이펙트(칼바람, 레이저, 탄환)는 게임이 그리므로 **캐릭터 몸 동작만** 그리기

---

## 5. 에셋 키 목록과 캐릭터 설명

주인공 12명·펫 8마리·몬스터 40종·보스 10명·마을 사람의 **키와 영어 설명은 [`ASSET_PLAN.md`](ASSET_PLAN.md) 의 "캐릭터 디자인" 표**에 있어요 (원본: `tower/tools/build-asset-plan.js`의 `D` 표). 게임 데이터가 바뀌면 `node tower/tools/build-asset-plan.js` 로 다시 만들어요.

- 주인공 키: 모찌는 `hero`, 나머지는 `mungchi`·`bopul`·`poksin`·`gombang`·`toseul`·`neogul`·`pengpeng`·`tobi`·`daram`·`yeoul`·`luna`
- 주인공은 빈손으로 그리기 (무기는 게임이 그려요). 몬스터·보스는 무기를 들고 있어도 돼요
- 설명 칸의 영문을 그대로 `<캐릭터 설명>` 자리에 넣으세요

---

## 6. 동작 프롬프트 템플릿 (Gemini)

### 6.1 한 프레임씩 (가장 안정적)

```
Edit the attached character. Keep the exact same character design, colors, outline and art style.
Only change the pose: <포즈 설명>.
Same size and same position of the feet, facing right, transparent background, no text.
```

`<포즈 설명>` 예시 — **walk 6프레임**

1. `landing: body squashed down about 10%, wider, eyes open`
2. `crouching before a hop: body slightly squashed, leaning forward`
3. `jumping up: body stretched taller about 10%, feet off the ground`
4. `top of the hop: normal round shape, floating slightly higher`
5. `falling down: body slightly stretched, scarf and ears trailing upward`
6. `about to land: body normal, feet almost touching the ground`

**idle 4프레임**: `neutral` → `slightly squashed (breathing out)` → `neutral` → `slightly taller (breathing in)`

**attack 4프레임**: `leaning back, preparing` → `lunging forward with a determined face` → `fully stretched forward, eyes squeezed shut` → `returning to neutral`

**hurt 2프레임**: `flinching, eyes as > <, body squashed and leaning back` → `neutral`

### 6.2 격자 한 장으로 (빠름)

```
Using the attached character, create a 2x2 sprite sheet on one image, each cell the same size,
the character in the same position in every cell, feet on the same baseline:
top-left = neutral, top-right = squashed, bottom-left = neutral, bottom-right = stretched taller.
Keep the exact same design and style. Transparent (or pure #00FF00) background, no grid lines, no text.
```
→ 패커에서 **가로 2, 세로 2** 로 자르기

### 6.3 동영상에서 뽑기 (가장 부드러움)

```
A 3-second seamless loop of the attached character hopping in place, bouncy squash and stretch,
camera fixed, character centered, flat pure green (#00FF00) background, same 2D flat art style, no camera movement.
```
→ 패커에서 동영상을 넣고 **프레임 수 6~8, 배경: 초록** 으로 추출

---

## 7. 배경 타일 · 장애물

- 바닥 타일 `tile_1` ~ `tile_10`, 장애물 `obs_<종류>` 의 프롬프트도 [`ASSET_PLAN.md`](ASSET_PLAN.md) 에 있어요
- 바닥은 이음매 없는(seamless) 정사각 타일, 캐릭터가 잘 보이도록 **대비를 낮게**. 던전별: 이끼 돌바닥 · 납골당 판석 · 동굴 흙 · 얼음 · 용암 바위 · 서고 나무 바닥 · 요새 판자 · 신전 판석 · 수정 타일 · 흑요석
- 장애물 종류: 나무통 `barrel` · 상자 `crate` · 바위 `rock` · 부서진 기둥 `brokenpillar` · 묘비 `tombstone` · 관 `coffin` · 뼈 더미 `bonepile` · 촛대 `candelabra` · 석순 `stalagmite` · 거미줄 `web` · 빛나는 버섯 `glowshroom` · 얼음 수정 `icecrystal` · 눈 바위 `snowrock` · 용암 바위 `lavarock` · 광차 `minecart` · 용암 구멍 `vent` · 책장 `bookshelf` · 수정 `crystal` · 바리케이드 `barricade` · 화로 `brazier` · 산호 `coral` · 석상 `statue` · 조개 `shell` · 기둥 `pillar` · 그림자 수정 `shadowcrystal` · 어둠 기둥 `darkpillar`

---

## 8. 아이콘

`[STYLE]` 대신 아래 블록을 쓰세요.

```
Cute flat game icon, single object centered, thick dark plum outline (#3B2A4D), flat pastel colors
with one highlight, no background (transparent), no text, 512x512, readable at 48px.
Object: <설명>
```

| 키 | 설명 |
|---|---|
| `icon_skill_spin` | a swirling white-blue whirlwind slash |
| `icon_skill_heal` | a pink heart with sparkles |
| `icon_skill_meteor` | an orange meteor with a fiery tail |
| `icon_skill_frost` | a light-blue snowflake burst |
| `icon_skill_thunder` | a yellow lightning bolt from a small cloud |
| `icon_skill_shield` | a round fluffy white-blue shield |
| `icon_skill_beam` | a golden star shooting a beam |
| `icon_skill_clone` | two small white cat silhouettes |
| `icon_weapon_sword` · `_spear` · `_hammer` · `_bow` · `_wand` · `_boomerang` · `_watergun` | wooden toy sword / spear / hammer / bow / star wand / boomerang / water pistol (각각 따로) |
| `icon_hat_0` ~ `_3` | beret · hood · knight helmet · crown |
| `icon_armor_0` ~ `_3` | vest · cape · breastplate · robe |
| `icon_shoes_0` ~ `_3` | rain boots · sandals · sneakers · leather boots |
| `icon_acc_0` ~ `_3` | ring with a gem · necklace with a gem · cat bell · gear-shaped brooch |

> 장비 아이콘은 테마 색을 코드가 입히지 않으므로, 나무·크림 같은 **중립적인 색**으로 만들면 어느 스테이지 장비에도 어울립니다. 등급은 아이콘 테두리 색으로 표시됩니다.

---

## 9. 눈길을 끄는 홍보용 이미지

| 키 / 용도 | 프롬프트 |
|---|---|
| `ui_logo` (타이틀 로고) | `Cute bubbly Korean game logo text "몽글타워", chunky rounded letters, white and butter-yellow fill with thick dark plum outline, a tiny white cat peeking over the letters, small stars around, transparent background` |
| 앱 아이콘 | `App icon, rounded square, deep night-purple background with a glowing pink star at the top, a cute round white cat with a red scarf holding a small lantern in the center, thick plum outline, pastel, no text` |
| 키 아트 (스토어 대표 이미지) | `Key art for a cute dungeon action roguelike: a tall dark tower rising into clouds under a starry night, a small white cat with a red scarf swinging a sword with a white slash trail, cute fantasy monsters (green goblin, round skeleton, cave bat, slime) around it, animal heroes (knitted bear with a greatsword, raccoon with daggers, fox archer) behind, torch-lit stone floor, chibi pixel style with thick plum outlines, vertical 9:16` |
| 스토어 스크린샷 배너 문구 | "무기마다 휘두르는 맛이 달라요" · "10층마다 새로운 던전" · "구해 낸 친구가 새 주인공이 돼요" · "고양이 모찌의 백 층 이야기" |

짧은 홍보 영상은 Gemini 동영상 생성에 키 아트를 첨부하고 `slow camera tilt up the tower, stars twinkling, the cat looks up, gentle bouncy motion` 처럼 요청하면 좋습니다.

---

## 10. 체크리스트

- [ ] `style_ref.png` 확정 (모찌)
- [ ] 모찌 idle · walk · attack · hurt
- [ ] 삐약이, 뭉치·보풀·폭신 (첫 펫·처음 고를 수 있는 주인공)
- [ ] 1스테이지 몬스터 4종 + 고블린 대장 그롬
- [ ] 스킬 아이콘 8종
- [ ] 바닥 타일 `tile_1`, 장애물 3종
- [ ] 나머지 스테이지를 하나씩 (스테이지 단위로 같은 대화에서 작업)
- [ ] 로고 · 앱 아이콘 · 키 아트
