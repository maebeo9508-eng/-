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

  // 면적은 항상 mm² 값에서 바로 바꾼다 (반올림 오차 방지). 1평 = 3.305785㎡
  const AREA = {
    '㎡': { factor: 1e6, label: '㎡' },
    '평': { factor: 3.305785e6, label: '평' },
    'ft²': { factor: 304.8 * 304.8, label: 'ft²' },
  };

  const unit = () => LENGTH[App.settings.lengthUnit] || LENGTH.mm;
  const areaUnit = () => AREA[App.settings.areaUnit] || AREA['㎡'];
  const fixed = (v) => {
    const d = App.settings.decimals;
    return (v || 0).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  };

  const units = {
    lengthLabel() {
      return unit().label;
    },

    /** 화면 표시용: 천 단위 쉼표, 설정한 소수점 자리 */
    formatLength(mm, withUnit = true) {
      const s = fixed(mm / unit().factor);
      return withUnit ? `${s} ${unit().label}` : s;
    },

    /** 면적(mm²) 표시 */
    formatArea(mm2, withUnit = true) {
      const s = fixed(mm2 / areaUnit().factor);
      return withUnit ? `${s} ${areaUnit().label}` : s;
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
