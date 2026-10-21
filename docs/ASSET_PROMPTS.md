# 몽글타워 에셋 제작 가이드 — ChatGPT · Gemini

게임은 지금도 **모든 캐릭터·몬스터·아이콘을 코드로 직접 그려서** 바로 플레이할 수 있습니다. 이 문서는 그 그림을 ChatGPT와 Gemini로 만든 고퀄리티 PNG로 하나씩 바꿔 나가는 방법입니다. 바꾸지 않은 것은 계속 코드 그림이 쓰이니, **주인공부터 하나씩** 교체해도 됩니다.

> 핵심 원칙: **스타일 기준 이미지 1장을 먼저 확정하고, 그 다음 모든 요청에 그 이미지를 첨부한다.** 이게 "에셋 통일"의 90%입니다.

---

## 1. 아트 디렉션 (스타일 바이블)

| 항목 | 규칙 |
|---|---|
| 키워드 | 몽글몽글 · 동글동글 · 말랑말랑 · 스티커 같은 2D |
| 몸 | 머리와 몸이 하나로 이어진 **동그란 덩어리**. 팔다리는 아주 짧거나 생략 |
| 외곽선 | 두껍고 균일한 **자두색 `#3B2A4D`** (검정 금지). 캐릭터 높이의 약 5~6% |
| 채색 | 파스텔 단색 + 아래쪽 그림자 1단 + 왼쪽 위 하얀 광택 1개 (그라데이션·질감 금지) |
| 얼굴 | 큰 까만 눈 + 하얀 반짝임 2개, 분홍 볼터치, 작은 ω 고양이 입 |
| 시점 | 살짝 위에서 내려다본 3/4 탑다운. 정면을 보되 **오른쪽으로 살짝 돌아선** 자세 |
| 배경 | **완전 투명** (안 되면 순수 초록 `#00FF00` → 패커로 지움) |
| 방향 | 캐릭터는 **오른쪽을 바라보게**. 왼쪽은 게임이 자동으로 뒤집음 |
| 무기 | 주인공·동료는 **빈손**으로 그리기 (게임이 장착 무기를 따로 그려 줌) |
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

### STEP 4 · 스프라이트 시트로 묶기
`tower/tools/sprite-packer.html` 을 브라우저로 열기 → 프레임들을 끌어다 놓기 → 배경 지우기 → **프레임 크기 256, 발밑 기준** → PNG 저장

### STEP 5 · 게임에 등록
1. PNG를 `tower/assets/sprites/` 에 넣기 (아이콘은 `tower/assets/icons/`)
2. 패커가 만들어 준 코드를 `tower/assets/manifest.js` 에 붙이기
3. 게임 새로고침 → 바로 반영. 마을 화면 초상화·도감도 자동으로 바뀝니다

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

> 애니메이션이 하나만 있어도 됩니다. `walk` 만 넣으면 idle·hurt 때도 walk를 씁니다.
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

- 프레임 크기 **256×256** (보스는 512 권장), 모든 프레임에서 **발밑 위치 동일**
- 몬스터는 `walk` 하나(4프레임)만 있어도 충분. 보스는 `idle` + `attack`
- 떠다니는 몬스터(꿀벌·유령·박쥐 등)는 walk 대신 "위아래로 둥실" 4프레임
- 공격 이펙트(칼바람, 레이저, 탄환)는 게임이 그리므로 **캐릭터 몸 동작만** 그리기

---

## 5. 에셋 키 목록과 캐릭터 설명

설명 칸의 영문을 그대로 `<캐릭터 설명>` 자리에 넣으세요.

### 5.1 주인공 · 이야기 인물

| 키 | 이름 | 필요한 동작 | 캐릭터 설명 (영문) |
|---|---|---|---|
| `hero` | 모찌 | idle · walk · attack · hurt | Mochi: a small round white cat (#FFFAF3) with pink inner ears, a short curled tail, wearing a red knitted scarf (#FF6B6B) whose ends flutter behind; big sparkly eyes, ω mouth, pink blush; empty paws, no weapon |
| `grandma` | 솜솜 할머니 | (대화 초상화만) | Grandma Somsom: an old round gray-lilac cat (#DDD6E8) with round golden glasses, gentle sleepy eyes, a lilac knitted shawl with white dots |
| `lumi` | 루미 | (대화 초상화만) | Lumi: a chubby five-pointed pale-yellow star (#FFF3B0) with a soft golden glow, cute face with a small "o" mouth, floating |

### 5.2 펫 (8)

| 키 | 이름 | 캐릭터 설명 (영문) |
|---|---|---|
| `chick` | 삐약이 | Piyaki: a tiny round yellow chick (#FFE066) with an orange beak, wearing half of a cracked white eggshell on its head like a hat |
| `slimey` | 말랑이 | Mallangi: a small translucent mint-blue slime (#9FE6F0), dome shaped, happy closed eyes (^ ^), glossy highlight |
| `ppoyong` | 뽀용 | Ppoyong: a tiny pink baby dragon (#FF9FB0) with a butter-yellow belly, small cream horns, little wings and a short tail, floating |
| `boo` | 부우 | Boo: a small white ghost (#F2F0FF) with a wavy bottom edge, happy closed eyes and a small "o" mouth, floating |
| `hoot` | 부엉 | Hoot: a round brown owl (#B08968) with a cream belly, small ear tufts, huge round eyes with white sclera, orange beak |
| `twinkle` | 반짝이 | Twinkle: a chubby baby star (#FFF3B0) with a soft inner glow and a cute ω face |
| `oink` | 꿀꿀이 | Oink: a round pink piglet (#FFC2D1) with small folded ears and a big pink snout |
| `nyang` | 냥냥이 | Nyang: a round orange kitten (#FFB26B) with darker orange spots and a curled tail |

### 5.3 동료 (11)

털실 인형 셋은 프롬프트에 `made of soft knitted wool yarn with visible knit stitches and button eyes, like a handmade plush doll` 를 꼭 넣으세요.

| 키 | 이름 | 캐릭터 설명 (영문) |
|---|---|---|
| `mungchi` | 뭉치 | Mungchi: a round sky-blue knitted wool teddy bear doll (#9FC5E8) with visible knit stitches, black button eyes, a yellow bandana, empty paws |
| `bopul` | 보풀 | Bopul: a round pink knitted wool bunny doll (#F6C1D0) with long ears, visible knit stitches, button eyes and a mint ribbon bow |
| `poksin` | 폭신 | Poksin: a round cream knitted wool sheep doll (#FFF6E8) with fluffy white wool puffs on its head, small droopy ears, button eyes and a gentle smile |
| `gombang` | 곰방 | Gombang: a big round brown bear blacksmith (#C08B5C) with a light tan belly, round ears and a red bandana tied on his forehead, empty paws |
| `toseul` | 토슬 | Toseul: a round white-pink bunny baker (#FFF0F5) with long ears and a puffy white chef hat, happy closed eyes |
| `neogul` | 너굴 | Neogul: a round gray raccoon merchant (#A39E9E) with a dark eye-mask band and a striped bushy tail |
| `pengpeng` | 펭펭 | Pengpeng: a tall egg-shaped navy penguin priest (#4A5878) with a white belly, orange beak and a floating golden halo |
| `tobi` | 토비 | Tobi: a round light-blue bunny apprentice mage (#D4E8FF) with long ears and a blue pointed wizard hat with a yellow band |
| `daram` | 다람 | Daram: a round orange squirrel clockmaker (#E0954F) with a cream belly, a huge fluffy tail and brass goggles on his forehead |
| `yeoul` | 여울 | Yeoul: a round orange fox archer (#FF9A4D) with a white belly, tall ears with dark tips, a fluffy tail with a white tip and a teal feather in her fur, empty paws |
| `luna` | 루나 | Luna: a round lavender-white moon rabbit (#F3F0FF) with long ears (lilac inside), sleepy eyes and a yellow crescent-moon hairpin |

### 5.4 몬스터 (40) — 필요한 동작: `walk` 4프레임

| 키 | 이름 | 캐릭터 설명 (영문) |
|---|---|---|
| **1. 새싹 정원** | | |
| `slime` | 말랑 슬라임 | a translucent green dome-shaped slime (#86E3A0) with a glossy highlight, cute eyes, ω mouth |
| `mushroom` | 버섯돌이 | a round cream body (#FFF1D6) under a big red mushroom cap (#FF7B7B) with white spots, small dot eyes, gentle smile |
| `bee` | 붕붕 꿀벌 | a round flying bee (#FFD166) with dark plum stripes, two antennae, small white translucent wings, surprised "o" mouth |
| `sprout` | 새싹 꼬마 | an egg-shaped light-brown seed creature (#C9A27A) with a cream belly and two green leaves sprouting on top, happy closed eyes |
| **2. 달콤 과자숲** | | |
| `cookie` | 진저 쿠키 병정 | a rounded-square gingerbread cookie (#D99058) with white zigzag icing and pink candy buttons, button eyes |
| `macaron` | 마카롱 박쥐 | a round sky-blue macaron (#A8DCFF) with a cream filling stripe across the middle, pink bat wings, a tiny fang |
| `cottonghost` | 솜사탕 유령 | a fluffy pink cotton-candy ghost (#FFC6E5) with rainbow sprinkles, happy closed eyes, floating |
| `gummybear` | 말랑 곰젤리 | a translucent strawberry-pink round gummy bear (#FF7B9C) with small round ears |
| **3. 모래시계 사막** | | |
| `cactus` | 선인장 꿍 | a tall oval green cactus (#6CC56F) with tiny cream needles and a pink bow on top, dot eyes |
| `scorpion` | 모래 전갈 | a wide oval sandy-orange scorpion (#E7A85F) with two claws and a curled tail with a dark stinger, angry brows |
| `mummycat` | 미라냥 | a round cream cat (#F2EAD3) wrapped in loose bandages, cat ears, glowing green eyes |
| `dustspirit` | 모래바람 정령 | a sandy yellow ghost (#EFCF8F) with a wavy bottom, sleepy eyes, floating |
| **4. 눈꽃 설원** | | |
| `snowman` | 꼬마 눈사람 | a round white snowman with a pink knitted beanie with a pompom, a carrot nose and dot eyes |
| `babypenguin` | 아기 펭귄 | a tall egg-shaped navy penguin chick (#4A5878) with a white belly and an orange beak |
| `icewisp` | 얼음 정령 | a chubby five-pointed star made of ice (#A5ECFF) with a soft glow and a happy face, floating |
| `snowbunny` | 눈토끼 | a round snow-white bunny with pale-blue inner ears |
| **5. 보글 화산** | | |
| `fireimp` | 불씨 도깨비 | a round red-orange imp (#FF7B54) with small cream horns and a flame on its head, angry brows, wide grin |
| `lavasnail` | 용암 달팽이 | a wide peach snail body (#FFB36B) carrying a red spiral shell (#FF5E5B), sleepy eyes |
| `firebat` | 화산 박쥐 | a round dark plum bat (#7A4B6B) with darker wings, glowing amber eyes, little fangs, floating |
| `magmaslime` | 마그마 슬라임 | a translucent red-orange slime (#FF6B5B) with glowing yellow lava cracks, angry brows |
| **6. 유령 도서관** | | |
| `flybook` | 날아다니는 책 | a purple hardcover book (#7B5EA7) with cream pages visible on one side and a grinning face on the cover, floating |
| `candleghost` | 촛불 유령 | a white ghost (#F6F0FF) with a small lit candle on its head, sleepy eyes, floating |
| `inkslime` | 잉크 슬라임 | a translucent indigo ink slime (#5A5694) with a surprised "o" mouth |
| `quillknight` | 깃펜 기사 | a tall oval cream body wearing a lilac knight helmet with a teal plume, holding nothing, a teal quill feather stuck in the helmet |
| **7. 태엽 장난감 공장** | | |
| `windupsoldier` | 태엽 병정 | a tall oval red toy soldier (#EF5F7F) with a tall navy busby hat with a gold band and a golden wind-up key on its back, button eyes |
| `jackbox` | 깜짝상자 | a yellow toy box (#FFD166) with a grinning face and a blue ribbon bow |
| `toytank` | 장난감 탱크 | a green toy-block tank (#8FC97A) with a small cannon on top and dot eyes |
| `robo` | 꼬마 로봇 | a rounded-square silver-blue robot (#B8C4D9) with two antennae tipped with red balls, glowing cyan eyes, zigzag mouth, no blush |
| **8. 물방울 수족관** | | |
| `jellyfish` | 말랑 해파리 | a translucent pink jellyfish (#FFB3E6) with a wavy skirt and a happy face, floating |
| `puffer` | 빵빵 복어 | a round yellow puffer fish (#FFE066) covered with darker yellow spikes, cute "o" mouth |
| `angler` | 반짝 아귀 | an oval navy-blue anglerfish (#4F6D9A) with fins and a glowing yellow lure on a stalk, little fangs |
| `crab` | 꽃게 장군 | a wide red crab (#FF6B6B) with two big round claws and a smile |
| **9. 별빛 천문대** | | |
| `shootingstar` | 별똥별 | a chubby yellow star (#FFE66D) with a happy face, floating |
| `moonbunny` | 달토끼 | a round lavender-white rabbit (#F3F0FF) with pink inner ears and a crescent-moon hairpin |
| `nebula` | 성운 정령 | a periwinkle ghost (#9D8DF1) sprinkled with tiny stars and glowing pale-yellow eyes, floating |
| `clockbird` | 뻐꾸기 시계새 | a round golden bird (#D9B45A) with a clock face on its belly, small white wings and an orange beak |
| **10. 꿈의 정점** | | |
| `nightslime` | 악몽 슬라임 | a translucent dark purple slime (#5B4A8A) with glowing magenta eyes and one tiny fang |
| `nightbat` | 악몽 박쥐 | a round very dark purple bat (#3E335C) with glowing magenta eyes, floating |
| `shadowknight` | 그림자 기사 | a tall dark purple knight (#4B3D70) wearing a dark helmet with a violet plume, glowing lilac eyes, no mouth |
| `nightmareeye` | 악몽의 눈 | a round dark body with one huge eye (magenta iris), small bat wings, floating |

### 5.5 보스 (10) — 필요한 동작: `idle` 4 + `attack` 4, 프레임 512

보스 프롬프트에는 `Large boss character, more detailed accessories but same simple style` 를 덧붙이세요.

| 키 | 이름 | 캐릭터 설명 (영문) |
|---|---|---|
| `puddingking` | 푸딩 임금님 | a giant wobbly custard pudding slime (#FFD480) with dripping caramel on top (#A0522D), a golden crown, a big grin |
| `cakegolem` | 생크림 대장 | a three-layer cake golem: a rounded-square white cream body with pink frosting drips and rainbow sprinkles, a lit candle and a cherry on top, angry brows, grin |
| `sphinx` | 냥크스 | a round golden cat (#F4C95D) wearing a blue-and-gold striped pharaoh headdress with a red gem, glowing cyan eyes |
| `yeti` | 털복숭이 설왕 | a big round white yeti (#F4F8FF) with a pale-blue belly, two icy horns, a small crown, angry brows and fangs |
| `ignis` | 꼬마 화염룡 이그니스 | a round red dragon (#FF6B5B) with a yellow belly, cream horns, red wings and tail, angry brows, fangs |
| `libra` | 책벌레 마녀 리브라 | a round lilac witch (#C7A6F0) with round golden glasses and a tall dark purple witch hat with a teal band, floating pages around |
| `teddymachine` | 테디 머신 | a giant round brown teddy bear (#C49A6C) with a tan belly, stitched patches, button eyes and a big wind-up key on its back |
| `octoking` | 왕문어 꾸물 | a round pink octopus (#E56B9F) with darker spots, six wiggly tentacles and a navy captain hat with a gold emblem |
| `chronoowl` | 시간의 부엉이 크로노 | a round purple-gray owl (#7D6B94) with a light belly showing a clock face, ear tufts, huge eyes and a golden monocle |
| `nightmare` | 악몽왕 | a large dark navy-purple star (#3A2B5C) sprinkled with tiny stars, glowing magenta eyes, a wide grin and a golden crown |

> 악몽왕 2페이즈(루미)는 게임이 기본 그림으로 바꿔 그립니다. PNG를 쓰고 싶다면 `lumi` 를 먼저 만들어 두세요.

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

### 7.1 바닥 타일 — 키 `tile_1` ~ `tile_10`

```
[STYLE 생략 가능] Seamless tileable square ground texture for a cute top-down mobile game,
flat pastel colors, very subtle pattern, low contrast so characters stand out, no objects, no shadows, 512x512.
Theme: <테마>
```

| 키 | 테마 |
|---|---|
| `tile_1` | soft light-green grass with tiny white and pink flowers |
| `tile_2` | pastel pink frosting floor with scattered rainbow sprinkles |
| `tile_3` | pale golden sand with a few tiny pebbles |
| `tile_4` | soft white snow with faint blue snowflake marks |
| `tile_5` | warm peach volcanic ground with thin orange glowing cracks |
| `tile_6` | lilac library carpet with faint scattered paper pages |
| `tile_7` | mint toy-factory floor with faint bolts and nuts |
| `tile_8` | light aqua sea floor with faint bubbles |
| `tile_9` | deep periwinkle night floor with tiny stars |
| `tile_10` | dark dreamy purple floor with faint pink stars |

### 7.2 장애물 — 키 `obs_<종류>`

`[STYLE]` + `A single cute obstacle prop for a top-down game, seen from a 3/4 top-down view, sitting on the ground, transparent background: <설명>`

| 키 | 설명 | 키 | 설명 |
|---|---|---|---|
| `obs_bush` | round green bush with pink berries | `obs_rock` | round lavender-gray boulder |
| `obs_flower` | one giant pink flower with a yellow center | `obs_lollipop` | big pink swirl lollipop on a stick |
| `obs_candycane` | red-and-white candy cane | `obs_cupcake` | cupcake with cream and a cherry |
| `obs_cactus` | green cactus with two arms and a pink flower | `obs_sandrock` | sandy rounded rock |
| `obs_pillar` | broken cream stone column | `obs_snowrock` | gray rock with a snow cap |
| `obs_pine` | snowy pine tree | `obs_icecrystal` | cluster of light-blue ice crystals |
| `obs_lavarock` | dark rock with glowing orange cracks | `obs_vent` | tiny volcano cone with a flame |
| `obs_bookshelf` | short wooden bookshelf with colorful books | `obs_candelabra` | golden three-candle candelabra |
| `obs_crystal` | cluster of lilac crystals | `obs_gear` | big golden gear standing upright |
| `obs_crate` | wooden crate | `obs_blocks` | stacked A-B-C toy blocks |
| `obs_coral` | pink branching coral | `obs_shell` | big pink scallop shell |
| `obs_telescope` | blue telescope on a wooden tripod | `obs_shadowcrystal` | dark purple glowing crystals |
| `obs_darkpillar` | dark purple stone column | | |

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
| 키 아트 (스토어 대표 이미지) | `Key art for a cute mobile roguelike: a tall dark tower rising into fluffy clouds under a starry night, a small white cat with a red scarf and a lantern at the bottom, cute monsters (slime, mushroom, bee, cookie soldier) peeking from the sides, companions (bear, bunny chef, raccoon, penguin priest) behind the cat, warm campfire glow, pastel chibi style with thick plum outlines, vertical 9:16` |
| 스토어 스크린샷 배너 문구 | "한 손으로 피하고, 자동으로 싸워요" · "10층마다 새로운 꿈의 세계" · "구해 낸 친구들이 동료가 돼요" · "고양이 모찌의 백 층 이야기" |

짧은 홍보 영상은 Gemini 동영상 생성에 키 아트를 첨부하고 `slow camera tilt up the tower, stars twinkling, the cat looks up, gentle bouncy motion` 처럼 요청하면 좋습니다.

---

## 10. 체크리스트

- [ ] `style_ref.png` 확정 (모찌)
- [ ] 모찌 idle · walk · attack · hurt
- [ ] 삐약이, 뭉치·보풀·폭신 (첫 펫·첫 팀)
- [ ] 1스테이지 몬스터 4종 + 푸딩 임금님
- [ ] 스킬 아이콘 8종
- [ ] 바닥 타일 `tile_1`, 장애물 3종
- [ ] 나머지 스테이지를 하나씩 (스테이지 단위로 같은 대화에서 작업)
- [ ] 로고 · 앱 아이콘 · 키 아트
