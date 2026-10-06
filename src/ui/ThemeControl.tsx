import { t } from '../i18n';
import { usePreference } from '../platform/settings';
import { Icon } from './Icon';



// Keep the control's state separate from the tournament and image viewport.
export function ThemeControl() {
  const [theme, setTheme] = usePreference('theme');
  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#252323' : '#f6f2e9');
    setTheme(next);
    try { localStorage.setItem('image-arena-theme', next); } catch { /* Still usable for this visit. */ }
  }
  return <button className="theme-control" onClick={toggle}
    aria-label={theme === 'light' ? t("切换到夜间模式") : t("切换到日间模式")}
    title={theme === 'light' ? t("夜深了，调暗一点") : t("天亮了，让场地亮起来")}>
    <Icon name={theme === 'light' ? 'sun' : 'moon'} size={16} />
    <span>{theme === 'light' ? t("日间") : t("夜间")}</span>
  </button>;
}
