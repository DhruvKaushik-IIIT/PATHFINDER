// Server-only: Open-Meteo hourly forecast (free, no key). Used by the Route Check agent's get_weather tool.
const TTL_MS = 30 * 60_000;
const cache = new Map<string, { at: number; data: Hourly }>();

interface Hourly {
  time: string[];
  precipitation: number[];
  snowfall: number[];
  temperature_2m: number[];
  weather_code: number[];
  precipitation_probability: number[];
}

export interface WeatherAt {
  at: string; // local hour (IST)
  tempC: number;
  rainMm: number;
  snowCm: number;
  rainChancePct: number;
  description: string;
  /** Next 6 hours from `at`: total rain mm + max chance — what a driver cares about. */
  next6h: { rainMm: number; snowCm: number; maxRainChancePct: number };
  elevationM: number | null;
}

// WMO weather codes (subset), plain words.
function describe(code: number): string {
  if (code === 0) return "clear";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain showers";
  if (code <= 86) return "snow showers";
  return "thunderstorm";
}

async function fetchHourly(lat: number, lng: number): Promise<{ hourly: Hourly; elevation: number | null }> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    "&hourly=precipitation,snowfall,temperature_2m,weather_code,precipitation_probability&forecast_days=3&timezone=Asia%2FKolkata";
  let lastErr: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
      const body = (await res.json()) as { hourly: Hourly; elevation?: number };
      return { hourly: body.hourly, elevation: body.elevation ?? null };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Throws if Open-Meteo is unreachable; the tool turns that into a message the model can work with. */
export async function weatherAt(lat: number, lng: number, atIso: string): Promise<WeatherAt> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at > TTL_MS) {
    const { hourly, elevation } = await fetchHourly(lat, lng);
    hit = { at: Date.now(), data: { ...hourly, elevation } as Hourly & { elevation: number | null } };
    cache.set(key, hit);
  }
  const h = hit.data as Hourly & { elevation: number | null };
  // Hourly times are local (IST) without offset → compare as IST.
  const target = new Date(atIso).getTime();
  let i = h.time.findIndex((t) => new Date(`${t}:00+05:30`).getTime() > target) - 1;
  if (i < 0) i = target < new Date(`${h.time[0]}:00+05:30`).getTime() ? 0 : h.time.length - 1;
  const win = (arr: number[]) => arr.slice(i, i + 6);
  const sum = (arr: number[]) => Math.round(arr.reduce((t, x) => t + (x ?? 0), 0) * 10) / 10;
  return {
    at: `${h.time[i]} IST`,
    tempC: h.temperature_2m[i]!,
    rainMm: h.precipitation[i]!,
    snowCm: h.snowfall[i]!,
    rainChancePct: h.precipitation_probability[i] ?? 0,
    description: describe(h.weather_code[i]!),
    next6h: { rainMm: sum(win(h.precipitation)), snowCm: sum(win(h.snowfall)), maxRainChancePct: Math.max(0, ...win(h.precipitation_probability)) },
    elevationM: h.elevation,
  };
}
