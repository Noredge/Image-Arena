import { usePreference } from '../platform/settings';
import { t, type Language } from '../i18n';

export function LanguageControl() {
  const [language, setLanguage] = usePreference('language');
  return <label className="language-control"><span>{t('语言')}</span>
    <select aria-label={t('界面语言')} value={language} onChange={event => setLanguage(event.target.value as Language)}>
      <option value="zh" lang="zh-CN">中文</option><option value="en" lang="en">English</option>
    </select>
  </label>;
}
