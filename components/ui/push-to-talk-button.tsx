'use client';

export function PushToTalkButton({
  onStart,
  onRelease,
  onCancel: _onCancel,
  disabled,
  children,
  isActive,
}: {
  onStart: () => void;
  onRelease: () => void;
  onCancel: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  isActive?: boolean;
}) {
  const onClick = () => {
    if (disabled) return;
    if (!isActive) onStart();
    else onRelease();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-held={isActive ? '1' : '0'}
      className="w-full rounded-2xl px-5 py-4 text-left text-white
        bg-[var(--primary)] data-[held='1']:bg-[var(--primary-2)]
        active:scale-[0.99] transition-transform
        disabled:opacity-50 select-none touch-none"
    >
      {children}
    </button>
  );
}
