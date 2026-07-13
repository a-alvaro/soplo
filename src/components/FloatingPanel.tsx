import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra CSS class for positioning the panel. */
  className?: string;
}

/**
 * Generic floating overlay panel with fade+slide animation.
 * Clicks outside the panel fire onClose.
 */
export function FloatingPanel({ open, onClose, children, className = '' }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay so the click that opened the panel doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [open, onClose]);

  return (
    <div
      ref={panelRef}
      className={`floating-panel ${className} ${open ? 'floating-panel--open' : ''}`}
      aria-hidden={!open}
    >
      {children}
    </div>
  );
}
