#!/usr/bin/env node
'use strict';
// 코드로 그린 캐릭터를 참고 그림(PNG)으로 내보내요. AI에게 "이 모양·이 색으로" 그려 달라고 함께 보내는 그림이에요.
//   node tower/tools/export-refs.js            → 전부
//   node tower/tools/export-refs.js hero slime → 일부만
// 결과: tower/assets/refs/<키>.png (512×512, 마젠타 배경 — AI가 배경을 그대로 따라 그리면 가져오기 도구가 지우기 쉬워요)
// Playwright(크로미움)가 필요해요: npm i -g playwright 또는 이 저장소의 개발 환경.

const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* 전역 설치 확인 */ }
  const root = require('child_process').execSync('npm root -g').toString().trim();
  return require(path.join(root, 'playwright'));
}

(async () => {
  const { chromium } = loadPlaywright();
  const outDir = path.join(__dirname, '../assets/refs');
  fs.mkdirSync(outDir, { recursive: true });
  const exe = process.env.CHROMIUM_PATH; // 다른 크로미움을 쓰려면 경로를 지정
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'gallery.html'));
  await page.waitForFunction(() => typeof window.renderRef === 'function');
  const all = await page.evaluate(() => window.rosterKeys());
  const want = process.argv.slice(2);
  const keys = all.filter((k) => !want.length || want.includes(k.key));
  for (const k of keys) {
    const url = await page.evaluate((key) => window.renderRef(key, 512, '#ff00ff'), k.key);
    if (!url) continue;
    const png = Buffer.from(url.split(',')[1], 'base64');
    fs.writeFileSync(path.join(outDir, k.key + '.png'), png);
  }
  await browser.close();
  console.log(`참고 그림 ${keys.length}장 → tower/assets/refs/`);
})().catch((e) => { console.error(e); process.exit(1); });
