export function parseYesNo(input: string): boolean | null {
  const normalized = input.trim().toLowerCase().replace(/[.!?,]/g, '');
  if (!normalized) return null;
  const first = normalized.split(/\s+/)[0];
  if (['yes', 'yeah', 'yep', 'yup', 'ja', 'sure', 'ok', 'okay'].includes(first)) return true;
  if (['no', 'nope', 'nah', 'nee', 'never'].includes(first)) return false;
  return null;
}
