/** A touch tap opens details; a scroll, cancellation or second finger never does. */
export class TouchTap {
  private point: { id: number; x: number; y: number; cancelled: boolean } | null = null;
  start(id: number, x: number, y: number) { this.point = { id, x, y, cancelled: false }; }
  has(id: number) { return this.point?.id === id; }
  move(id: number, x: number, y: number) {
    const point = this.point;
    if (point?.id === id && Math.hypot(x - point.x, y - point.y) >= 8) point.cancelled = true;
  }
  cancel() { if (this.point) this.point.cancelled = true; }
  release(id: number) {
    if (this.point?.id !== id) return false;
    const tapped = !this.point.cancelled; this.point = null; return tapped;
  }
  reset() { this.point = null; }
}
