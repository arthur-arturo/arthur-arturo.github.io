export interface GeoLocationConfig {
  latitude: number;
  longitude: number;
  label: string;
  timezone: string;
}

export const DEFAULT_LOCATION: GeoLocationConfig = {
  latitude: -34.6037,
  longitude: -58.3816,
  label: "Buenos Aires",
  timezone: "America/Argentina/Buenos_Aires",
};

export const ATMOSPHERE_CONFIG = {
  openMeteoBaseUrl: "https://api.open-meteo.com/v1/forecast",
  weatherRefreshMs: 10 * 60_000,
  weatherCacheTtlMs: 10 * 60_000,
  weatherCacheKey: "portfolio-atmosphere-weather-v2",
  geolocationTimeoutMs: 6_000,
  geolocationMaxAgeMs: 10 * 60_000,
  clockTickMs: 30_000,
  windyThresholdKmh: 16,
  strongWindKmh: 38,
  partlyCloudyMin: 0.25,
  overcastMin: 0.78,
  transitionLerpSpeed: 2.2,
} as const;

export type QualityTier = "low" | "medium" | "high";

export interface QualityProfile {
  tier: QualityTier;
  maxDpr: number;
  starCount: number;
  rainCount: number;
  cloudLayers: number;
  leafCount: number;
  dustCount: number;
  celestialSegments: number;
  shootingStarCount: number;
}

const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  low: {
    tier: "low",
    maxDpr: 1.25,
    starCount: 140,
    rainCount: 90,
    cloudLayers: 2,
    leafCount: 18,
    dustCount: 30,
    celestialSegments: 32,
    shootingStarCount: 2,
  },
  medium: {
    tier: "medium",
    maxDpr: 1.5,
    starCount: 220,
    rainCount: 150,
    cloudLayers: 3,
    leafCount: 28,
    dustCount: 48,
    celestialSegments: 40,
    shootingStarCount: 3,
  },
  high: {
    tier: "high",
    maxDpr: 1.75,
    starCount: 300,
    rainCount: 220,
    cloudLayers: 3,
    leafCount: 42,
    dustCount: 65,
    celestialSegments: 48,
    shootingStarCount: 3,
  },
};

export function detectQualityProfile(): QualityProfile {
  if (typeof window === "undefined") return QUALITY_PROFILES.medium;

  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 6 : 6;
  const memory =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
      : 8;
  const width = window.innerWidth || 1280;

  if (cores <= 2 || memory <= 2) {
    return QUALITY_PROFILES.low;
  }
  if (cores <= 4 || memory <= 4 || width < 768) {
    return QUALITY_PROFILES.medium;
  }
  return QUALITY_PROFILES.high;
}
