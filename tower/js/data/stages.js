'use strict';
// 10층마다 바뀌는 스테이지. 각 스테이지는 잠든 마을 주민 한 명의 꿈입니다.
G.STAGES = [
  {
    id: 1, name: '새싹 정원', sub: '곰방의 꿈',
    ground: ['#c8eba6', '#bde39a'], wall: '#7fb069', deco: 'flower', tint: '#6cc56f',
    obstacles: ['bush', 'rock', 'flower'],
    monsters: ['slime', 'mushroom', 'bee', 'sprout'],
    boss: 'puddingking', villager: 'gombang',
  },
  {
    id: 2, name: '달콤 과자숲', sub: '토슬의 꿈',
    ground: ['#ffe0e9', '#ffd3df'], wall: '#f49cbb', deco: 'sprinkle', tint: '#ff8fab',
    obstacles: ['lollipop', 'candycane', 'cupcake'],
    monsters: ['cookie', 'macaron', 'cottonghost', 'gummybear'],
    boss: 'cakegolem', villager: 'toseul',
  },
  {
    id: 3, name: '모래시계 사막', sub: '너굴의 꿈',
    ground: ['#f7e3ad', '#f0d799'], wall: '#d9a85b', deco: 'pebble', tint: '#e0a458',
    obstacles: ['cactus', 'sandrock', 'pillar'],
    monsters: ['cactus', 'scorpion', 'mummycat', 'dustspirit'],
    boss: 'sphinx', villager: 'neogul',
  },
  {
    id: 4, name: '눈꽃 설원', sub: '펭펭의 꿈',
    ground: ['#eef7ff', '#e1f0fc'], wall: '#9cc9ea', deco: 'snow', tint: '#8fd3ff',
    obstacles: ['snowrock', 'pine', 'icecrystal'],
    monsters: ['snowman', 'babypenguin', 'icewisp', 'snowbunny'],
    boss: 'yeti', villager: 'pengpeng',
  },
  {
    id: 5, name: '보글 화산', sub: '뽀용의 꿈',
    ground: ['#ffc9a8', '#ffbd98'], wall: '#d9705a', deco: 'ember', tint: '#ff6b4a',
    obstacles: ['lavarock', 'vent', 'rock'],
    monsters: ['fireimp', 'lavasnail', 'firebat', 'magmaslime'],
    boss: 'ignis', villager: 'ppoyong',
  },
  {
    id: 6, name: '유령 도서관', sub: '토비의 꿈',
    ground: ['#e3d6ff', '#d8c9fb'], wall: '#9b84d6', deco: 'page', tint: '#b9a6ff',
    obstacles: ['bookshelf', 'candelabra', 'crystal'],
    monsters: ['flybook', 'candleghost', 'inkslime', 'quillknight'],
    boss: 'libra', villager: 'tobi',
  },
  {
    id: 7, name: '태엽 장난감 공장', sub: '다람의 꿈',
    ground: ['#d6eeea', '#c9e6e1'], wall: '#7fb7ae', deco: 'bolt', tint: '#f2c14e',
    obstacles: ['gear', 'crate', 'blocks'],
    monsters: ['windupsoldier', 'jackbox', 'toytank', 'robo'],
    boss: 'teddymachine', villager: 'daram',
  },
  {
    id: 8, name: '물방울 수족관', sub: '여울의 꿈',
    ground: ['#bfe6f7', '#b0def3'], wall: '#5fa8d3', deco: 'bubble', tint: '#ff8fa3',
    obstacles: ['coral', 'shell', 'rock'],
    monsters: ['jellyfish', 'puffer', 'angler', 'crab'],
    boss: 'octoking', villager: 'yeoul',
  },
  {
    id: 9, name: '별빛 천문대', sub: '솜솜 할머니의 꿈',
    ground: ['#5a64a8', '#535d9e'], wall: '#363f7a', deco: 'star', tint: '#ffe66d',
    obstacles: ['crystal', 'telescope', 'pillar'],
    monsters: ['shootingstar', 'moonbunny', 'nebula', 'clockbird'],
    boss: 'chronoowl', villager: 'luna',
  },
  {
    id: 10, name: '꿈의 정점', sub: '루미의 꿈',
    ground: ['#3d3358', '#372e50'], wall: '#251e3a', deco: 'dream', tint: '#c3a6ff',
    obstacles: ['shadowcrystal', 'darkpillar', 'shadowcrystal'],
    monsters: ['nightslime', 'nightbat', 'shadowknight', 'nightmareeye'],
    boss: 'nightmare', villager: null,
  },
];

// 층 → 스테이지 (100층 이후는 '끝없는 탑': 스테이지가 다시 돌아오며 계속 강해짐)
G.stageOf = (floor) => G.STAGES[Math.floor((floor - 1) / 10) % 10];
G.isBossFloor = (floor) => floor % 10 === 0;
G.isEndless = (floor) => floor > 100;
