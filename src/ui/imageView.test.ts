import { expect, it } from 'vitest';
import { clampView, fitView, imageGeometry, panBy, updatePair, wheelFactor, zoomAt } from './imageView';
it('fits portrait and landscape without stretching or upscaling', () => {
  const g = imageGeometry(600, 400, 1200, 800);
  expect(g.width / g.height).toBe(1.5); expect(g.height).toBe(376);
  expect(imageGeometry(600, 400, 100, 100).fit).toBe(1);
  expect(clampView({ zoom: 1, x: 1, y: 0 }, g)).toEqual(fitView());
});
it('keeps the image point under the mouse stationary while zooming', () => {
  const g = imageGeometry(600, 400, 1200, 800); const pointer = { x: 420, y: 250 };
  const a = { zoom: 2, x: .5, y: .5 }; const b = zoomAt(a, 3, pointer, g);
  const pointInImage = (v: typeof a) => [v.x + (pointer.x - 300) / (g.width * v.zoom), v.y + (pointer.y - 200) / (g.height * v.zoom)];
  expect(pointInImage(b)[0]).toBeCloseTo(pointInImage(a)[0]); expect(pointInImage(b)[1]).toBeCloseTo(pointInImage(a)[1]);
  const restored = zoomAt(b, 2, pointer, g); expect(restored.x).toBeCloseTo(a.x); expect(restored.y).toBeCloseTo(a.y);
});
it('limits panning to image edges and recenters when returning to full image', () => {
  const g = imageGeometry(600, 400, 1200, 800); const moved = panBy({ zoom: 3, x: .5, y: .5 }, 100, -60, g);
  expect(moved.x).toBeLessThan(.5); expect(moved.y).toBeGreaterThan(.5);
  const edge = panBy(moved, 99999, 99999, g);
  expect(edge.x).toBeCloseTo(600 / (2 * g.width * 3));
  expect(zoomAt(edge, .1, { x: 300, y: 200 }, g)).toEqual(fitView());
  expect(clampView({ ...moved, zoom: Infinity }, g).zoom).toBe(16);
});
it('supports 1:1 even for very large source images', () => {
  const g = imageGeometry(300, 200, 10000, 10000);
  expect(zoomAt(fitView(), 1 / g.fit, { x: 150, y: 100 }, g).zoom * g.fit).toBeCloseTo(1);
});
it('normalizes wheel pixels, lines and pages with bounded steps', () => {
  expect(wheelFactor(16, 0, 400)).toBe(wheelFactor(1, 1, 400));
  expect(wheelFactor(100, 0, 100)).toBe(wheelFactor(1, 2, 100));
  expect(wheelFactor(-120, 0, 400)).toBeGreaterThan(1);
  expect(wheelFactor(99999, 0, 400)).toBeGreaterThan(.5);
});
it('linked gestures update both images; independent gestures preserve the other view', () => {
  const original: [ReturnType<typeof fitView>, ReturnType<typeof fitView>] = [fitView(), fitView()]; const next = { zoom: 3, x: .4, y: .6 };
  expect(updatePair(original, 1, next, true)).toEqual([next, next]);
  expect(updatePair(original, 1, next, false)).toEqual([fitView(), next]);
  expect(original).toEqual([fitView(), fitView()]);
});
