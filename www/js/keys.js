/* 키보드 단축키 (PC).
   글자 키는 e.code로 판단해 한글 입력 상태에서도 동작 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  function init() {
    document.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
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
        }
        return;
      }
      if (e.altKey || e.repeat) return;
      if (!document.getElementById('catalogModal').hidden) return; // 목록 편집 창이 열려 있으면 도면 단축키 끔

      if (e.key === 'Escape') {
        if (!App.tools.escape() && App.tools.id !== 'select') App.ui.setTool('select');
      } else if (e.key === 'Enter') {
        App.tools.finish();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        App.actions.deleteSelection();
      } else if (e.code === 'KeyQ') {
        App.actions.rotateSelection(); // 고른 아이템 90도 돌리기
      } else if (/^Key[A-Z]$/.test(e.code)) {
        const letter = e.code.slice(3);
        const tool = App.ui.TOOLS.find((t) => t.key === letter);
        if (tool) App.ui.pickTool(tool.id);
      }
    });
  }

  App.keys = { init };
})();
