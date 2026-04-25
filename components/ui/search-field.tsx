'use client';

import { SearchBox } from '@mapbox/search-js-react';

type SearchBoxRetrieveResponse = Parameters<
  NonNullable<Parameters<typeof SearchBox>[0]['onRetrieve']>
>[0];

export function SearchField({
  onRetrieve,
  value,
}: {
  onRetrieve: (coord: { lat: number; lng: number }, name: string) => void;
  value?: string;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

  function handleRetrieve(res: SearchBoxRetrieveResponse) {
    const feature = res.features[0];
    if (!feature) return;
    const [lng, lat] = feature.geometry.coordinates;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = feature.properties as any;
    const name: string = props?.name ?? props?.full_address ?? '';
    onRetrieve({ lat, lng }, name);
  }

  return (
    <div className="bg-white/95 rounded-2xl shadow-md backdrop-blur">
      <SearchBox
        accessToken={token}
        value={value}
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
            colorBackground: '#ffffff',
          },
        }}
      />
    </div>
  );
}
