'use strict';
// 10층마다 바뀌는 던전. 탑의 각 구역은 악몽에 물들어 던전이 되어 버린 마을 주민의 꿈이에요.
// floor: 바닥 무늬(stone 돌바닥 · planks 나무 · cave 동굴) / ground: 바닥 색 2가지 / wall: 벽 색
// light: 횃불 빛 색 / deco: 바닥 장식 / dark: 어둠의 짙기(0~1)
G.STAGES = [
  {
    id: 1, name: '이끼 낀 지하감옥', sub: '곰방의 꿈',
    floor: 'stone', ground: ['#5f6d5c', '#57655a'], wall: '#3d4a40', light: '#ffcf7a', deco: 'moss', tint: '#8fbf6a', dark: 0.35,
    obstacles: ['barrel', 'crate', 'rock', 'brokenpillar'],
    monsters: ['slime', 'goblin', 'bat', 'goblinthrower'],
    boss: 'goblinchief', villager: 'gombang',
  },
  {
    id: 2, name: '해골 납골당', sub: '토슬의 꿈',
    floor: 'stone', ground: ['#5e596c', '#575265'], wall: '#36314a', light: '#9fe8ff', deco: 'bones', tint: '#b9d8ff', dark: 0.45,
    obstacles: ['tombstone', 'coffin', 'bonepile', 'candelabra'],
    monsters: ['skeleton', 'skelarcher', 'ghost', 'skeldog'],
    boss: 'skeletonking', villager: 'toseul',
  },
  {
    id: 3, name: '거미 동굴', sub: '너굴의 꿈',
    floor: 'cave', ground: ['#6a5545', '#62503f'], wall: '#3f3128', light: '#c8ff9a', deco: 'web', tint: '#a8d47a', dark: 0.5,
    obstacles: ['stalagmite', 'web', 'glowshroom', 'rock'],
    monsters: ['spider', 'toadstool', 'worm', 'poisonslime'],
    boss: 'spiderqueen', villager: 'neogul',
  },
  {
    id: 4, name: '서리 동굴', sub: '펭펭의 꿈',
    floor: 'cave', ground: ['#8db2c9', '#85aac2'], wall: '#4f7896', light: '#dff6ff', deco: 'frost', tint: '#9be7ff', dark: 0.25,
    obstacles: ['icecrystal', 'snowrock', 'stalagmite'],
    monsters: ['frostbat', 'icewisp', 'frostwolf', 'icegolem'],
    boss: 'frostgiant', villager: 'pengpeng',
  },
  {
    id: 5, name: '용암 갱도', sub: '뽀용의 꿈',
    floor: 'cave', ground: ['#5e3e37', '#573932'], wall: '#3a2320', light: '#ffa04a', deco: 'ember', tint: '#ff6b4a', dark: 0.4,
    obstacles: ['lavarock', 'minecart', 'vent', 'crate'],
    monsters: ['imp', 'lavaslime', 'firebat', 'kobold'],
    boss: 'reddragon', villager: 'ppoyong',
  },
  {
    id: 6, name: '저주받은 서고', sub: '토비의 꿈',
    floor: 'planks', ground: ['#5b4a6a', '#544462'], wall: '#33284a', light: '#d6b8ff', deco: 'page', tint: '#b9a6ff', dark: 0.45,
    obstacles: ['bookshelf', 'candelabra', 'crystal'],
    monsters: ['grimoire', 'candlewraith', 'darkmage', 'gargoyle'],
    boss: 'lich', villager: 'tobi',
  },
  {
    id: 7, name: '오크 요새', sub: '다람의 꿈',
    floor: 'planks', ground: ['#7a6248', '#725a41'], wall: '#4a3826', light: '#ffc46b', deco: 'straw', tint: '#d9a85b', dark: 0.3,
    obstacles: ['barricade', 'barrel', 'crate', 'brazier'],
    monsters: ['orc', 'warwolf', 'mimic', 'shaman'],
    boss: 'orcwarlord', villager: 'daram',
  },
  {
    id: 8, name: '가라앉은 신전', sub: '여울의 꿈',
    floor: 'stone', ground: ['#4c787d', '#457075'], wall: '#2c5054', light: '#9ff0e0', deco: 'puddle', tint: '#5fd3c8', dark: 0.4,
    obstacles: ['coral', 'brokenpillar', 'statue', 'shell'],
    monsters: ['merfolk', 'jellyfish', 'seaserpent', 'crabknight'],
    boss: 'kraken', villager: 'yeoul',
  },
  {
    id: 9, name: '수정 첨탑', sub: '솜솜 할머니의 꿈',
    floor: 'stone', ground: ['#8e8ab8', '#8682b0'], wall: '#56518a', light: '#fff3b0', deco: 'shard', tint: '#d9c9ff', dark: 0.2,
    obstacles: ['crystal', 'pillar', 'statue'],
    monsters: ['crystalgolem', 'livingarmor', 'lightwisp', 'manaeye'],
    boss: 'ancientgolem', villager: 'luna',
  },
  {
    id: 10, name: '악몽의 왕좌', sub: '루미의 꿈',
    floor: 'stone', ground: ['#3c3256', '#362d4f'], wall: '#211a35', light: '#ff8fe0', deco: 'dream', tint: '#c3a6ff', dark: 0.55,
    obstacles: ['shadowcrystal', 'darkpillar', 'brazier'],
    monsters: ['nightslime', 'demonbat', 'deathknight', 'nightmareeye'],
    boss: 'nightmare', villager: null,
  },
];

// 층 → 스테이지 (100층 이후는 '끝없는 탑': 스테이지가 다시 돌아오며 계속 강해짐)
G.stageOf = (floor) => G.STAGES[Math.floor((floor - 1) / 10) % 10];
G.isBossFloor = (floor) => floor % 10 === 0;
G.isEndless = (floor) => floor > 100;
