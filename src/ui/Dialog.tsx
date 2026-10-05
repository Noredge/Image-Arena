import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({ children, onClose, label, className = '' }: { children: ReactNode; onClose: () => void; label: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={label} className={className} onCancel={e => { e.preventDefault(); onClose(); }}>{children}</dialog>;
}
