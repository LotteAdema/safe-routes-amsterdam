'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import { MapView } from '@/components/map/map-view';
import { ReportPins, type Pin } from '@/components/map/report-pins';
import { RouteLine } from '@/components/map/route-line';
import { UserLocationDot } from '@/components/map/user-location-dot';
import { ManeuverIcon } from '@/components/ui/maneuver-icon';
import { formatDistance, remainingDistance } from '@/lib/navigate/format';
import { isNewHighAcute } from '@/lib/navigate/acute';
import { getVoice } from '@/lib/voice';
import type { Coord, RouteResponse } from '@/app/page';

const POLL_MS = 7_000;
const REROUTE_MIN_MS = 30_000;
const REROUTE_THRESHOLD = 0.6;

export function NavigateScreen({
  origin,
  destination,
  mode,
  routes,
  activeRouteId,
  promptCountRef,
  ownReportIdsRef,
  onArrive,
  onCancel,
  onPromptOpen,
  onActiveRouteChange,
}: {
  origin: Coord;
  destination: Coord;
  mode: 'walking' | 'cycling';
  routes: RouteResponse[];
  activeRouteId: string;
  promptCountRef: MutableRefObject<number>;
  ownReportIdsRef: MutableRefObject<Set<string>>;
  onArrive: () => void;
  onCancel: () => void;
  onPromptOpen: (report: NearReport) => void;
  onActiveRouteChange: (rs: RouteResponse[], activeId: string) => void;
}) {
  const [map, setMap] = useState<MbMap | null>(null);
  const [pos, setPos] = useState<Coord | null>(origin);
  const [pins, setPins] = useState<Pin[]>([]);

  // Reset step index when the active route changes (React "adjust state during render" pattern).
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [prevRouteId, setPrevRouteId] = useState(activeRouteId);
  if (prevRouteId !== activeRouteId) {
    setPrevRouteId(activeRouteId);
    setCurrentStepIdx(0);
  }

  const lastRerouteAt = useRef(0);
  const promptedIds = useRef<Set<string>>(new Set());
  const lastPromptAt = useRef(0);
  const arrivalDwellSince = useRef(0);
  const knownAcuteIds = useRef<Set<string>>(new Set());
  const forceAcuteReroute = useRef(false);

  // Refs kept current so GPS callback (which has [] deps) can read latest values.
  const routesRef = useRef(routes);
  const activeRouteIdRef = useRef(activeRouteId);
  useEffect(() => {
    routesRef.current = routes;
    activeRouteIdRef.current = activeRouteId;
  }, [routes, activeRouteId]);

  // Reset prompt tracking refs when route changes.
  useEffect(() => {
    promptCountRef.current = 0;
    lastPromptAt.current = 0;
    promptedIds.current.clear();
    arrivalDwellSince.current = 0;
  }, [activeRouteId, promptCountRef]);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    let lastAccepted: { lat: number; lng: number; t: number } | null = null;
    const id = navigator.geolocation.watchPosition(
      (g) => {
        if (g.coords.accuracy > 50) return;
        const next = { lat: g.coords.latitude, lng: g.coords.longitude };
        const now = Date.now();
        if (lastAccepted) {
          const dist = haversine(lastAccepted, next);
          const dt = (now - lastAccepted.t) / 1000;
          if (dt > 0 && dist / dt > 100) return;
        }
        lastAccepted = { ...next, t: now };
        setPos(next);

        // Step advance inside the GPS callback using current refs.
        setCurrentStepIdx((prevIdx) => {
          const activeSteps =
            routesRef.current.find((r) => r.id === activeRouteIdRef.current)?.steps ?? [];
          const step = activeSteps[prevIdx];
          if (!step) return prevIdx;
          const dist = haversine(next, { lat: step.endLat, lng: step.endLng });
          return dist < 20 && prevIdx < activeSteps.length - 1 ? prevIdx + 1 : prevIdx;
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Camera follow.
  useEffect(() => {
    if (!pos || !map) return;
    map.easeTo({ center: [pos.lng, pos.lat], duration: 500 });
  }, [pos, map]);

  useEffect(() => {
    if (!pos) return;
    const tick = async () => {
      const dToDest = haversine(pos, destination);
      if (dToDest < 30) {
        if (arrivalDwellSince.current === 0) {
          arrivalDwellSince.current = Date.now();
        } else if (Date.now() - arrivalDwellSince.current >= 5_000) {
          onArrive();
          return;
        }
      } else {
        arrivalDwellSince.current = 0;
      }

      const allNearby = await fetch(
        `/api/reports/near?lat=${pos.lat}&lng=${pos.lng}&radius=500`,
      )
        .then((r) => r.json())
        .catch(() => ({ reports: [] }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allReports: any[] = allNearby.reports ?? [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      const sinceLastPrompt = Date.now() - lastPromptAt.current;
      if (promptCountRef.current < 2 && sinceLastPrompt > 60_000) {
        const eligible = allReports.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (r: any) =>
            haversine(pos, { lat: Number(r.lat), lng: Number(r.lng) }) < 50 &&
            !promptedIds.current.has(r.id) &&
            !ownReportIdsRef.current.has(r.id),
        );
        if (eligible.length > 0) {
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
    };
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(tick, POLL_MS);
      tick();
    };
    const stop = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [
    pos,
    destination,
    mode,
    routes,
    activeRouteId,
    promptCountRef,
    ownReportIdsRef,
    onArrive,
    onPromptOpen,
    onActiveRouteChange,
  ]);

  useEffect(() => {
    if (!pos) return;
    fetch(`/api/reports/near?lat=${pos.lat}&lng=${pos.lng}&radius=2000`)
      .then((r) => r.json())
      .then((data) => {
        setPins(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data.reports ?? []).map((r: any) => ({
            id: r.id,
            lat: Number(r.lat),
            lng: Number(r.lng),
            severity: r.severity,
            type: r.type,
          })),
        );
      })
      .catch(() => {
        /* DB not ready */
      });
  }, [pos]);

  const drawn = routes.map((r, i) => ({
    id: r.id,
    polyline: r.polyline,
    rank: i,
    active: r.id === activeRouteId,
  }));
  const active = routes.find((r) => r.id === activeRouteId);
  const steps = active?.steps ?? [];

  return (
    <div className="absolute inset-0">
      <MapView className="absolute inset-0" onReady={setMap} />
      <ReportPins map={map} pins={pins} />
      <RouteLine map={map} routes={drawn} mode={mode} />
      <UserLocationDot map={map} position={pos} />

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
    </div>
  );
}

export type NearReport = {
  id: string;
  type: 'acute' | 'environmental';
  severity: 'low' | 'medium' | 'high';
  summary: string;
  lat: number;
  lng: number;
  reported_at: string;
};

function severityWeight(severity: string, type: string): number {
  const s = severity === 'high' ? 10 : severity === 'medium' ? 3 : 1;
  const t = type === 'acute' ? 4 : 1;
  return s * t;
}

function haversine(a: Coord, b: Coord): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
