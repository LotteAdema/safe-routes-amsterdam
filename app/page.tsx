'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { HomeScreen } from '@/components/screens/home';
import { ReportScreen } from '@/components/screens/report';
import { RouteScreen } from '@/components/screens/route';
import { NavigateScreen, type NearReport } from '@/components/screens/navigate';
import { PromptOverlay } from '@/components/screens/prompt';
import { ArriveScreen } from '@/components/screens/arrive';
import type { RouteStep } from '@/lib/routing/google-directions';
import { EmergencyButton } from '@/components/ui/emergency-button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

type Screen = 'home' | 'report' | 'route' | 'navigate' | 'arrive';

export type Coord = { lat: number; lng: number };

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

export type AppState = {
  screen: Screen;
  origin: Coord | null;
  destination: Coord | null;
  destinationName: string | null;
  routes: RouteResponse[];
  activeRouteId: string | null;
  mode: 'walking' | 'cycling';
  activePrompt: NearReport | null;
};

export default function Page() {
  const [state, setState] = useState<AppState>({
    screen: 'home',
    origin: null,
    destination: null,
    destinationName: null,
    routes: [],
    activeRouteId: null,
    mode: 'walking',
    activePrompt: null,
  });

  // Counts only when the user actually answers a prompt (yes/no), not on skip.
  // Lifted here so PromptOverlay's onCounted can increment the cap that
  // NavigateScreen reads from inside its poll-loop.
  const promptCountRef = useRef(0);

  // Report IDs filed from this device this session — never re-prompt them.
  // Spec §7: "Skip own reports entirely."
  const ownReportIdsRef = useRef<Set<string>>(new Set());

  const [pos, setPos] = useState<Coord | null>(null);
  useEffect(() => {
    // Request location + mic permissions upfront so they're granted before an emergency.
    if (typeof navigator === 'undefined') return;
    if ('geolocation' in navigator) {
      const id = navigator.geolocation.watchPosition(
        (g) => setPos({ lat: g.coords.latitude, lng: g.coords.longitude }),
        () => {},
        { enableHighAccuracy: true },
      );
      navigator.mediaDevices?.getUserMedia({ audio: true })
        .then((s) => s.getTracks().forEach((t) => t.stop()))
        .catch(() => {});
      return () => navigator.geolocation.clearWatch(id);
    }
  }, []);

  const goto = useCallback((screen: Screen) => {
    setState((s) => ({ ...s, screen }));
  }, []);

  const setRoutes = useCallback((routes: RouteResponse[]) => {
    setState((s) => ({ ...s, routes, activeRouteId: routes[0]?.id ?? null }));
  }, []);

  const setMode = useCallback((mode: 'walking' | 'cycling') => {
    setState((s) => ({ ...s, mode }));
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[var(--paper)]">
      <ThemeToggle />
      <EmergencyButton />
      {state.screen === 'home' && (
        <HomeScreen
          initialPosition={pos}
          destinationName={state.destinationName}
          onSearch={(dest, name) =>
            setState((s) => ({
              ...s,
              origin: pos ?? { lat: 52.3676, lng: 4.9041 },
              destination: dest,
              destinationName: name,
              screen: 'route',
            }))
          }
          onReport={() => goto('report')}
        />
      )}
      {state.screen === 'report' && (
        <ReportScreen
          onDone={() => goto('home')}
          onReported={(id) => ownReportIdsRef.current.add(id)}
          initialPosition={pos}
          autoStart
        />
      )}
      {state.screen === 'route' && state.origin && state.destination && (
        <RouteScreen
          origin={state.origin}
          destination={state.destination}
          destinationName={state.destinationName}
          mode={state.mode}
          onModeChange={setMode}
          routes={state.routes}
          setRoutes={setRoutes}
          onStart={(activeRouteId) => setState((s) => ({ ...s, activeRouteId, screen: 'navigate' }))}
          onCancel={() => goto('home')}
          onDestinationChange={(dest, name) =>
            setState((s) => ({ ...s, destination: dest, destinationName: name, routes: [] }))
          }
        />
      )}
      {state.screen === 'navigate' && state.origin && state.destination && state.activeRouteId && (
        <>
          <NavigateScreen
            origin={state.origin}
            destination={state.destination}
            mode={state.mode}
            routes={state.routes}
            activeRouteId={state.activeRouteId}
            promptCountRef={promptCountRef}
            ownReportIdsRef={ownReportIdsRef}
            onArrive={() => goto('arrive')}
            onCancel={() => goto('home')}
            onPromptOpen={(r) => setState((s) => ({ ...s, activePrompt: r }))}
            onActiveRouteChange={(rs, id) =>
              setState((s) => ({ ...s, routes: rs, activeRouteId: id }))
            }
          />
          {state.activePrompt && state.origin && (
            <PromptOverlay
              report={state.activePrompt}
              position={state.origin}
              onClose={() => setState((s) => ({ ...s, activePrompt: null }))}
              onCounted={() => {
                promptCountRef.current += 1;
              }}
            />
          )}
        </>
      )}
      {state.screen === 'arrive' && state.activeRouteId && (() => {
        const active = state.routes.find((r) => r.id === state.activeRouteId);
        if (!active) return null;
        return <ArriveScreen activeRoute={active} mode={state.mode} onDone={() => goto('home')} />;
      })()}
    </main>
  );
}
