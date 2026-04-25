'use client';

import { useEffect, useState } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import { MapView } from '@/components/map/map-view';
import { ReportPins, type Pin } from '@/components/map/report-pins';
import { SearchField } from '@/components/ui/search-field';
import { ReportsNearbyBadge } from '@/components/ui/reports-nearby-badge';
import type { Coord } from '@/app/page';

export function HomeScreen({
  onSearch,
  onReport,
  initialPosition,
}: {
  onSearch: (destination: Coord) => void;
  onReport: () => void;
  initialPosition: Coord | null;
}) {
  const [map, setMap] = useState<MbMap | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [destinationText, setDestinationText] = useState('');
  const [nearbyCount, setNearbyCount] = useState<number | null>(null);

  useEffect(() => {
    const center = initialPosition ?? { lat: 52.3676, lng: 4.9041 };
    fetch(`/api/reports/near?lat=${center.lat}&lng=${center.lng}&radius=2000`)
      .then((r) => r.json())
      .then((data) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = (data.reports ?? []) as any[];
        setPins(
          list.map((r) => ({
            id: r.id,
            lat: Number(r.lat),
            lng: Number(r.lng),
            severity: r.severity,
            type: r.type,
          })),
        );
        const recent = list.filter(
          (r) => Date.now() - new Date(r.reported_at).getTime() < 3600_000,
        ).length;
        setNearbyCount(recent);
      })
      .catch(() => {
        /* DB not ready, render gracefully */
      });
  }, [initialPosition]);

  const onSearchSubmit = async () => {
    if (!destinationText.trim()) return;
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(destinationText)}.json` +
        `?proximity=4.9041,52.3676&country=nl&limit=1` +
        `&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`,
    );
    const data = await r.json();
    const f = data.features?.[0];
    if (!f) return;
    const [lng, lat] = f.center;
    onSearch({ lat, lng });
  };

  return (
    <div className="absolute inset-0">
      <MapView className="absolute inset-0" onReady={setMap} />
      <ReportPins map={map} pins={pins} />

      <div className="absolute top-3 left-3 right-3">
        <SearchField
          value={destinationText}
          onChange={setDestinationText}
          onSubmit={onSearchSubmit}
        />
      </div>

      {nearbyCount !== null && (
        <div className="absolute top-[64px] left-4">
          <ReportsNearbyBadge count={nearbyCount} />
        </div>
      )}

      <div className="absolute bottom-6 left-4 right-4">
        <button
          onClick={onReport}
          className="w-full rounded-2xl px-5 py-4 text-left text-white bg-[var(--primary)]
                     shadow-lg active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🎤</span>
            <div className="leading-tight">
              <div className="display text-base">Report what you see</div>
              <div className="text-xs opacity-80">Hold to speak — anonymous</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
