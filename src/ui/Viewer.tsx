import { t } from '../i18n';
import { useRef, useState } from 'react';
import type { Picture } from '../platform/browser';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { ImageCanvas } from './ImageCanvas';
import { fitView, imageGeometry } from './imageView';

export function Viewer({ picture, onClose, onVeto, vetoDisabled, compact = false, returnLabel = t("返回比赛") }: { picture: Picture; onVeto?: () => void; vetoDisabled?: boolean; onClose: () => void; compact?: boolean; returnLabel?: string }) {
  const [view, setView] = useState(fitView);
  const [failed, setFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  function actualSize() {
    const canvas = container.current!;
    const geometry = imageGeometry(canvas.clientWidth, canvas.clientHeight, picture.width, picture.height);
    setView({ zoom: 1 / geometry.fit, x: .5, y: .5 });
  }
  return <Dialog label={t("查看 {0}", [picture.file.name])} onClose={onClose} className="viewer">
    <div className="viewer-bar"><div className="viewer-title"><strong>{picture.file.name}</strong><span>{picture.width} × {picture.height}</span></div>
      <div className="viewer-tools"><button onClick={() => setView(fitView())}><Icon name="fit" size={16} />{t("恢复全图")}</button><button onClick={actualSize} title={t("一个图片像素对应一个 CSS 像素")}>1:1</button><button className="icon-button" aria-label={t("关闭查看器")} onClick={onClose}><Icon name="close" /></button></div>
    </div>
    <div className="viewer-canvas" ref={container}>
      <ImageCanvas pinch picture={picture} view={view} onView={setView} testId="viewer-image" onError={() => setFailed(true)} />
      {failed && <p className="viewer-error" role="alert">{t("图片载入失败，请关闭后重新打开。")}</p>}
    </div>
    {compact ? <div className="viewer-hint">{onVeto && <details className="viewer-more"><summary>{t("更多")}</summary><button className="veto-button" disabled={vetoDisabled} onClick={onVeto}>{vetoDisabled ? t("本轮资格已取消") : t("裁判一票否决")}</button></details>}<span>{t("滚轮／双指缩放 · 放大后拖动")}</span><button className="secondary viewer-return" onClick={onClose}>{returnLabel}</button></div> : <div className="viewer-hint">{onVeto && <button className="veto-button" disabled={vetoDisabled} onClick={onVeto}>{vetoDisabled ? t("当前不可否决") : t("裁判一票否决")}</button>}<span>{t("滚轮或双指缩放 · 按住拖动 · 双击恢复全图")}</span><span>{t("1:1 为 CSS 像素 · Esc 关闭")}</span></div>}
  </Dialog>;
}
