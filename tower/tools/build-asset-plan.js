#!/usr/bin/env node
'use strict';
// AI 에셋 생성 계획 만들기
//   node tower/tools/build-asset-plan.js
// 게임 데이터(캐릭터·몬스터·보스·스킬·장애물)를 읽어서
//   - tower/assets/asset-plan.json : 생성 도구가 그대로 따라 할 수 있는 전체 목록(프롬프트·동작·크기·크레딧)
//   - docs/ASSET_PLAN.md           : 사람이 보는 단계별 체크리스트와 비용표
// 를 만듭니다. 프롬프트는 영어(이미지 모델이 가장 잘 알아들어요), 설명은 한국어.
//
// 그림체 방향: "귀여운 동물 + 도트 감성" (세피리아 같은 느낌).
// 단, 다른 게임의 캐릭터를 따라 그리지 않도록 프롬프트에는 게임 이름·캐릭터 이름을 넣지 않아요.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── 게임 데이터 읽기 ─────────────────────────────────────
global.window = global;
global.G = {};
global.document = { createElement: () => ({ getContext: () => ({}) }) };
global.location = { search: '' };
for (const f of ['js/core/util.js', 'js/data/stages.js', 'js/data/monsters.js', 'js/data/items.js', 'js/data/runes.js', 'js/data/skills.js', 'js/data/allies.js']) {
  eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); // eslint-disable-line no-eval
}

// ── 공통 그림체 ─────────────────────────────────────────
const STYLE = [
  'cute chibi animal character for a top-down action roguelite game',
  'pixel art, crisp clean pixels, limited soft pastel palette',
  '2-head-tall round body, big glossy eyes, rosy cheeks, tiny paws',
  'clean dark plum (#3b2a4d) outline, simple 2-3 tone shading, soft top-left light',
  '3/4 top-down view, facing right, full body, centered, small',
  'flat solid magenta (#FF00FF) background, no ground shadow, no text, no border',
].join(', ');
// 탄환·베기 궤적·폭발 같은 효과는 게임이 그려요. 동작 그림에는 몸 움직임만
const BODY_ONLY = 'body motion only, no projectiles, no slash trails, no magic effects, no particles';
const NEG = 'realistic, 3d render, blurry, gradient background, text, watermark, extra limbs, multiple characters, cropped';

// 이미지 모델 / 비용(크레딧). 2026-10 기준 Higgsfield 표시 가격
const MODELS = {
  chatgpt: { id: 'gpt_image_2_5', label: 'ChatGPT 이미지', credits: 0.25 },
  gemini: { id: 'nano_banana_pro', label: 'Gemini (나노바나나 프로)', credits: 2 },
  autosprite: { id: 'autosprite', label: 'AutoSprite (그림→동작)', credits: { turbo: 2, pro: 3 } },
};
const RETRY = 1.3; // 다시 뽑기 여유분

// ── 동작 정의 ───────────────────────────────────────────
// frames/fps 는 게임에서 재생할 값, kind 는 AutoSprite 의 동작 종류
const ANIM = {
  idle: { frames: 4, fps: 6, loop: true, kind: 'idle', text: 'idle breathing loop, gentle squash and stretch, one blink' },
  walk: { frames: 6, fps: 12, loop: true, kind: 'walk', text: 'bouncy walk cycle loop, little hopping steps' },
  attack: { frames: 4, fps: 16, kind: 'attack', text: 'quick attack: wind-up, strike, follow-through, recover' },
  hurt: { frames: 2, fps: 10, kind: 'custom', text: 'hit reaction: flinches backward, squinting eyes' },
  ult: { frames: 8, fps: 14, kind: 'custom', text: 'special move' },
  cast: { frames: 6, fps: 10, kind: 'custom', text: 'raises paws and charges glowing magic, then releases it' },
  die: { frames: 6, fps: 10, kind: 'custom', text: 'faints: wobbles, falls over, dizzy stars, lies flat' },
};

// 그룹별 기본 동작 묶음과 게임 속 그림 크기(프레임 높이, 픽셀)
const GROUP = {
  hero: { size: 48, anims: ['idle', 'walk', 'attack', 'hurt', 'ult', 'die'] },
  companion: { size: 48, anims: ['idle', 'walk', 'attack', 'ult', 'hurt', 'die'] },
  pet: { size: 32, anims: ['idle', 'walk', 'attack'] },
  monster: { size: 40, anims: ['walk', 'attack', 'hurt', 'die'] },
  boss: { size: 112, anims: ['idle', 'walk', 'attack', 'cast', 'hurt', 'die'] },
  npc: { size: 48, anims: ['idle'] },
};

// ── 캐릭터별 디자인 (영어 프롬프트) ─────────────────────
// look: 생김새, atk: 공격 동작, ult: 궁극기 동작
const D = {
  // 주인공
  // 주인공은 빈손으로 — 장착한 무기(검·창·망치·활·지팡이…)는 게임이 따로 그려요
  hero: { look: 'a small white kitten with pink inner ears, a red scarf and a long white tail, empty paws (holding nothing)', atk: 'leans back then lunges forward with a quick paw swing, empty-handed', ult: 'crouches, spins in a full circle and lands in a heroic pose, empty-handed' },
  // 펫
  chick: { look: 'a tiny yellow chick still wearing half of its eggshell on its head', atk: 'pecks forward twice' },
  slimey: { look: 'a small sky-blue jelly blob pet with a happy face', atk: 'bounces and squirts a healing droplet' },
  ppoyong: { look: 'a baby pink dragon with tiny wings and a cream belly', atk: 'puffs a little fireball' },
  boo: { look: 'a tiny lavender ghost pet with a sleepy smile', atk: 'waves its wispy arms spooking forward' },
  hoot: { look: 'a small brown owlet with round glasses-like eye rings', atk: 'flaps and shoots a feather' },
  twinkle: { look: 'a small smiling yellow star creature', atk: 'spins and glows brightly' },
  oink: { look: 'a chubby pink piglet with a coin-shaped snout', atk: 'sniffs the ground and headbutts' },
  nyang: { look: 'a small orange tabby kitten', atk: 'swipes with a quick paw punch' },
  // 동료
  mungchi: { look: 'a knitted blue yarn teddy bear doll with stitched mouth and a yellow headband, holding a round yarn shield', atk: 'bashes forward with the yarn shield', ult: 'plants the shield and a big blue yarn dome shimmers around it, then roars proudly' },
  bopul: { look: 'a knitted pink yarn bunny doll with long ears and a mint bow, holding a small bow', atk: 'draws the bow and shoots a yarn arrow', ult: 'rapidly fires many yarn arrows in a flurry' },
  poksin: { look: 'a fluffy knitted white yarn sheep doll with a cream face', atk: 'waves its paws sending a soft healing sparkle', ult: 'sings a lullaby with floating music notes and sleepy Zzz bubbles spreading out' },
  gombang: { look: 'a sturdy brown bear blacksmith with a red bandana and a leather apron, holding a big hammer', atk: 'smashes the hammer down', ult: 'leaps high and slams the hammer into the ground creating a shockwave' },
  toseul: { look: 'a white bunny baker with a tall chef hat and a pink apron', atk: 'tosses a small cupcake', ult: 'heaves a giant layered cake overhead and throws it' },
  neogul: { look: 'a grey raccoon merchant rogue with a striped tail, a coin pouch and twin small daggers', atk: 'dashes and slashes with daggers', ult: 'unleashes a rapid flurry of dagger slashes with gold coins flying' },
  pengpeng: { look: 'a little penguin priest with a golden halo and a small staff', atk: 'raises the staff releasing gentle light', ult: 'opens its flippers wide as a rainbow aurora pours down' },
  tobi: { look: 'a light-blue apprentice mage hamster with a blue pointy wizard hat and a wand', atk: 'waves the wand shooting a fireball', ult: 'raises the wand as several fire bursts explode around' },
  daram: { look: 'a squirrel clockmaker with brass goggles and a huge fluffy tail, carrying gears', atk: 'tosses a spinning gear', ult: 'quickly assembles a little clockwork turret with a wrench' },
  yeoul: { look: 'an orange fox archer with a white-tipped tail and a teal feather in its ear, holding a longbow', atk: 'draws the longbow and looses a glowing arrow', ult: 'aims upward and fires a volley of shining light arrows' },
  luna: { look: 'a lilac moon bunny shrine maiden with long ears and a crescent moon hairpin', atk: 'summons a small twinkling star', ult: 'lifts its paws to the sky calling down a shower of shooting stars' },
  // 1 새싹 정원
  slime: { look: 'a translucent mint-green jelly slime with little cat ears' },
  mushroom: { look: 'a chubby cream hamster wearing a big red spotted mushroom cap' },
  bee: { look: 'a round fuzzy yellow-and-plum striped bumblebee with tiny wings and antennae' },
  sprout: { look: 'a small brown mole with a green sprout growing on its head and a cream belly' },
  puddingking: { look: 'a giant wobbly caramel custard pudding cat with cat ears, dripping caramel and a tiny golden crown', boss: true },
  // 2 달콤 과자숲
  cookie: { look: 'a gingerbread cookie bear soldier with white icing details and button eyes' },
  macaron: { look: 'a round sky-blue macaron bat with cream filling and pink wings' },
  cottonghost: { look: 'a pink cotton-candy ghost bunny with long fluffy ears and rainbow sprinkles' },
  gummybear: { look: 'a translucent strawberry-red gummy bear' },
  cakegolem: { look: 'a big three-layer strawberry shortcake bear with frosting, sprinkles, a cherry and a lit candle on top', boss: true },
  // 3 모래시계 사막
  cactus: { look: 'a round potted-cactus creature with little needles and a pink flower bow' },
  scorpion: { look: 'a chubby sandy-orange baby scorpion with big claws and a curled tail' },
  mummycat: { look: 'a cream cat wrapped in mummy bandages with glowing green eyes' },
  dustspirit: { look: 'a floating sand-colored fennec fox spirit with huge ears and a wispy dust tail' },
  sphinx: { look: 'a golden sphinx cat wearing a blue-and-gold pharaoh headdress with glowing cyan eyes', boss: true },
  // 4 눈꽃 설원
  snowman: { look: 'a little snowman bear cub with a pink knit beanie and a carrot nose' },
  babypenguin: { look: 'a navy baby penguin with a white belly and a tiny orange beak' },
  icewisp: { look: 'a floating ice-blue star-shaped frost spirit with a happy face' },
  snowbunny: { look: 'a white snow bunny with light-blue inner ears' },
  yeti: { look: 'a huge fluffy white yeti with ice-blue belly, small curved horns and a frosty crown', boss: true },
  // 5 보글 화산
  fireimp: { look: 'a small orange fire imp fox with tiny horns, a flame on its head and a fox tail' },
  lavasnail: { look: 'a sleepy orange snail with a glowing red lava shell' },
  firebat: { look: 'a plum-colored volcano bat with glowing amber eyes' },
  magmaslime: { look: 'a translucent red magma jelly slime with cat ears and glowing lava cracks' },
  ignis: { look: 'a chubby baby red dragon with a yellow belly, small horns, big wings and a dragon tail', boss: true },
  // 6 유령 도서관
  flybook: { look: 'a purple flying spellbook with fluttering pages and a cute face on the cover' },
  candleghost: { look: 'a white ghost cat with a lit candle on its head and sleepy eyes' },
  inkslime: { look: 'a translucent indigo ink jelly slime with round mouse ears' },
  quillknight: { look: 'a white duck knight with a lavender helmet and a teal feather plume, holding a giant quill pen like a lance' },
  libra: { look: 'a lilac cat witch with round glasses, a tall dark-purple witch hat and a floating open book', boss: true },
  // 7 태엽 장난감 공장
  windupsoldier: { look: 'a grey wind-up toy mouse soldier with a red coat, a tall soldier hat and a brass wind-up key on its back' },
  jackbox: { look: 'a yellow jack-in-the-box with a blue bow and a grinning bunny popping out on a spring' },
  toytank: { look: 'a small green toy tank driven by a tiny hamster with a cannon' },
  robo: { look: 'a small silver robot cat with glowing cyan eyes' },
  teddymachine: { look: 'a giant brown patched teddy bear machine with stitches, button eyes and a big wind-up key on its back', boss: true },
  // 8 물방울 수족관
  jellyfish: { look: 'a translucent pink jellyfish with a happy face and short tentacles' },
  puffer: { look: 'a round yellow pufferfish with spikes' },
  angler: { look: 'a navy anglerfish with tiny fangs and a glowing lure' },
  crab: { look: 'a red crab general with big claws and a proud smile' },
  octoking: { look: 'a big pink octopus with spotted tentacles wearing a navy captain hat', boss: true },
  // 9 별빛 천문대
  shootingstar: { look: 'a yellow shooting star creature with a sparkling tail' },
  moonbunny: { look: 'a white moon rabbit with pink inner ears and a crescent moon hairpin, holding a rice-cake mallet' },
  nebula: { look: 'a floating violet nebula ghost cat dotted with tiny stars and glowing yellow eyes' },
  clockbird: { look: 'a golden cuckoo-clock bird with a clock face on its belly and little wings' },
  chronoowl: { look: 'a large dusky purple owl with a clock-face belly and a golden monocle', boss: true },
  // 10 꿈의 정점
  nightslime: { look: 'a translucent dark-violet nightmare jelly slime with small horns and glowing pink eyes' },
  nightbat: { look: 'a dark navy nightmare bat with glowing pink eyes' },
  shadowknight: { look: 'a shadowy purple wolf knight with fox-like ears, a dark helmet and a big bushy tail' },
  nightmareeye: { look: 'a dark round one-eyed creature with a big pink eye and bat wings' },
  nightmare: { look: 'a dark indigo star-shaped nightmare king with a golden crown, glowing pink eyes and starry patterns', boss: true },
  // 마을 사람들
  grandma: { look: 'an old grey grandma cat with round glasses and a purple shawl' },
  lumi: { look: 'a small cream-yellow dream star spirit with a gentle smile' },
};

// 몬스터 행동(ai)별 공격 동작 설명
const AI_ATK = {
  chase: 'lunges forward with a body slam', shooter: 'puffs up and spits a projectile', dasher: 'crouches low then dashes forward',
  jumper: 'crouches, jumps up and slams down', charger: 'lowers its head and charges', flyer: 'swoops forward',
  blinker: 'fades out and pops back in, tossing a candy', turret: 'shoots needles in all directions', burrower: 'bursts out of the sand',
  tank: 'stomps heavily', nova: 'glows and releases a pulsing ring', bomber: 'inflates, flashes and bursts', trailer: 'squirms forward leaving a trail',
  laser: 'charges and fires a beam from its eye', ambusher: 'springs out in surprise',
};

// ── 목록 만들기 ─────────────────────────────────────────
const entries = [];
function add(group, key, name, phase, extra) {
  const d = D[key];
  if (!d) throw new Error('디자인 설명이 없어요: ' + key);
  const g = GROUP[group];
  const anims = (extra && extra.anims) || g.anims;
  const ai = extra && extra.ai;
  const e = {
    key, name, group, phase, frameSize: g.size,
    base: {
      model: group === 'boss' ? 'gemini' : 'chatgpt',
      prompt: `${d.look}. ${STYLE}`,
      negative: NEG,
      reference: `tower/assets/refs/${key}.png`, // tools/export-refs.js 로 만든 코드 그림(모양·색 참고용)
      out: `tower/assets/src/${key}/base.png`,
    },
    anims: anims.map((st) => {
      const a = ANIM[st];
      let text = a.text;
      if (st === 'attack') text = `attack: ${d.atk || AI_ATK[ai] || 'lunges forward'}`;
      if (st === 'ult') text = `special move: ${d.ult || 'a big flashy special attack'}`;
      return {
        state: st, frames: a.frames, fps: a.fps, loop: !!a.loop,
        autosprite: { kind: a.kind, prompt: `${text}. ${BODY_ONLY}`, frame_count: a.frames, frame_size: 128, remove_bg: true, is_humanoid: false },
        sheetPrompt: `Sprite sheet of the SAME character as the reference image, ${a.frames} frames in ONE horizontal row, evenly spaced, identical size, feet on the same baseline: ${text}. ${BODY_ONLY}. ${STYLE}`,
        out: `tower/assets/src/${key}/${st}.png`,
      };
    }),
    portrait: `icon_${key}`, // 기본 그림에서 얼굴을 잘라 자동으로 만들어요 (추가 비용 없음)
  };
  entries.push(e);
}

// 1단계: 시작 팀 + 1스테이지 (먼저 맛보기)
add('hero', 'hero', '모찌', 1);
for (const k of G.STARTER_TEAM) add('companion', k, G.COMPANIONS[k].name, 1);
add('pet', 'chick', G.PETS.chick.name, 1);
// 스테이지 몬스터·보스
for (const s of G.STAGES) {
  const phase = s.id === 1 ? 1 : s.id <= 5 ? 2 : 3;
  for (const k of s.monsters) add('monster', k, G.MONSTERS[k].name, phase, { ai: G.MONSTERS[k].ai });
  add('boss', s.boss, G.BOSSES[s.boss].name, phase);
}
// 2단계: 나머지 동료·펫
for (const k of Object.keys(G.COMPANIONS)) if (!G.STARTER_TEAM.includes(k)) add('companion', k, G.COMPANIONS[k].name, 2);
for (const k of Object.keys(G.PETS)) if (k !== 'chick') add('pet', k, G.PETS[k].name, 2);
add('npc', 'grandma', G.CHARACTERS.grandma.name, 3);
add('npc', 'lumi', G.CHARACTERS.lumi.name, 3);

// 4단계(선택): 피격·기절 같은 세부 동작은 나중에. 1~3단계에서는 핵심 동작만 만들어요.
const CORE = { hero: ['idle', 'walk', 'attack', 'ult'], companion: ['idle', 'walk', 'attack', 'ult'], pet: ['idle', 'walk'], monster: ['walk', 'attack'], boss: ['idle', 'attack', 'cast'], npc: ['idle'] };
for (const e of entries) for (const a of e.anims) a.phase = CORE[e.group].includes(a.state) ? e.phase : 4;

// 아이콘·바닥·장애물·로고 (그림 한 장씩)
const ICON_STYLE = 'pixel art game icon, cute pastel colors, dark plum (#3b2a4d) outline, centered, flat solid magenta (#FF00FF) background, no text';
const icons = [];
const SKILL_TXT = {
  spin: 'a pink sword spinning in a circle with sparkles', heal: 'a glowing pink heart with a plus sign', meteor: 'a cute falling meteor with a fiery tail',
  frost: 'a sparkling blue snowflake crystal', thunder: 'a yellow lightning bolt with a cloud', shield: 'a round sky-blue bubble shield',
  beam: 'a bright rainbow light beam from a star', clone: 'two white kitten silhouettes side by side',
};
for (const k of Object.keys(G.ACTIVE_SKILLS)) icons.push({ key: `icon_skill_${k}`, name: G.ACTIVE_SKILLS[k].name, phase: k === 'spin' || k === 'heal' ? 1 : 3, model: 'chatgpt', size: 64, prompt: `${SKILL_TXT[k] || G.ACTIVE_SKILLS[k].name}, ${ICON_STYLE}`, out: `tower/assets/src/icons/skill_${k}.png` });
const OBS_TXT = {
  bush: 'a round green berry bush', rock: 'a smooth grey boulder', flower: 'a cluster of pastel flowers', lollipop: 'a giant swirl lollipop stuck in the ground',
  candycane: 'a giant candy cane', cupcake: 'a giant cupcake with frosting', cactus: 'a round desert cactus', sandrock: 'a sandy desert rock', pillar: 'a broken sandstone pillar',
  snowrock: 'a snow-capped rock', pine: 'a snowy pine tree', icecrystal: 'a cluster of blue ice crystals', lavarock: 'a dark rock with glowing lava cracks', vent: 'a small steaming volcanic vent',
  bookshelf: 'a tall wooden bookshelf with colorful books', candelabra: 'a golden candelabra with lit candles', crystal: 'a glowing purple crystal cluster', gear: 'a big brass gear half buried',
  crate: 'a wooden toy crate', blocks: 'stacked colorful toy blocks', coral: 'pink branching coral', shell: 'a big spiral seashell', telescope: 'a brass telescope on a tripod',
  shadowcrystal: 'a dark violet shadow crystal', darkpillar: 'a dark stone pillar with glowing runes',
};
const obsStage = {};
for (const s of G.STAGES) for (const o of s.obstacles) if (!obsStage[o]) obsStage[o] = s.id;
for (const o of Object.keys(obsStage)) icons.push({ key: `obs_${o}`, name: o, phase: obsStage[o] === 1 ? 1 : obsStage[o] <= 5 ? 2 : 3, model: 'chatgpt', size: 64, prompt: `${OBS_TXT[o] || o}, top-down 3/4 view game prop, ${ICON_STYLE}`, out: `tower/assets/src/obs/${o}.png` });
for (const s of G.STAGES) icons.push({ key: `tile_${s.id}`, name: `${s.name} 바닥`, phase: s.id === 1 ? 1 : s.id <= 5 ? 2 : 3, model: 'gemini', size: 64, prompt: `seamless tileable top-down floor texture for "${s.name}" (${['spring garden grass with tiny flowers', 'pink candy forest ground with sprinkles', 'warm desert sand with pebbles', 'soft snow field', 'dark volcanic rock with glowing cracks', 'old library wooden floor with scattered pages', 'toy factory checkered floor', 'aquarium sand with bubbles', 'starry observatory tiles', 'dreamy purple night clouds'][s.id - 1]}), pixel art, pastel, low contrast so characters stand out, no objects, no text`, out: `tower/assets/src/tiles/tile_${s.id}.png` });
icons.push({ key: 'ui_logo', name: '타이틀 로고', phase: 1, model: 'gemini', size: 512, prompt: 'game title logo reading "몽글타워" in chunky rounded Korean letters, pastel pink and cream with dark plum outline, a tiny white kitten peeking from the letters, a small tower and star, pixel art style, flat solid magenta (#FF00FF) background', out: 'tower/assets/src/ui/logo.png' });

// ── 비용 계산 ───────────────────────────────────────────
function cost(phaseFilter, tier) {
  let images = 0, anims = 0;
  for (const e of entries) {
    if (phaseFilter(e.phase)) images += MODELS[e.base.model].credits;
    for (const a of e.anims) if (phaseFilter(a.phase)) anims += tier === 'sheet' ? MODELS.chatgpt.credits : MODELS.autosprite.credits[tier];
  }
  for (const i of icons) if (phaseFilter(i.phase)) images += MODELS[i.model].credits;
  return { images: +(images * RETRY).toFixed(1), anims: +(anims * RETRY).toFixed(1), total: +((images + anims) * RETRY).toFixed(1) };
}
const PHASES = [1, 2, 3, 4];
const costs = {};
for (const tier of ['sheet', 'turbo', 'pro']) {
  costs[tier] = {};
  for (const p of PHASES) costs[tier][p] = cost((x) => x === p, tier);
  costs[tier].all = cost(() => true, tier);
}

const plan = {
  version: 1,
  direction: '귀여운 동물 + 도트 감성 (세피리아 같은 느낌, 특정 게임의 캐릭터는 따라 그리지 않음)',
  style: STYLE, negative: NEG, models: MODELS, retryFactor: RETRY,
  tiers: {
    sheet: 'ChatGPT 이미지로 동작 시트 한 장(가로 한 줄)을 그려요. 가장 싸고 빠르지만 프레임끼리 조금씩 달라질 수 있어요.',
    turbo: 'AutoSprite(빠름)로 기본 그림을 움직여요. 프레임이 매끄럽고 캐릭터가 안 바뀌어요.',
    pro: 'AutoSprite(고품질). 보스·주인공처럼 오래 보이는 캐릭터에 추천.',
  },
  phases: {
    1: '맛보기: 모찌 + 시작 동료 3 + 삐약이 + 1스테이지 몬스터 4 + 푸딩 임금님 + 바닥·장애물·스킬 아이콘 2·로고',
    2: '2~5스테이지 + 나머지 동료 8 + 펫 7',
    3: '6~10스테이지 + 마을 사람 + 나머지 스킬 아이콘',
    4: '(선택) 피격·기절 등 세부 동작 전부',
  },
  costs,
  characters: entries,
  icons,
};

fs.writeFileSync(path.join(ROOT, 'assets/asset-plan.json'), JSON.stringify(plan, null, 2) + '\n');

// ── 사람이 보는 문서 ────────────────────────────────────
const GROUP_KO = { hero: '주인공', companion: '동료', pet: '펫', monster: '몬스터', boss: '보스', npc: '마을 사람' };
const fmt = (c) => `${c.total} (그림 ${c.images} + 동작 ${c.anims})`;
let md = `# AI 에셋 생성 계획\n\n> 이 문서는 \`node tower/tools/build-asset-plan.js\` 로 자동 생성돼요. 직접 고치지 말고 스크립트를 고친 뒤 다시 실행하세요.\n> 생성 도구가 그대로 따라 하는 전체 목록(프롬프트 포함)은 \`tower/assets/asset-plan.json\` 에 있어요.\n\n`;
md += `## 그림체 방향\n\n**귀여운 동물 + 도트 감성** — 세피리아처럼 작은 동물 친구들이 탑을 오르는 느낌. 다른 게임의 캐릭터를 따라 그리지 않도록 프롬프트에는 게임·캐릭터 이름을 넣지 않아요.\n\n- 2등신 동글동글 몸, 큰 눈, 볼터치, 짙은 자주색(#3b2a4d) 외곽선, 파스텔 색\n- 위에서 비스듬히 내려다본 시점, 오른쪽을 바라봄 (왼쪽은 게임이 뒤집어요)\n- 배경은 마젠타(#FF00FF) 단색 → 가져오기 도구가 자동으로 지워요\n- 게임 안에서는 "도트 감성 화면"이 모든 그림을 같은 픽셀 크기로 맞춰 줘서, 여러 모델로 만든 그림도 한 세트처럼 보여요\n\n공통 프롬프트(영어):\n\n\`\`\`\n${STYLE}\n\`\`\`\n\n`;
md += `## 만드는 순서 (캐릭터 1명 기준)\n\n1. **참고 그림**: \`node tower/tools/export-refs.js\` → \`tower/assets/refs/<키>.png\` (지금 코드로 그린 모습. 모양·색을 맞추는 참고용)\n2. **기본 그림**: 참고 그림 + 프롬프트로 ChatGPT 이미지(보스는 Gemini) 생성 → \`tower/assets/src/<키>/base.png\`\n3. **동작**: 기본 그림으로 동작을 만들어요 → \`tower/assets/src/<키>/<동작>.png\` (시트 또는 AutoSprite 결과)\n4. **가져오기**: \`python3 tower/tools/import_sprites.py\` → 배경 제거·크기 맞춤·발 위치 정렬 후 \`tower/assets/sprites/\` 에 저장하고 \`manifest.auto.js\` 자동 등록\n5. **확인**: \`tower/tools/gallery.html\` (캐릭터 도감)에서 동작을 하나씩 재생해 봐요\n\n`;
md += `## 비용 (Higgsfield 크레딧, 다시 뽑기 여유 ×${RETRY} 포함)\n\n| 단계 | 내용 | 절약형 (동작=ChatGPT 시트) | 표준 (AutoSprite 빠름) | 고급 (AutoSprite 고품질) |\n|---|---|---|---|---|\n`;
for (const p of PHASES) md += `| ${p} | ${plan.phases[p]} | ${fmt(costs.sheet[p])} | ${fmt(costs.turbo[p])} | ${fmt(costs.pro[p])} |\n`;
md += `| **합계** | | **${costs.sheet.all.total}** | **${costs.turbo.all.total}** | **${costs.pro.all.total}** |\n\n`;
md += `가격: ChatGPT 이미지 ${MODELS.chatgpt.credits} / Gemini ${MODELS.gemini.credits} / AutoSprite 빠름 ${MODELS.autosprite.credits.turbo}, 고품질 ${MODELS.autosprite.credits.pro} 크레딧 (2026-10 확인한 값, 바뀔 수 있어요)\n\n`;
for (const p of [1, 2, 3]) {
  md += `## ${p}단계 — ${plan.phases[p]}\n\n| 키 | 이름 | 종류 | 크기 | 동작 (프레임) |\n|---|---|---|---|---|\n`;
  for (const e of entries.filter((x) => x.phase === p)) {
    const core = e.anims.filter((a) => a.phase === p).map((a) => `${a.state}(${a.frames})`).join(', ');
    md += `| \`${e.key}\` | ${e.name} | ${GROUP_KO[e.group]} | ${e.frameSize}px | ${core} |\n`;
  }
  const ic = icons.filter((i) => i.phase === p);
  if (ic.length) md += `\n아이콘·바닥·장애물: ${ic.map((i) => `\`${i.key}\``).join(', ')}\n`;
  md += '\n';
}
md += `## 4단계 (선택) — 세부 동작\n\n피격(hurt)·기절(die) 등: ${entries.reduce((n, e) => n + e.anims.filter((a) => a.phase === 4).length, 0)}개 동작. 없으면 게임이 코드 그림의 흔들림·하얀 번쩍임으로 대신해요.\n\n`;
md += `## 캐릭터 디자인 (프롬프트 앞부분)\n\n| 키 | 이름 | 생김새 |\n|---|---|---|\n`;
for (const e of entries) md += `| \`${e.key}\` | ${e.name} | ${D[e.key].look} |\n`;
fs.writeFileSync(path.join(ROOT, '../docs/ASSET_PLAN.md'), md);

console.log(`캐릭터 ${entries.length}명, 동작 ${entries.reduce((n, e) => n + e.anims.length, 0)}개, 아이콘 ${icons.length}개`);
for (const tier of ['sheet', 'turbo', 'pro']) console.log(tier, JSON.stringify(costs[tier]));
