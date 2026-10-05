import { useEffect, useState } from 'react';

// Choose presentation from available space, never from the input device.
const query = '(max-width: 1050px), (max-width: 1400px) and (max-height: 540px)';
export function useCompactLayout() {
  const [compact, setCompact] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query); const update = () => setCompact(media.matches);
    media.addEventListener('change', update); update();
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}
