'use client';

import { useEffect, useRef, useState } from 'react';

const COLLAPSED_MAX = 280;
const EXPANDED_MAX_VH = 75;
const DRAG_THRESHOLD = 40;

export function BottomSheet({
  children,
  expanded,
  onExpandedChange,
}: {
  children: React.ReactNode;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
}) {
  const dragStart = useRef<number | null>(null);
  const [vh, setVh] = useState(800);

  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const expandedMaxPx = Math.round((vh * EXPANDED_MAX_VH) / 100);
  const maxHeight = expanded ? expandedMaxPx : COLLAPSED_MAX;

  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    const dy = e.clientY - dragStart.current;
    dragStart.current = null;
    if (dy < -DRAG_THRESHOLD) onExpandedChange(true);
    else if (dy > DRAG_THRESHOLD) onExpandedChange(false);
    else onExpandedChange(!expanded);
  };

  return (
    <div
      style={{ maxHeight }}
      className="absolute bottom-0 left-0 right-0 bg-[var(--card)] rounded-t-3xl
                 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] overflow-hidden
                 transition-[max-height] duration-300 ease-out"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragStart.current = null)}
        className="w-full pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none select-none"
        aria-label={expanded ? 'Collapse details' : 'Expand details'}
        role="button"
      >
        <div className="mx-auto w-12 h-1 rounded-full bg-[var(--ink-4)] opacity-30" />
      </div>
      <div
        className="px-5 pb-7 overflow-y-auto"
        style={{ maxHeight: maxHeight - 32 }}
      >
        {children}
      </div>
    </div>
  );
}
