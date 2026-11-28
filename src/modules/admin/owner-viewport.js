export function installOwnerViewport(navigation) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement;
  const header = document.querySelector('header.top');
  let frame = 0;

  function update() {
    frame = 0;
    const field = document.activeElement;
    const keyboard = root.hasAttribute('data-adm-geral-layout') &&
      Math.abs(viewport.scale - 1) < 0.05 &&
      root.clientHeight - viewport.height > 90 &&
      field.matches('textarea, input:not([type=hidden], [type=radio], [type=checkbox], [type=file])');
    root.toggleAttribute('data-adm-geral-keyboard', keyboard);
    if (!keyboard) {
      root.style.removeProperty('--adm-keyboard-bottom');
      root.style.removeProperty('--adm-viewport-height');
      return;
    }

    const bottomInset = Math.max(0, root.clientHeight - viewport.height - viewport.offsetTop);
    root.style.setProperty('--adm-keyboard-bottom', bottomInset + 'px');
    root.style.setProperty('--adm-viewport-height', viewport.height + 'px');

    if (field.closest('dialog[open], [role="dialog"]')) {
      field.scrollIntoView({block: 'nearest', inline: 'nearest'});
      return;
    }
    const bounds = field.getBoundingClientRect();
    const top = Math.max(viewport.offsetTop, header.getBoundingClientRect().bottom) + 10;
    const bottom = navigation.getBoundingClientRect().top - 10;
    const delta = bounds.bottom > bottom ? bounds.bottom - bottom : Math.min(0, bounds.top - top);
    if (Math.abs(delta) > 1) window.scrollBy({top: delta, behavior: 'instant'});
  }

  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(update);
  }

  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
}
