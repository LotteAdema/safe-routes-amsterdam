'use client';

import { useRef, useState, type PointerEvent } from 'react';

export function PushToTalkButton({
  onStart,
  onRelease,
  onCancel,
  disabled,
  children,
}: {
  onStart: () => void;
  onRelease: () => void;
  onCancel: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [held, setHeld] = useState(false);
  const startY = useRef(0);
  const cancelled = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    cancelled.current = false;
    setHeld(true);
    onStart();
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!held) return;
    if (startY.current - e.clientY > 80) {
      cancelled.current = true;
    }
  };
  const onPointerUp = () => {
    if (!held) return;
    setHeld(false);
    if (cancelled.current) onCancel();
    else onRelease();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-held={held ? '1' : '0'}
      className="w-full rounded-2xl px-5 py-4 text-left text-white
        bg-[var(--primary)] data-[held='1']:bg-[var(--primary-2)]
        active:scale-[0.99] transition-transform
        disabled:opacity-50 select-none touch-none"
    >
      {children}
    </button>
  );
}
