'use client';

import { useEffect, useState } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import { MapView } from '@/components/map/map-view';
import { ReportPins, type Pin } from '@/components/map/report-pins';
import { RouteLine } from '@/components/map/route-line';
import { UserLocationDot } from '@/components/map/user-location-dot';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { getVoice } from '@/lib/voice';
import type { NearReport } from '@/components/screens/navigate';
import type { RouteResponse, Coord } from '@/app/page';
import dynamic from 'next/dynamic';
const SearchField = dynamic(() => import('@/components/ui/search-field').then(m => m.SearchField), { ssr: false });

export function RouteScreen({
  origin, destination, destinationName, mode, onModeChange,
  onStart, onCancel, onDestinationChange, setRoutes, routes,
}: {
  origin: Coord;
  destination: Coord;
  destinationName?: string | null;
  mode: 'walking' | 'cycling';
  onModeChange: (mode: 'walking' | 'cycling') => void;
  onStart: (activeRouteId: string) => void;
  onCancel: () => void;
  onDestinationChange: (dest: Coord, name: string) => void;
  setRoutes: (rs: RouteResponse[]) => void;
  routes: RouteResponse[];
}) {
  const [map, setMap] = useState<MbMap | null>(null);
  const [reports, setReports] = useState<NearReport[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [reasonPlaces, setReasonPlaces] = useState<Record<string, string>>({});

  useEffect(() => {
    setRoutes([]);
    setActiveId(null);
    setError(null);
    fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, mode }),
    }).then((r) => r.json()).then(async (data) => {
      const rs: RouteResponse[] = data.routes ?? [];
      if (rs.length === 0) { setError('no_routes'); return; }
      setRoutes(rs);
      setActiveId(rs[0].id);

      const v = await getVoice();
      const fastest = [...rs].sort((a, b) => a.duration_min - b.duration_min)[0];
      const safest = rs[0];
      if (safest.id === fastest.id) {
        await v.speak(`Routing you there. ${safest.duration_min} minutes.`);
      } else {
        const extra = safest.duration_min - fastest.duration_min;
        const reason = safest.reasons[0] ?? 'fewer reports along this path';
        await v.speak(`Picked the safer route. ${reason}. ${extra} minutes longer.`);
      }
    }).catch(() => setError('fetch_failed'));
  }, [origin, destination, mode, setRoutes]);

  useEffect(() => {
    fetch(`/api/reports/near?lat=${origin.lat}&lng=${origin.lng}&radius=2000`)
      .then((r) => r.json()).then((data) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setReports((data.reports ?? []).map((r: any) => ({
          id: r.id, lat: Number(r.lat), lng: Number(r.lng),
          severity: r.severity, type: r.type,
          summary: r.summary, reported_at: r.reported_at,
        })));
      }).catch(() => { /* DB not ready */ });
  }, [origin]);

  const pins: Pin[] = reports.map((r) => ({
    id: r.id, lat: r.lat, lng: r.lng, severity: r.severity, type: r.type,
  }));
  const drawn = routes.map((r, i) => ({
    id: r.id, polyline: r.polyline, rank: i, active: r.id === activeId,
  }));
  const active = routes.find((r) => r.id === activeId);

  const routeLabels = new Map<string, string>();
  if (routes.length > 0) {
    const safest = routes.reduce((a, b) => (a.safety_score < b.safety_score ? a : b));
    const fastest = routes.reduce((a, b) => (a.duration_min < b.duration_min ? a : b));
    const shortest = routes.reduce((a, b) => (a.distance_m < b.distance_m ? a : b));
    for (const r of routes) {
      if (r.id === safest.id) routeLabels.set(r.id, 'Safest');
      else if (r.id === fastest.id) routeLabels.set(r.id, 'Fastest');
      else if (r.id === shortest.id) routeLabels.set(r.id, 'Shortest');
      else routeLabels.set(r.id, 'Alt');
    }
  }
  const labelFor = (r: RouteResponse) => routeLabels.get(r.id) ?? 'Alt';

  useEffect(() => {
    if (!active || reports.length === 0) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const reason of active.reasons) {
        const m = reason.match(/avoids (?:acute|environmental) report:\s*(.+?)\.?$/i);
        if (!m) continue;
        const snippet = m[1].slice(0, 30).toLowerCase();
        const matched = reports.find(
          (r) => r.summary && r.summary.toLowerCase().includes(snippet),
        );
        if (!matched) continue;
        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${matched.lng},${matched.lat}.json` +
              `?access_token=${token}&types=address,neighborhood,locality&limit=1&language=nl`,
          );
          const data = await res.json();
          const place = data.features?.[0]?.text;
          if (place) next[reason] = place;
        } catch { /* skip */ }
      }
      if (!cancelled) setReasonPlaces(next);
    })();
    return () => { cancelled = true; };
  }, [active, reports]);

  return (
    <div className="absolute inset-0">
      <MapView className="absolute inset-0" onReady={setMap} />
      <ReportPins map={map} pins={pins} />
      <RouteLine map={map} routes={drawn} mode={mode} />
      <UserLocationDot map={map} position={origin} />

      <div className="absolute top-3 left-20 right-20">
        <SearchField
          value={destinationName ?? undefined}
          onRetrieve={onDestinationChange}
        />
      </div>

      <BottomSheet expanded={sheetExpanded} onExpandedChange={setSheetExpanded}>
        {sheetExpanded && (
          <div className="flex bg-[var(--paper-2)] rounded-xl p-1 mb-4">
            <button
              onClick={() => onModeChange('walking')}
              aria-pressed={mode === 'walking'}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all active:scale-[0.98]
                ${mode === 'walking'
                  ? 'bg-[var(--card)] text-[var(--ink)] shadow-sm'
                  : 'text-[var(--ink-3)]'}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="13" cy="4" r="2" />
                <path d="m11 8-3 4 3 1v4l-2 4" />
                <path d="M14 7l1 4 4 2" />
              </svg>
              <span className="text-sm">Walk</span>
            </button>
            <button
              onClick={() => onModeChange('cycling')}
              aria-pressed={mode === 'cycling'}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all active:scale-[0.98]
                ${mode === 'cycling'
                  ? 'bg-[var(--card)] text-[var(--ink)] shadow-sm'
                  : 'text-[var(--ink-3)]'}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="6" cy="17" r="3" />
                <circle cx="18" cy="17" r="3" />
                <path d="M6 17l4-7h6l-3 7" />
                <path d="M14 5h2l2 4" />
              </svg>
              <span className="text-sm">Bike</span>
            </button>
          </div>
        )}
        {error && (
          <p className="text-[var(--sev-acute)]">
            Couldn&rsquo;t find a route there — try a different destination.
          </p>
        )}
        {!error && !active && (
          <div className="flex items-center gap-3 py-1">
            <span className="text-[var(--ink-3)]">Finding the safest route</span>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
        )}
        {active && (
          <>
            <h2 className="display text-xl text-[var(--ink)]">
              {labelFor(active)} route
            </h2>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="display text-4xl text-[var(--ink)] leading-none">
                {active.duration_min}
              </span>
              <span className="text-sm text-[var(--ink-3)]">
                min · {(active.distance_m / 1000).toFixed(1)} km
              </span>
            </div>
            <p className="text-sm text-[var(--ink-3)] mt-1">
              Arrive at {new Date(Date.now() + active.duration_min * 60_000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
            </p>
            {(() => {
              const visible = active.reasons.filter(
                (r) => sheetExpanded || /acute report/i.test(r),
              );
              if (visible.length === 0) return null;
              return (
                <ul className="text-sm text-[var(--ink-2)] mt-3 space-y-1">
                  {visible.map((r, i) => (
                    <li key={i}>
                      · {r}
                      {reasonPlaces[r] && (
                        <span className="text-[var(--ink-3)]"> — near {reasonPlaces[r]}</span>
                      )}
                    </li>
                  ))}
                </ul>
              );
            })()}
            <div className="flex gap-2 mt-4">
              {routes.map((r) => (
                <button key={r.id} onClick={() => setActiveId(r.id)}
                  className={`flex-1 py-2 rounded-xl text-sm active:scale-[0.98] transition-transform
                    ${r.id === activeId
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-[var(--paper-2)] text-[var(--ink)]'}`}>
                  {labelFor(r)} · {r.duration_min}m
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={onCancel}
                className="flex-1 py-3 rounded-xl bg-[var(--paper-2)] text-[var(--ink)]">
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!active) return;
                  const v = await getVoice();
                  v.speak(`Starting your route. ${active.duration_min} minutes. Stay aware.`);
                  onStart(active.id);
                }}
                className="flex-[2] py-3 rounded-xl bg-[var(--primary)] text-white display">
                Start
              </button>
            </div>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
