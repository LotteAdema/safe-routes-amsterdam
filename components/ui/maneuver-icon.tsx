'use client';

import { maneuverGroup } from '@/lib/navigate/maneuver';

export function ManeuverIcon({ maneuver, size = 40 }: { maneuver: string; size?: number }) {
  const group = maneuverGroup(maneuver);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {group === 'straight' && (
        <path d="M20 32V8M14 14l6-6 6 6" />
      )}
      {group === 'left' && (
        <>
          <path d="M26 32V22a8 8 0 0 0-8-8h-4" />
          <path d="M8 8l6 6-6 6" />
        </>
      )}
      {group === 'right' && (
        <>
          <path d="M14 32V22a8 8 0 0 1 8-8h4" />
          <path d="M32 8l-6 6 6 6" />
        </>
      )}
      {group === 'uturn' && (
        <>
          <path d="M14 32V16a8 8 0 0 1 16 0v2" />
          <path d="M24 12l6 6-6 6" />
        </>
      )}
      {group === 'roundabout' && (
        <>
          <circle cx="20" cy="20" r="8" />
          <path d="M20 8V4M14 6l6-2 2 6" />
        </>
      )}
      {group === 'merge' && (
        <path d="M20 32V18M12 10l8 8 8-8" />
      )}
    </svg>
  );
}
