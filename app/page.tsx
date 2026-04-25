'use client';

import { useState, useCallback } from 'react';

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
};

export type AppState = {
  screen: Screen;
  origin: Coord | null;
  destination: Coord | null;
  routes: RouteResponse[];
  activeRouteId: string | null;
  mode: 'walking' | 'cycling';
};

export default function Page() {
  const [state, setState] = useState<AppState>({
    screen: 'home',
    origin: null,
    destination: null,
    routes: [],
    activeRouteId: null,
    mode: 'walking',
  });

  const goto = useCallback((screen: Screen) => {
    setState((s) => ({ ...s, screen }));
  }, []);

  const setRoutes = useCallback((routes: RouteResponse[]) => {
    setState((s) => ({ ...s, routes, activeRouteId: routes[0]?.id ?? null }));
  }, []);
  void setRoutes;

  return (
    <main className="fixed inset-0 overflow-hidden bg-[var(--paper)]">
      {state.screen === 'home' && (
        <HomeStub onSearch={(dest) => {
          setState((s) => ({ ...s, destination: dest, screen: 'route' }));
        }} onReport={() => goto('report')} />
      )}
      {state.screen === 'report' && (
        <ReportStub onDone={() => goto('home')} />
      )}
      {state.screen === 'route' && (
        <RouteStub onStart={() => goto('navigate')} onCancel={() => goto('home')} />
      )}
      {state.screen === 'navigate' && (
        <NavigateStub onArrive={() => goto('arrive')} onCancel={() => goto('home')} />
      )}
      {state.screen === 'arrive' && (
        <ArriveStub onDone={() => goto('home')} />
      )}
    </main>
  );
}

function HomeStub({ onSearch, onReport }: {
  onSearch: (d: Coord) => void;
  onReport: () => void;
}) {
  return (
    <div className="p-6">
      <h1 className="display text-2xl">Home (stub)</h1>
      <button className="mt-4 underline" onClick={() => onSearch({ lat: 52.3791, lng: 4.9000 })}>
        Mock: search Centraal
      </button>
      <button className="mt-4 ml-4 underline" onClick={onReport}>Report (stub)</button>
    </div>
  );
}
function ReportStub({ onDone }: { onDone: () => void }) {
  return <button className="m-6 underline" onClick={onDone}>Report stub — back</button>;
}
function RouteStub({ onStart, onCancel }: { onStart: () => void; onCancel: () => void }) {
  return (
    <div className="p-6">
      <h1 className="display text-2xl">Route (stub)</h1>
      <button className="m-2 underline" onClick={onStart}>Start</button>
      <button className="m-2 underline" onClick={onCancel}>Cancel</button>
    </div>
  );
}
function NavigateStub({ onArrive, onCancel }: { onArrive: () => void; onCancel: () => void }) {
  return (
    <div className="p-6">
      <h1 className="display text-2xl">Navigate (stub)</h1>
      <button className="m-2 underline" onClick={onArrive}>Mock arrive</button>
      <button className="m-2 underline" onClick={onCancel}>Cancel</button>
    </div>
  );
}
function ArriveStub({ onDone }: { onDone: () => void }) {
  return (
    <div className="p-6">
      <h1 className="display text-2xl">Arrive (stub)</h1>
      <button className="m-2 underline" onClick={onDone}>Done</button>
    </div>
  );
}
