import { expect, it } from 'vitest';
import { fitView, imageGeometry, panBy } from './imageView';
import { pinchView } from './touchGesture';
const g = imageGeometry(400, 600, 800, 1200);
it('doubles zoom around the two-finger midpoint without stretching', () => {
  const next = pinchView(fitView(), [{ x: 150, y: 300 }, { x: 250, y: 300 }], [{ x: 100, y: 300 }, { x: 300, y: 300 }], g);
  expect(next).toEqual({ zoom: 2, x: .5, y: .5 });
});
it('combines two-finger translation with zoom and preserves direction', () => {
  const next = pinchView({ zoom: 2, x: .5, y: .5 }, [{ x: 150, y: 300 }, { x: 250, y: 300 }], [{ x: 180, y: 260 }, { x: 280, y: 260 }], g);
  expect(next).toEqual(panBy({ zoom: 2, x: .5, y: .5 }, 30, -40, g));
});
it('recenters at full contain view and clamps oversized zoom', () => {
  const a = [{ x: 150, y: 300 }, { x: 250, y: 300 }] as const;
  expect(pinchView({ zoom: 2, x: .5, y: .5 }, [...a], [{ x: 199, y: 300 }, { x: 201, y: 300 }], g)).toEqual(fitView());
  expect(pinchView(fitView(), [...a], [{ x: -10000, y: 300 }, { x: 10000, y: 300 }], g).zoom).toBe(16);
});
it('ignores nearly coincident starting fingers rather than dividing by zero', () => {
  const view = fitView();
  expect(pinchView(view, [{ x: 200, y: 300 }, { x: 201, y: 300 }], [{ x: 0, y: 0 }, { x: 400, y: 600 }], g)).toBe(view);
});
