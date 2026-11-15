/* 목록: 벽 종류(틀·석고 구성)와 문·창문·기둥 프리셋.
   목록 항목은 도면 데이터 안에 함께 저장되어, 고치면 실행 취소가 되고 프로젝트 파일에도 따라간다.
   벽 두께는 벽 종류에서 정해지고, 벽 종류를 고치면 그 종류의 벽이 모두 함께 바뀐다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const BOARD = { boardT: 9.5, boardW: 900, boardL: 1800 };
  const WOOD = { frameKind: 'wood', frameDepth: 30, frameSpacing: 450, frameRowSpacing: 900, framePiece: 3600 };
  const METAL = { frameKind: 'metal', frameDepth: 65, frameSpacing: 450, frameRowSpacing: 0, framePiece: 3000 };
  const NO_FRAME = { frameKind: 'none', frameDepth: 30, frameSpacing: 450, frameRowSpacing: 0, framePiece: 3600 };
  // 로스는 현장 기준이 아직 없어 0%. 벽 종류마다 고칠 수 있음
  const NO_LOSS = { frameLoss: 0, boardLoss: 0 };

  // 층 순서(마감 쪽 → 반대쪽): [마감 쪽 석고][틀][기존 벽][반대쪽 석고]
  const DEFAULT_WALL_TYPES = [
    { name: '가벽 · 다루끼', base: 0, ...WOOD, ...BOARD, boardFace: 1, boardBack: 1, ...NO_LOSS },
    { name: '가벽 · 경량 스터드', base: 0, ...METAL, ...BOARD, boardFace: 2, boardBack: 2, ...NO_LOSS },
    { name: '덧방 · 다루끼', base: 150, ...WOOD, ...BOARD, boardFace: 1, boardBack: 0, ...NO_LOSS },
    { name: '기존 벽 · 콘크리트', base: 150, ...NO_FRAME, ...BOARD, boardFace: 0, boardBack: 0, ...NO_LOSS },
  ];

  const DEFAULT_PRESETS = [
    ['door', { name: '방문', style: '여닫이', width: 900, height: 2100 }],
    ['door', { name: '욕실문', style: '여닫이', width: 800, height: 2100 }],
    ['door', { name: '현관 방화문', style: '방화문', width: 1000, height: 2100 }],
    ['door', { name: '미닫이문', style: '미닫이', width: 900, height: 2100 }],
    ['window', { name: '방 창', style: '미서기', width: 1200, height: 1200, sill: 900 }],
    ['window', { name: '거실 창', style: '미서기', width: 2400, height: 2100, sill: 300 }],
    ['window', { name: '욕실 창', style: '프로젝트창', width: 600, height: 600, sill: 1500 }],
    ['column', { name: '사각 기둥', shape: 'rect', width: 400, depth: 400 }],
    ['column', { name: '원형 기둥', shape: 'circle', width: 400, depth: 400 }],
    // 선 종류: size는 관·덕트 지름(폭). 덕트는 이 폭으로 그림
    // runHeight: 배관이 지나가는 높이(mm, null이면 천장 속). 기구까지 오르내리는 수직 길이를 자동 계산할 때 씀
    ['line', { name: '전선관 CD 16C', category: '전선관', color: '#e03131', size: 16, runHeight: null }],
    ['line', { name: '전선관 CD 22C', category: '전선관', color: '#c2255c', size: 22, runHeight: null }],
    ['line', { name: '급수 배관 15A', category: '배관', color: '#1c7ed6', size: 20, runHeight: 0 }],
    ['line', { name: '배수 배관 50A', category: '배관', color: '#2f9e44', size: 60, runHeight: 0 }],
    ['line', { name: '덕트 Ø100', category: '덕트', color: '#0c8599', size: 100, runHeight: null }],
    ['line', { name: '덕트 Ø150', category: '덕트', color: '#0c8599', size: 150, runHeight: null }],
    // 마감재: 방 속성에서 벽 마감·바닥 마감으로 고름. from: 벽 마감을 시작하는 높이(바닥에서), unitW×unitL: 한 장 크기(0이면 면적만)
    ['finish', { name: '아트보드', target: 'wall', from: 800, unitW: 1220, unitL: 2440, loss: 0 }],
    ['finish', { name: '데코타일', target: 'floor', from: 0, unitW: 450, unitL: 450, loss: 0 }],
  ];

  /* 전기·설비 아이템 종류
     size: 기본 기호 폭(mm), aspect: 깊이/폭, wall: 벽 가까이 놓으면 벽면에 붙고 벽을 따라감
     height: 설치 높이(바닥에서 기구 가운데까지, mm). null이면 천장 (방의 천장 높이)
     options: 고르는 값 (구수·형식 등), numbers: 숫자 값 (회로 수 등)
     line: 팔레트에서 고르면 선 그리기로 바뀌는 항목 (선 종류의 분류) */
  const GANG = { label: '구수', values: ['1구', '2구', '3구', '4구'] };
  let defIndex = null; // itemDef 찾기 표
  const ITEM_KINDS = {
    elec: [
      {
        kind: '콘센트', size: 250, aspect: 1, wall: true, height: 300,
        options: { gang: { ...GANG, default: '2구' }, variant: { label: '형식', values: ['일반(접지)', '방수형', '전용', '바닥형'], default: '일반(접지)' } },
      },
      {
        kind: '스위치', size: 200, aspect: 1, wall: true, height: 1200,
        options: { gang: { ...GANG, default: '1구' }, variant: { label: '형식', values: ['일반', '3로(두 곳에서 켜기)', '디밍'], default: '일반' } },
      },
      {
        kind: '조명', size: 400, aspect: 1, height: null,
        options: { variant: { label: '형식', values: ['다운라이트', 'LED 평판등', '등기구', '간접등', '라인조명', '펜던트', '센서등'], default: '다운라이트' } },
      },
      {
        kind: '분전반', size: 600, aspect: 0.5, wall: true, height: 1500,
        numbers: { circuits: { label: '회로 수', unit: '회로', default: 12, min: 1, max: 200 } },
      },
      {
        kind: '감지기', size: 150, aspect: 1, height: null,
        options: { variant: { label: '형식', values: ['연기', '열', '가스'], default: '연기' } },
      },
      {
        kind: '유도등', size: 400, aspect: 0.35, wall: true, height: 2200,
        options: { variant: { label: '형식', values: ['피난구', '통로', '객석'], default: '피난구' } },
      },
      { kind: '비상조명', size: 300, aspect: 1, height: null },
      {
        kind: '통신 단자', size: 200, aspect: 1, wall: true, height: 300,
        options: { variant: { label: '형식', values: ['TV', '랜(LAN)', '전화', 'TV+랜'], default: '랜(LAN)' } },
      },
      { kind: '월패드', size: 300, aspect: 0.3, wall: true, height: 1400 },
      { line: '전선관' },
    ],
    mech: [
      {
        kind: '에어컨 실내기', size: 900, aspect: 0.3, wall: true, height: 2100,
        options: { variant: { label: '형식', values: ['벽걸이', '스탠드', '천장형'], default: '벽걸이' } },
      },
      {
        kind: '에어컨 실외기', size: 800, aspect: 0.45, height: 0,
        options: { variant: { label: '설치', values: ['바닥', '벽 거치대', '옥상'], default: '바닥' } },
      },
      {
        kind: '환기구', size: 250, aspect: 1, height: null,
        options: { variant: { label: '형식', values: ['천장형', '벽부형'], default: '천장형' } },
      },
      {
        kind: '배수구', size: 150, aspect: 1, height: 0,
        options: { variant: { label: '규격', values: ['50A', '75A', '100A'], default: '50A' } },
      },
      // 천장에 다는 것들: 실제 크기(폭 size × 깊이 depth)로 그리고 규격을 고를 수 있음
      { kind: '시스템 에어컨', size: 950, depth: 950, height: null, sizes: [['4way', 950, 950], ['미니 4way', 620, 620], ['2way', 1100, 600], ['1way', 1200, 450]] },
      { kind: '점검구', size: 450, depth: 450, height: null, sizes: [['300', 300, 300], ['450', 450, 450], ['600', 600, 600]] },
      {
        kind: '디퓨저', size: 450, depth: 450, height: null, sizes: [['Ø300', 300, 300], ['450', 450, 450], ['600', 600, 600], ['라인 1200', 1200, 150]],
        options: { variant: { label: '형식', values: ['사각', '원형', '라인'], default: '사각' } },
      },
      { kind: '스프링클러', size: 120, aspect: 1, height: null },
      {
        kind: '수전', size: 150, aspect: 1, wall: true, height: 900,
        options: { variant: { label: '자리', values: ['싱크', '세면', '세탁', '샤워', '외부'], default: '싱크' } },
      },
      { kind: '보일러', size: 450, aspect: 0.35, wall: true, height: 1500 },
      { line: '배관' },
      { line: '덕트' },
    ],
    /* 가구: 실제 크기(폭 size × 깊이 depth, mm)로 그림. 기호의 위쪽(-y)이 등(벽 쪽).
       back: 벽 가까이 놓으면 등을 벽에 대고 붙음, sizes: 규격 [이름, 폭, 깊이], h3: 3D 보기 높이 */
    furn: [
      { kind: '침대', cat: '침실·서재', colors: '이불 색', size: 1500, depth: 2000, h3: 450, back: true, sizes: [['싱글', 1000, 2000], ['슈퍼싱글', 1100, 2000], ['더블', 1400, 2000], ['퀸', 1500, 2000], ['킹', 1600, 2000]] },
      { kind: '소파', cat: '거실', colors: '천 색', size: 2000, depth: 850, h3: 800, back: true, sizes: [['1인', 900, 850], ['2인', 1500, 850], ['3인', 2000, 850]] },
      { kind: '식탁', cat: '주방·식당', colors: '색', size: 1200, depth: 800, h3: 750, sizes: [['2인', 800, 700], ['4인', 1200, 800], ['6인', 1600, 900]] },
      { kind: '식탁 의자', cat: '주방·식당', colors: '색', size: 450, depth: 450, h3: 850 },
      { kind: '책상', cat: '침실·서재', colors: '상판 색', size: 1200, depth: 600, h3: 730, back: true, sizes: [['1000', 1000, 600], ['1200', 1200, 600], ['1400', 1400, 700]] },
      { kind: '옷장', cat: '침실·서재', colors: '문 색', size: 1200, depth: 600, h3: 2100, back: true, sizes: [['800', 800, 600], ['1200', 1200, 600], ['1800', 1800, 600], ['2400', 2400, 600]] },
      { kind: '수납장', cat: '거실', colors: '문 색', size: 800, depth: 400, h3: 900, back: true },
      { kind: 'TV장', cat: '거실', colors: '색', size: 1800, depth: 400, h3: 450, back: true },
      { kind: '냉장고', cat: '주방·식당', colors: '색', size: 900, depth: 900, h3: 1800, back: true, sizes: [['일반', 700, 750], ['양문형', 900, 900]] },
      { kind: '세탁기', cat: '욕실·세탁', size: 700, depth: 700, h3: 1000, back: true },
      { kind: '싱크대', cat: '주방·식당', colors: '문 색', size: 2400, depth: 600, h3: 850, back: true, sizes: [['1800', 1800, 600], ['2400', 2400, 600], ['3000', 3000, 600]] },
      { kind: '쿡탑', cat: '주방·식당', size: 600, depth: 520, h3: 850, back: true },
      { kind: '변기', cat: '욕실·세탁', size: 400, depth: 700, h3: 750, back: true },
      { kind: '세면대', cat: '욕실·세탁', size: 600, depth: 450, h3: 850, back: true },
      { kind: '욕조', cat: '욕실·세탁', size: 1500, depth: 750, h3: 550, back: true, sizes: [['1400', 1400, 700], ['1500', 1500, 750], ['1700', 1700, 750]] },
      { kind: '샤워부스', cat: '욕실·세탁', size: 900, depth: 900, h3: 2000 },
      { kind: '신발장', cat: '거실', colors: '문 색', size: 1000, depth: 380, h3: 1200, back: true },
      // ── 2.2: 더 많은 가구 (cat: 고르는 막대의 분류)
      { kind: 'L자 소파', cat: '거실', colors: '천 색', size: 2600, depth: 1600, h3: 820, back: true, sizes: [['3인', 2400, 1500], ['4인', 2800, 1700]] },
      { kind: '안락의자', cat: '거실', colors: '천 색', size: 850, depth: 850, h3: 880 },
      { kind: '거실 테이블', cat: '거실', colors: '색', size: 1100, depth: 550, h3: 400, sizes: [['900', 900, 500], ['1100', 1100, 550], ['1300', 1300, 650]] },
      { kind: '책장', cat: '거실', colors: '색', size: 800, depth: 300, h3: 1800, back: true, sizes: [['600', 600, 300], ['800', 800, 300], ['1200', 1200, 300]] },
      { kind: '피아노', cat: '거실', size: 1500, depth: 1000, h3: 1250, back: true },
      { kind: '협탁', cat: '침실·서재', colors: '색', size: 450, depth: 400, h3: 550, back: true },
      { kind: '화장대', cat: '침실·서재', colors: '색', size: 1000, depth: 800, h3: 1450, back: true },
      { kind: '아일랜드 식탁', cat: '주방·식당', colors: '문 색', size: 1800, depth: 1300, h3: 900, sizes: [['1500', 1500, 1300], ['1800', 1800, 1300], ['2400', 2400, 1300]] },
      { kind: '바 테이블', cat: '주방·식당', colors: '색', size: 1500, depth: 600, h3: 1050 },
      { kind: '사무용 의자', cat: '사무·상가', colors: '색', size: 620, depth: 620, h3: 1050 },
      { kind: '회의 테이블', cat: '사무·상가', colors: '상판 색', size: 2400, depth: 1100, h3: 740, sizes: [['6인', 1800, 900], ['8인', 2400, 1100], ['10인', 3000, 1200], ['12인', 3600, 1200]] },
      { kind: '파티션', cat: '사무·상가', colors: '천 색', size: 1200, depth: 50, h3: 1200, sizes: [['800', 800, 50], ['1200', 1200, 50], ['1600', 1600, 50]] },
      { kind: '서류 캐비닛', cat: '사무·상가', size: 800, depth: 450, h3: 1300, back: true },
      { kind: '카운터', cat: '사무·상가', colors: '앞판 색', size: 1800, depth: 600, h3: 1050, sizes: [['1200', 1200, 600], ['1800', 1800, 600], ['2400', 2400, 600]] },
      { kind: '진열장', cat: '사무·상가', size: 1200, depth: 450, h3: 1800, back: true, sizes: [['900', 900, 450], ['1200', 1200, 450], ['1800', 1800, 450]] },
      { kind: '러그', cat: '장식·조명', colors: '색', size: 2000, depth: 1400, h3: 12, flat: true, sizes: [['1400×2000', 2000, 1400], ['1600×2300', 2300, 1600], ['2000×3000', 3000, 2000]] },
      { kind: '실내 화분', cat: '장식·조명', size: 500, depth: 500, h3: 1300 },
      { kind: '스탠드 조명', cat: '장식·조명', size: 420, depth: 420, h3: 1650 },
    ],
  };
  /* 조감도(행사) 물건: 실제 크기(폭 size × 깊이 depth)로 그리고, h3은 3D 높이(물건마다 고칠 수 있음).
     기호의 위쪽(-y)이 등, 아래쪽(+y)이 앞 (의자는 앞을 보고 앉음, 스피커·화면은 앞을 향함).
     cat: 팔레트 분류, sizes: 규격 [이름, 폭, 깊이], numbers: 정수 값, styles: 모양, colors: 색을 고를 수 있음(값은 색 이름표),
     face: 앞면에 글자나 이미지를 넣을 수 있음, pass: 동선이 지나갈 수 있음(동선 체크에서 장애물로 안 봄),
     resize(it): 숫자 값이 바뀌면 자리 크기를 다시 계산 */
  const CHAIR_STYLES = ['접이식', '연회 의자', '플라스틱', '의자 커버', '스툴'];
  const N = (label, unit, def, min, max) => ({ label, unit, default: def, min, max });
  ITEM_KINDS.event = [
    // ── 구조물
    {
      kind: '몽골텐트', cat: '구조물', size: 5000, depth: 5000, h3: 2500, pass: true, colors: '천막 색',
      sizes: [['3×3', 3000, 3000], ['4×4', 4000, 4000], ['5×5', 5000, 5000], ['6×3', 6000, 3000], ['10×10', 10000, 10000]],
      options: { variant: { label: '옆 천막', values: ['없음', '뒤', '뒤·양옆'], default: '없음' } },
    },
    {
      kind: '대형 텐트', cat: '구조물', size: 10000, depth: 5000, h3: 3000, pass: true, colors: '천막 색',
      sizes: [['5×10', 10000, 5000], ['10×10', 10000, 10000], ['10×15', 15000, 10000], ['10×20', 20000, 10000], ['15×30', 30000, 15000]],
      options: { variant: { label: '지붕', values: ['뾰족 지붕', '박공 지붕'], default: '뾰족 지붕' } },
    },
    { kind: '파라솔', cat: '구조물', size: 2500, depth: 2500, h3: 2300, pass: true, colors: '천 색', sizes: [['Ø2000', 2000, 2000], ['Ø2500', 2500, 2500], ['Ø3000', 3000, 3000]] },
    {
      kind: '무대', cat: '구조물', size: 7200, depth: 4800, h3: 900, back: true, colors: '바닥 색',
      sizes: [['3.6×2.4', 3600, 2400], ['5.4×3.6', 5400, 3600], ['7.2×4.8', 7200, 4800], ['9×5.4', 9000, 5400], ['12×7.2', 12000, 7200]],
      options: { variant: { label: '지붕', values: ['없음', '트러스 지붕'], default: '없음' } },
    },
    { kind: '계단', cat: '구조물', size: 1200, depth: 900, h3: 900, sizes: [['폭 900', 900, 900], ['폭 1200', 1200, 900], ['폭 1800', 1800, 900]] },
    { kind: '트러스', cat: '구조물', size: 8000, depth: 400, h3: 4000, pass: true, sizes: [['4m', 4000, 400], ['6m', 6000, 400], ['8m', 8000, 400], ['10m', 10000, 400], ['12m', 12000, 400]] },
    { kind: '부스', cat: '구조물', size: 3000, depth: 3000, h3: 2500, back: true, colors: '간판 색', face: '간판 글자', sizes: [['2×2', 2000, 2000], ['3×3', 3000, 3000], ['6×3', 6000, 3000], ['9×3', 9000, 3000]] },
    { kind: '에어아치', cat: '구조물', size: 6000, depth: 1000, h3: 4000, pass: true, colors: '색', face: '글자', sizes: [['4m', 4000, 1000], ['6m', 6000, 1000], ['8m', 8000, 1000]] },
    // ── 좌석
    {
      kind: '의자 배열', cat: '좌석', size: 5000, depth: 4500, h3: 850, styles: CHAIR_STYLES, colors: '의자 색',
      numbers: {
        cols: N('한 줄 의자 수', '개', 10, 1, 200), rows: N('줄 수', '줄', 5, 1, 200), gap: N('줄 간격', 'mm', 900, 450, 5000),
        seatW: N('의자 간격', 'mm', 500, 400, 2000), aisles: N('세로 통로 수', '개', 0, 0, 8), aisleW: N('통로 폭', 'mm', 1200, 600, 5000),
      },
      resize: (it) => ({ size: it.cols * it.seatW + it.aisles * it.aisleW, depth: it.rows * it.gap }),
    },
    { kind: '의자', cat: '좌석', size: 450, depth: 450, h3: 850, styles: CHAIR_STYLES, colors: '의자 색' },
    {
      kind: '원형 테이블', cat: '좌석', size: 1500, depth: 1500, h3: 750, styles: CHAIR_STYLES, styleDefault: '연회 의자', colors: '테이블보 색',
      sizes: [['Ø1200', 1200, 1200], ['Ø1500', 1500, 1500], ['Ø1800', 1800, 1800]],
      numbers: { chairs: N('의자 수', '개', 8, 0, 14) },
    },
    {
      kind: '테이블', cat: '좌석', size: 1800, depth: 600, h3: 750, styles: CHAIR_STYLES, colors: '테이블보 색',
      sizes: [['1200×600', 1200, 600], ['1500×600', 1500, 600], ['1800×600', 1800, 600], ['1800×750', 1800, 750]],
      numbers: { chairs: N('의자 수', '개', 0, 0, 20) },
    },
    { kind: '스탠딩 테이블', cat: '좌석', size: 700, depth: 700, h3: 1100, colors: '테이블보 색' },
    // ── 장비
    { kind: '스피커', cat: '장비', size: 500, depth: 450, h3: 1900 },
    { kind: '라인어레이', cat: '장비', size: 1100, depth: 800, h3: 3200, numbers: { units: N('스피커 단 수', '단', 5, 2, 12) } },
    { kind: '모니터 스피커', cat: '장비', size: 600, depth: 450, h3: 350 },
    { kind: '콘솔 데스크', cat: '장비', size: 2000, depth: 1000, h3: 1100, back: true },
    { kind: 'LED 스크린', cat: '장비', size: 4000, depth: 300, h3: 3000, back: true, face: '화면 글자', sizes: [['3m', 3000, 300], ['4m', 4000, 300], ['6m', 6000, 300], ['8m', 8000, 300]] },
    { kind: '조명 타워', cat: '장비', size: 600, depth: 600, h3: 5000 },
    { kind: '발전기', cat: '장비', size: 2000, depth: 1000, h3: 1200 },
    // ── 안내·장식
    { kind: '백월', cat: '안내·장식', size: 6000, depth: 400, h3: 3000, back: true, colors: '띠 색', face: '행사 제목', sizes: [['3m', 3000, 400], ['4.8m', 4800, 400], ['6m', 6000, 400], ['9m', 9000, 400]] },
    { kind: '현수막', cat: '안내·장식', size: 5000, depth: 100, h3: 3000, pass: true, colors: '띠 색', face: '현수막 글자', sizes: [['3m', 3000, 100], ['5m', 5000, 100], ['7m', 7000, 100], ['10m', 10000, 100]] },
    { kind: '포토월', cat: '안내·장식', size: 3000, depth: 300, h3: 2400, back: true, colors: '띠 색', face: '포토월 글자', sizes: [['2.4m', 2400, 300], ['3m', 3000, 300], ['5m', 5000, 300]] },
    { kind: 'X배너', cat: '안내·장식', size: 600, depth: 500, h3: 1800, back: true, colors: '띠 색', face: '배너 글자' },
    { kind: '안내판', cat: '안내·장식', size: 600, depth: 450, h3: 1500, back: true, colors: '띠 색', face: '안내 글자' },
    { kind: '깃발', cat: '안내·장식', size: 600, depth: 600, h3: 5000, colors: '깃발 색' },
    { kind: '연단', cat: '안내·장식', size: 700, depth: 500, h3: 1150, colors: '색' },
    { kind: '레드카펫', cat: '안내·장식', size: 1200, depth: 6000, h3: 10, pass: true, flat: true, colors: '카펫 색' },
    // 바닥에 까는 그림: 배치도·위성 사진·로고·바닥 래핑 (이미지를 넣어 씀)
    { kind: '바닥 이미지', cat: '안내·장식', size: 4000, depth: 3000, h3: 10, pass: true, flat: true, face: '글자', sizes: [['2×2', 2000, 2000], ['4×3', 4000, 3000], ['10×10', 10000, 10000], ['30×20', 30000, 20000]] },
    { kind: '테이프 커팅', cat: '안내·장식', size: 6000, depth: 300, h3: 1000, colors: '리본 색', sizes: [['4m', 4000, 300], ['6m', 6000, 300], ['8m', 8000, 300]] },
    { kind: '화분', cat: '안내·장식', size: 600, depth: 600, h3: 1200, styles: ['화분', '축하 화환', '꽃 화단'], colors: '꽃 색' },
    // ── 편의·안전
    { kind: '데스크', cat: '편의·안전', size: 1800, depth: 600, h3: 1000, back: true, colors: '색', face: '앞면 글자' },
    { kind: '이동식 화장실', cat: '편의·안전', size: 1200, depth: 1200, h3: 2300, back: true, colors: '색' },
    { kind: '푸드트럭', cat: '편의·안전', size: 6000, depth: 2200, h3: 2800, colors: '차 색' },
    { kind: '쓰레기통', cat: '편의·안전', size: 600, depth: 600, h3: 900, colors: '색' },
    { kind: '펜스', cat: '편의·안전', size: 2000, depth: 100, h3: 1100, sizes: [['2m', 2000, 100], ['4m', 4000, 100], ['6m', 6000, 100], ['10m', 10000, 100], ['20m', 20000, 100]] },
    { kind: '차단봉', cat: '편의·안전', size: 4000, depth: 350, h3: 950, colors: '벨트 색', sizes: [['2m', 2000, 350], ['4m', 4000, 350], ['6m', 6000, 350], ['10m', 10000, 350]] },
    { kind: '러버콘', cat: '편의·안전', size: 400, depth: 400, h3: 700 },
    { kind: '소화기', cat: '편의·안전', size: 250, depth: 250, h3: 600 },
    // ── 사람·차량
    {
      kind: '사람', cat: '사람·차량', size: 600, depth: 400, h3: 1720, pass: true, styles: ['정장', '일반', '스태프'],
      numbers: { count: N('인원', '명', 1, 1, 200), perRow: N('한 줄 인원', '명', 10, 1, 100) },
      resize: (it) => ({ size: Math.min(it.count, it.perRow) * 600, depth: Math.ceil(it.count / it.perRow) * 600 - 200 }),
    },
    { kind: '승용차', cat: '사람·차량', size: 4600, depth: 1850, h3: 1450, colors: '차 색' },
    { kind: '버스', cat: '사람·차량', size: 11000, depth: 2500, h3: 3200, colors: '차 색' },
    // ── 건물·조경
    {
      kind: '건물', cat: '건물·조경', size: 20000, depth: 10000, h3: 7000, back: true, colors: '벽 색', face: '간판 글자',
      numbers: { floors: N('층수', '층', 2, 1, 30) },
      resize: (it) => ({ h3: it.floors * 3500 }),
    },
    { kind: '나무', cat: '건물·조경', size: 3000, depth: 3000, h3: 5000, styles: ['활엽수', '침엽수', '벚나무'], sizes: [['작게', 2000, 2000], ['보통', 3000, 3000], ['크게', 4500, 4500]] },
    { kind: '담장', cat: '건물·조경', size: 10000, depth: 300, h3: 1500, styles: ['돌담', '벽돌', '판넬'], sizes: [['5m', 5000, 300], ['10m', 10000, 300], ['20m', 20000, 300], ['30m', 30000, 300]] },
    {
      kind: '주차 구획', cat: '건물·조경', size: 12500, depth: 5000, h3: 10, pass: true, flat: true,
      numbers: { count: N('칸 수', '칸', 5, 1, 100) },
      resize: (it) => ({ size: it.count * 2500 }),
    },
    { kind: '가로등', cat: '건물·조경', size: 300, depth: 300, h3: 5000 },
  ];
  /* ── 2.1: 더 많은 물건 (운동 경기·건물·장식 등) ── */
  const GOAL = { variant: { label: '골대·네트', values: ['있음', '없음'], default: '있음' } };
  // 경기장: 크기는 경기 선(라인) 기준. 바닥은 선 바깥으로 여유를 두고 깔림
  const court = (kind, w, d, h, sizes) => ({ kind, cat: '운동·경기', size: w, depth: d, h3: h, pass: true, flat: true, colors: '바닥 색', options: GOAL, ...(sizes ? { sizes } : {}) });
  ITEM_KINDS.event.push(
    // 구조물
    { kind: '돔 텐트', cat: '구조물', size: 8000, depth: 8000, h3: 4200, pass: true, colors: '천막 색', sizes: [['Ø6m', 6000, 6000], ['Ø8m', 8000, 8000], ['Ø12m', 12000, 12000]] },
    { kind: '파고라', cat: '구조물', size: 4000, depth: 3000, h3: 2600, pass: true, colors: '색', sizes: [['3×3', 3000, 3000], ['4×3', 4000, 3000], ['6×4', 6000, 4000]] },
    { kind: '관람석', cat: '구조물', size: 8000, depth: 4000, h3: 2200, back: true, colors: '의자 색', numbers: { tiers: N('단 수', '단', 5, 2, 20) }, sizes: [['6m', 6000, 4000], ['8m', 8000, 4000], ['12m', 12000, 5000], ['20m', 20000, 6000]] },
    {
      kind: '컨테이너', cat: '구조물', size: 6000, depth: 2400, h3: 2600, back: true, colors: '색', face: '옆면 글자', sizes: [['3m', 3000, 2400], ['6m', 6000, 2400], ['12m', 12000, 2400]],
      options: { variant: { label: '모양', values: ['사무실형', '창고형', '매점형'], default: '사무실형' } },
    },
    { kind: '매표소', cat: '구조물', size: 2400, depth: 1800, h3: 2700, back: true, colors: '색', face: '간판 글자' },
    // 좌석
    { kind: '벤치', cat: '좌석', size: 1800, depth: 600, h3: 850, back: true, colors: '색' },
    { kind: 'VIP 소파', cat: '좌석', size: 2000, depth: 900, h3: 850, back: true, colors: '색', sizes: [['1인', 900, 900], ['2인', 1500, 900], ['3인', 2000, 900]] },
    { kind: '피크닉 테이블', cat: '좌석', size: 1800, depth: 1600, h3: 760, colors: '색' },
    // 장비
    { kind: '카메라', cat: '장비', size: 900, depth: 900, h3: 1700 },
    { kind: '스크린', cat: '장비', size: 3000, depth: 600, h3: 2800, back: true, face: '화면 글자', sizes: [['2.4m', 2400, 600], ['3m', 3000, 600], ['4m', 4000, 600]] },
    { kind: '난로', cat: '장비', size: 600, depth: 600, h3: 2200 },
    // 안내·장식
    { kind: '윙배너', cat: '안내·장식', size: 700, depth: 500, h3: 3500, colors: '색', face: '글자' },
    { kind: 'A형 입간판', cat: '안내·장식', size: 600, depth: 700, h3: 1000, colors: '색', face: '글자' },
    { kind: '풍선 아치', cat: '안내·장식', size: 4000, depth: 600, h3: 3000, pass: true, colors: '풍선 색', sizes: [['3m', 3000, 600], ['4m', 4000, 600], ['6m', 6000, 600]] },
    { kind: '풍선 다발', cat: '안내·장식', size: 800, depth: 800, h3: 2400, colors: '풍선 색' },
    { kind: '입체 글자', cat: '안내·장식', size: 4000, depth: 500, h3: 1200, colors: '글자 색', face: '글자', sizes: [['2m', 2000, 400], ['4m', 4000, 500], ['6m', 6000, 600]] },
    { kind: '분수', cat: '안내·장식', size: 3000, depth: 3000, h3: 1500, sizes: [['Ø2m', 2000, 2000], ['Ø3m', 3000, 3000], ['Ø5m', 5000, 5000]] },
    { kind: '조형물', cat: '안내·장식', size: 1500, depth: 1500, h3: 3000, colors: '색', styles: ['구', '기둥', '고리'] },
    { kind: '바닥 화살표', cat: '안내·장식', size: 1000, depth: 2500, h3: 10, pass: true, flat: true, colors: '색' },
    // 편의·안전
    { kind: '구급차', cat: '편의·안전', size: 5600, depth: 2100, h3: 2500 },
    {
      kind: '의무실 텐트', cat: '편의·안전', size: 3000, depth: 3000, h3: 2500, // 안전 점검에서 의료·구급 자리로 셈
      sizes: [['3×3', 3000, 3000], ['4×4', 4000, 4000], ['5×5', 5000, 5000]],
      options: { variant: { label: '옆 천막', values: ['없음', '뒤', '뒤·양옆'], default: '뒤·양옆' } },
    },
    { kind: '안내 키오스크', cat: '편의·안전', size: 600, depth: 500, h3: 1800, back: true, face: '화면 글자' },
    { kind: '분리수거함', cat: '편의·안전', size: 1800, depth: 600, h3: 1000, back: true },
    { kind: '경사로', cat: '편의·안전', size: 1200, depth: 3000, h3: 450, sizes: [['폭 1.2m', 1200, 3000], ['폭 1.5m', 1500, 4000]] },
    // 운동·경기
    court('축구장', 105000, 68000, 2440, [['정규 105×68', 105000, 68000], ['8인제 68×50', 68000, 50000], ['유소년 50×30', 50000, 30000]]),
    court('풋살장', 40000, 20000, 2000, [['40×20', 40000, 20000], ['30×15', 30000, 15000]]),
    court('농구장', 28000, 15000, 3950),
    court('배구장', 18000, 9000, 2430),
    court('테니스장', 23770, 10970, 1070),
    court('배드민턴장', 13400, 6100, 1550),
    { kind: '육상 트랙', cat: '운동·경기', size: 176000, depth: 92000, h3: 10, pass: true, flat: true, numbers: { lanes: N('레인 수', '레인', 8, 4, 10) }, sizes: [['400m', 176000, 92000], ['200m', 88000, 46000]] },
    { kind: '골대', cat: '운동·경기', size: 7320, depth: 2000, h3: 2440, back: true, sizes: [['정규 7.32m', 7320, 2000], ['유소년 5m', 5000, 1500], ['풋살 3m', 3000, 1000]] },
    { kind: '농구대', cat: '운동·경기', size: 1800, depth: 2500, h3: 3950, back: true },
    { kind: '시상대', cat: '운동·경기', size: 3000, depth: 1000, h3: 900, back: true },
    { kind: '점수판', cat: '운동·경기', size: 3000, depth: 400, h3: 2600, back: true, face: '점수판 글자' },
    { kind: '선수 벤치', cat: '운동·경기', size: 5000, depth: 1500, h3: 2200, back: true, colors: '색' },
    { kind: '트로피', cat: '운동·경기', size: 1200, depth: 1200, h3: 2600, colors: '색' },
    // 사람·차량
    { kind: '트럭', cat: '사람·차량', size: 7500, depth: 2400, h3: 3200, colors: '차 색' },
    { kind: '자전거', cat: '사람·차량', size: 1800, depth: 600, h3: 1100, colors: '색' },
    // 건물·조경
    { kind: '바위', cat: '건물·조경', size: 1500, depth: 1200, h3: 900 },
    { kind: '생울타리', cat: '건물·조경', size: 5000, depth: 600, h3: 1200, sizes: [['3m', 3000, 600], ['5m', 5000, 600], ['10m', 10000, 600]] },
    { kind: '버스 정류장', cat: '건물·조경', size: 4000, depth: 1800, h3: 2600, back: true, face: '광고판 글자' },
    { kind: '횡단보도', cat: '건물·조경', size: 6000, depth: 3000, h3: 10, pass: true, flat: true },
  );
  // 있던 종류에 모양·선택을 더함
  {
    const ev = (k) => ITEM_KINDS.event.find((d) => d.kind === k);
    ev('트러스').face = '현수막 글자';
    Object.assign(ev('건물'), {
      styles: ['일반 건물', '유리 건물', '주택', '창고·체육관', '아파트'],
      options: { faceOn: { label: '글자·이미지 붙이는 곳', values: ['간판', '앞면 전체'], default: '간판' } },
    });
    ev('부스').options = { faceOn: { label: '글자·이미지 붙이는 곳', values: ['간판', '뒷벽'], default: '간판' } };
    ev('나무').styles.push('은행나무', '단풍나무', '야자수');
    Object.assign(ev('담장'), { styles: ['돌담', '벽돌', '판넬', '나무 울타리', '철제 난간'], colors: '색', face: '벽 그림·글자' });
    Object.assign(ev('사람'), { styles: ['정장', '일반', '스태프', '어린이', '선수'], colors: '옷 색' });
  }
  // 벽에 붙이는 액자·벽보: 인테리어(가구)와 조감도 팔레트 양쪽에서 씀. 폭 size, 그림 높이 h3, 걸리는 높이 height(가운데)
  ITEM_KINDS.furn.push({ kind: '액자·벽보', cat: '장식·조명', size: 900, depth: 40, h3: 600, wall: true, height: 1500, face: '글자', sizes: [['A2 가로', 594, 40], ['900', 900, 40], ['1200', 1200, 40], ['1800', 1800, 40]] });
  const EVENT_CATS = ['구조물', '좌석', '장비', '안내·장식', '편의·안전', '운동·경기', '사람·차량', '건물·조경'];
  const FURN_CATS = ['거실', '침실·서재', '주방·식당', '욕실·세탁', '사무·상가', '장식·조명'];
  // 조감도 물건 색 (첫 칸은 종류의 기본 색)
  // 벽지·도장 색 (부드러운 색 위주, 포인트 벽용 진한 색 몇 가지)
  const WALL_COLORS = [
    ['#ffffff', '화이트'], ['#f6f1e6', '아이보리'], ['#ece3d3', '베이지'], ['#e6e4df', '연회색'], ['#d9d2c5', '그레이지'], ['#dfe9f0', '연하늘'],
    ['#dcebe2', '민트'], ['#f3e1e1', '연분홍'], ['#cdd6c4', '세이지'], ['#8a8f96', '진회색 (포인트)'], ['#2f3e55', '네이비 (포인트)'], ['#6b4f3a', '월넛 (포인트)'],
  ];
  const ITEM_COLORS = [
    ['#ffffff', '흰색'], ['#d92d20', '빨강'], ['#f97316', '주황'], ['#facc15', '노랑'], ['#16a34a', '초록'], ['#0ea5e9', '하늘'],
    ['#2563eb', '파랑'], ['#1e3a8a', '남색'], ['#7c3aed', '보라'], ['#ec4899', '분홍'], ['#111827', '검정'], ['#9ca3af', '회색'],
    ['#92400e', '갈색'], ['#d4af37', '금색'], ['#f5f0e1', '아이보리'],
  ];
  // 영역의 바닥 종류 (조감도 3D에서 그 재질로, 평면에서는 그 색으로)
  const SURFACES = [
    ['', '색만', null], ['grass', '잔디', '#3f9b4b'], ['asphalt', '아스팔트', '#5b5f66'], ['paver', '보도블록', '#b98f73'],
    ['soil', '흙·모래', '#c9a877'], ['deck', '나무 데크', '#a9744b'], ['concrete', '콘크리트', '#b9bcc0'], ['water', '물', '#3b8fd9'], ['carpet', '카펫', null],
    ['sand', '모래 (해변)', '#e6d3a3'], ['turf', '인조 잔디', '#3e8f4a'], ['track', '우레탄 (트랙·코트)', '#b5513c'], ['court', '체육관 마루', '#d2a66a'],
  ];
  // 가구·조감도 물건은 높이 0(바닥)에 놓이고, 실제 크기로 그리는 것(깊이가 있는 것)의 기호 비율은 깊이 ÷ 폭
  [...ITEM_KINDS.furn, ...ITEM_KINDS.event].forEach((d) => { if (d.height === undefined) d.height = 0; });
  Object.entries(ITEM_KINDS).forEach(([category, list]) => list.forEach((d) => {
    d.category = category;
    if (d.depth) d.aspect = d.depth / d.size;
  }));
  /* 방 바닥 모양 (평면 색·무늬와 3D 재질): [id, 이름, 색, 무늬]
     무늬: plank 마루 널, wide 넓은 널, deco 데코타일, chevron V자 마루, tile 600각, tile-l 800각, tile-s 300각, marble 대리석, carpet, plain */
  const FLOOR_LOOKS = [
    ['oak', '강마루 · 밝은 오크', '#d9bb8f', 'plank'],
    ['walnut', '강마루 · 월넛', '#8b5e3c', 'plank'],
    ['greywood', '강마루 · 그레이', '#aaa59c', 'plank'],
    ['wide', '원목 마루 (넓은 널)', '#c49a6c', 'wide'],
    ['chevron', '쉐브론 마루 (V자)', '#c99f70', 'chevron'],
    ['vinyl', '장판', '#d8bd8e', 'plank'],
    ['deco', '데코타일', '#c8b08e', 'deco'],
    ['tile', '포세린 타일 600각', '#e2dfd8', 'tile'],
    ['tile-l', '포세린 타일 800각 · 진회색', '#77797d', 'tile-l'],
    ['marble', '대리석', '#ecebe7', 'marble'],
    ['bath', '욕실 타일 300각', '#d3dde2', 'tile-s'],
    ['carpet', '카펫', '#8f96a1', 'carpet'],
    ['concrete', '노출 콘크리트', '#b5b7b9', 'plain'],
    ['epoxy', '에폭시 (주차장·창고)', '#8fa0ad', 'plain'],
  ].map(([id, name, color, pattern]) => ({ id, name, color, pattern }));
  const LINE_CATEGORIES = ['전선관', '배관', '덕트', '기타'];
  const COLORS = [
    ['#e03131', '빨강'], ['#c2255c', '자홍'], ['#e8590c', '주황'], ['#f08c00', '노랑'], ['#2f9e44', '초록'],
    ['#0c8599', '청록'], ['#1c7ed6', '파랑'], ['#7048e8', '보라'], ['#495057', '회색'],
  ];

  const FRAME_NAMES = { none: '없음', wood: '다루끼', metal: '경량 스터드' };
  const SHAPE_NAMES = { rect: '사각', circle: '원형' };
  const num = (v) => String(Number(v));
  const G_dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  const catalog = {
    FRAME_NAMES,
    SHAPE_NAMES,
    ITEM_KINDS,
    EVENT_CATS,
    FURN_CATS,
    ITEM_COLORS,
    SURFACES,
    CHAIR_STYLES,
    LINE_CATEGORIES,
    COLORS,

    /** 종류 이름 → 정의 (그릴 때마다 여러 번 불리므로 표로 찾음) */
    itemDef(kind) {
      const n = Object.values(ITEM_KINDS).reduce((t, l) => t + l.length, 0);
      if (!defIndex || defIndex.n !== n) {
        defIndex = { n, map: new Map() };
        Object.values(ITEM_KINDS).flat().forEach((d) => { if (!defIndex.map.has(d.kind)) defIndex.map.set(d.kind, d); });
      }
      return defIndex.map.get(kind) || null;
    },
    /** 종류의 기본 속성값 (설치 높이, 구수·형식, 회로 수) */
    itemDefaults(def) {
      const v = { height: def.height ?? null };
      Object.entries(def.options || {}).forEach(([k, o]) => { v[k] = o.default; });
      Object.entries(def.numbers || {}).forEach(([k, o]) => { v[k] = o.default; });
      if (def.styles) v.style = def.styleDefault || def.styles[0];
      if (def.kind === '의자 배열') v.count = v.cols * v.rows; // 총 의자 수 (마지막 줄을 덜 채울 때만 줄어듦)
      return v;
    },
    /** 숫자 값(의자 수·인원·층수 등)을 바꿀 때: 그 값에 맞춰 자리 크기도 같이 바뀌는 종류면 함께 */
    resized(it, patch) {
      const def = catalog.itemDef(it.kind);
      return def && def.resize ? { ...patch, ...def.resize({ ...it, ...patch }) } : patch;
    },
    /** 크기 손잡이를 쓸 수 있는 물건 (인원처럼 숫자로만 정해지는 것은 뺌) */
    resizable(it) {
      return it.depth != null && it.kind !== '사람';
    },
    /** 늘 정사각형(둥근 것)으로 두는 종류: 기본이 정사각형이고 규격도 모두 정사각형 */
    square(it) {
      const d = catalog.itemDef(it.kind);
      return !!d && d.depth === d.size && (!d.sizes || d.sizes.every(([, w, dd]) => w === dd));
    },
    /** 손잡이로 폭·깊이를 바꿀 때의 값: 의자 배열은 한 줄 의자 수·줄 수, 주차 구획은 칸 수가 따라 바뀜 */
    sizedBy(it, axis, mm) {
      const v = Math.max(200, Math.round(mm / 50) * 50);
      if (it.kind === '의자 배열') {
        if (axis === 'x') {
          const cols = Math.max(1, Math.round((mm - (it.aisles || 0) * (it.aisleW || 1200)) / (it.seatW || 500)));
          return catalog.resized(it, { cols, count: cols * it.rows });
        }
        const rows = Math.max(1, Math.round(mm / (it.gap || 900)));
        return catalog.resized(it, { rows, count: it.cols * rows });
      }
      if (it.kind === '주차 구획' && axis === 'x') return catalog.resized(it, { count: Math.max(1, Math.round(mm / 2500)) });
      if (catalog.square(it)) return { size: v, depth: v };
      return axis === 'x' ? { size: v } : { depth: v };
    },
    /** 조감도 팔레트: 분류마다 놓을 수 있는 종류들 */
    FLOOR_LOOKS,
    WALL_COLORS,
    /** 방의 바닥 모양: 고른 것, 없으면 바닥 마감재 이름으로 짐작, 그래도 없으면 null (기본 바닥) */
    floorLook(r) {
      if (!r) return null;
      const chosen = FLOOR_LOOKS.find((l) => l.id === r.floorLook);
      if (chosen) return chosen;
      const fin = r.floorFinishId && App.doc && App.doc.get(r.floorFinishId);
      const n = fin ? fin.name : '';
      const id = /대리석/.test(n) ? 'marble' : /욕실/.test(n) ? 'bath' : /데코/.test(n) ? 'deco' : /타일|석재/.test(n) ? 'tile'
        : /장판/.test(n) ? 'vinyl' : /헤링본|쉐브론/.test(n) ? 'chevron' : /마루|우드|원목|목재/.test(n) ? 'oak' : /카펫/.test(n) ? 'carpet'
          : /콘크리트/.test(n) ? 'concrete' : /에폭시/.test(n) ? 'epoxy' : '';
      return FLOOR_LOOKS.find((l) => l.id === id) || null;
    },
    /** 가구 고르는 막대: 분류별 */
    furnPalette() {
      return FURN_CATS.map((cat) => ({ cat, kinds: ITEM_KINDS.furn.filter((d) => d.cat === cat) }));
    },
    /** 고르는 막대의 분류 목록 (조감도 물건 / 가구) */
    palette(category) {
      return category === 'furn' ? catalog.furnPalette() : catalog.eventPalette();
    },
    eventPalette() {
      return EVENT_CATS.map((cat) => ({
        cat,
        kinds: [...ITEM_KINDS.event.filter((d) => d.cat === cat), ...(cat === '안내·장식' ? ITEM_KINDS.furn.filter((d) => d.kind === '액자·벽보') : [])],
      }));
    },
    /** 집계용 이름: '콘센트 2구 · 일반(접지)', '분전반 12회로' */
    itemLabel(it) {
      if (it.category === 'event') {
        // 조감도 물건: 규격 이름이 있으면 그것만 (예: 몽골텐트 5×5), 없으면 폭×깊이. 기본값이 아닌 모양·선택만 덧붙임
        const def = catalog.itemDef(it.kind) || {};
        const seats = catalog.seats(it);
        if (it.kind === '의자 배열') return `의자 배열 ${seats.cols}개×${seats.rows}줄 (${seats.count}석)`;
        if (it.kind === '사람') return `사람 ${it.count || 1}명 · ${it.style || '정장'}`;
        if (it.kind === '주차 구획') return `주차 구획 ${it.count || 1}칸`;
        const parts = [`${it.kind} ${it.kind === '건물' ? `${it.floors || 1}층 ` : ''}${catalog.sizeName(it) || `${num(it.size)}×${num(it.depth)}`}`];
        if (seats && it.kind !== '의자') parts.push(/테이블/.test(it.kind) ? `의자 ${seats.count}개` : `${seats.count}석`);
        if (it.style && def.styles && it.style !== (def.styleDefault || def.styles[0])) parts.push(it.style);
        const vo = def.options && def.options.variant;
        if (it.variant && (!vo || it.variant !== vo.default) && !/^의자 \d+개$/.test(it.variant)) parts.push(it.variant);
        return parts.join(' · ');
      }
      if (it.depth != null) {
        // 실제 크기로 그리는 것: 규격 이름(크기가 맞으면)과 폭×깊이
        const name = catalog.sizeName(it).replace(/^\d+$/, ''); // '450'처럼 숫자뿐인 규격 이름은 크기와 겹쳐서 뺌
        const sized = `${it.kind}${name ? ` ${name}` : ''} ${num(it.size)}×${num(it.depth)}`;
        return it.category === 'furn' || !it.variant ? sized : `${sized} · ${it.variant}`;
      }
      const parts = [it.kind + (it.gang ? ` ${it.gang}` : '') + (it.circuits ? ` ${it.circuits}회로` : '')];
      if (it.variant) parts.push(it.variant);
      return parts.join(' · ');
    },
    /** 좌석 수: 의자 배열은 { cols, rows, count }, 원형 테이블은 { count }(둘레 의자). 좌석이 없는 것은 null */
    seats(it) {
      if (it.kind === '의자 배열') {
        const cols = Math.max(1, it.cols || 1), rows = Math.max(1, it.rows || 1);
        // 총 의자 수를 따로 정했으면(마지막 줄이 덜 참) 그 수
        return { cols, rows, count: it.count != null ? Math.max(1, Math.min(it.count, cols * rows)) : cols * rows };
      }
      if (it.kind === '의자') return it.category === 'event' ? { count: 1 } : null; // 가구의 의자는 좌석으로 세지 않음
      if (it.kind === '원형 테이블' || it.kind === '테이블') {
        // 예전 도면은 '의자 8개' 같은 선택 값으로 저장되어 있음
        const n = it.chairs != null ? it.chairs : parseInt((String(it.variant || '').match(/\d+/) || [0])[0], 10) || 0;
        return n ? { count: n } : null;
      }
      if (it.category !== 'event') return null;
      if (it.kind === '벤치' || it.kind === 'VIP 소파') return { count: Math.max(1, Math.floor(it.size / 600)) };
      if (it.kind === '피크닉 테이블') return { count: 6 };
      if (it.kind === '관람석') return { count: Math.max(1, it.tiers || 5) * Math.max(1, Math.floor(it.size / 500)) };
      if (it.kind === '선수 벤치') return { count: Math.max(1, Math.floor(it.size / 550)) };
      return null;
    },
    /** 의자 배열에서 세로 통로로 나뉜 묶음들: [왼쪽 끝에서 시작, 끝](mm). 묶음마다 열 수는 고르게 */
    seatBlocks(it) {
      const { cols } = catalog.seats(it);
      const aisles = Math.max(0, Math.min(it.aisles || 0, cols - 1));
      const aisleW = aisles ? it.aisleW || 1200 : 0;
      const pw = (it.size - aisles * aisleW) / cols;
      const out = [];
      let x = 0;
      for (let b = 0; b <= aisles; b++) {
        const n = Math.floor(cols / (aisles + 1)) + (b < cols % (aisles + 1) ? 1 : 0);
        out.push([x, x + n * pw, n]);
        x += n * pw + aisleW;
      }
      return out;
    },
    /** 의자 배열의 자리: 열마다 가운데 위치 xs(왼쪽 끝에서, mm), 줄 간격 ph, 줄마다 채울 열 [from, to) */
    /** 의자 배열의 좌석 번호: [{ row, no, label, x, y }] (x·y는 물건 가운데 기준 물건 안 좌표, mm).
        A열이 무대 쪽(앞, +y) 줄, 번호는 관객이 무대를 볼 때 왼쪽부터 (seatFrom 'right'면 오른쪽부터).
        관객은 +y를 보므로 관객의 왼쪽은 +x 쪽. 첫 열 글자(seatRow0)·첫 번호(seatNum0)를 바꿀 수 있음 (여러 구역 이어 붙이기) */
    seatLabels(it) {
      if (!it || it.kind !== '의자 배열') return [];
      const L = catalog.seatLayout(it);
      const rowName = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
      const r0 = /^[A-Z]$/.test(String(it.seatRow0 || 'A').toUpperCase()) ? String(it.seatRow0 || 'A').toUpperCase().charCodeAt(0) - 65 : 0;
      const n0 = Number.isInteger(it.seatNum0) && it.seatNum0 > 0 ? it.seatNum0 : 1;
      const out = [];
      for (let r = L.rows - 1, k = 0; r >= 0; r--, k++) {
        const [c0, c1] = L.rowRange(r);
        const cols = [];
        for (let c = c0; c < c1; c++) cols.push(c);
        cols.sort((a, b) => (it.seatFrom === 'right' ? L.xs[a] - L.xs[b] : L.xs[b] - L.xs[a]));
        const row = rowName(r0 + k);
        cols.forEach((c, i) => out.push({ row, no: n0 + i, label: `${row}${n0 + i}`, x: -it.size / 2 + L.xs[c], y: -it.depth / 2 + r * L.ph + L.ph * 0.3 }));
      }
      return out;
    },
    seatLayout(it) {
      const { cols, rows, count } = catalog.seats(it);
      const blocks = catalog.seatBlocks(it);
      const pw = (blocks[0][1] - blocks[0][0]) / blocks[0][2];
      const xs = [];
      blocks.forEach(([x0, , n]) => { for (let i = 0; i < n; i++) xs.push(x0 + (i + 0.5) * pw); });
      // 덜 찬 줄은 맨 뒷줄(등 쪽, 0번 줄)에 가운데로
      const last = count - cols * (rows - 1);
      const from = Math.floor((cols - last) / 2);
      return { cols, rows, count, xs, pw, ph: it.depth / rows, rowRange: (r) => (r === 0 && last < cols ? [from, from + last] : [0, cols]) };
    },
    /** 3D 높이(mm): 물건마다 고친 값, 없으면 종류의 기본값 */
    itemHeight3(it) {
      const def = catalog.itemDef(it.kind) || {};
      return it.h3 != null ? it.h3 : def.h3 || 800;
    },
    /** 폭×깊이가 규격 목록의 하나와 같으면 그 이름 (예: 퀸, 4way) */
    sizeName(it) {
      const def = catalog.itemDef(it.kind);
      const hit = def && def.sizes && def.sizes.find(([, w, d]) => w === it.size && d === it.depth);
      return hit ? hit[0] : '';
    },
    /** 영역을 칠할 색: 바닥 종류(잔디·아스팔트 등)가 있으면 그 색, 없으면(색만·카펫) 영역 색 */
    surfaceColor(z) {
      const s = z.surface && SURFACES.find((x) => x[0] === z.surface);
      return (s && s[2]) || z.color;
    },
    surfaceName(z) {
      const s = z.surface && SURFACES.find((x) => x[0] === z.surface);
      return s ? s[1] : '';
    },
    /** 선 분류에 맞는 레이어: 전선관은 전기, 나머지는 설비 */
    lineLayer(category) {
      return category === '전선관' ? 'elec' : 'mech';
    },
    colorName(hex) {
      const c = COLORS.find(([h]) => h === hex);
      return c ? c[1] : hex;
    },

    /** 새 도면의 기본 목록 */
    defaultElements() {
      const T = App.model.TYPES;
      return [
        ...DEFAULT_WALL_TYPES.map((p) => T.wallType.create(p)),
        ...DEFAULT_PRESETS.map(([kind, p]) => T.preset.create(kind, p)),
      ];
    },

    /** 벽 종류의 전체 두께(mm) */
    thickness(t) {
      return (t.base || 0) + (t.frameKind !== 'none' ? t.frameDepth : 0) + t.boardT * (t.boardFace + t.boardBack);
    },

    typeOf(wall) {
      const t = wall.typeId && App.doc.get(wall.typeId);
      return t && t.type === 'wallType' ? t : null;
    },
    wallTypes() {
      return [...App.doc.all()].filter((e) => e.type === 'wallType');
    },
    presets(kind) {
      return [...App.doc.all()].filter((e) => e.type === 'preset' && e.kind === kind);
    },
    /** 이 벽 종류를 쓰는 벽 수 */
    usage(typeId) {
      let n = 0;
      for (const el of App.doc.all()) if (el.type === 'wall' && el.typeId === typeId) n++;
      return n;
    },
    /** 한쪽만 마감하는 종류인지 (뒤집기 버튼이 필요한지) */
    isOneSided(t) {
      return t.boardFace !== t.boardBack || (t.frameKind !== 'none' && t.base > 0);
    },

    /** 한 줄 설명: '다루끼 30 @450 · 석고 9.5T 양면 1겹 · 49 mm' */
    describe(t) {
      const parts = [];
      if (t.base > 0) parts.push(`기존 벽 ${num(t.base)}`);
      if (t.frameKind !== 'none') parts.push(`${FRAME_NAMES[t.frameKind]} ${num(t.frameDepth)} @${num(t.frameSpacing)}`);
      const f = t.boardFace, b = t.boardBack;
      if (f || b) {
        const layers = f === b ? `양면 ${f}겹` : !b ? `한쪽 ${f}겹` : !f ? `반대쪽 ${b}겹` : `${f}+${b}겹`;
        parts.push(`석고 ${num(t.boardT)}T ${layers}`);
      }
      parts.push(App.units.formatLength(catalog.thickness(t)));
      return parts.join(' · ');
    },
    describePreset(p) {
      if (p.kind === 'finish') {
        const unit = p.unitW > 0 && p.unitL > 0 ? ` · 한 장 ${num(p.unitW)}×${num(p.unitL)}` : ' · 면적만';
        return p.target === 'wall' ? `벽 · 바닥에서 ${num(p.from || 0)} 위로 천장까지${unit}` : `바닥 (안목)${unit}`;
      }
      if (p.kind === 'line') {
        const run = p.runHeight == null ? '천장' : p.runHeight === 0 ? '바닥' : `높이 ${num(p.runHeight)}`;
        return `${p.category} · ${p.category === '덕트' ? `폭 ${num(p.size)}` : catalog.colorName(p.color)} · ${run}`;
      }
      if (p.kind === 'column') {
        return p.shape === 'circle' ? `원형 Ø${num(p.width)}` : `사각 ${num(p.width)}×${num(p.depth)}`;
      }
      const size = `${num(p.width)}×${num(p.height)}`;
      return p.kind === 'window' ? `${p.style} ${size} · 하단 ${num(p.sill)}` : `${p.style} ${size}`;
    },

    /** 기본 마감재 목록 (예전에 만든 도면에 마감재가 없으면 넣음) */
    defaultFinishes() {
      return DEFAULT_PRESETS.filter(([kind]) => kind === 'finish').map(([kind, p]) => App.model.TYPES.preset.create(kind, p));
    },
    finishes(target) {
      return catalog.presets('finish').filter((p) => !target || p.target === target);
    },

    /** 도구가 쓸 '지금 고른' 벽 종류·프리셋이 없어졌으면 목록의 첫 항목으로 */
    ensureCurrent() {
      const cur = (App.current = App.current || {});
      const valid = (id, ok) => id && App.doc.has(id) && ok(App.doc.get(id));
      if (!valid(cur.wallTypeId, (e) => e.type === 'wallType')) cur.wallTypeId = (catalog.wallTypes()[0] || {}).id || null;
      ['door', 'window', 'column', 'line'].forEach((kind) => {
        const key = `${kind}PresetId`;
        if (!valid(cur[key], (e) => e.type === 'preset' && e.kind === kind)) cur[key] = (catalog.presets(kind)[0] || {}).id || null;
      });
      if (!cur.elecKind) cur.elecKind = '콘센트';
      if (!cur.mechKind) cur.mechKind = '에어컨 실내기';
      if (!cur.furnKind || !ITEM_KINDS.furn.some((d) => d.kind === cur.furnKind)) cur.furnKind = '침대';
      if (!FURN_CATS.includes(cur.furnCat)) cur.furnCat = (ITEM_KINDS.furn.find((d) => d.kind === cur.furnKind) || {}).cat || FURN_CATS[0];
      if (!cur.eventKind || !catalog.itemDef(cur.eventKind)) cur.eventKind = '몽골텐트';
      if (!EVENT_CATS.includes(cur.eventCat)) cur.eventCat = (catalog.itemDef(cur.eventKind) || {}).cat || EVENT_CATS[0];
      if (!App.routes.KINDS.some((k) => k.kind === cur.routeKind)) cur.routeKind = App.routes.KINDS[0].kind;
      if (cur.zoneSurface == null) cur.zoneSurface = '';
      if (!cur.zoneColor) cur.zoneColor = '#7048e8'; // 선택 표시(주황)·방 바닥(파랑)과 헷갈리지 않는 보라
      if (!cur.textSize) cur.textSize = '200';
      if (!['clear', 'center', 'free'].includes(cur.dimMode)) cur.dimMode = 'clear';
    },

    /** 이번 변경에 들어 있는 요소 종류들 */
    touchedTypes(tx) {
      const types = new Set();
      for (const [id, before] of tx.before) {
        const now = App.doc.get(id);
        types.add((now || before || {}).type);
      }
      return types;
    },

    /** 기록 직전 훅: 벽이 없어진 문·창문은 지우고, 벽 두께를 벽 종류에, 선 분류·레이어를 선 종류에 맞추고,
        벽에 붙은 기호를 벽 위치에 다시 맞춤 (같은 실행 취소 단계) */
    syncHook(tx) {
      const types = catalog.touchedTypes(tx);
      const walls = types.has('wall') || types.has('wallType');
      const lines = types.has('line') || types.has('preset');
      const items = walls || types.has('item');
      if (!walls && !lines && !items) return;
      for (const el of [...App.doc.all()]) {
        if (walls && (el.type === 'door' || el.type === 'window') && !App.doc.has(el.wallId)) App.doc.remove(el.id);
        if (walls && el.type === 'wall') {
          const t = catalog.typeOf(el);
          if (t && el.thickness !== catalog.thickness(t)) App.doc.update(el.id, { thickness: catalog.thickness(t) });
        }
      }
      for (const el of [...App.doc.all()]) {
        if (items && el.type === 'item' && el.wallId) {
          const w = App.doc.get(el.wallId);
          if (!w || G_dist(w.start, w.end) < 1) {
            App.doc.update(el.id, { wallId: null, t: null, side: null }); // 벽이 없어지면 그 자리에 남김
          } else {
            const def = catalog.itemDef(el.kind) || { aspect: 1 };
            const m = App.model.mountPoint(w, el.t, el.side, el.depth != null ? el.depth : el.size * def.aspect);
            if (Math.abs(m.x - el.x) > 0.01 || Math.abs(m.y - el.y) > 0.01 || m.rotation !== el.rotation) App.doc.update(el.id, m);
          }
        }
        if (lines && el.type === 'line') {
          const p = App.doc.get(el.presetId);
          if (p && (el.category !== p.category || el.layer !== catalog.lineLayer(p.category))) {
            App.doc.update(el.id, { category: p.category, layer: catalog.lineLayer(p.category) });
          }
        }
      }
    },

    /** 방 경계를 맞춘 뒤 실행: 아이템·기둥이 들어 있는 방을 room에 기록 (방별 집계용) */
    roomHook(tx) {
      const types = catalog.touchedTypes(tx);
      if (!['item', 'column', 'room', 'wall'].some((t) => types.has(t))) return;
      const rooms = [...App.doc.all()].filter((e) => e.type === 'room');
      for (const el of [...App.doc.all()]) {
        if (el.type !== 'item' && el.type !== 'column') continue;
        let best = null, bestArea = Infinity;
        rooms.forEach((r) => {
          if (!App.geom.pointInPolygon({ x: el.x, y: el.y }, r.points)) return;
          const a = Math.abs(App.geom.signedArea(r.points));
          if (a < bestArea) { best = r.id; bestArea = a; }
        });
        if (el.room !== best) App.doc.update(el.id, { room: best });
      }
    },
  };

  App.catalog = catalog;
})();
