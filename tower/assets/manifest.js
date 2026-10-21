// ─────────────────────────────────────────────────────────────
// 몽글타워 에셋 매니페스트
// ─────────────────────────────────────────────────────────────
// 게임은 기본적으로 모든 캐릭터·몬스터·아이콘을 코드로 직접 그립니다.
// ChatGPT / Gemini로 만든 PNG를 assets/ 폴더에 넣고 여기에 등록하면
// 해당 키의 그림만 이미지로 바뀝니다. (등록하지 않은 것은 계속 코드 그림 사용)
//
// ● 스프라이트(캐릭터·몬스터·펫·동료·보스)
//   '키': {
//      idle:   { src: '경로.png', frames: 프레임수, fps: 초당프레임 },
//      walk:   { ... },   // 이동
//      attack: { ... },   // 공격 (없으면 walk/idle 사용)
//      hurt:   { ... },   // 피격
//      scale: 1.0,        // (선택) 크기 보정
//   }
//   - 시트는 "가로 한 줄" 형식: 프레임을 왼쪽→오른쪽으로 같은 간격으로 배치
//   - 캐릭터는 오른쪽을 바라보게 그리면 게임이 좌우 반전을 자동 처리합니다
//   - tools/sprite-packer.html 로 AI가 만든 낱장 이미지를 시트로 묶을 수 있어요
//
// ● 아이콘(UI)
//   'icon_키': { src: '경로.png' }
//
// 키 목록은 docs/ASSET_PROMPTS.md 의 "에셋 키 목록" 표를 참고하세요.
// ─────────────────────────────────────────────────────────────
window.ASSET_MANIFEST = {
  // 예시) 주인공 모찌
  // hero: {
  //   idle:   { src: 'assets/sprites/hero_idle.png',   frames: 4, fps: 6 },
  //   walk:   { src: 'assets/sprites/hero_walk.png',   frames: 6, fps: 12 },
  //   attack: { src: 'assets/sprites/hero_attack.png', frames: 4, fps: 16 },
  //   hurt:   { src: 'assets/sprites/hero_hurt.png',   frames: 2, fps: 10 },
  // },
  //
  // 예시) 말랑 슬라임
  // slime: { walk: { src: 'assets/sprites/slime_walk.png', frames: 4, fps: 8 } },
  //
  // 예시) 회전 베기 스킬 아이콘
  // icon_skill_spin: { src: 'assets/icons/skill_spin.png' },
};
