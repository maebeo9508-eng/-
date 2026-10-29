/* 키보드 단축키 (PC).
   글자 키는 e.code로 판단해 한글 입력 상태에서도 동작 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  function init() {
    document.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      if (!document.getElementById('dialog').hidden) return; // 확인 창이 떠 있으면 그 창의 키만
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && !e.altKey) {
        if (e.code === 'KeyZ' && !e.shiftKey) {
          e.preventDefault();
          App.actions.undo();
        } else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
          e.preventDefault();
          App.actions.redo();
        } else if (e.code === 'KeyG') {
          e.preventDefault();
          if (e.shiftKey) App.actions.ungroupSelection();
          else App.actions.groupSelection();
        } else if (e.code === 'KeyC' && !e.shiftKey) {
          if (App.selection.size) {
            e.preventDefault();
            App.edit.copy();
          }
        } else if (e.code === 'KeyV') {
          e.preventDefault();
          App.edit.paste(e.shiftKey); // Shift: 제자리에
        } else if (e.code === 'KeyD') {
          e.preventDefault();
          App.edit.duplicate();
        } else if (e.code === 'KeyF') {
          e.preventDefault();
          App.edit.search();
        } else if (e.code === 'KeyA') {
          e.preventDefault();
          if (App.tools.id !== 'select') App.ui.setTool('select');
          App.selection.set([...App.doc.all()].filter((el) => {
            const t = App.model.TYPES[el.type];
            return t && !t.catalog && el.type !== 'underlay' && App.layers.visible(el);
          }).map((el) => el.id));
        }
        return;
      }
      if (e.altKey) return;
      if (document.querySelector('.modal:not([hidden])')) return; // 목록 편집·설정 창이 열려 있으면 도면 단축키 끔
      // 화살표: 격자 한 칸씩 옮기기 (Shift: 열 칸). 누르고 있으면 계속
      if (e.key.startsWith('Arrow') && App.selection.size && App.tools.id === 'select') {
        e.preventDefault();
        const step = (App.settings.gridSize || 100) * (e.shiftKey ? 10 : 1);
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        App.edit.nudge(d[0], d[1]);
        return;
      }
      if (e.repeat) return;

      // 이어 그리는 중에 숫자를 누르면 길이 입력 칸이 열림
      if (/^[0-9.]$/.test(e.key) && App.ui.openLength(e.key)) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        if (!App.tools.escape() && App.tools.id !== 'select') App.ui.setTool('select');
      } else if (e.key === 'Enter') {
        App.tools.finish();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        App.actions.deleteSelection();
      } else if (e.key === '?') {
        App.edit.shortcuts();
      } else if (e.code === 'KeyQ') {
        App.actions.rotateSelection(); // 고른 것 90도 돌리기
      } else if (/^Key[A-Z]$/.test(e.code)) {
        const letter = e.code.slice(3);
        const tool = App.ui.TOOLS.find((t) => t.key === letter);
        if (tool) App.ui.pickTool(tool.id);
      }
    });
  }

  App.keys = { init };
})();
