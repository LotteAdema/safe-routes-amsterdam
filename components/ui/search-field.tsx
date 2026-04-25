'use client';

export function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder = 'Where to?',
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="bg-white/95 rounded-2xl px-4 py-3 shadow-md flex items-center gap-3 backdrop-blur"
    >
      <span className="opacity-60">⌕</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 outline-none bg-transparent text-[var(--ink)] placeholder:text-[var(--ink-4)]"
      />
    </form>
  );
}
