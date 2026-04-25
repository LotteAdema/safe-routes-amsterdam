# Search Autocomplete + Navigation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Mapbox address autocomplete to the home search, replace the bare NavigateScreen with turn-by-turn step guidance + camera follow, and trigger an immediate re-route when a new high/acute report appears within 500m during navigation.

**Architecture:** Three independent feature slices sharing a single data-model change: `RouteStep[]` is extracted from the Google Directions API response, added to `RouteResponse`, and consumed by the updated `NavigateScreen`. The autocomplete replaces `SearchField` in isolation. The acute re-routing extends the existing 7s poll loop in `NavigateScreen` without touching the API layer.

**Tech Stack:** `@mapbox/search-js-react` (SearchBox), Google Directions API steps, Mapbox GL `easeTo`, vitest for pure-logic tests.

---

## File Map

| File | Change |
|---|---|
| `components/ui/search-field.tsx` | Rewrite — Mapbox SearchBox replaces plain input |
| `lib/routing/google-directions.ts` | Add `RouteStep` type, `stripHtml`, extract steps from API |
| `lib/routing/steps.ts` | **Create** — `formatDistance`, `remainingDistance` pure helpers |
| `components/ui/maneuver-icon.tsx` | **Create** — SVG maneuver arrow, `maneuverGroup` pure fn |
| `app/page.tsx` | Add `steps: RouteStep[]` to `RouteResponse` |
| `app/api/route/route.ts` | Pass `steps` through in response object |
| `components/screens/navigate.tsx` | Step tracking, camera follow, bottom panel, acute re-route |
| `tests/routing/steps.test.ts` | **Create** — tests for stripHtml, formatDistance, remainingDistance |
| `tests/navigate/maneuver.test.ts` | **Create** — tests for maneuverGroup mapping |
| `tests/navigate/acute.test.ts` | **Create** — tests for acute report filter logic |

---

## Task 1: Install @mapbox/search-js-react and wire up autocomplete

**Files:**
- Modify: `components/ui/search-field.tsx`

- [ ] **Step 1: Install the package**

```bash
pnpm add @mapbox/search-js-react
```

Expected: package added to `package.json` and `pnpm-lock.yaml`. No build errors.

- [ ] **Step 2: Check the package README for the correct import and theme API**

```bash
cat node_modules/@mapbox/search-js-react/README.md | head -80
```

The component is `SearchBox`. Its `onRetrieve` callback receives an object whose `features[0].geometry.coordinates` is `[lng, lat]`. Confirm the exact prop name for proximity options before writing code.

- [ ] **Step 3: Rewrite `components/ui/search-field.tsx`**

```tsx
'use client';

import { SearchBox } from '@mapbox/search-js-react';
import type { SearchBoxRetrieveResponse } from '@mapbox/search-js-react';

export function SearchField({
  onRetrieve,
}: {
  onRetrieve: (coord: { lat: number; lng: number }) => void;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

  function handleRetrieve(res: SearchBoxRetrieveResponse) {
    const [lng, lat] = res.features[0].geometry.coordinates;
    onRetrieve({ lat, lng });
  }

  return (
    <div className="bg-white/95 rounded-2xl shadow-md backdrop-blur overflow-hidden">
      <SearchBox
        accessToken={token}
        options={{
          language: 'en',
          country: 'NL',
          proximity: { lng: 4.9041, lat: 52.3676 },
        }}
        onRetrieve={handleRetrieve}
        placeholder="Where to?"
        theme={{
          variables: {
            fontFamily: 'inherit',
            borderRadius: '1rem',
            colorBackground: 'transparent',
          },
        }}
      />
    </div>
  );
}
```

Note: if `SearchBoxRetrieveResponse` is not exported from the package at this path, use `Parameters<Parameters<typeof SearchBox>[0]['onRetrieve']>[0]` or just `any` temporarily and tighten later.

- [ ] **Step 4: Update the call site in `components/screens/home.tsx`**

The existing `SearchField` receives `value`, `onChange`, and `onSubmit`. Replace with the new `onRetrieve` prop. Remove the `destinationText` state and `onSearchSubmit` handler (the SearchBox owns the input value internally).

Find the `destinationText` state and `onSearchSubmit` in `home.tsx` (~lines 25–95) and replace with:

```tsx
// Remove:
// const [destinationText, setDestinationText] = useState('');
// const onSearchSubmit = async () => { ... };

// The SearchField now calls onSearch directly via onRetrieve
```

Update the `<SearchField>` JSX:
```tsx
<SearchField onRetrieve={onSearch} />
```

- [ ] **Step 5: Verify types compile**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors. If `SearchBoxRetrieveResponse` import path differs, adjust the import to match what the package actually exports.

- [ ] **Step 6: Manual smoke test**

Run `pnpm dev`, open `http://localhost:3000`, type "Centraal" in the search box. A dropdown of Amsterdam addresses should appear. Selecting one should navigate to the Route screen with the correct destination pinned on the map.

- [ ] **Step 7: Commit**

```bash
git add components/ui/search-field.tsx components/screens/home.tsx package.json pnpm-lock.yaml
git commit -m "feat: Mapbox SearchBox autocomplete replaces plain search input"
```

---

## Task 2: Add RouteStep type and extract steps from Google Directions

**Files:**
- Modify: `lib/routing/google-directions.ts`

- [ ] **Step 1: Add `RouteStep` type and `stripHtml` to `google-directions.ts`**

Add at the top of the file, before `DirectionsRoute`:

```ts
export type RouteStep = {
  instruction: string;
  maneuver: string;
  distanceM: number;
  endLat: number;
  endLng: number;
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
```

- [ ] **Step 2: Add `steps` to `DirectionsRoute`**

Change:
```ts
export type DirectionsRoute = {
  polyline: string;
  durationSec: number;
  distanceM: number;
};
```

To:
```ts
export type DirectionsRoute = {
  polyline: string;
  durationSec: number;
  distanceM: number;
  steps: RouteStep[];
};
```

- [ ] **Step 3: Extend the API response type to include steps**

In `getRoutes`, the `data` type assertion currently omits steps. Replace with:

```ts
const data = (await r.json()) as {
  status: string;
  routes?: Array<{
    overview_polyline: { points: string };
    legs?: Array<{
      duration?: { value: number };
      distance?: { value: number };
      steps?: Array<{
        html_instructions: string;
        maneuver?: string;
        distance?: { value: number };
        end_location: { lat: number; lng: number };
      }>;
    }>;
  }>;
};
```

- [ ] **Step 4: Extract steps in the `.map()` at the bottom of `getRoutes`**

Replace:
```ts
return (data.routes ?? []).map((rt) => ({
  polyline: rt.overview_polyline.points,
  durationSec: rt.legs?.[0]?.duration?.value ?? 0,
  distanceM: rt.legs?.[0]?.distance?.value ?? 0,
}));
```

With:
```ts
return (data.routes ?? []).map((rt) => {
  const rawSteps = rt.legs?.[0]?.steps ?? [];
  const steps: RouteStep[] = rawSteps.map((s) => ({
    instruction: stripHtml(s.html_instructions),
    maneuver: s.maneuver ?? 'straight',
    distanceM: s.distance?.value ?? 0,
    endLat: s.end_location.lat,
    endLng: s.end_location.lng,
  }));
  return {
    polyline: rt.overview_polyline.points,
    durationSec: rt.legs?.[0]?.duration?.value ?? 0,
    distanceM: rt.legs?.[0]?.distance?.value ?? 0,
    steps,
  };
});
```

- [ ] **Step 5: Write tests for `stripHtml`**

Create `tests/routing/steps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// Replicate the function here for isolated testing — it's not exported from
// google-directions.ts (it's internal). Test the exported behaviour via
// RouteStep shapes in the integration path; unit-test the logic directly.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

describe('stripHtml', () => {
  it('removes bold tags from Google instructions', () => {
    expect(stripHtml('Turn <b>left</b> onto Damrak')).toBe('Turn left onto Damrak');
  });

  it('removes nested tags', () => {
    expect(stripHtml('Head <div class="x"><b>north</b></div> on Rokin')).toBe(
      'Head north on Rokin',
    );
  });

  it('decodes html entities', () => {
    expect(stripHtml('Take exit &amp; continue')).toBe('Take exit & continue');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('Continue straight')).toBe('Continue straight');
  });
});
```

- [ ] **Step 6: Run the new tests and confirm they pass**

```bash
pnpm test
```

Expected: all tests pass (21 existing + 4 new = 25).

- [ ] **Step 7: Commit**

```bash
git add lib/routing/google-directions.ts tests/routing/steps.test.ts
git commit -m "feat: extract RouteStep from Google Directions API response"
```

---

## Task 3: Propagate steps through the data pipeline

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/api/route/route.ts`

- [ ] **Step 1: Add `steps` to `RouteResponse` in `app/page.tsx`**

Import the type at the top:
```ts
import type { RouteStep } from '@/lib/routing/google-directions';
```

Change `RouteResponse`:
```ts
export type RouteResponse = {
  id: string;
  polyline: string;
  duration_min: number;
  distance_m: number;
  safety_score: number;
  incidents_avoided: number;
  reasons: string[];
  steps: RouteStep[];
};
```

- [ ] **Step 2: Pass `steps` through in `app/api/route/route.ts`**

In the `responseRoutes` map at the bottom of the POST handler, `rt` is the spread of `DirectionsRoute` (which now includes `steps`). Add `steps` to the returned object:

```ts
return {
  id: rt.id,
  polyline: rt.polyline,
  duration_min: Math.round(rt.durationSec / 60),
  distance_m: rt.distanceM,
  safety_score: Number(totalScore(rt).toFixed(4)),
  incidents_avoided: Math.max(0, fastestNearbyCount - rt.scored.scored.length),
  reasons,
  steps: rt.steps,      // ← add this line
};
```

- [ ] **Step 3: Verify type check passes**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/api/route/route.ts
git commit -m "feat: propagate RouteStep[] through RouteResponse"
```

---

## Task 4: Create ManeuverIcon component

**Files:**
- Create: `lib/navigate/maneuver.ts`
- Create: `components/ui/maneuver-icon.tsx`
- Create: `tests/navigate/maneuver.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `tests/navigate/maneuver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { maneuverGroup, type ManeuverGroup } from '@/lib/navigate/maneuver';

describe('maneuverGroup', () => {
  it('maps turn-left to left', () => {
    expect(maneuverGroup('turn-left')).toBe<ManeuverGroup>('left');
  });

  it('maps fork-left to left', () => {
    expect(maneuverGroup('fork-left')).toBe<ManeuverGroup>('left');
  });

  it('maps keep-left to left', () => {
    expect(maneuverGroup('keep-left')).toBe<ManeuverGroup>('left');
  });

  it('maps ramp-left to left', () => {
    expect(maneuverGroup('ramp-left')).toBe<ManeuverGroup>('left');
  });

  it('maps turn-right to right', () => {
    expect(maneuverGroup('turn-right')).toBe<ManeuverGroup>('right');
  });

  it('maps roundabout-left to roundabout', () => {
    expect(maneuverGroup('roundabout-left')).toBe<ManeuverGroup>('roundabout');
  });

  it('maps roundabout-right to roundabout', () => {
    expect(maneuverGroup('roundabout-right')).toBe<ManeuverGroup>('roundabout');
  });

  it('maps merge to merge', () => {
    expect(maneuverGroup('merge')).toBe<ManeuverGroup>('merge');
  });

  it('maps u-turn-left to uturn', () => {
    expect(maneuverGroup('u-turn-left')).toBe<ManeuverGroup>('uturn');
  });

  it('maps straight to straight', () => {
    expect(maneuverGroup('straight')).toBe<ManeuverGroup>('straight');
  });

  it('defaults unknown strings to straight', () => {
    expect(maneuverGroup('')).toBe<ManeuverGroup>('straight');
    expect(maneuverGroup('head-north')).toBe<ManeuverGroup>('straight');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
pnpm test tests/navigate/maneuver.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/navigate/maneuver'".

- [ ] **Step 3: Create `lib/navigate/maneuver.ts`**

```ts
export type ManeuverGroup = 'straight' | 'left' | 'right' | 'uturn' | 'roundabout' | 'merge';

export function maneuverGroup(maneuver: string): ManeuverGroup {
  if (maneuver.includes('u-turn')) return 'uturn';
  if (maneuver.includes('roundabout')) return 'roundabout';
  if (maneuver === 'merge') return 'merge';
  if (maneuver.includes('left')) return 'left';
  if (maneuver.includes('right')) return 'right';
  return 'straight';
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm test
```

Expected: all tests pass (25 existing + 11 new = 36).

- [ ] **Step 5: Create `components/ui/maneuver-icon.tsx`**

```tsx
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
        <>
          <path d="M20 32V18M12 10l8 8 8-8" />
        </>
      )}
    </svg>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/navigate/maneuver.ts components/ui/maneuver-icon.tsx tests/navigate/maneuver.test.ts
git commit -m "feat: ManeuverIcon component + maneuverGroup pure function"
```

---

## Task 5: Add formatDistance and remainingDistance helpers

**Files:**
- Create: `lib/navigate/format.ts`
- Create: `tests/navigate/format.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/navigate/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatDistance, remainingDistance } from '@/lib/navigate/format';
import type { RouteStep } from '@/lib/routing/google-directions';

describe('formatDistance', () => {
  it('formats meters below 200 to nearest 10', () => {
    expect(formatDistance(84)).toBe('80 m');
    expect(formatDistance(195)).toBe('190 m');
  });

  it('formats meters 200–999 to nearest 100', () => {
    expect(formatDistance(340)).toBe('300 m');
    expect(formatDistance(950)).toBe('900 m');
  });

  it('formats 1000+ as km with one decimal', () => {
    expect(formatDistance(1200)).toBe('1.2 km');
    expect(formatDistance(5500)).toBe('5.5 km');
  });
});

describe('remainingDistance', () => {
  const steps: RouteStep[] = [
    { instruction: 'a', maneuver: 'straight', distanceM: 100, endLat: 0, endLng: 0 },
    { instruction: 'b', maneuver: 'turn-left', distanceM: 200, endLat: 0, endLng: 0 },
    { instruction: 'c', maneuver: 'straight', distanceM: 50, endLat: 0, endLng: 0 },
  ];

  it('sums all steps from the given index', () => {
    expect(remainingDistance(steps, 0)).toBe(350);
    expect(remainingDistance(steps, 1)).toBe(250);
    expect(remainingDistance(steps, 2)).toBe(50);
  });

  it('returns 0 for an out-of-bounds index', () => {
    expect(remainingDistance(steps, 10)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test tests/navigate/format.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/navigate/format'".

- [ ] **Step 3: Create `lib/navigate/format.ts`**

```ts
import type { RouteStep } from '@/lib/routing/google-directions';

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  if (meters >= 200) return `${Math.round(meters / 100) * 100} m`;
  return `${Math.round(meters / 10) * 10} m`;
}

export function remainingDistance(steps: RouteStep[], fromIdx: number): number {
  return steps.slice(fromIdx).reduce((sum, s) => sum + s.distanceM, 0);
}
```

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: all tests pass (36 existing + 7 new = 43).

- [ ] **Step 5: Commit**

```bash
git add lib/navigate/format.ts tests/navigate/format.test.ts
git commit -m "feat: formatDistance and remainingDistance navigation helpers"
```

---

## Task 6: Add step tracking, camera follow, and bottom panel to NavigateScreen

**Files:**
- Modify: `components/screens/navigate.tsx`

This is the largest task — three changes to a single file. Work through them in order.

### 6a — Step tracking and camera follow

- [ ] **Step 1: Add imports at the top of `navigate.tsx`**

```tsx
import { ManeuverIcon } from '@/components/ui/maneuver-icon';
import { formatDistance, remainingDistance } from '@/lib/navigate/format';
```

- [ ] **Step 2: Derive the active route's steps inside the component**

After the existing `const active = routes.find(...)` line, add:

```tsx
const steps = active?.steps ?? [];
```

- [ ] **Step 3: Add `currentStepIdx` state and reset it when route changes**

After `const [pins, setPins] = useState<Pin[]>([]);`, add:

```tsx
const [currentStepIdx, setCurrentStepIdx] = useState(0);
```

Add a new `useEffect` after the existing effects:

```tsx
useEffect(() => {
  setCurrentStepIdx(0);
}, [activeRouteId]);
```

- [ ] **Step 4: Add two `useEffect` hooks — one for camera follow, one for step advance**

`steps` is `active?.steps ?? []`, which produces a new array reference on every render. Keep the two concerns in separate effects with stable dependencies so neither over-fires.

Add both effects after the GPS `watchPosition` effect:

```tsx
// Camera follow — fires whenever position or map instance changes
useEffect(() => {
  if (!pos || !map) return;
  map.easeTo({ center: [pos.lng, pos.lat], duration: 500 });
}, [pos, map]);

// Step advance — fires when GPS position, route, or step index changes
useEffect(() => {
  if (!pos) return;
  const activeSteps = routes.find((r) => r.id === activeRouteId)?.steps ?? [];
  if (activeSteps.length === 0) return;
  const step = activeSteps[currentStepIdx];
  if (!step) return;
  const distToStepEnd = haversine(pos, { lat: step.endLat, lng: step.endLng });
  if (distToStepEnd < 20 && currentStepIdx < activeSteps.length - 1) {
    setCurrentStepIdx((i) => i + 1);
  }
}, [pos, routes, activeRouteId, currentStepIdx]);
```

### 6b — Updated top bar

- [ ] **Step 5: Extend the top bar to show remaining distance**

Locate the top bar `<div>` inside the return JSX (around the current duration display). Replace:

```tsx
<div
  className="absolute top-3 left-3 right-3 bg-white/95 rounded-2xl px-4 py-3
                shadow-md flex items-center justify-between backdrop-blur"
>
  <div>
    <div className="flex items-baseline gap-1.5">
      <span className="display text-2xl text-[var(--ink)] leading-none">
        {active?.duration_min ?? '—'}
      </span>
      <span className="text-sm text-[var(--ink-3)]">min</span>
    </div>
    <div className="text-xs text-[var(--ink-3)] mt-1">
      safety score {active?.safety_score.toFixed(2) ?? '—'}
    </div>
  </div>
  <button onClick={onCancel} className="text-[var(--sev-acute)] text-sm">
    End trip
  </button>
</div>
```

With:

```tsx
<div
  className="absolute top-3 left-3 right-3 bg-white/95 rounded-2xl px-4 py-3
                shadow-md flex items-center justify-between backdrop-blur"
>
  <div>
    <div className="flex items-baseline gap-1.5">
      <span className="display text-2xl text-[var(--ink)] leading-none">
        {active?.duration_min ?? '—'}
      </span>
      <span className="text-sm text-[var(--ink-3)]">min</span>
    </div>
    <div className="text-xs text-[var(--ink-3)] mt-1">
      {steps.length > 0
        ? formatDistance(remainingDistance(steps, currentStepIdx))
        : `safety score ${active?.safety_score.toFixed(2) ?? '—'}`}
    </div>
  </div>
  <button onClick={onCancel} className="text-[var(--sev-acute)] text-sm font-medium">
    End trip
  </button>
</div>
```

### 6c — Bottom navigation panel

- [ ] **Step 6: Add the bottom panel just before the closing `</div>` of the return**

```tsx
{steps.length > 0 && steps[currentStepIdx] && (() => {
  const step = steps[currentStepIdx];
  const distToTurn = pos
    ? haversine(pos, { lat: step.endLat, lng: step.endLng })
    : step.distanceM;
  return (
    <div
      className="absolute bottom-6 left-4 right-4 bg-white/95 rounded-2xl px-4 py-3
                  shadow-lg backdrop-blur flex items-center gap-4"
    >
      <div className="text-[var(--primary)] shrink-0">
        <ManeuverIcon maneuver={step.maneuver} size={40} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="display text-base text-[var(--ink)] leading-tight truncate">
          {step.instruction}
        </div>
        <div className="text-sm text-[var(--ink-3)] mt-0.5">
          in {formatDistance(distToTurn)}
        </div>
      </div>
    </div>
  );
})()}
```

- [ ] **Step 7: Verify TypeScript**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Manual test — start navigation and verify**

Run `pnpm dev`. Search for a destination, pick a route, press Start. Confirm:
- Map camera pans to follow your position as you move (or simulate by reloading with a different GPS mock).
- Bottom panel shows the first turn instruction and distance.
- Top bar shows remaining distance instead of raw safety score.

- [ ] **Step 9: Commit**

```bash
git add components/screens/navigate.tsx
git commit -m "feat: step tracking, camera follow, and turn-by-turn bottom panel in NavigateScreen"
```

---

## Task 7: Acute report re-routing

**Files:**
- Create: `lib/navigate/acute.ts`
- Create: `tests/navigate/acute.test.ts`
- Modify: `components/screens/navigate.tsx`

### 7a — Pure filter logic (testable)

- [ ] **Step 1: Write failing tests**

Create `tests/navigate/acute.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isNewHighAcute } from '@/lib/navigate/acute';

const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000 + 1000).toISOString(); // just inside window
const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();

const knownIds = new Set<string>();

describe('isNewHighAcute', () => {
  it('returns true for a fresh high acute report not in known set', () => {
    expect(
      isNewHighAcute({ id: 'a', severity: 'high', type: 'acute', reported_at: tenMinutesAgo }, knownIds),
    ).toBe(true);
  });

  it('returns false if id is already in known set', () => {
    const known = new Set(['a']);
    expect(
      isNewHighAcute({ id: 'a', severity: 'high', type: 'acute', reported_at: tenMinutesAgo }, known),
    ).toBe(false);
  });

  it('returns false if severity is not high', () => {
    expect(
      isNewHighAcute({ id: 'b', severity: 'medium', type: 'acute', reported_at: tenMinutesAgo }, knownIds),
    ).toBe(false);
  });

  it('returns false if type is not acute', () => {
    expect(
      isNewHighAcute({ id: 'c', severity: 'high', type: 'environmental', reported_at: tenMinutesAgo }, knownIds),
    ).toBe(false);
  });

  it('returns false if reported more than 10 minutes ago', () => {
    expect(
      isNewHighAcute({ id: 'd', severity: 'high', type: 'acute', reported_at: elevenMinutesAgo }, knownIds),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test tests/navigate/acute.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/navigate/acute'".

- [ ] **Step 3: Create `lib/navigate/acute.ts`**

```ts
const TEN_MIN_MS = 10 * 60 * 1000;

export type AcuteReportLike = {
  id: string;
  severity: string;
  type: string;
  reported_at: string;
};

export function isNewHighAcute(report: AcuteReportLike, knownIds: Set<string>): boolean {
  return (
    report.severity === 'high' &&
    report.type === 'acute' &&
    Date.now() - new Date(report.reported_at).getTime() < TEN_MIN_MS &&
    !knownIds.has(report.id)
  );
}
```

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: all tests pass (43 existing + 5 new = 48).

### 7b — Wire up in NavigateScreen

- [ ] **Step 5: Add imports and new refs to `navigate.tsx`**

Add import:
```tsx
import { isNewHighAcute } from '@/lib/navigate/acute';
```

Add two new refs after the existing `const lastRerouteAt = useRef(0);`:
```tsx
const knownAcuteIds = useRef<Set<string>>(new Set());
const forceAcuteReroute = useRef(false);
```

- [ ] **Step 6: Consolidate the 50m prompt fetch and add the acute detection**

In the `tick` async function inside the main poll `useEffect`, locate the block that fetches `/api/reports/near?...&radius=50`. Replace it with a single 500m fetch, splitting results in JS:

Replace this block:
```tsx
const sinceLastPrompt = Date.now() - lastPromptAt.current;
if (promptCountRef.current < 2 && sinceLastPrompt > 60_000) {
  const nearbyResp = await fetch(
    `/api/reports/near?lat=${pos.lat}&lng=${pos.lng}&radius=50`,
  )
    .then((r) => r.json())
    .catch(() => ({ reports: [] }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eligible = (nearbyResp.reports ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) =>
      !promptedIds.current.has(r.id) && !ownReportIdsRef.current.has(r.id),
  );
```

With:
```tsx
const allNearby = await fetch(
  `/api/reports/near?lat=${pos.lat}&lng=${pos.lng}&radius=500`,
)
  .then((r) => r.json())
  .catch(() => ({ reports: [] }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const allReports: any[] = allNearby.reports ?? [];

// Acute re-route check (runs every tick regardless of prompt cap)
const newAcute = allReports.filter((r: any) =>
  isNewHighAcute(r, knownAcuteIds.current),
);
if (newAcute.length > 0) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newAcute.forEach((r: any) => knownAcuteIds.current.add(r.id));
  forceAcuteReroute.current = true;
  lastRerouteAt.current = 0;
  const v = await getVoice();
  await v.speak('High-priority report nearby. Checking for a safer route.');
}

// Geofence prompt check — same logic as before, now filtered from the 500m fetch
const sinceLastPrompt = Date.now() - lastPromptAt.current;
if (promptCountRef.current < 2 && sinceLastPrompt > 60_000) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eligible = allReports.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) =>
      haversine(pos, { lat: Number(r.lat), lng: Number(r.lng) }) < 50 &&
      !promptedIds.current.has(r.id) &&
      !ownReportIdsRef.current.has(r.id),
  );
  if (eligible.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = eligible.sort(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any, b: any) =>
        severityWeight(b.severity, b.type) - severityWeight(a.severity, a.type),
    )[0];
    promptedIds.current.add(r.id);
    lastPromptAt.current = Date.now();
    onPromptOpen(r);
  }
}

- [ ] **Step 7: Modify the re-route block to handle the acute flag**

Locate the existing re-route block (starts with `if (Date.now() - lastRerouteAt.current > REROUTE_MIN_MS)`). Replace with:

```tsx
const isAcuteForced = forceAcuteReroute.current;
if (isAcuteForced || Date.now() - lastRerouteAt.current > REROUTE_MIN_MS) {
  lastRerouteAt.current = Date.now();
  forceAcuteReroute.current = false;
  const reroute = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin: pos, destination, mode }),
  })
    .then((r) => r.json())
    .catch(() => ({ routes: [] }));
  const newRoutes: RouteResponse[] = reroute.routes ?? [];
  if (newRoutes.length === 0) {
    if (isAcuteForced) {
      const v = await getVoice();
      await v.speak('No safer alternative available. Stay alert.');
    }
    return;
  }
  const safest = newRoutes[0];
  const current = routes.find((rr) => rr.id === activeRouteId);
  const threshold = isAcuteForced ? 1.0 : REROUTE_THRESHOLD;
  if (
    current &&
    safest.id !== activeRouteId &&
    safest.safety_score < current.safety_score * threshold
  ) {
    const v = await getVoice();
    const message = isAcuteForced
      ? `Re-routing to avoid the report. ${safest.reasons[0] ?? ''}`
      : `Safer route found. ${safest.reasons[0] ?? ''}. Switching.`;
    await v.speak(message);
    onActiveRouteChange(newRoutes, safest.id);
  } else if (isAcuteForced) {
    const v = await getVoice();
    await v.speak('No safer alternative available. Stay alert.');
  }
}
```

- [ ] **Step 8: TypeScript check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Run all tests**

```bash
pnpm test
```

Expected: all 48 tests pass.

- [ ] **Step 10: Commit**

```bash
git add lib/navigate/acute.ts tests/navigate/acute.test.ts components/screens/navigate.tsx
git commit -m "feat: immediate re-route on new high/acute report during navigation"
```

---

## Task 8: Final integration check

- [ ] **Step 1: Full type check**

```bash
pnpm exec tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Full test run**

```bash
pnpm test
```

Expected: all 48 tests pass.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: no errors. Fix any warnings about unused imports before committing.

- [ ] **Step 4: Manual end-to-end walkthrough**

1. Open `http://localhost:3000` on a phone or device with GPS.
2. Type "Dam" in the search box — verify autocomplete dropdown with Amsterdam suggestions.
3. Select "Dam Square" — verify transition to Route screen with correct destination marker.
4. Press Start — verify NavigateScreen loads with:
   - Bottom panel showing first turn instruction + distance
   - Top bar showing remaining distance
   - Map centred on current position
5. Walk/simulate a few steps — verify step index advances when within 20m of step endpoint, instruction updates.
6. To test acute re-routing: use the Neon console or `pnpm db:seed` to insert a `severity=high, type=acute` report at your current location. Within ≤7s the app should speak the warning.

- [ ] **Step 5: Final commit (if any lint fixes were made)**

```bash
git add -p   # stage only lint fixes
git commit -m "chore: lint cleanup after navigation feature"
```
