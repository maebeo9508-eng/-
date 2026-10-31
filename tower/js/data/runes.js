'use strict';
// 룬: 주 능력치·원소를 올려요 (보조 능력치는 보석이 맡아요). 같은 종류·같은 등급 3개를 합치면 한 등급 위 룬 (최대 5등급).
G.RUNE_TYPES = {
  power: { name: '힘의 룬', icon: '⚔️', color: '#ff6b6b', stat: 'atkP', vals: [0.05, 0.09, 0.14, 0.2, 0.28] },
  life: { name: '생명의 룬', icon: '❤️', color: '#ff8fab', stat: 'hpP', vals: [0.06, 0.11, 0.17, 0.24, 0.33] },
  guard: { name: '수호의 룬', icon: '🛡️', color: '#8ecbff', stat: 'defP', vals: [0.06, 0.11, 0.17, 0.24, 0.33] },
  hunt: { name: '사냥의 룬', icon: '👑', color: '#ffd166', stat: 'bossDmg', vals: [0.06, 0.1, 0.15, 0.21, 0.3] },
  arcane: { name: '비전의 룬', icon: '📘', color: '#4fa3ff', stat: 'skillDmg', vals: [0.06, 0.1, 0.15, 0.21, 0.3] },
  ember: { name: '불꽃의 룬', icon: '🔥', color: '#ff9f1c', stat: 'burn', vals: [0.04, 0.07, 0.1, 0.14, 0.2] },
  frost: { name: '서리의 룬', icon: '❄️', color: '#9be7ff', stat: 'frost', vals: [0.04, 0.07, 0.1, 0.14, 0.2] },
  storm: { name: '번개의 룬', icon: '🌩️', color: '#b9a6ff', stat: 'shock', vals: [0.03, 0.05, 0.08, 0.11, 0.15] },
  venom: { name: '맹독의 룬', icon: '🧪', color: '#8be36b', stat: 'poison', vals: [0.04, 0.07, 0.1, 0.14, 0.2] },
  luck: { name: '행운의 룬', icon: '🍀', color: '#5cc26a', stat: 'goldP', vals: [0.08, 0.14, 0.22, 0.32, 0.45] },
  wisdom: { name: '지혜의 룬', icon: '📜', color: '#c3a6ff', stat: 'expP', vals: [0.06, 0.1, 0.15, 0.21, 0.3] },
};
G.RUNE_GRADE_NAMES = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];
G.RUNE_SLOT_COST = [0, 0, 30, 60, 120, 200]; // 마석으로 슬롯 열기
// 예전 보조 능력치 룬은 같은 효과의 보석으로 바뀌어요
G.RUNE_TO_GEM = { swift: 'emerald', wind: 'aquamarine', keen: 'topaz', ruin: 'ruby', blood: 'amethyst', time: 'sapphire' };
