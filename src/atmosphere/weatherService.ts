import { ATMOSPHERE_CONFIG, DEFAULT_LOCATION } from "./config";

export interface RawWeatherSample {
  temperature: number | null;
  weatherCode: number | null;
  isDay: boolean;
  windSpeed: number;
  windDirection: number;
  cloudCover: number; // 0..100
  precipitationMm: number;
  sunriseHour: number;
  sunsetHour: number;
  latitude: number;
  longitude: number;
  fetchedAt: number;
}

export interface WeatherLocation {
  latitude: number;
  longitude: number;
  source: "geolocation" | "default";
}

interface StoredWeatherEntry {
  savedAt: number;
  coordKey: string;
  sample: RawWeatherSample;
}

function toCoordKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function parseIsoHour(isoDateTime: string | undefined, fallback: number): number {
  if (!isoDateTime) return fallback;
  const timePart = isoDateTime.split("T")[1];
  if (!timePart) return fallback;
  const [hh, mm] = timePart.split(":");
  const hour = Number.parseInt(hh ?? "", 10);
  const minute = Number.parseInt(mm ?? "0", 10);
  if (Number.isNaN(hour)) return fallback;
  return hour + (Number.isNaN(minute) ? 0 : minute) / 60;
}

export function readFreshWeatherCache(
  latitude: number,
  longitude: number,
  expectedIsDay: boolean,
): RawWeatherSample | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATMOSPHERE_CONFIG.weatherCacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredWeatherEntry>;
    if (
      typeof parsed?.savedAt !== "number" ||
      Date.now() - parsed.savedAt >= ATMOSPHERE_CONFIG.weatherCacheTtlMs ||
      parsed.coordKey !== toCoordKey(latitude, longitude) ||
      !parsed.sample ||
      typeof parsed.sample.isDay !== "boolean" ||
      parsed.sample.isDay !== expectedIsDay
    ) {
      return null;
    }
    return parsed.sample;
  } catch {
    return null;
  }
}

export function writeWeatherCache(sample: RawWeatherSample): void {
  if (typeof window === "undefined") return;
  try {
    const entry: StoredWeatherEntry = {
      savedAt: Date.now(),
      coordKey: toCoordKey(sample.latitude, sample.longitude),
      sample,
    };
    window.localStorage.setItem(ATMOSPHERE_CONFIG.weatherCacheKey, JSON.stringify(entry));
  } catch {
    // Ignore storage quota or privacy mode restrictions.
  }
}

export async function resolveVisitorLocation(signal?: AbortSignal): Promise<WeatherLocation> {
  const fallback: WeatherLocation = {
    latitude: DEFAULT_LOCATION.latitude,
    longitude: DEFAULT_LOCATION.longitude,
    source: "default",
  };

  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return fallback;
  }

  try {
    if ("permissions" in navigator && typeof navigator.permissions.query === "function") {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      if (permission.state === "denied") {
        return fallback;
      }
    }
  } catch {
    // Continue gracefully if Permissions API rejects geolocation query.
  }

  if (signal?.aborted) return fallback;

  return new Promise<WeatherLocation>((resolve) => {
    let settled = false;
    const finish = (loc: WeatherLocation) => {
      if (settled) return;
      settled = true;
      resolve(loc);
    };

    const onAbort = () => finish(fallback);
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          signal?.removeEventListener("abort", onAbort);
          finish({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            source: "geolocation",
          });
        },
        () => {
          signal?.removeEventListener("abort", onAbort);
          finish(fallback);
        },
        {
          enableHighAccuracy: false,
          timeout: ATMOSPHERE_CONFIG.geolocationTimeoutMs,
          maximumAge: ATMOSPHERE_CONFIG.geolocationMaxAgeMs,
        },
      );
    } catch {
      signal?.removeEventListener("abort", onAbort);
      finish(fallback);
    }
  });
}

export async function fetchLiveWeather(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<RawWeatherSample | null> {
  try {
    const url =
      `${ATMOSPHERE_CONFIG.openMeteoBaseUrl}?latitude=${encodeURIComponent(latitude.toFixed(4))}` +
      `&longitude=${encodeURIComponent(longitude.toFixed(4))}` +
      "&current=temperature_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation,rain,showers" +
      "&daily=sunrise,sunset&forecast_days=1&timezone=auto";

    const response = await fetch(url, { signal });
    if (!response.ok) return null;

    const result = (await response.json()) as {
      current?: {
        temperature_2m?: number;
        weather_code?: number;
        is_day?: number;
        wind_speed_10m?: number;
        wind_direction_10m?: number;
        cloud_cover?: number;
        precipitation?: number;
        rain?: number;
        showers?: number;
      };
      daily?: {
        sunrise?: string[];
        sunset?: string[];
      };
    };

    const cur = result.current;
    if (!cur || typeof cur.temperature_2m !== "number") {
      return null;
    }

    const precipTotal = Math.max(
      cur.precipitation ?? 0,
      (cur.rain ?? 0) + (cur.showers ?? 0),
    );

    const sample: RawWeatherSample = {
      temperature: cur.temperature_2m,
      weatherCode: cur.weather_code ?? null,
      isDay: cur.is_day === 1,
      windSpeed: cur.wind_speed_10m ?? 0,
      windDirection: cur.wind_direction_10m ?? 180,
      cloudCover: cur.cloud_cover ?? 0,
      precipitationMm: precipTotal,
      sunriseHour: parseIsoHour(result.daily?.sunrise?.[0], 6.2),
      sunsetHour: parseIsoHour(result.daily?.sunset?.[0], 19.2),
      latitude,
      longitude,
      fetchedAt: Date.now(),
    };

    writeWeatherCache(sample);
    return sample;
  } catch {
    return null;
  }
}
