import { t } from '../i18n';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Picture } from '../platform/browser';
import { clampView, fitView, imageGeometry, panBy, wheelFactor, zoomAt, type ImageView } from './imageView';
import { pinchView, type TouchPoint } from './touchGesture';
import { TouchTap } from './touchTap';
type Props = {
  picture: Picture; view: ImageView; onView: (view: ImageView) => void;
  disabled?: boolean; onLoad?: () => void; onError?: () => void;
  onGesture?: (active: boolean) => void; children?: ReactNode; testId?: string;
  pinch?: boolean; onTouchTap?: () => void;
};
export function ImageCanvas({ picture, view, onView, disabled, onLoad, onError, onGesture, children, testId, pinch = false, onTouchTap }: Props) {
  const canvas = useRef<HTMLDivElement>(null); const [size, setSize] = useState({ width: 1, height: 1 });
  const [dragging, setDragging] = useState(false);
  const geometry = imageGeometry(size.width, size.height, picture.width, picture.height); const displayed = clampView(view, geometry);
  const current = useRef({ displayed, geometry, onView, disabled, onGesture }); current.current = { displayed, geometry, onView, disabled, onGesture };
  const drag = useRef<{ id: number; x: number; y: number; view: ImageView } | null>(null);
  const touches = useRef(new Map<number, TouchPoint>());
  const pinchStart = useRef<{ ids: [number, number]; points: [TouchPoint, TouchPoint]; view: ImageView } | null>(null);
  const touchView = useRef(displayed);
  const touchTap = useRef(new TouchTap());
  useLayoutEffect(() => {
    const element = canvas.current!; const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure(); const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = canvas.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); const { displayed, geometry, onView, disabled } = current.current;
      if (disabled || drag.current) return; const rect = element.getBoundingClientRect();
      onView(zoomAt(displayed, displayed.zoom * wheelFactor(e.deltaY, e.deltaMode, geometry.boxHeight), { x: e.clientX - rect.left, y: e.clientY - rect.top }, geometry));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { element.removeEventListener('wheel', wheel); touchTap.current.reset(); current.current.onGesture?.(false); };
  }, []);
  function endDrag() { drag.current = null; setDragging(false); onGesture?.(false); }
  function rebaseTouches(element: HTMLDivElement) {
    const points = [...touches.current.entries()]; pinchStart.current = null;
    if (points.length >= 2) {
      const rect = element.getBoundingClientRect();
      pinchStart.current = { ids: [points[0][0], points[1][0]], points: [points[0][1], points[1][1]].map(p => ({ x: p.x - rect.left, y: p.y - rect.top })) as [TouchPoint, TouchPoint], view: touchView.current };
      drag.current = null;
    } else if (points.length === 1) drag.current = { id: points[0][0], ...points[0][1], view: touchView.current };
    else endDrag();
  }
  function stopPointer(id: number, element: HTMLDivElement, allowTap = false) {
    if (touchTap.current.has(id)) {
      const tapped = touchTap.current.release(id); onGesture?.(false);
      if (allowTap && tapped && !disabled) onTouchTap?.();
      return;
    }
    if (touches.current.delete(id)) rebaseTouches(element);
    else if (drag.current?.id === id) endDrag();
  }
  return <div ref={canvas} className={`image-canvas ${dragging ? 'dragging' : ''}`} data-testid={testId}
    style={onTouchTap && !pinch ? { touchAction: 'pan-y' } : undefined}
    data-zoom={displayed.zoom.toFixed(5)} data-focus-x={displayed.x.toFixed(5)} data-focus-y={displayed.y.toFixed(5)}
    role="group" aria-label={t("查看图片：{0}，滚轮缩放，按住拖动，双击恢复全图{1}", [picture.file.name, onTouchTap ? t("，触屏点图单独查看") : ''])} tabIndex={0}
    onDoubleClick={() => { if (!disabled) onView(fitView()); }}
    onKeyDown={e => {
      if (disabled) return;
      if (e.key === 'Home') { e.preventDefault(); onView(fitView()); }
      if (['+', '=', '-'].includes(e.key)) { e.preventDefault(); onView(zoomAt(displayed, displayed.zoom * (e.key === '-' ? 1 / 1.25 : 1.25), { x: size.width / 2, y: size.height / 2 }, geometry)); }
    }}
    onPointerDown={e => {
      if (onTouchTap && !pinch && e.pointerType === 'touch') {
        if (disabled || e.button !== 0) return;
        if (!e.isPrimary) { touchTap.current.cancel(); return; }
        touchTap.current.start(e.pointerId, e.clientX, e.clientY);
        e.currentTarget.setPointerCapture(e.pointerId); onGesture?.(true); return;
      }
      if (disabled || e.button !== 0 || (!e.isPrimary && !(pinch && e.pointerType === 'touch'))) return;
      e.preventDefault(); e.currentTarget.focus({ preventScroll: true }); e.currentTarget.setPointerCapture(e.pointerId);
      if (pinch && e.pointerType === 'touch') {
        if (!touches.current.size) touchView.current = displayed;
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); rebaseTouches(e.currentTarget); onGesture?.(true); return;
      }
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, view: displayed }; onGesture?.(true);
    }}
    onPointerMove={e => {
      if (touchTap.current.has(e.pointerId)) { touchTap.current.move(e.pointerId, e.clientX, e.clientY); return; }
      if (touches.current.has(e.pointerId)) {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const start = pinchStart.current;
        if (start) {
          const rect = e.currentTarget.getBoundingClientRect();
          const next = start.ids.map(id => { const p = touches.current.get(id)!; return { x: p.x - rect.left, y: p.y - rect.top }; }) as [TouchPoint, TouchPoint];
          const updated = pinchView(start.view, start.points, next, geometry);
          touchView.current = updated; setDragging(true); onView(updated); return;
        }
      }
      const start = drag.current; if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x; const dy = e.clientY - start.y;
      if (!dragging && Math.hypot(dx, dy) < 4) return;
      const updated = panBy(start.view, dx, dy, geometry);
      touchView.current = updated; setDragging(true); onView(updated);
    }}
    onPointerUp={e => { stopPointer(e.pointerId, e.currentTarget, true); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={e => stopPointer(e.pointerId, e.currentTarget)} onLostPointerCapture={e => stopPointer(e.pointerId, e.currentTarget)}>
    <img src={picture.url} alt={picture.file.name} draggable={false} onLoad={onLoad} onError={onError}
      style={{ width: geometry.width, height: geometry.height, transform: `translate3d(${size.width / 2 - displayed.x * geometry.width * displayed.zoom}px, ${size.height / 2 - displayed.y * geometry.height * displayed.zoom}px, 0) scale(${displayed.zoom})` }} />
    <span className="zoom-readout" aria-hidden="true">{displayed.zoom === 1 ? t("全图") : `${displayed.zoom.toFixed(1)}×`}</span>{children}
  </div>;
}
