export type ImageView = { zoom: number; x: number; y: number };
export type ImageGeometry = { boxWidth: number; boxHeight: number; width: number; height: number; fit: number };
export const fitView = (): ImageView => ({ zoom: 1, x: .5, y: .5 });
export function imageGeometry(boxWidth: number, boxHeight: number, width: number, height: number): ImageGeometry {
  const fit = Math.min(Math.max(1, boxWidth - 24) / width, Math.max(1, boxHeight - 24) / height, 1);
  return { boxWidth, boxHeight, width: width * fit, height: height * fit, fit };
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function clampView(view: ImageView, g: ImageGeometry): ImageView {
  const zoom = clamp(view.zoom, 1, Math.max(16, 1 / g.fit));
  const bound = (focus: number, box: number, image: number) => {
    const margin = Math.min(.5, box / (2 * image * zoom));
    return clamp(focus, margin, 1 - margin);
  };
  return { zoom, x: bound(view.x, g.boxWidth, g.width), y: bound(view.y, g.boxHeight, g.height) };
}
export function zoomAt(view: ImageView, zoom: number, point: { x: number; y: number }, g: ImageGeometry): ImageView {
  const current = clampView(view, g); const target = clamp(zoom, 1, Math.max(16, 1 / g.fit));
  const dx = point.x - g.boxWidth / 2; const dy = point.y - g.boxHeight / 2;
  return clampView({ zoom: target,
    x: current.x + dx / g.width * (1 / current.zoom - 1 / target),
    y: current.y + dy / g.height * (1 / current.zoom - 1 / target),
  }, g);
}
export function panBy(view: ImageView, dx: number, dy: number, g: ImageGeometry): ImageView {
  const current = clampView(view, g);
  return clampView({ ...current, x: current.x - dx / (g.width * current.zoom), y: current.y - dy / (g.height * current.zoom) }, g);
}
export function wheelFactor(delta: number, mode: number, pageHeight: number) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
  return Math.exp(-clamp(pixels, -240, 240) * .0025);
}
export function updatePair(views: [ImageView, ImageView], side: number, next: ImageView, linked: boolean): [ImageView, ImageView] {
  return linked ? [{ ...next }, { ...next }] : side === 0 ? [{ ...next }, views[1]] : [views[0], { ...next }];
}
