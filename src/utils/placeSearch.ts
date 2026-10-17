// Place search for the map: OpenStreetMap data through the public Photon
// geocoder (no API key, fair use: debounce and keep requests small).

export type PlaceResult = {
  id: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
  kind: string;
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | number | undefined>;
};

/** Photon's GeoJSON features as list rows, skipping ones without a point. */
export function parsePhotonResponse(data: { features?: PhotonFeature[] }): PlaceResult[] {
  const seen = new Set<string>();
  return (data.features || []).flatMap((feature, index) => {
    const [lng, lat] = feature.geometry?.coordinates || [];
    const p = feature.properties || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const name = String(p.name || p.street || p.city || '').trim();
    if (!name) return [];
    const detail = [p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street !== name ? p.street : '',
      p.district || p.locality, p.city !== name ? p.city : '', p.state, p.country]
      .filter(part => part && String(part).trim()).map(String).filter((part, i, all) => all.indexOf(part) === i).join(', ');
    const key = `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: String(p.osm_id ?? index), name, detail, lat, lng, kind: String(p.osm_value || p.type || '') }];
  });
}

/** Places matching `query`, nearest to `near` first. */
export async function searchPlaces(query: string, near: { lat: number; lng: number }, signal?: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    q: query, limit: '8', lat: near.lat.toFixed(5), lon: near.lng.toFixed(5), location_bias_scale: '0.3'
  });
  const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!response.ok) throw new Error(`Place search failed (${response.status})`);
  return parsePhotonResponse(await response.json());
}
