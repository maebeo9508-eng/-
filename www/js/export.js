/* 파일로 내보내기: 브라우저 다운로드 (Capacitor 앱에서의 저장은 13단계에서 연결) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  /** 엑셀에서 수식으로 읽히지 않게, 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감쌈 */
  function csvCell(v) {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  const exporter = {
    /** 표 → CSV 글자. 엑셀이 한글을 UTF-8로 읽도록 맨 앞에 BOM */
    csvText(rows) {
      return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    },

    /** 파일 이름에 붙일 날짜: 20261029-1630 */
    stamp(d = new Date()) {
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    },

    download(filename, data, mime) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };

  App.exporter = exporter;
})();
