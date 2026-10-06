import { t } from '../i18n';
import { usePreference } from '../platform/settings';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';

// Background motion never runs while comparing or inspecting an image.
export function useSceneMotion(quiet: boolean) {
  const [paused, setPaused] = usePreference('motionPaused');
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReduced(preference.matches);
    const updateVisibility = () => setHidden(document.hidden);
    preference.addEventListener('change', updatePreference);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      preference.removeEventListener('change', updatePreference);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);
  return { moving: !quiet && !paused && !reduced && !hidden, paused, reduced, toggle: () => setPaused(!paused) };
}

export function SceneMotionControl({ paused, reduced, toggle }: ReturnType<typeof useSceneMotion>) {
  return <button className="scene-motion-control" onClick={toggle} disabled={reduced}
    aria-pressed={paused || reduced} aria-label={reduced ? t("背景动画已按系统设置暂停") : paused ? t("继续背景动画") : t("暂停背景动画")}
    title={reduced ? t("已遵循系统减少动态效果设置") : paused ? t("继续背景动画") : t("暂停背景动画")}>
    <Icon name={paused || reduced ? 'play' : 'pause'} size={12} />
    <span>{reduced ? t("静静看，也很好") : paused ? t("让风继续") : t("让风歇会儿")}</span>
  </button>;
}
