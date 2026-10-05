import { expect, it } from 'vitest';
import { bindSettingsDismissal } from './settingsDismissal';

function setup() {
  const view = new EventTarget();
  const document = Object.assign(new EventTarget(), { defaultView: view });
  let visible = true; let parentOpen = false; let focused = false;
  const panel = {
    open: true, ownerDocument: document,
    getClientRects: () => visible ? [{}] : [],
    parentElement: { closest: () => parentOpen ? {} : null },
    querySelector: () => ({ focus: () => { focused = true; } }),
  } as unknown as HTMLDetailsElement;
  const cleanup = bindSettingsDismissal(panel);
  const send = (type: string, inside = false, fields = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, detail: 1, ...fields });
    Object.defineProperty(event, 'composedPath', { value: () => inside ? [panel] : [] });
    document.dispatchEvent(event); return event;
  };
  return { panel, document, view, send, cleanup, setVisible: (value: boolean) => { visible = value; }, setParent: (value: boolean) => { parentOpen = value; }, focused: () => focused };
}
it('consumes the outside down/up/click so the closing gesture cannot activate an underlying vote', () => {
  const s = setup(); let votes = 0;
  s.document.addEventListener('click', () => votes++);
  expect(s.send('pointerdown').defaultPrevented).toBe(true);
  expect(s.panel.open).toBe(false);
  expect(s.send('pointerup').defaultPrevented).toBe(true);
  expect(s.send('click').defaultPrevented).toBe(true);
  expect(votes).toBe(0);
  s.send('pointerdown'); s.send('pointerup'); s.send('click');
  expect(votes).toBe(1); s.cleanup();
});
it('leaves internal controls and the original summary toggle available', () => {
  const s = setup();
  for (const type of ['pointerdown', 'pointerup', 'click']) expect(s.send(type, true).defaultPrevented).toBe(false);
  expect(s.panel.open).toBe(true); s.cleanup();
});
it('dismisses click-only outside activation and does not leave suppression behind', () => {
  const s = setup();
  expect(s.send('click', false, { detail: 0, pointerId: -1 }).defaultPrevented).toBe(true);
  expect(s.panel.open).toBe(false);
  expect(s.send('click', false, { detail: 0, pointerId: -1 }).defaultPrevented).toBe(false);
  s.cleanup();
});
it('Escape closes and returns focus to the settings summary without swallowing other keys', () => {
  const s = setup();
  expect(s.send('keydown', true, { key: 'ArrowRight' }).defaultPrevented).toBe(false);
  expect(s.panel.open).toBe(true);
  expect(s.send('keydown', true, { key: 'Escape' }).defaultPrevented).toBe(true);
  expect(s.panel.open).toBe(false); expect(s.focused()).toBe(true); s.cleanup();
});
it('lets the containing settings panel own dismissal instead of consuming only its nested sound panel', () => {
  const s = setup(); s.setParent(true);
  expect(s.send('pointerdown').defaultPrevented).toBe(false);
  expect(s.panel.open).toBe(true); s.cleanup();
});
it('does not intercept interactions while settings are closed or hidden by a containing details', () => {
  const s = setup(); s.setVisible(false);
  expect(s.send('pointerdown').defaultPrevented).toBe(false);
  s.panel.open = false; s.setVisible(true);
  expect(s.send('click').defaultPrevented).toBe(false); s.cleanup();
});
it('resets after pointer cancellation and does not swallow a later keyboard activation', () => {
  const s = setup(); s.send('pointerdown'); s.send('pointercancel');
  expect(s.send('click', false, { detail: 0, pointerId: -1 }).defaultPrevented).toBe(false);
  s.cleanup();
});
it('closes on rotation/resize and removes listeners on layout unmount', () => {
  const s = setup(); s.view.dispatchEvent(new Event('resize'));
  expect(s.panel.open).toBe(false);
  s.panel.open = true; s.cleanup();
  expect(s.send('pointerdown').defaultPrevented).toBe(false);
  expect(s.panel.open).toBe(true);
});
