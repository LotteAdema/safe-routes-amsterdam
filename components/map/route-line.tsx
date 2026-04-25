'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import { decodePolyline } from '@/lib/routing/decode-polyline';

export type DrawnRoute = {
  id: string;
  polyline: string;
  /** rank 0 = safest (drawn last, on top, thicker) */
  rank: number;
  active: boolean;
};

function resolveVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function RouteLine({ map, routes }: { map: MbMap | null; routes: DrawnRoute[] }) {
  useEffect(() => {
    if (!map) return;

    const colorByRank = (rank: number) =>
      rank === 0
        ? resolveVar('--primary')
        : rank === 1
          ? resolveVar('--sev-mid')
          : resolveVar('--sev-high');

    for (const id of (map.getStyle()?.layers ?? []).map((l) => l.id)) {
      if (id.startsWith('route-line-')) map.removeLayer(id);
    }
    for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
      if (id.startsWith('route-src-')) map.removeSource(id);
    }

    const sorted = [...routes].sort((a, b) => b.rank - a.rank);
    for (const r of sorted) {
      const pts = decodePolyline(r.polyline).map(([lat, lng]) => [lng, lat]);
      const srcId = `route-src-${r.id}`;
      const layerId = `route-line-${r.id}`;
      map.addSource(srcId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: pts },
        } as any,
      });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: srcId,
        paint: {
          'line-color': colorByRank(r.rank),
          'line-width': r.rank === 0 ? 6 : 4,
          'line-opacity': r.rank === 0 ? 1 : 0.6,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }
  }, [map, routes]);

  return null;
}
