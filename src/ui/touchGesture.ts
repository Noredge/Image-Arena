import { panBy, zoomAt, type ImageGeometry, type ImageView } from './imageView';
export type TouchPoint = { x: number; y: number };
export function pinchView(view: ImageView, start: [TouchPoint, TouchPoint], next: [TouchPoint, TouchPoint], geometry: ImageGeometry): ImageView {
  const midpoint = (p: [TouchPoint, TouchPoint]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
  const distance = (p: [TouchPoint, TouchPoint]) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
  if (distance(start) < 8) return view;
  const a = midpoint(start), b = midpoint(next);
  return panBy(zoomAt(view, view.zoom * distance(next) / distance(start), a, geometry), b.x - a.x, b.y - a.y, geometry);
}
