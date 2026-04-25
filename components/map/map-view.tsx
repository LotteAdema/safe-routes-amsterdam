'use client';

import { useEffect, useRef } from 'react';
import mapboxgl, { type Map as MbMap } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const AMSTERDAM_CENTER: [number, number] = [4.9041, 52.3676];

const PAINT_OVERRIDES: Array<{ layer: string; prop: string; value: string }> = [
  { layer: 'background', prop: 'background-color', value: 'var(--map-land)' },
  { layer: 'land', prop: 'background-color', value: 'var(--map-land)' },
  { layer: 'road-primary', prop: 'line-color', value: 'var(--map-road)' },
  { layer: 'road-secondary-tertiary', prop: 'line-color', value: 'var(--map-road)' },
  { layer: 'road-street', prop: 'line-color', value: 'var(--map-road)' },
  { layer: 'road-pedestrian', prop: 'line-color', value: 'var(--map-road)' },
  { layer: 'water', prop: 'fill-color', value: 'var(--map-water)' },
  { layer: 'land-structure-polygon', prop: 'fill-color', value: 'var(--map-block)' },
];

function resolveCssVar(name: string): string {
  if (typeof window === 'undefined') return '#000';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

export function MapView({
  onReady,
  className,
}: {
  onReady?: (m: MbMap) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const m = new mapboxgl.Map({
      container: ref.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: AMSTERDAM_CENTER,
      zoom: 13,
      attributionControl: false,
    });
    mapRef.current = m;

    m.on('style.load', () => {
      for (const o of PAINT_OVERRIDES) {
        try {
          const value = o.value.startsWith('var(') ? resolveCssVar(o.value.slice(4, -1)) : o.value;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          m.setPaintProperty(o.layer, o.prop as any, value);
        } catch {
          /* layer may not exist; ignore */
        }
      }
      onReady?.(m);
    });

    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, [onReady]);

  return <div ref={ref} className={className ?? 'w-full h-full'} />;
}
