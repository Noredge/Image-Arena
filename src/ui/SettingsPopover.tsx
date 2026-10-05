import { useEffect, useRef, type DetailsHTMLAttributes } from 'react';
import { bindSettingsDismissal } from './settingsDismissal';

export function SettingsPopover(props: DetailsHTMLAttributes<HTMLDetailsElement>) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => bindSettingsDismissal(ref.current!), []);
  return <details {...props} ref={ref} data-settings-popover onKeyDown={event => {
    // Keep page vote shortcuts away from controls inside the open settings.
    event.stopPropagation(); props.onKeyDown?.(event);
  }} />;
}
