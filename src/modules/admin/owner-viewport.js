export function installOwnerViewport(navigation) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement;
  let frame = 0;

  function update() {
    frame = 0;
    const field = document.activeElement;
    const keyboard = root.hasAttribute('data-adm-geral-layout') &&
      Math.abs(viewport.scale - 1) < 0.05 &&
      root.clientHeight - viewport.height > 90 &&
      field?.matches('textarea, input:not([type=hidden], [type=radio], [type=checkbox], [type=file])');
    root.toggleAttribute('data-adm-geral-keyboard', keyboard);
    if (!keyboard) {
      root.style.removeProperty('--adm-keyboard-bottom');
      root.style.removeProperty('--adm-viewport-height');
      return;
    }

    const bottomInset = Math.max(0, root.clientHeight - viewport.height - viewport.offsetTop);
    root.style.setProperty('--adm-keyboard-bottom', bottomInset + 'px');
    root.style.setProperty('--adm-viewport-height', viewport.height + 'px');

    // Let Safari position the focused field; scrolling on every viewport event
    // feeds back into visualViewport.scroll while the keyboard animates.

  }

  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(update);
  }

  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
}
