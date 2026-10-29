# AI 에셋 생성 계획

> 이 문서는 `node tower/tools/build-asset-plan.js` 로 자동 생성돼요. 직접 고치지 말고 스크립트를 고친 뒤 다시 실행하세요.
> 생성 도구가 그대로 따라 하는 전체 목록(프롬프트 포함)은 `tower/assets/asset-plan.json` 에 있어요.

## 그림체 방향

**귀여운 동물 + 도트 감성** — 세피리아처럼 작은 동물 친구들이 탑을 오르는 느낌. 다른 게임의 캐릭터를 따라 그리지 않도록 프롬프트에는 게임·캐릭터 이름을 넣지 않아요.

- 2등신 동글동글 몸, 큰 눈, 볼터치, 짙은 자주색(#3b2a4d) 외곽선, 파스텔 색
- 위에서 비스듬히 내려다본 시점, 오른쪽을 바라봄 (왼쪽은 게임이 뒤집어요)
- 배경은 마젠타(#FF00FF) 단색 → 가져오기 도구가 자동으로 지워요
- 게임 안에서는 "도트 감성 화면"이 모든 그림을 같은 픽셀 크기로 맞춰 줘서, 여러 모델로 만든 그림도 한 세트처럼 보여요

공통 프롬프트(영어):

```
cute chibi animal character for a top-down action roguelite game, pixel art, crisp clean pixels, limited soft pastel palette, 2-head-tall round body, big glossy eyes, rosy cheeks, tiny paws, clean dark plum (#3b2a4d) outline, simple 2-3 tone shading, soft top-left light, 3/4 top-down view, facing right, full body, centered, small, flat solid magenta (#FF00FF) background, no ground shadow, no text, no border
```

## 만드는 순서 (캐릭터 1명 기준)

1. **참고 그림**: `node tower/tools/export-refs.js` → `tower/assets/refs/<키>.png` (지금 코드로 그린 모습. 모양·색을 맞추는 참고용)
2. **기본 그림**: 참고 그림 + 프롬프트로 ChatGPT 이미지(보스는 Gemini) 생성 → `tower/assets/src/<키>/base.png`
3. **동작**: 기본 그림으로 동작을 만들어요 → `tower/assets/src/<키>/<동작>.png` (시트 또는 AutoSprite 결과)
4. **가져오기**: `python3 tower/tools/import_sprites.py` → 배경 제거·크기 맞춤·발 위치 정렬 후 `tower/assets/sprites/` 에 저장하고 `manifest.auto.js` 자동 등록
5. **확인**: `tower/tools/gallery.html` (캐릭터 도감)에서 동작을 하나씩 재생해 봐요

## 비용 (Higgsfield 크레딧, 다시 뽑기 여유 ×1.3 포함)

| 단계 | 내용 | 절약형 (동작=ChatGPT 시트) | 표준 (AutoSprite 빠름) | 고급 (AutoSprite 고품질) |
|---|---|---|---|---|
| 1 | 맛보기: 모찌 + 시작 동료 3 + 삐약이 + 1스테이지 몬스터 4 + 푸딩 임금님 + 바닥·장애물·스킬 아이콘 2·로고 | 21.8 (그림 12.3 + 동작 9.4) | 87.8 (그림 12.3 + 동작 75.4) | 125.5 (그림 12.3 + 동작 113.1) |
| 2 | 2~5스테이지 + 나머지 동료 8 + 펫 7 | 63.7 (그림 34.5 + 동작 29.3) | 268.4 (그림 34.5 + 동작 234) | 385.4 (그림 34.5 + 동작 351) |
| 3 | 6~10스테이지 + 마을 사람 + 나머지 스킬 아이콘 | 57.2 (그림 38.7 + 동작 18.5) | 186.9 (그림 38.7 + 동작 148.2) | 261 (그림 38.7 + 동작 222.3) |
| 4 | (선택) 피격·기절 등 세부 동작 전부 | 46.1 (그림 0 + 동작 46.1) | 369.2 (그림 0 + 동작 369.2) | 553.8 (그림 0 + 동작 553.8) |
| **합계** | | **188.8** | **912.3** | **1325.7** |

가격: ChatGPT 이미지 0.25 / Gemini 2 / AutoSprite 빠름 2, 고품질 3 크레딧 (2026-10 확인한 값, 바뀔 수 있어요)

## 1단계 — 맛보기: 모찌 + 시작 동료 3 + 삐약이 + 1스테이지 몬스터 4 + 푸딩 임금님 + 바닥·장애물·스킬 아이콘 2·로고

| 키 | 이름 | 종류 | 크기 | 동작 (프레임) |
|---|---|---|---|---|
| `hero` | 모찌 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `mungchi` | 뭉치 | 동료 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `bopul` | 보풀 | 동료 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `poksin` | 폭신 | 동료 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `chick` | 삐약이 | 펫 | 32px | idle(4), walk(6) |
| `slime` | 말랑 슬라임 | 몬스터 | 40px | walk(6), attack(4) |
| `mushroom` | 버섯돌이 | 몬스터 | 40px | walk(6), attack(4) |
| `bee` | 붕붕 꿀벌 | 몬스터 | 40px | walk(6), attack(4) |
| `sprout` | 새싹 꼬마 | 몬스터 | 40px | walk(6), attack(4) |
| `puddingking` | 푸딩 임금님 | 보스 | 112px | idle(4), attack(4), cast(6) |

아이콘·바닥·장애물: `icon_skill_spin`, `icon_skill_heal`, `obs_bush`, `obs_rock`, `obs_flower`, `tile_1`, `ui_logo`

## 2단계 — 2~5스테이지 + 나머지 동료 8 + 펫 7

| 키 | 이름 | 종류 | 크기 | 동작 (프레임) |
|---|---|---|---|---|
| `cookie` | 진저 쿠키 병정 | 몬스터 | 40px | walk(6), attack(4) |
| `macaron` | 마카롱 박쥐 | 몬스터 | 40px | walk(6), attack(4) |
| `cottonghost` | 솜사탕 유령 | 몬스터 | 40px | walk(6), attack(4) |
| `gummybear` | 말랑 곰젤리 | 몬스터 | 40px | walk(6), attack(4) |
| `cakegolem` | 생크림 대장 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `cactus` | 선인장 꿍 | 몬스터 | 40px | walk(6), attack(4) |
| `scorpion` | 모래 전갈 | 몬스터 | 40px | walk(6), attack(4) |
| `mummycat` | 미라냥 | 몬스터 | 40px | walk(6), attack(4) |
| `dustspirit` | 모래바람 정령 | 몬스터 | 40px | walk(6), attack(4) |
| `sphinx` | 냥크스 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `snowman` | 꼬마 눈사람 | 몬스터 | 40px | walk(6), attack(4) |
| `babypenguin` | 아기 펭귄 | 몬스터 | 40px | walk(6), attack(4) |
| `icewisp` | 얼음 정령 | 몬스터 | 40px | walk(6), attack(4) |
| `snowbunny` | 눈토끼 | 몬스터 | 40px | walk(6), attack(4) |
| `yeti` | 털복숭이 설왕 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `fireimp` | 불씨 도깨비 | 몬스터 | 40px | walk(6), attack(4) |
| `lavasnail` | 용암 달팽이 | 몬스터 | 40px | walk(6), attack(4) |
| `firebat` | 화산 박쥐 | 몬스터 | 40px | walk(6), attack(4) |
| `magmaslime` | 마그마 슬라임 | 몬스터 | 40px | walk(6), attack(4) |
| `ignis` | 꼬마 화염룡 이그니스 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `gombang` | 곰방 | 동료 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `toseul` | 토슬 | 동료 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `neogul` | 너굴 | 동료 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `pengpeng` | 펭펭 | 동료 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `tobi` | 토비 | 동료 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `daram` | 다람 | 동료 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `yeoul` | 여울 | 동료 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `luna` | 루나 | 동료 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `slimey` | 말랑이 | 펫 | 32px | idle(4), walk(6) |
| `ppoyong` | 뽀용 | 펫 | 32px | idle(4), walk(6) |
| `boo` | 부우 | 펫 | 32px | idle(4), walk(6) |
| `hoot` | 부엉 | 펫 | 32px | idle(4), walk(6) |
| `twinkle` | 반짝이 | 펫 | 32px | idle(4), walk(6) |
| `oink` | 꿀꿀이 | 펫 | 32px | idle(4), walk(6) |
| `nyang` | 냥냥이 | 펫 | 32px | idle(4), walk(6) |

아이콘·바닥·장애물: `obs_lollipop`, `obs_candycane`, `obs_cupcake`, `obs_cactus`, `obs_sandrock`, `obs_pillar`, `obs_snowrock`, `obs_pine`, `obs_icecrystal`, `obs_lavarock`, `obs_vent`, `tile_2`, `tile_3`, `tile_4`, `tile_5`

## 3단계 — 6~10스테이지 + 마을 사람 + 나머지 스킬 아이콘

| 키 | 이름 | 종류 | 크기 | 동작 (프레임) |
|---|---|---|---|---|
| `flybook` | 날아다니는 책 | 몬스터 | 40px | walk(6), attack(4) |
| `candleghost` | 촛불 유령 | 몬스터 | 40px | walk(6), attack(4) |
| `inkslime` | 잉크 슬라임 | 몬스터 | 40px | walk(6), attack(4) |
| `quillknight` | 깃펜 기사 | 몬스터 | 40px | walk(6), attack(4) |
| `libra` | 책벌레 마녀 리브라 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `windupsoldier` | 태엽 병정 | 몬스터 | 40px | walk(6), attack(4) |
| `jackbox` | 깜짝상자 | 몬스터 | 40px | walk(6), attack(4) |
| `toytank` | 장난감 탱크 | 몬스터 | 40px | walk(6), attack(4) |
| `robo` | 꼬마 로봇 | 몬스터 | 40px | walk(6), attack(4) |
| `teddymachine` | 테디 머신 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `jellyfish` | 말랑 해파리 | 몬스터 | 40px | walk(6), attack(4) |
| `puffer` | 빵빵 복어 | 몬스터 | 40px | walk(6), attack(4) |
| `angler` | 반짝 아귀 | 몬스터 | 40px | walk(6), attack(4) |
| `crab` | 꽃게 장군 | 몬스터 | 40px | walk(6), attack(4) |
| `octoking` | 왕문어 꾸물 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `shootingstar` | 별똥별 | 몬스터 | 40px | walk(6), attack(4) |
| `moonbunny` | 달토끼 | 몬스터 | 40px | walk(6), attack(4) |
| `nebula` | 성운 정령 | 몬스터 | 40px | walk(6), attack(4) |
| `clockbird` | 뻐꾸기 시계새 | 몬스터 | 40px | walk(6), attack(4) |
| `chronoowl` | 시간의 부엉이 크로노 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `nightslime` | 악몽 슬라임 | 몬스터 | 40px | walk(6), attack(4) |
| `nightbat` | 악몽 박쥐 | 몬스터 | 40px | walk(6), attack(4) |
| `shadowknight` | 그림자 기사 | 몬스터 | 40px | walk(6), attack(4) |
| `nightmareeye` | 악몽의 눈 | 몬스터 | 40px | walk(6), attack(4) |
| `nightmare` | 악몽왕 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `grandma` | 솜솜 할머니 | 마을 사람 | 48px | idle(4) |
| `lumi` | 루미 | 마을 사람 | 48px | idle(4) |

아이콘·바닥·장애물: `icon_skill_meteor`, `icon_skill_frost`, `icon_skill_thunder`, `icon_skill_shield`, `icon_skill_beam`, `icon_skill_clone`, `obs_bookshelf`, `obs_candelabra`, `obs_crystal`, `obs_gear`, `obs_crate`, `obs_blocks`, `obs_coral`, `obs_shell`, `obs_telescope`, `obs_shadowcrystal`, `obs_darkpillar`, `tile_6`, `tile_7`, `tile_8`, `tile_9`, `tile_10`

## 4단계 (선택) — 세부 동작

피격(hurt)·기절(die) 등: 142개 동작. 없으면 게임이 코드 그림의 흔들림·하얀 번쩍임으로 대신해요.

## 캐릭터 디자인 (프롬프트 앞부분)

| 키 | 이름 | 생김새 |
|---|---|---|
| `hero` | 모찌 | a small white kitten with pink inner ears, a red scarf and a long white tail, empty paws (holding nothing) |
| `mungchi` | 뭉치 | a knitted blue yarn teddy bear doll with stitched mouth and a yellow headband, holding a round yarn shield |
| `bopul` | 보풀 | a knitted pink yarn bunny doll with long ears and a mint bow, holding a small bow |
| `poksin` | 폭신 | a fluffy knitted white yarn sheep doll with a cream face |
| `chick` | 삐약이 | a tiny yellow chick still wearing half of its eggshell on its head |
| `slime` | 말랑 슬라임 | a translucent mint-green jelly slime with little cat ears |
| `mushroom` | 버섯돌이 | a chubby cream hamster wearing a big red spotted mushroom cap |
| `bee` | 붕붕 꿀벌 | a round fuzzy yellow-and-plum striped bumblebee with tiny wings and antennae |
| `sprout` | 새싹 꼬마 | a small brown mole with a green sprout growing on its head and a cream belly |
| `puddingking` | 푸딩 임금님 | a giant wobbly caramel custard pudding cat with cat ears, dripping caramel and a tiny golden crown |
| `cookie` | 진저 쿠키 병정 | a gingerbread cookie bear soldier with white icing details and button eyes |
| `macaron` | 마카롱 박쥐 | a round sky-blue macaron bat with cream filling and pink wings |
| `cottonghost` | 솜사탕 유령 | a pink cotton-candy ghost bunny with long fluffy ears and rainbow sprinkles |
| `gummybear` | 말랑 곰젤리 | a translucent strawberry-red gummy bear |
| `cakegolem` | 생크림 대장 | a big three-layer strawberry shortcake bear with frosting, sprinkles, a cherry and a lit candle on top |
| `cactus` | 선인장 꿍 | a round potted-cactus creature with little needles and a pink flower bow |
| `scorpion` | 모래 전갈 | a chubby sandy-orange baby scorpion with big claws and a curled tail |
| `mummycat` | 미라냥 | a cream cat wrapped in mummy bandages with glowing green eyes |
| `dustspirit` | 모래바람 정령 | a floating sand-colored fennec fox spirit with huge ears and a wispy dust tail |
| `sphinx` | 냥크스 | a golden sphinx cat wearing a blue-and-gold pharaoh headdress with glowing cyan eyes |
| `snowman` | 꼬마 눈사람 | a little snowman bear cub with a pink knit beanie and a carrot nose |
| `babypenguin` | 아기 펭귄 | a navy baby penguin with a white belly and a tiny orange beak |
| `icewisp` | 얼음 정령 | a floating ice-blue star-shaped frost spirit with a happy face |
| `snowbunny` | 눈토끼 | a white snow bunny with light-blue inner ears |
| `yeti` | 털복숭이 설왕 | a huge fluffy white yeti with ice-blue belly, small curved horns and a frosty crown |
| `fireimp` | 불씨 도깨비 | a small orange fire imp fox with tiny horns, a flame on its head and a fox tail |
| `lavasnail` | 용암 달팽이 | a sleepy orange snail with a glowing red lava shell |
| `firebat` | 화산 박쥐 | a plum-colored volcano bat with glowing amber eyes |
| `magmaslime` | 마그마 슬라임 | a translucent red magma jelly slime with cat ears and glowing lava cracks |
| `ignis` | 꼬마 화염룡 이그니스 | a chubby baby red dragon with a yellow belly, small horns, big wings and a dragon tail |
| `flybook` | 날아다니는 책 | a purple flying spellbook with fluttering pages and a cute face on the cover |
| `candleghost` | 촛불 유령 | a white ghost cat with a lit candle on its head and sleepy eyes |
| `inkslime` | 잉크 슬라임 | a translucent indigo ink jelly slime with round mouse ears |
| `quillknight` | 깃펜 기사 | a white duck knight with a lavender helmet and a teal feather plume, holding a giant quill pen like a lance |
| `libra` | 책벌레 마녀 리브라 | a lilac cat witch with round glasses, a tall dark-purple witch hat and a floating open book |
| `windupsoldier` | 태엽 병정 | a grey wind-up toy mouse soldier with a red coat, a tall soldier hat and a brass wind-up key on its back |
| `jackbox` | 깜짝상자 | a yellow jack-in-the-box with a blue bow and a grinning bunny popping out on a spring |
| `toytank` | 장난감 탱크 | a small green toy tank driven by a tiny hamster with a cannon |
| `robo` | 꼬마 로봇 | a small silver robot cat with glowing cyan eyes |
| `teddymachine` | 테디 머신 | a giant brown patched teddy bear machine with stitches, button eyes and a big wind-up key on its back |
| `jellyfish` | 말랑 해파리 | a translucent pink jellyfish with a happy face and short tentacles |
| `puffer` | 빵빵 복어 | a round yellow pufferfish with spikes |
| `angler` | 반짝 아귀 | a navy anglerfish with tiny fangs and a glowing lure |
| `crab` | 꽃게 장군 | a red crab general with big claws and a proud smile |
| `octoking` | 왕문어 꾸물 | a big pink octopus with spotted tentacles wearing a navy captain hat |
| `shootingstar` | 별똥별 | a yellow shooting star creature with a sparkling tail |
| `moonbunny` | 달토끼 | a white moon rabbit with pink inner ears and a crescent moon hairpin, holding a rice-cake mallet |
| `nebula` | 성운 정령 | a floating violet nebula ghost cat dotted with tiny stars and glowing yellow eyes |
| `clockbird` | 뻐꾸기 시계새 | a golden cuckoo-clock bird with a clock face on its belly and little wings |
| `chronoowl` | 시간의 부엉이 크로노 | a large dusky purple owl with a clock-face belly and a golden monocle |
| `nightslime` | 악몽 슬라임 | a translucent dark-violet nightmare jelly slime with small horns and glowing pink eyes |
| `nightbat` | 악몽 박쥐 | a dark navy nightmare bat with glowing pink eyes |
| `shadowknight` | 그림자 기사 | a shadowy purple wolf knight with fox-like ears, a dark helmet and a big bushy tail |
| `nightmareeye` | 악몽의 눈 | a dark round one-eyed creature with a big pink eye and bat wings |
| `nightmare` | 악몽왕 | a dark indigo star-shaped nightmare king with a golden crown, glowing pink eyes and starry patterns |
| `gombang` | 곰방 | a sturdy brown bear blacksmith with a red bandana and a leather apron, holding a big hammer |
| `toseul` | 토슬 | a white bunny baker with a tall chef hat and a pink apron |
| `neogul` | 너굴 | a grey raccoon merchant rogue with a striped tail, a coin pouch and twin small daggers |
| `pengpeng` | 펭펭 | a little penguin priest with a golden halo and a small staff |
| `tobi` | 토비 | a light-blue apprentice mage hamster with a blue pointy wizard hat and a wand |
| `daram` | 다람 | a squirrel clockmaker with brass goggles and a huge fluffy tail, carrying gears |
| `yeoul` | 여울 | an orange fox archer with a white-tipped tail and a teal feather in its ear, holding a longbow |
| `luna` | 루나 | a lilac moon bunny shrine maiden with long ears and a crescent moon hairpin |
| `slimey` | 말랑이 | a small sky-blue jelly blob pet with a happy face |
| `ppoyong` | 뽀용 | a baby pink dragon with tiny wings and a cream belly |
| `boo` | 부우 | a tiny lavender ghost pet with a sleepy smile |
| `hoot` | 부엉 | a small brown owlet with round glasses-like eye rings |
| `twinkle` | 반짝이 | a small smiling yellow star creature |
| `oink` | 꿀꿀이 | a chubby pink piglet with a coin-shaped snout |
| `nyang` | 냥냥이 | a small orange tabby kitten |
| `grandma` | 솜솜 할머니 | an old grey grandma cat with round glasses and a purple shawl |
| `lumi` | 루미 | a small cream-yellow dream star spirit with a gentle smile |
