import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** Content shown inside the popover. Plain string or pre-formatted JSX. */
  children: React.ReactNode;
  /** Optional aria/title fallback for the trigger. */
  label?: string;
}

const POPOVER_WIDTH = 280;
const GAP = 10;
const VIEWPORT_MARGIN = 8;

interface Pos {
  top: number;
  left: number;
  /** Side of trigger the popover is on, used to flip the arrow. */
  side: 'right' | 'left';
}

/**
 * "i" trigger that opens an explanatory popover. The popover is rendered in
 * a portal at <body> level (so it can overflow scrolling parents) and
 * positioned with `position: fixed` based on the trigger's bounding rect.
 *
 * Hover opens, click pins until you click elsewhere.
 */
export function InfoTip({ children, label = 'More info' }: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  /** Recompute position from the trigger rect. Flips left/right and clamps
   *  vertically so the popover stays within the viewport. */
  const updatePosition = () => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Use the popover's measured height if mounted, else estimate.
    const popH = popoverRef.current?.offsetHeight ?? 240;

    // Prefer right side; flip to left if it overflows.
    let side: 'right' | 'left' = 'right';
    let left = r.right + GAP;
    if (left + POPOVER_WIDTH + VIEWPORT_MARGIN > vw) {
      side = 'left';
      left = r.left - GAP - POPOVER_WIDTH;
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    }

    // Vertically centre on the trigger, then clamp to viewport.
    let top = r.top + r.height / 2 - popH / 2;
    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
    if (top + popH > vh - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, vh - VIEWPORT_MARGIN - popH);
    }

    setPos({ top, left, side });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    // After the popover renders we know its real height — re-position once.
    const id = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setPinned(false);
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pinned]);

  const popover =
    open && pos
      ? createPortal(
          <div
            ref={popoverRef}
            className={`infotip-popover side-${pos.side}`}
            style={{
              top: `${pos.top}px`,
              left: `${pos.left}px`,
              width: `${POPOVER_WIDTH}px`,
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => !pinned && setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )
      : null;

  return (
    <span className="infotip">
      <button
        type="button"
        ref={triggerRef}
        className="infotip-trigger"
        aria-label={label}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setPinned((p) => !p);
          setOpen(true);
        }}
      >
        i
      </button>
      {popover}
    </span>
  );
}
