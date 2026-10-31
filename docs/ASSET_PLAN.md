# AI 에셋 생성 계획

> 이 문서는 `node tower/tools/build-asset-plan.js` 로 자동 생성돼요. 직접 고치지 말고 스크립트를 고친 뒤 다시 실행하세요.
> 생성 도구가 그대로 따라 하는 전체 목록(프롬프트 포함)은 `tower/assets/asset-plan.json` 에 있어요.

## 그림체 방향

**귀여운 동물 주인공 + 판타지 던전 몬스터 + 도트 감성** — 세피리아처럼 작은 동물 친구들이 무기를 휘두르며 던전 탑을 오르는 느낌. 다른 게임의 캐릭터를 따라 그리지 않도록 프롬프트에는 게임·캐릭터 이름을 넣지 않아요.

- 2등신 동글동글 몸, 큰 눈, 짙은 자주색(#3b2a4d) 외곽선. 주인공은 빈손(무기는 게임이 그림), 몬스터는 해골·고블린·박쥐처럼 판타지풍
- 위에서 비스듬히 내려다본 시점, 오른쪽을 바라봄 (왼쪽은 게임이 뒤집어요)
- 배경은 마젠타(#FF00FF) 단색 → 가져오기 도구가 자동으로 지워요
- 게임 안에서는 "도트 감성 화면"이 모든 그림을 같은 픽셀 크기로 맞춰 줘서, 여러 모델로 만든 그림도 한 세트처럼 보여요

공통 프롬프트(영어):

```
cute chibi fantasy character for a top-down dungeon action roguelite game, pixel art, crisp clean pixels, limited soft pastel palette, 2-head-tall round body, big glossy eyes, rosy cheeks, tiny paws, clean dark plum (#3b2a4d) outline, simple 2-3 tone shading, soft top-left light, 3/4 top-down view, facing right, full body, centered, small, flat solid magenta (#FF00FF) background, no ground shadow, no text, no border
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
| 1 | 맛보기: 모찌 + 처음 고르는 주인공 3 + 삐약이 + 1스테이지 몬스터 4 + 고블린 대장 + 바닥·장애물·스킬 아이콘 2·로고 | 22.1 (그림 12.7 + 동작 9.4) | 88.1 (그림 12.7 + 동작 75.4) | 125.8 (그림 12.7 + 동작 113.1) |
| 2 | 2~5스테이지 + 나머지 주인공 8 + 펫 7 | 64 (그림 34.8 + 동작 29.3) | 268.8 (그림 34.8 + 동작 234) | 385.8 (그림 34.8 + 동작 351) |
| 3 | 6~10스테이지 + 마을 사람 + 나머지 스킬 아이콘 | 56.9 (그림 38.4 + 동작 18.5) | 186.6 (그림 38.4 + 동작 148.2) | 260.7 (그림 38.4 + 동작 222.3) |
| 4 | (선택) 피격·기절 등 세부 동작 전부 | 46.1 (그림 0 + 동작 46.1) | 369.2 (그림 0 + 동작 369.2) | 553.8 (그림 0 + 동작 553.8) |
| **합계** | | **189.2** | **912.6** | **1326** |

가격: ChatGPT 이미지 0.25 / Gemini 2 / AutoSprite 빠름 2, 고품질 3 크레딧 (2026-10 확인한 값, 바뀔 수 있어요)

## 1단계 — 맛보기: 모찌 + 처음 고르는 주인공 3 + 삐약이 + 1스테이지 몬스터 4 + 고블린 대장 + 바닥·장애물·스킬 아이콘 2·로고

| 키 | 이름 | 종류 | 크기 | 동작 (프레임) |
|---|---|---|---|---|
| `hero` | 모찌 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `mungchi` | 뭉치 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `bopul` | 보풀 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `poksin` | 폭신 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `chick` | 삐약이 | 펫 | 32px | idle(4), walk(6) |
| `slime` | 초록 슬라임 | 몬스터 | 40px | walk(6), attack(4) |
| `goblin` | 고블린 | 몬스터 | 40px | walk(6), attack(4) |
| `bat` | 동굴 박쥐 | 몬스터 | 40px | walk(6), attack(4) |
| `goblinthrower` | 고블린 투석꾼 | 몬스터 | 40px | walk(6), attack(4) |
| `goblinchief` | 고블린 대장 그롬 | 보스 | 112px | idle(4), attack(4), cast(6) |

아이콘·바닥·장애물: `icon_skill_spin`, `icon_skill_heal`, `obs_barrel`, `obs_crate`, `obs_rock`, `obs_brokenpillar`, `tile_1`, `ui_logo`

## 2단계 — 2~5스테이지 + 나머지 주인공 8 + 펫 7

| 키 | 이름 | 종류 | 크기 | 동작 (프레임) |
|---|---|---|---|---|
| `skeleton` | 해골 병사 | 몬스터 | 40px | walk(6), attack(4) |
| `skelarcher` | 해골 궁수 | 몬스터 | 40px | walk(6), attack(4) |
| `ghost` | 떠도는 유령 | 몬스터 | 40px | walk(6), attack(4) |
| `skeldog` | 해골 개 | 몬스터 | 40px | walk(6), attack(4) |
| `skeletonking` | 해골 왕 본즈 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `spider` | 동굴 거미 | 몬스터 | 40px | walk(6), attack(4) |
| `toadstool` | 독버섯 | 몬스터 | 40px | walk(6), attack(4) |
| `worm` | 동굴 지렁이 | 몬스터 | 40px | walk(6), attack(4) |
| `poisonslime` | 독 슬라임 | 몬스터 | 40px | walk(6), attack(4) |
| `spiderqueen` | 거미 여왕 아라냐 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `frostbat` | 서리 박쥐 | 몬스터 | 40px | walk(6), attack(4) |
| `icewisp` | 얼음 정령 | 몬스터 | 40px | walk(6), attack(4) |
| `frostwolf` | 서리 늑대 | 몬스터 | 40px | walk(6), attack(4) |
| `icegolem` | 얼음 골렘 | 몬스터 | 40px | walk(6), attack(4) |
| `frostgiant` | 서리 거인 요툰 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `imp` | 불꽃 임프 | 몬스터 | 40px | walk(6), attack(4) |
| `lavaslime` | 용암 슬라임 | 몬스터 | 40px | walk(6), attack(4) |
| `firebat` | 화염 박쥐 | 몬스터 | 40px | walk(6), attack(4) |
| `kobold` | 코볼트 광부 | 몬스터 | 40px | walk(6), attack(4) |
| `reddragon` | 화염룡 이그니스 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `gombang` | 곰방 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `toseul` | 토슬 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `neogul` | 너굴 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `pengpeng` | 펭펭 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `tobi` | 토비 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `daram` | 다람 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `yeoul` | 여울 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `luna` | 루나 | 주인공 | 48px | idle(4), walk(6), attack(4), ult(8) |
| `slimey` | 말랑이 | 펫 | 32px | idle(4), walk(6) |
| `ppoyong` | 뽀용 | 펫 | 32px | idle(4), walk(6) |
| `boo` | 부우 | 펫 | 32px | idle(4), walk(6) |
| `hoot` | 부엉 | 펫 | 32px | idle(4), walk(6) |
| `twinkle` | 반짝이 | 펫 | 32px | idle(4), walk(6) |
| `oink` | 꿀꿀이 | 펫 | 32px | idle(4), walk(6) |
| `nyang` | 냥냥이 | 펫 | 32px | idle(4), walk(6) |

아이콘·바닥·장애물: `obs_tombstone`, `obs_coffin`, `obs_bonepile`, `obs_candelabra`, `obs_stalagmite`, `obs_web`, `obs_glowshroom`, `obs_icecrystal`, `obs_snowrock`, `obs_lavarock`, `obs_minecart`, `obs_vent`, `tile_2`, `tile_3`, `tile_4`, `tile_5`

## 3단계 — 6~10스테이지 + 마을 사람 + 나머지 스킬 아이콘

| 키 | 이름 | 종류 | 크기 | 동작 (프레임) |
|---|---|---|---|---|
| `grimoire` | 떠도는 마도서 | 몬스터 | 40px | walk(6), attack(4) |
| `candlewraith` | 촛불 망령 | 몬스터 | 40px | walk(6), attack(4) |
| `darkmage` | 어둠 마법사 | 몬스터 | 40px | walk(6), attack(4) |
| `gargoyle` | 가고일 | 몬스터 | 40px | walk(6), attack(4) |
| `lich` | 리치 모르테 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `orc` | 오크 전사 | 몬스터 | 40px | walk(6), attack(4) |
| `warwolf` | 전투 늑대 | 몬스터 | 40px | walk(6), attack(4) |
| `mimic` | 미믹 | 몬스터 | 40px | walk(6), attack(4) |
| `shaman` | 오크 주술사 | 몬스터 | 40px | walk(6), attack(4) |
| `orcwarlord` | 오크 대족장 고르크 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `merfolk` | 어인 병사 | 몬스터 | 40px | walk(6), attack(4) |
| `jellyfish` | 찌릿 해파리 | 몬스터 | 40px | walk(6), attack(4) |
| `seaserpent` | 바다뱀 | 몬스터 | 40px | walk(6), attack(4) |
| `crabknight` | 게 기사 | 몬스터 | 40px | walk(6), attack(4) |
| `kraken` | 크라켄 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `crystalgolem` | 수정 골렘 | 몬스터 | 40px | walk(6), attack(4) |
| `livingarmor` | 살아있는 갑옷 | 몬스터 | 40px | walk(6), attack(4) |
| `lightwisp` | 빛의 정령 | 몬스터 | 40px | walk(6), attack(4) |
| `manaeye` | 마나의 눈 | 몬스터 | 40px | walk(6), attack(4) |
| `ancientgolem` | 고대 수호자 아스트라 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `nightslime` | 그림자 슬라임 | 몬스터 | 40px | walk(6), attack(4) |
| `demonbat` | 악마 박쥐 | 몬스터 | 40px | walk(6), attack(4) |
| `deathknight` | 데스나이트 | 몬스터 | 40px | walk(6), attack(4) |
| `nightmareeye` | 악몽의 눈 | 몬스터 | 40px | walk(6), attack(4) |
| `nightmare` | 악몽왕 | 보스 | 112px | idle(4), attack(4), cast(6) |
| `grandma` | 솜솜 할머니 | 마을 사람 | 48px | idle(4) |
| `lumi` | 루미 | 마을 사람 | 48px | idle(4) |

아이콘·바닥·장애물: `icon_skill_meteor`, `icon_skill_frost`, `icon_skill_thunder`, `icon_skill_shield`, `icon_skill_beam`, `icon_skill_clone`, `obs_bookshelf`, `obs_crystal`, `obs_barricade`, `obs_brazier`, `obs_coral`, `obs_statue`, `obs_shell`, `obs_pillar`, `obs_shadowcrystal`, `obs_darkpillar`, `tile_6`, `tile_7`, `tile_8`, `tile_9`, `tile_10`

## 4단계 (선택) — 세부 동작

피격(hurt)·기절(die) 등: 142개 동작. 없으면 게임이 코드 그림의 흔들림·하얀 번쩍임으로 대신해요.

## 캐릭터 디자인 (프롬프트 앞부분)

| 키 | 이름 | 생김새 |
|---|---|---|
| `hero` | 모찌 | a small white kitten adventurer with pink inner ears, a red scarf and a long white tail, empty paws (holding nothing) |
| `mungchi` | 뭉치 | a knitted sky-blue yarn teddy bear doll with stitched mouth, button eyes and a yellow headband, empty paws |
| `bopul` | 보풀 | a knitted pink yarn bunny doll with long ears, button eyes and a mint bow, empty paws |
| `poksin` | 폭신 | a fluffy knitted white yarn sheep doll with a cream face and button eyes, empty paws |
| `chick` | 삐약이 | a tiny yellow chick still wearing half of its eggshell on its head |
| `slime` | 초록 슬라임 | a translucent green jelly slime with a cute face |
| `goblin` | 고블린 | a small round green goblin with long pointy ears, a big nose and a rusty dagger |
| `bat` | 동굴 박쥐 | a round purple cave bat with pointy ears, tiny fangs and leathery wings |
| `goblinthrower` | 고블린 투석꾼 | a small green goblin with long pointy ears, a red bandana and a big nose, holding a rock |
| `goblinchief` | 고블린 대장 그롬 | a big chubby green goblin chief with a horned iron helmet, tusks, a big nose and a spiked wooden club |
| `skeleton` | 해골 병사 | a cute round little skeleton soldier with hollow eye sockets glowing cyan, a toothy grin, visible ribs and a bone sword |
| `skelarcher` | 해골 궁수 | a cute round little skeleton archer in a purple hood with glowing yellow eyes and a wooden bow |
| `ghost` | 떠도는 유령 | a pale blue translucent ghost with sleepy eyes and a wispy tail |
| `skeldog` | 해골 개 | a cute skeleton dog with pointy ears, glowing orange eye sockets and a toothy grin |
| `skeletonking` | 해골 왕 본즈 | a big round skeleton king with a golden crown, a purple cape, glowing cyan eye sockets and a bone greatsword |
| `spider` | 동굴 거미 | a round dark brown cave spider with eight legs and six glowing red eyes |
| `toadstool` | 독버섯 | a chubby cream mushroom creature with a big purple spotted poison cap |
| `worm` | 동굴 지렁이 | a pink cave worm popping out of the ground with tiny fangs |
| `poisonslime` | 독 슬라임 | a translucent toxic green slime with darker green spots |
| `spiderqueen` | 거미 여왕 아라냐 | a large dark purple spider queen with eight legs, six glowing pink eyes, spotted patterns and a small crown |
| `frostbat` | 서리 박쥐 | a round icy blue bat with frosty wings and tiny fangs |
| `icewisp` | 얼음 정령 | a floating ice-blue star-shaped frost spirit with a happy face |
| `frostwolf` | 서리 늑대 | a round white frost wolf pup with pointy ears, a fluffy tail and fangs |
| `icegolem` | 얼음 골렘 | a chunky ice golem made of pale blue blocks with crystals on its head and glowing white eyes |
| `frostgiant` | 서리 거인 요툰 | a huge fluffy white frost giant with an ice-blue belly, curved horns and a frosty crown |
| `imp` | 불꽃 임프 | a small red fire imp with tiny horns, a pointed tail and a flame on its head |
| `lavaslime` | 용암 슬라임 | a translucent red magma slime with glowing lava cracks |
| `firebat` | 화염 박쥐 | a plum-colored volcano bat with glowing amber eyes |
| `kobold` | 코볼트 광부 | a small brown dog-like kobold miner with a yellow mining helmet and lamp, holding a pickaxe |
| `reddragon` | 화염룡 이그니스 | a chubby red dragon with a yellow belly, small horns, big wings and a dragon tail |
| `grimoire` | 떠도는 마도서 | a purple flying spellbook with fluttering pages and an angry face on the cover |
| `candlewraith` | 촛불 망령 | a white wraith ghost with a lit candle on its head and sleepy eyes |
| `darkmage` | 어둠 마법사 | a small mage in a dark purple hood with glowing pink eyes, holding a staff with a violet orb |
| `gargoyle` | 가고일 | a grey stone gargoyle with small horns, bat wings and glowing orange eyes |
| `lich` | 리치 모르테 | a skeleton lich in a dark purple hood with a small crown, a long cape, glowing violet eye sockets and a staff |
| `orc` | 오크 전사 | a chunky green orc warrior with tusks, long pointy ears, a horned iron helmet and a battle axe |
| `warwolf` | 전투 늑대 | a grey war wolf with a red bandana, pointy ears, a bushy tail and fangs |
| `mimic` | 미믹 | a wooden treasure chest mimic with gold trims, a toothy grin and glowing yellow eyes |
| `shaman` | 오크 주술사 | a green orc shaman with tusks, long pointy ears, a brown hood and a staff with a green orb |
| `orcwarlord` | 오크 대족장 고르크 | a huge green orc warlord with tusks, a golden horned helmet and a giant battle axe |
| `merfolk` | 어인 병사 | a round blue fish-folk soldier with fins, scales and a golden trident |
| `jellyfish` | 찌릿 해파리 | a translucent pink jellyfish with a happy face and short tentacles |
| `seaserpent` | 바다뱀 | a green sea serpent with scales, fangs and a curling tail |
| `crabknight` | 게 기사 | a red crab knight with big claws and a steel helmet with a teal plume |
| `kraken` | 크라켄 | a big purple kraken with spotted tentacles, glowing yellow eyes and a small crown |
| `crystalgolem` | 수정 골렘 | a chunky lavender crystal golem made of stone blocks with crystals on its head and glowing white eyes |
| `livingarmor` | 살아있는 갑옷 | an empty suit of steel armor with a plumed helmet, glowing cyan eyes inside, a round shield and a sword |
| `lightwisp` | 빛의 정령 | a floating pale yellow star-shaped light spirit with a happy face |
| `manaeye` | 마나의 눈 | a floating round blue creature with one huge cyan eye and small wings |
| `ancientgolem` | 고대 수호자 아스트라 | a giant ancient crystal guardian golem of lavender stone with a crown and glowing golden crystals |
| `nightslime` | 그림자 슬라임 | a translucent dark violet shadow slime with small horns and glowing pink eyes |
| `demonbat` | 악마 박쥐 | a dark navy demon bat with pink horns and glowing pink eyes |
| `deathknight` | 데스나이트 | a dark armored death knight with a horned helmet, a crimson cape, glowing pink eye sockets and a violet sword |
| `nightmareeye` | 악몽의 눈 | a dark round one-eyed creature with a big pink eye and bat wings |
| `nightmare` | 악몽왕 | a dark indigo star-shaped nightmare king with a golden crown, a crimson cape, glowing pink eyes and starry patterns |
| `gombang` | 곰방 | a sturdy brown bear blacksmith with a red bandana and a leather apron, empty paws |
| `toseul` | 토슬 | a white bunny baker with a tall chef hat, a pink apron and puffy oven mitts |
| `neogul` | 너굴 | a grey raccoon merchant rogue with a striped tail, a bandit mask pattern and a coin pouch, empty paws |
| `pengpeng` | 펭펭 | a little navy penguin priest with a white belly and a golden halo, empty flippers |
| `tobi` | 토비 | a light-blue apprentice mage bunny with a tall blue pointy wizard hat, empty paws |
| `daram` | 다람 | an orange squirrel clockmaker with brass goggles and a huge fluffy tail, empty paws |
| `yeoul` | 여울 | an orange fox archer with a white-tipped tail and a teal feather in its ear, empty paws |
| `luna` | 루나 | a lilac moon bunny shrine maiden with long ears and a crescent moon hairpin, empty paws |
| `slimey` | 말랑이 | a small sky-blue jelly blob pet with a happy face |
| `ppoyong` | 뽀용 | a baby pink dragon with tiny wings and a cream belly |
| `boo` | 부우 | a tiny lavender ghost pet with a sleepy smile |
| `hoot` | 부엉 | a small brown owlet with round glasses-like eye rings |
| `twinkle` | 반짝이 | a small smiling yellow star creature |
| `oink` | 꿀꿀이 | a chubby pink piglet with a coin-shaped snout |
| `nyang` | 냥냥이 | a small orange tabby kitten |
| `grandma` | 솜솜 할머니 | an old grey grandma cat with round glasses and a purple shawl |
| `lumi` | 루미 | a small cream-yellow dream star spirit with a gentle smile |
