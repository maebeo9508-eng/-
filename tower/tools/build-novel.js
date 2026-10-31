#!/usr/bin/env node
// docs/novel/*.md 소설 원고를 게임 속 "이야기" 창에서 읽을 수 있게 js/data/novel.js 로 변환합니다.
// 사용법: node tower/tools/build-novel.js
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const dir = path.join(root, 'docs', 'novel');
const out = path.join(root, 'tower', 'js', 'data', 'novel.js');

const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => /^\d\d_.*\.md$/.test(f)).sort()
  : [];

const chapters = files.map((f) => {
  const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const titleLine = lines.find((l) => l.startsWith('# ')) || f;
  const title = titleLine.replace(/^#\s*/, '').trim();
  const body = lines.filter((l) => !l.startsWith('# ') && !/^-{3,}$/.test(l.trim()));
  const paras = body
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, ' ').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^>\s?/, '').trim())
    .filter(Boolean);
  return { title, paras };
});

const js = `'use strict';
// 자동 생성 파일 — 직접 고치지 말고 docs/novel/*.md 를 고친 뒤
//   node tower/tools/build-novel.js
// 를 실행하세요.
G.NOVEL = ${JSON.stringify(chapters, null, 1)};
`;
fs.writeFileSync(out, js);
console.log(`novel.js: ${chapters.length}개 장, ${chapters.reduce((a, c) => a + c.paras.length, 0)}개 문단`);
