'use client';

import { SearchBox } from '@mapbox/search-js-react';

type SearchBoxRetrieveResponse = Parameters<
  NonNullable<Parameters<typeof SearchBox>[0]['onRetrieve']>
>[0];

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
