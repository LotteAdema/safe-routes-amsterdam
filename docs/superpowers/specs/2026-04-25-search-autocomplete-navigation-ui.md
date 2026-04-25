# Design: Search Autocomplete + Navigation UI

**Date:** 2026-04-25
**Branch:** feature/resonate-voice-adapter

---

## Problem

1. The search field on the Home screen is a plain `<input>`. Geocoding only fires on form submit — no suggestions while typing.
2. The Navigate screen shows a bare top bar (duration + "End trip"). No turn-by-turn instructions, no map camera follow, no bottom panel.
3. New high/acute reports that appear near the active route during navigation do not trigger an immediate re-route or alert.

---

## Feature 1: Address Autocomplete

### Approach

Use `@mapbox/search-js-react` (Mapbox's current recommended autocomplete SDK). Replaces the hand-rolled `SearchField` component entirely.

### Package

```
pnpm add @mapbox/search-js-react
```

### Component: `SearchField`

Replace the existing `<form>/<input>` with Mapbox's `<SearchBox>` component.

Configuration:
- `accessToken`: `process.env.NEXT_PUBLIC_MAPBOX_TOKEN`
- `options.proximity`: `{ lng: 4.9041, lat: 52.3676 }` (Amsterdam centre)
- `options.country`: `"nl"`
- `onRetrieve(res)`: extract `res.features[0].geometry.coordinates` → `[lng, lat]`, call the existing `onSearch({ lat, lng })` prop — no changes to the parent flow.

### Styling

Wrap `<SearchBox>` in a div that applies the existing pill card style (white/95 background, rounded-2xl, shadow-md). Use Mapbox's CSS custom property overrides (`--mapbox-search-box-*`) to match app tokens — same ink colours, same border radius, same font.

The suggestions dropdown renders below the card. Style via the same token overrides: white background, ink text, a thin separator between items.

### Files changed

- `components/ui/search-field.tsx` — rewrite to use `SearchBox`
- `package.json` / `pnpm-lock.yaml` — new dependency

---

## Feature 2: Turn-by-Turn Navigation UI

### Data model additions

**`lib/routing/google-directions.ts`**

New type:
```ts
export type RouteStep = {
  instruction: string; // HTML stripped
  maneuver: string;    // e.g. "turn-left", "straight", "roundabout-left"
  distanceM: number;
  endLat: number;
  endLng: number;
};
```

Extract steps from `legs[0].steps[]` in the Directions API response. Strip HTML from `html_instructions` with a simple regex (`/<[^>]+>/g`, `''`). Expose `steps: RouteStep[]` on `DirectionsRoute`.

**`app/page.tsx`**

Add `steps: RouteStep[]` to `RouteResponse`.

**`app/api/route/route.ts`**

Pass `steps` from `DirectionsRoute` through to the response routes unchanged (no scoring impact).

### Step progress in `NavigateScreen`

New state: `currentStepIdx` (number, starts at 0).

On each GPS position update: compute `haversine(pos, steps[currentStepIdx].end)`. When distance < 20m, advance `currentStepIdx` by 1. This advances automatically at walking/cycling speeds without geometric polyline projection.

If `currentStepIdx` reaches `steps.length - 1`, arrival detection (existing 30m / 5s dwell) handles the final approach.

### Map camera follow

On every GPS update in the existing `watchPosition` callback, call:
```ts
map?.easeTo({ center: [pos.lng, pos.lat], duration: 500 });
```

No pitch or bearing change — keep the map north-up for simplicity.

### UI layout

**Top bar** (existing, extended):
- Left: duration remaining + safety score (existing)
- Right: add remaining distance (sum of `distanceM` for steps from `currentStepIdx` onwards), formatted as "1.2 km" or "340 m"
- Far right: "End trip" button (moved from inline to here)

**Bottom panel** (new floating card):
- Positioned `bottom-6 left-4 right-4`
- White/95 background, rounded-2xl, shadow-lg — matches existing card style
- Layout (single row): `[maneuver icon 40×40] [instruction text + distance-to-turn]`
- Maneuver icon: SVG arrow mapped from `step.maneuver` string. Six shapes cover all cases:
  - `straight` / default → up arrow
  - `turn-left` / `fork-left` / `keep-left` / `ramp-left` → left arrow
  - `turn-right` / `fork-right` / `keep-right` / `ramp-right` → right arrow
  - `u-turn-left` / `u-turn-right` → U-turn arrow
  - `roundabout-left` / `roundabout-right` → circle arrow
  - `merge` → merge arrow
- Instruction text: current step's `instruction` (plain text, already stripped)
- Distance: live haversine distance to current step's endpoint, formatted to nearest 10m below 200m, nearest 100m above

### Files changed

- `lib/routing/google-directions.ts` — add `RouteStep` type + extract steps
- `app/page.tsx` — add `steps` to `RouteResponse`
- `app/api/route/route.ts` — pass through steps
- `components/screens/navigate.tsx` — step tracking, camera follow, new bottom panel + updated top bar

---

## Feature 3: High/Acute Report Re-routing

### Behaviour

During active navigation, if a HIGH severity + ACUTE type report appears within 500m of the user's position that was reported within the last 10 minutes, the app:

1. Voice: "High-priority report nearby. Checking for a safer route."
2. Immediately triggers the re-route check (bypasses the 30s cooldown by resetting `lastRerouteAt`).
3. Uses a lower re-route threshold (any improvement in safety score triggers a switch, rather than the existing 40% threshold).
4. If a different safer route is found: switch routes + voice: "Re-routing to avoid the report."
5. If the current route is still safest: voice: "No safer alternative. Stay alert."

### Implementation

New ref in `NavigateScreen`: `knownAcuteIds: MutableRefObject<Set<string>>` (tracks report IDs already processed to avoid re-triggering on the same report).

Consolidate the existing 50m geofence fetch and the new 500m acute check into a single `/api/reports/near` call at 500m per tick, then filter by radius in JS. In the existing 7s poll tick, replace the separate 50m fetch with a 500m fetch and split results by distance:

```ts
// One fetch, two uses
const nearbyData = await fetch(`/api/reports/near?lat=${pos.lat}&lng=${pos.lng}&radius=500`).then(r => r.json());
const within50m = nearbyData.reports.filter(r => haversine(pos, r) < 50);
const newHighAcute = nearbyData.reports.filter(r =>
  r.severity === 'high' &&
  r.type === 'acute' &&
  Date.now() - new Date(r.reported_at).getTime() < 10 * 60 * 1000 &&
  !knownAcuteIds.current.has(r.id)
);
```

Geofence prompt logic continues to use `within50m`. For `newHighAcute`:
```ts
if (newHighAcute.length > 0) {
  newHighAcute.forEach(r => knownAcuteIds.current.add(r.id));
  forceAcuteReroute.current = true;
  lastRerouteAt.current = 0;
  await v.speak("High-priority report nearby. Checking for a safer route.");
}
```

The re-route block checks `forceAcuteReroute.current`. When true: bypass the 30s cooldown check, use threshold `1.0` (any safety improvement triggers switch) instead of `REROUTE_THRESHOLD`, speak the acute-specific voice message, then set `forceAcuteReroute.current = false`.

### Files changed

- `components/screens/navigate.tsx` — new `knownAcuteIds` ref + acute report detection block + `forceAcuteReroute` flag in re-route logic

---

## Out of scope

- Map heading lock / bearing rotation during navigation
- Dutch language instructions
- Custom Mapbox cartography style

---

## Testing

- Autocomplete: manual — search "Centraal", verify dropdown appears, selecting a result navigates to route screen with correct coordinates.
- Step advance: manual — walk (or simulate position) past a step endpoint, verify instruction updates.
- Acute re-route: seed a new HIGH/ACUTE report in the DB at a nearby location during a test navigation session, verify voice fires and route switches within one poll cycle (≤7s).
- Existing 21 unit tests must still pass.
