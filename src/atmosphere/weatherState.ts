import { ATMOSPHERE_CONFIG } from "./config";
import type { RawWeatherSample } from "./weatherService";

export type AtmosphereMood =
  | "clear-day"
  | "overcast-day"
  | "night-clear"
  | "night-wind"
  | "rain";

export type SkyCondition = "clear" | "partly-cloudy" | "overcast";
export type PrecipitationKind = "none" | "rain" | "storm";

export interface WeatherConditions {
  skyCondition: SkyCondition;
  precipitation: PrecipitationKind;
  rainIntensity: number; // 0..1
  isStorm: boolean;
  fogIntensity: number; // 0..1
  cloudCover: number; // 0..1
  windSpeed: number; // km/h
  windDirection: number; // degrees
  windIntensity: number; // 0..1
  isWindy: boolean;
  temperature: number | null;
  weatherCode: number | null;
  isLive: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRainWmoCode(code: number | null): boolean {
  if (code === null) return false;
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

function deriveRainIntensity(code: number | null, precipMm: number): number {
  if (code !== null) {
    if (code >= 95) return 1.0;
    if (code === 65 || code === 67 || code === 82) return 0.86;
    if (code === 63 || code === 81) return 0.68;
    if (code === 61 || code === 80 || code === 66) return 0.54;
    if (code >= 51 && code <= 57) return 0.36;
  }
  if (precipMm > 0.15) {
    return clamp(0.25 + precipMm * 0.15, 0.25, 0.9);
  }
  return 0;
}

export function deriveWeatherConditions(sample: RawWeatherSample | null): WeatherConditions {
  if (!sample) {
    return {
      skyCondition: "clear",
      precipitation: "none",
      rainIntensity: 0,
      isStorm: false,
      fogIntensity: 0,
      cloudCover: 0.12,
      windSpeed: 6,
      windDirection: 120,
      windIntensity: 0.16,
      isWindy: false,
      temperature: null,
      weatherCode: null,
      isLive: false,
    };
  }

  const code = sample.weatherCode;
  const cloudCover = clamp(sample.cloudCover / 100, 0, 1);
  const isStorm = code !== null && code >= 95;
  const hasRain = isStorm || isRainWmoCode(code) || sample.precipitationMm > 0.15;
  const rainIntensity = hasRain ? deriveRainIntensity(code, sample.precipitationMm) : 0;
  const precipitation: PrecipitationKind = isStorm ? "storm" : hasRain ? "rain" : "none";

  const fogIntensity = code === 48 ? 0.9 : code === 45 ? 0.72 : 0;

  let skyCondition: SkyCondition = "clear";
  if (
    code === 3 ||
    cloudCover >= ATMOSPHERE_CONFIG.overcastMin ||
    precipitation !== "none" ||
    fogIntensity > 0
  ) {
    skyCondition = "overcast";
  } else if (code === 2 || cloudCover >= ATMOSPHERE_CONFIG.partlyCloudyMin) {
    skyCondition = "partly-cloudy";
  }

  const windSpeed = Math.max(0, sample.windSpeed);
  const windIntensity = clamp(windSpeed / ATMOSPHERE_CONFIG.strongWindKmh, 0.08, 1);
  const isWindy = windSpeed >= ATMOSPHERE_CONFIG.windyThresholdKmh;

  return {
    skyCondition,
    precipitation,
    rainIntensity,
    isStorm,
    fogIntensity,
    cloudCover,
    windSpeed,
    windDirection: sample.windDirection,
    windIntensity,
    isWindy,
    temperature: sample.temperature,
    weatherCode: code,
    isLive: true,
  };
}

export function deriveLegacyMood(weather: WeatherConditions, isDay: boolean): AtmosphereMood {
  if (weather.precipitation !== "none") return "rain";
  if (isDay) {
    return weather.skyCondition === "overcast" ? "overcast-day" : "clear-day";
  }
  return weather.isWindy ? "night-wind" : "night-clear";
}
