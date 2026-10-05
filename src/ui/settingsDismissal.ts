/** Dismiss settings without letting the same gesture activate the page beneath. */
export function bindSettingsDismissal(panel: HTMLDetailsElement) {
  const document = panel.ownerDocument;
  const window = document.defaultView;
  let dismissedPointer: { id: number; down: boolean } | null = null;
  const active = () => panel.open && panel.getClientRects().length > 0 &&
    !panel.parentElement?.closest('details[data-settings-popover][open]');
  const inside = (event: Event) => event.composedPath().includes(panel);
  const consume = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const close = () => { panel.open = false; };
  const pointerdown = (event: PointerEvent) => {
    // A fresh gesture must not inherit suppression from a cancelled old click.
    if (dismissedPointer?.down) { consume(event); return; }
    dismissedPointer = null;
    if (!active() || inside(event)) return;
    dismissedPointer = { id: event.pointerId, down: true };
    close(); consume(event);
  };
  const pointerup = (event: PointerEvent) => {
    if (dismissedPointer?.id !== event.pointerId) return;
    dismissedPointer.down = false; consume(event);
  };
  const pointercancel = (event: PointerEvent) => {
    if (dismissedPointer?.id === event.pointerId) dismissedPointer = null;
  };
  const click = (event: MouseEvent) => {
    if (dismissedPointer && (event.detail > 0 ||
      ('pointerId' in event && event.pointerId === dismissedPointer.id))) {
      dismissedPointer = null; consume(event); return;
    }
    if (!active() || inside(event)) return;
    close(); consume(event);
  };
  const keydown = (event: KeyboardEvent) => {
    if (!active() || event.key !== 'Escape') return;
    dismissedPointer = null; close(); consume(event);
    panel.querySelector<HTMLElement>(':scope > summary')?.focus();
  };
  const reset = () => { dismissedPointer = null; if (active()) close(); };
  document.addEventListener('pointerdown', pointerdown, { capture: true, passive: false });
  document.addEventListener('pointerup', pointerup, { capture: true, passive: false });
  document.addEventListener('pointercancel', pointercancel, true);
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', keydown, true);
  window?.addEventListener('resize', reset);
  window?.addEventListener('blur', reset);
  return () => {
    document.removeEventListener('pointerdown', pointerdown, { capture: true });
    document.removeEventListener('pointerup', pointerup, { capture: true });
    document.removeEventListener('pointercancel', pointercancel, { capture: true });
    document.removeEventListener('click', click, { capture: true });
    document.removeEventListener('keydown', keydown, { capture: true });
    window?.removeEventListener('resize', reset);
    window?.removeEventListener('blur', reset);
    dismissedPointer = null;
  };
}
