/* 단위 변환과 숫자 표시. 내부 값은 항상 mm, 화면 표시만 설정 단위로 바꾼다.
   단위 설정 화면은 7단계. 지금은 기본값(mm, 소수점 0자리)으로 동작 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const LENGTH = {
    mm: { factor: 1, label: 'mm', inputDigits: 1 },
    cm: { factor: 10, label: 'cm', inputDigits: 2 },
    m: { factor: 1000, label: 'm', inputDigits: 4 },
    ft: { factor: 304.8, label: 'ft', inputDigits: 4 },
  };

  const unit = () => LENGTH[App.settings.lengthUnit] || LENGTH.mm;

  const units = {
    lengthLabel() {
      return unit().label;
    },

    /** 화면 표시용: 천 단위 쉼표, 설정한 소수점 자리 */
    formatLength(mm, withUnit = true) {
      const d = App.settings.decimals;
      const v = (mm / unit().factor) || 0;
      const s = v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
      return withUnit ? `${s} ${unit().label}` : s;
    },

    /** 입력 칸용: 쉼표 없이, 편집해도 값이 뭉개지지 않을 만큼의 자리수 */
    inputLength(mm) {
      const v = mm / unit().factor;
      return String(Number(v.toFixed(unit().inputDigits)));
    },

    /** 입력 칸 글자 → mm. 숫자가 아니면 NaN */
    parseLength(text) {
      const s = String(text).replace(/[,\s]/g, '');
      if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
      return Number(s) * unit().factor;
    },
  };

  App.units = units;
})();
