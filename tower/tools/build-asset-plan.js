#!/usr/bin/env node
'use strict';
// AI 에셋 생성 계획 만들기
//   node tower/tools/build-asset-plan.js
// 게임 데이터(캐릭터·몬스터·보스·스킬·장애물)를 읽어서
//   - tower/assets/asset-plan.json : 생성 도구가 그대로 따라 할 수 있는 전체 목록(프롬프트·동작·크기·크레딧)
//   - docs/ASSET_PLAN.md           : 사람이 보는 단계별 체크리스트와 비용표
// 를 만듭니다. 프롬프트는 영어(이미지 모델이 가장 잘 알아들어요), 설명은 한국어.
//
// 그림체 방향: "귀여운 동물 주인공 + 판타지 던전 몬스터 + 도트 감성" (세피리아 같은 느낌).
// 단, 다른 게임의 캐릭터를 따라 그리지 않도록 프롬프트에는 게임 이름·캐릭터 이름을 넣지 않아요.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── 게임 데이터 읽기 ─────────────────────────────────────
global.window = global;
global.G = {};
global.document = { createElement: () => ({ getContext: () => ({}) }) };
global.location = { search: '' };
for (const f of ['js/core/util.js', 'js/data/stages.js', 'js/data/monsters.js', 'js/data/items.js', 'js/data/runes.js', 'js/data/skills.js', 'js/data/artifacts.js', 'js/data/allies.js']) {
  eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); // eslint-disable-line no-eval
}

// ── 공통 그림체 ─────────────────────────────────────────
const STYLE = [
  'cute chibi fantasy character for a top-down dungeon action roguelite game',
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
  // 주인공들은 빈손으로 — 장착한 무기(검·대검·창·채찍·도끼…)는 게임이 휘두르는 모습까지 따로 그려요
  hero: { look: 'a small white kitten adventurer with pink inner ears, a red scarf and a long white tail, empty paws (holding nothing)', atk: 'leans into a big forward swing, empty-handed', ult: 'crouches, spins in a full circle and lands in a heroic pose, empty-handed' },
  mungchi: { look: 'a knitted sky-blue yarn teddy bear doll with stitched mouth, button eyes and a yellow headband, empty paws', atk: 'heaves a heavy two-handed overhead swing, empty-handed', ult: 'braces and a big blue yarn dome shimmers around it' },
  bopul: { look: 'a knitted pink yarn bunny doll with long ears, button eyes and a mint bow, empty paws', atk: 'lunges forward with a long two-handed thrust, empty-handed', ult: 'throws many little knitting needles in a flurry' },
  poksin: { look: 'a fluffy knitted white yarn sheep doll with a cream face and button eyes, empty paws', atk: 'flicks a long whip motion with one paw, empty-handed', ult: 'sings a lullaby with floating music notes and sleepy Zzz bubbles' },
  gombang: { look: 'a sturdy brown bear blacksmith with a red bandana and a leather apron, empty paws', atk: 'chops forward with a heavy swing, empty-handed', ult: 'leaps high and slams down creating a shockwave' },
  toseul: { look: 'a white bunny baker with a tall chef hat, a pink apron and puffy oven mitts', atk: 'throws a rapid one-two punch combo', ult: 'heaves a giant layered cake overhead and throws it' },
  neogul: { look: 'a grey raccoon merchant rogue with a striped tail, a bandit mask pattern and a coin pouch, empty paws', atk: 'darts forward with quick stabbing motions, empty-handed', ult: 'unleashes a blur of quick strikes with gold coins flying' },
  pengpeng: { look: 'a little navy penguin priest with a white belly and a golden halo, empty flippers', atk: 'raises both flippers and smashes down, empty-handed', ult: 'opens its flippers wide as a rainbow aurora pours down' },
  tobi: { look: 'a light-blue apprentice mage bunny with a tall blue pointy wizard hat, empty paws', atk: 'thrusts a paw forward casting a spell, empty-handed', ult: 'raises both paws as fire bursts explode around' },
  daram: { look: 'an orange squirrel clockmaker with brass goggles and a huge fluffy tail, empty paws', atk: 'fences forward with a precise lunge, empty-handed', ult: 'quickly assembles a little clockwork turret' },
  yeoul: { look: 'an orange fox archer with a white-tipped tail and a teal feather in its ear, empty paws', atk: 'pulls back as if drawing a bow and releases, empty-handed', ult: 'aims upward and releases a volley of shining light' },
  luna: { look: 'a lilac moon bunny shrine maiden with long ears and a crescent moon hairpin, empty paws', atk: 'sweeps a wide reaping motion, empty-handed', ult: 'lifts its paws to the sky calling down shooting stars' },
  // 펫
  chick: { look: 'a tiny yellow chick still wearing half of its eggshell on its head', atk: 'pecks forward twice' },
  slimey: { look: 'a small sky-blue jelly blob pet with a happy face', atk: 'bounces and squirts a healing droplet' },
  ppoyong: { look: 'a baby pink dragon with tiny wings and a cream belly', atk: 'puffs a little fireball' },
  boo: { look: 'a tiny lavender ghost pet with a sleepy smile', atk: 'waves its wispy arms spooking forward' },
  hoot: { look: 'a small brown owlet with round glasses-like eye rings', atk: 'flaps and shoots a feather' },
  twinkle: { look: 'a small smiling yellow star creature', atk: 'spins and glows brightly' },
  oink: { look: 'a chubby pink piglet with a coin-shaped snout', atk: 'sniffs the ground and headbutts' },
  nyang: { look: 'a small orange tabby kitten', atk: 'swipes with a quick paw punch' },
  // 1 이끼 낀 지하감옥
  slime: { look: 'a translucent green jelly slime with a cute face' },
  goblin: { look: 'a small round green goblin with long pointy ears, a big nose and a rusty dagger' },
  bat: { look: 'a round purple cave bat with pointy ears, tiny fangs and leathery wings' },
  goblinthrower: { look: 'a small green goblin with long pointy ears, a red bandana and a big nose, holding a rock' },
  goblinchief: { look: 'a big chubby green goblin chief with a horned iron helmet, tusks, a big nose and a spiked wooden club', boss: true },
  // 2 해골 납골당
  skeleton: { look: 'a cute round little skeleton soldier with hollow eye sockets glowing cyan, a toothy grin, visible ribs and a bone sword' },
  skelarcher: { look: 'a cute round little skeleton archer in a purple hood with glowing yellow eyes and a wooden bow' },
  ghost: { look: 'a pale blue translucent ghost with sleepy eyes and a wispy tail' },
  skeldog: { look: 'a cute skeleton dog with pointy ears, glowing orange eye sockets and a toothy grin' },
  skeletonking: { look: 'a big round skeleton king with a golden crown, a purple cape, glowing cyan eye sockets and a bone greatsword', boss: true },
  // 3 거미 동굴
  spider: { look: 'a round dark brown cave spider with eight legs and six glowing red eyes' },
  toadstool: { look: 'a chubby cream mushroom creature with a big purple spotted poison cap' },
  worm: { look: 'a pink cave worm popping out of the ground with tiny fangs' },
  poisonslime: { look: 'a translucent toxic green slime with darker green spots' },
  spiderqueen: { look: 'a large dark purple spider queen with eight legs, six glowing pink eyes, spotted patterns and a small crown', boss: true },
  // 4 서리 동굴
  frostbat: { look: 'a round icy blue bat with frosty wings and tiny fangs' },
  icewisp: { look: 'a floating ice-blue star-shaped frost spirit with a happy face' },
  frostwolf: { look: 'a round white frost wolf pup with pointy ears, a fluffy tail and fangs' },
  icegolem: { look: 'a chunky ice golem made of pale blue blocks with crystals on its head and glowing white eyes' },
  frostgiant: { look: 'a huge fluffy white frost giant with an ice-blue belly, curved horns and a frosty crown', boss: true },
  // 5 용암 갱도
  imp: { look: 'a small red fire imp with tiny horns, a pointed tail and a flame on its head' },
  lavaslime: { look: 'a translucent red magma slime with glowing lava cracks' },
  firebat: { look: 'a plum-colored volcano bat with glowing amber eyes' },
  kobold: { look: 'a small brown dog-like kobold miner with a yellow mining helmet and lamp, holding a pickaxe' },
  reddragon: { look: 'a chubby red dragon with a yellow belly, small horns, big wings and a dragon tail', boss: true },
  // 6 저주받은 서고
  grimoire: { look: 'a purple flying spellbook with fluttering pages and an angry face on the cover' },
  candlewraith: { look: 'a white wraith ghost with a lit candle on its head and sleepy eyes' },
  darkmage: { look: 'a small mage in a dark purple hood with glowing pink eyes, holding a staff with a violet orb' },
  gargoyle: { look: 'a grey stone gargoyle with small horns, bat wings and glowing orange eyes' },
  lich: { look: 'a skeleton lich in a dark purple hood with a small crown, a long cape, glowing violet eye sockets and a staff', boss: true },
  // 7 오크 요새
  orc: { look: 'a chunky green orc warrior with tusks, long pointy ears, a horned iron helmet and a battle axe' },
  warwolf: { look: 'a grey war wolf with a red bandana, pointy ears, a bushy tail and fangs' },
  mimic: { look: 'a wooden treasure chest mimic with gold trims, a toothy grin and glowing yellow eyes' },
  shaman: { look: 'a green orc shaman with tusks, long pointy ears, a brown hood and a staff with a green orb' },
  orcwarlord: { look: 'a huge green orc warlord with tusks, a golden horned helmet and a giant battle axe', boss: true },
  // 8 가라앉은 신전
  merfolk: { look: 'a round blue fish-folk soldier with fins, scales and a golden trident' },
  jellyfish: { look: 'a translucent pink jellyfish with a happy face and short tentacles' },
  seaserpent: { look: 'a green sea serpent with scales, fangs and a curling tail' },
  crabknight: { look: 'a red crab knight with big claws and a steel helmet with a teal plume' },
  kraken: { look: 'a big purple kraken with spotted tentacles, glowing yellow eyes and a small crown', boss: true },
  // 9 수정 첨탑
  crystalgolem: { look: 'a chunky lavender crystal golem made of stone blocks with crystals on its head and glowing white eyes' },
  livingarmor: { look: 'an empty suit of steel armor with a plumed helmet, glowing cyan eyes inside, a round shield and a sword' },
  lightwisp: { look: 'a floating pale yellow star-shaped light spirit with a happy face' },
  manaeye: { look: 'a floating round blue creature with one huge cyan eye and small wings' },
  ancientgolem: { look: 'a giant ancient crystal guardian golem of lavender stone with a crown and glowing golden crystals', boss: true },
  // 10 악몽의 왕좌
  nightslime: { look: 'a translucent dark violet shadow slime with small horns and glowing pink eyes' },
  demonbat: { look: 'a dark navy demon bat with pink horns and glowing pink eyes' },
  deathknight: { look: 'a dark armored death knight with a horned helmet, a crimson cape, glowing pink eye sockets and a violet sword' },
  nightmareeye: { look: 'a dark round one-eyed creature with a big pink eye and bat wings' },
  nightmare: { look: 'a dark indigo star-shaped nightmare king with a golden crown, a crimson cape, glowing pink eyes and starry patterns', boss: true },
  // 마을 사람들
  grandma: { look: 'an old grey grandma cat with round glasses and a purple shawl' },
  lumi: { look: 'a small cream-yellow dream star spirit with a gentle smile' },
};

// 몬스터 행동(ai)별 공격 동작 설명
const AI_ATK = {
  chase: 'lunges forward with a body slam', shooter: 'puffs up and spits a projectile', dasher: 'crouches low then dashes forward',
  jumper: 'crouches, jumps up and slams down', charger: 'lowers its head and charges', flyer: 'swoops forward',
  blinker: 'fades out and pops back in, tossing a wisp', turret: 'shoots spores in all directions', burrower: 'bursts out of the ground',
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

// 1단계: 처음 고를 수 있는 주인공 4명 + 1스테이지 (먼저 맛보기)
add('hero', 'hero', '모찌', 1);
for (const k of G.STARTER_HEROES) if (k !== 'mochi') add('companion', k, G.HEROES[k].name, 1);
add('pet', 'chick', G.PETS.chick.name, 1);
// 스테이지 몬스터·보스
for (const s of G.STAGES) {
  const phase = s.id === 1 ? 1 : s.id <= 5 ? 2 : 3;
  for (const k of s.monsters) add('monster', k, G.MONSTERS[k].name, phase, { ai: G.MONSTERS[k].ai });
  add('boss', s.boss, G.BOSSES[s.boss].name, phase);
}
// 2단계: 나머지 주인공·펫
for (const k of Object.keys(G.HEROES)) if (!G.STARTER_HEROES.includes(k)) add('companion', k, G.HEROES[k].name, 2);
for (const k of Object.keys(G.PETS)) if (k !== 'chick') add('pet', k, G.PETS[k].name, 2);
add('npc', 'grandma', G.CHARACTERS.grandma.name, 3);
add('npc', 'lumi', G.CHARACTERS.lumi.name, 3);

// 4단계(선택): 피격·기절 같은 세부 동작은 나중에. 1~3단계에서는 핵심 동작만 만들어요.
const CORE = { hero: ['idle', 'walk', 'attack', 'ult'], companion: ['idle', 'walk', 'attack', 'ult'], pet: ['idle', 'walk'], monster: ['walk', 'attack'], boss: ['idle', 'attack', 'cast'], npc: ['idle'] };
for (const e of entries) for (const a of e.anims) a.phase = CORE[e.group].includes(a.state) ? e.phase : 4;

// 아이콘·바닥·장애물·로고 (그림 한 장씩)
const ICON_STYLE = 'pixel art fantasy game icon, cute colors, dark plum (#3b2a4d) outline, centered, flat solid magenta (#FF00FF) background, no text';
const icons = [];
const SKILL_TXT = {
  spin: 'a pink sword spinning in a circle with sparkles', heal: 'a glowing pink heart with a plus sign', meteor: 'a cute falling meteor with a fiery tail',
  frost: 'a sparkling blue snowflake crystal', thunder: 'a yellow lightning bolt with a cloud', shield: 'a round sky-blue bubble shield',
  beam: 'a bright rainbow light beam from a star', clone: 'two white kitten silhouettes side by side',
};
for (const k of Object.keys(G.ACTIVE_SKILLS)) icons.push({ key: `icon_skill_${k}`, name: G.ACTIVE_SKILLS[k].name, phase: k === 'spin' || k === 'heal' ? 1 : 3, model: 'chatgpt', size: 64, prompt: `${SKILL_TXT[k] || G.ACTIVE_SKILLS[k].name}, ${ICON_STYLE}`, out: `tower/assets/src/icons/skill_${k}.png` });
const OBS_TXT = {
  barrel: 'a wooden barrel with iron bands', crate: 'a wooden dungeon crate', rock: 'a mossy grey boulder', brokenpillar: 'a broken stone pillar with moss',
  tombstone: 'a cracked grey tombstone with a cross', coffin: 'a dark wooden coffin with a golden cross', bonepile: 'a little pile of bones with a skull', candelabra: 'a golden candelabra with lit candles',
  stalagmite: 'a cluster of brown cave stalagmites', web: 'a big spider web with a little spider', glowshroom: 'a cluster of glowing teal mushrooms',
  icecrystal: 'a cluster of blue ice crystals', snowrock: 'a snow-capped rock', lavarock: 'a dark rock with glowing lava cracks', minecart: 'a mine cart full of ore',
  vent: 'a small steaming lava vent', bookshelf: 'a tall wooden bookshelf with colorful books', crystal: 'a glowing purple crystal cluster',
  barricade: 'a spiked wooden barricade', brazier: 'an iron brazier with a burning fire', coral: 'pink branching coral', statue: 'a small stone gargoyle statue',
  shell: 'a big spiral seashell', pillar: 'a tall marble pillar', shadowcrystal: 'a dark violet shadow crystal', darkpillar: 'a dark stone pillar with glowing runes',
};
const obsStage = {};
for (const s of G.STAGES) for (const o of s.obstacles) if (!obsStage[o]) obsStage[o] = s.id;
for (const o of Object.keys(obsStage)) icons.push({ key: `obs_${o}`, name: o, phase: obsStage[o] === 1 ? 1 : obsStage[o] <= 5 ? 2 : 3, model: 'chatgpt', size: 64, prompt: `${OBS_TXT[o] || o}, top-down 3/4 view game prop, ${ICON_STYLE}`, out: `tower/assets/src/obs/${o}.png` });
for (const s of G.STAGES) icons.push({ key: `tile_${s.id}`, name: `${s.name} 바닥`, phase: s.id === 1 ? 1 : s.id <= 5 ? 2 : 3, model: 'gemini', size: 64, prompt: `seamless tileable top-down floor texture for "${s.name}" (${['mossy grey-green dungeon flagstones', 'purple-grey crypt flagstones with tiny bones', 'brown cave dirt with pebbles and webs', 'icy blue cave floor with frost', 'dark mine rock with glowing lava cracks', 'dark purple library wooden planks with scattered pages', 'wooden fortress planks with straw', 'teal sunken temple flagstones with puddles', 'lavender crystal tiles with shards', 'dark violet obsidian tiles with pink stars'][s.id - 1]}), pixel art, muted, low contrast so characters stand out, no objects, no text`, out: `tower/assets/src/tiles/tile_${s.id}.png` });
icons.push({ key: 'ui_logo', name: '타이틀 로고', phase: 1, model: 'gemini', size: 512, prompt: 'game title logo reading "몽글타워" in chunky rounded Korean letters, pastel pink and cream with dark plum outline, a tiny white kitten with a sword peeking from the letters, a dark dungeon tower and star, pixel art style, flat solid magenta (#FF00FF) background', out: 'tower/assets/src/ui/logo.png' });

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
  direction: '귀여운 동물 주인공 + 판타지 던전 몬스터 + 도트 감성 (세피리아 같은 느낌, 특정 게임의 캐릭터는 따라 그리지 않음)',
  style: STYLE, negative: NEG, models: MODELS, retryFactor: RETRY,
  tiers: {
    sheet: 'ChatGPT 이미지로 동작 시트 한 장(가로 한 줄)을 그려요. 가장 싸고 빠르지만 프레임끼리 조금씩 달라질 수 있어요.',
    turbo: 'AutoSprite(빠름)로 기본 그림을 움직여요. 프레임이 매끄럽고 캐릭터가 안 바뀌어요.',
    pro: 'AutoSprite(고품질). 보스·주인공처럼 오래 보이는 캐릭터에 추천.',
  },
  phases: {
    1: '맛보기: 모찌 + 처음 고르는 주인공 3 + 삐약이 + 1스테이지 몬스터 4 + 고블린 대장 + 바닥·장애물·스킬 아이콘 2·로고',
    2: '2~5스테이지 + 나머지 주인공 8 + 펫 7',
    3: '6~10스테이지 + 마을 사람 + 나머지 스킬 아이콘',
    4: '(선택) 피격·기절 등 세부 동작 전부',
  },
  costs,
  characters: entries,
  icons,
};

fs.writeFileSync(path.join(ROOT, 'assets/asset-plan.json'), JSON.stringify(plan, null, 2) + '\n');

// ── 사람이 보는 문서 ────────────────────────────────────
const GROUP_KO = { hero: '주인공', companion: '주인공', pet: '펫', monster: '몬스터', boss: '보스', npc: '마을 사람' };
const fmt = (c) => `${c.total} (그림 ${c.images} + 동작 ${c.anims})`;
let md = `# AI 에셋 생성 계획\n\n> 이 문서는 \`node tower/tools/build-asset-plan.js\` 로 자동 생성돼요. 직접 고치지 말고 스크립트를 고친 뒤 다시 실행하세요.\n> 생성 도구가 그대로 따라 하는 전체 목록(프롬프트 포함)은 \`tower/assets/asset-plan.json\` 에 있어요.\n\n`;
md += `## 그림체 방향\n\n**귀여운 동물 주인공 + 판타지 던전 몬스터 + 도트 감성** — 세피리아처럼 작은 동물 친구들이 무기를 휘두르며 던전 탑을 오르는 느낌. 다른 게임의 캐릭터를 따라 그리지 않도록 프롬프트에는 게임·캐릭터 이름을 넣지 않아요.\n\n- 2등신 동글동글 몸, 큰 눈, 짙은 자주색(#3b2a4d) 외곽선. 주인공은 빈손(무기는 게임이 그림), 몬스터는 해골·고블린·박쥐처럼 판타지풍\n- 위에서 비스듬히 내려다본 시점, 오른쪽을 바라봄 (왼쪽은 게임이 뒤집어요)\n- 배경은 마젠타(#FF00FF) 단색 → 가져오기 도구가 자동으로 지워요\n- 게임 안에서는 "도트 감성 화면"이 모든 그림을 같은 픽셀 크기로 맞춰 줘서, 여러 모델로 만든 그림도 한 세트처럼 보여요\n\n공통 프롬프트(영어):\n\n\`\`\`\n${STYLE}\n\`\`\`\n\n`;
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
