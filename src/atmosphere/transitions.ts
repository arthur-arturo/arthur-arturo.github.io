import { ATMOSPHERE_CONFIG } from "./config";
import type { SolarCycleState } from "./solarCycle";
import type { WeatherConditions } from "./weatherState";

export interface AtmosphericVisualTargets {
  skyBottom: [number, number, number];
  skyMid: [number, number, number];
  skyTop: [number, number, number];
  sunCore: [number, number, number];
  sunRim: [number, number, number];
  celestialGlowColor: [number, number, number];
  cloudColor: [number, number, number];
  cloudHighlight: [number, number, number];
  cloudShadow: [number, number, number];
  fogColor: [number, number, number];
  sunOpacity: number;
  moonOpacity: number;
  lunarPhase: number;
  celestialGlow: number;
  celestialRingOpacity: number;
  sunXFactor: number;
  sunYFactor: number;
  moonXFactor: number;
  moonYFactor: number;
  sunDesktopX: number;
  sunDesktopY: number;
  moonDesktopX: number;
  moonDesktopY: number;
  beamMix: number;
  beamDirectionX: number;
  beamDirectionY: number;
  cloudAmount: number;
  cloudDarkness: number;
  cloudOpacity: number;
  cloudSpeed: number;
  fogOpacity: number;
  starOpacity: number;
  dayDustOpacity: number;
  rainOpacity: number;
  rainSlantX: number;
  windDirX: number;
  windSpeedNorm: number;
  targetActiveLeaves: number;
  leafBaseOpacity: number;
  stormActive: number;
  isDark: number;
  nightBlend: number;
}

export type AtmosphericVisualState = AtmosphericVisualTargets;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToUnitRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const k = clamp(t, 0, 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function stepRgb(
  cur: [number, number, number],
  target: [number, number, number],
  rate: number,
): void {
  cur[0] += (target[0] - cur[0]) * rate;
  cur[1] += (target[1] - cur[1]) * rate;
  cur[2] += (target[2] - cur[2]) * rate;
}

export function computeAtmosphericTargets(
  solar: SolarCycleState,
  weather: WeatherConditions,
  isDark: boolean,
  maxLeaves: number,
): AtmosphericVisualTargets {
  let skyBottom = hexToUnitRgb(solar.skyPalette.bottom);
  let skyMid = hexToUnitRgb(solar.skyPalette.mid);
  let skyTop = hexToUnitRgb(solar.skyPalette.top);
  const sunCore = hexToUnitRgb(solar.skyPalette.sunCore);
  const sunRim = hexToUnitRgb(solar.skyPalette.sunRim);
  const celestialGlowColor = hexToUnitRgb(solar.skyPalette.glow);

  const isOvercast = weather.skyCondition === "overcast";
  const isPartlyCloudy = weather.skyCondition === "partly-cloudy";
  const hasRain = weather.precipitation !== "none";
  const hasFog = weather.fogIntensity > 0;
  const dayMix = 1 - solar.nightBlend;
  const solarIntensity = 0.48 + 0.52 * solar.sunArc.elevation;

  // Modulate base solar sky smoothly according to weather conditions
  if (isOvercast && !hasRain && !hasFog) {
    const overBottom = mixRgb([0.85, 0.86, 0.92], [0.09, 0.095, 0.14], solar.nightBlend);
    const overMid = mixRgb([0.79, 0.81, 0.89], [0.11, 0.115, 0.17], solar.nightBlend);
    const overTop = mixRgb([0.73, 0.75, 0.85], [0.13, 0.135, 0.21], solar.nightBlend);
    const overStrength = 0.34 + weather.cloudCover * 0.2;
    skyBottom = mixRgb(skyBottom, overBottom, overStrength);
    skyMid = mixRgb(skyMid, overMid, overStrength);
    skyTop = mixRgb(skyTop, overTop, overStrength);
  }

  if (hasRain) {
    const rainBottom = mixRgb([0.69, 0.73, 0.82], [0.035, 0.045, 0.085], solar.nightBlend);
    const rainMid = mixRgb([0.62, 0.67, 0.78], [0.06, 0.075, 0.135], solar.nightBlend);
    const rainTop = mixRgb([0.55, 0.61, 0.74], [0.085, 0.105, 0.185], solar.nightBlend);
    const rainTintStrength = clamp(0.45 + weather.rainIntensity * 0.38, 0.45, 0.85);
    skyBottom = mixRgb(skyBottom, rainBottom, rainTintStrength);
    skyMid = mixRgb(skyMid, rainMid, rainTintStrength);
    skyTop = mixRgb(skyTop, rainTop, rainTintStrength);
  }

  if (hasFog) {
    const fogTint = mixRgb([0.87, 0.88, 0.93], [0.14, 0.15, 0.22], solar.nightBlend);
    const fogStrength = weather.fogIntensity * 0.62;
    skyBottom = mixRgb(skyBottom, fogTint, fogStrength * 1.1);
    skyMid = mixRgb(skyMid, fogTint, fogStrength);
    skyTop = mixRgb(skyTop, fogTint, fogStrength * 0.85);
  }

  const cloudDim = clamp(
    1 -
      (isOvercast ? 0.42 : isPartlyCloudy ? weather.cloudCover * 0.22 : 0) -
      weather.rainIntensity * 0.42 -
      weather.fogIntensity * 0.48,
    0.18,
    1,
  );

  // Celestial visibility scaled by solar elevation intensity
  const dayBodyWeight = clamp(
    dayMix + solar.weights.sunset * 0.35 + solar.weights.dawn * 0.35,
    0,
    1,
  );
  const nightBodyWeight = clamp(
    solar.nightBlend + solar.weights.sunset * 0.25 + solar.weights.dawn * 0.2,
    0,
    1,
  );

  const sunOpacity =
    dayBodyWeight *
    solarIntensity *
    (hasRain
      ? 0.16
      : hasFog
        ? 0.28
        : isOvercast
          ? 0.46
          : 0.96 * clamp(1 - weather.cloudCover * 0.15, 0.82, 1));

  const moonOpacity =
    nightBodyWeight *
    (hasRain ? 0.24 : hasFog ? 0.28 : Math.max(0.32, cloudDim)) *
    (isDark ? 0.96 : 0.64);

  const celestialGlow =
    (dayMix *
      solarIntensity *
      (isOvercast ? 0.48 : hasRain ? 0.2 : isPartlyCloudy ? 0.72 : 0.84) +
      solar.nightBlend * (isDark ? 0.46 : 0.3)) *
    clamp(1 - weather.fogIntensity * 0.45 - weather.rainIntensity * 0.45, 0.24, 1);

  const celestialRingOpacity =
    (solar.isDay ? 0.14 * solarIntensity : 0.17) * clamp(cloudDim, 0.25, 1);

  // Panoramic desktop orbital sweep across upper sky vault
  const sunDesktopX = (solar.dayProgress * 2 - 1) * 0.66;
  const sunDesktopY = 0.58 + solar.sunArc.elevation * 0.36;
  const moonDesktopX = (solar.nightProgress * 2 - 1) * 0.62;
  const moonDesktopY = 0.6 + solar.moonArc.elevation * 0.32;

  // Sculpted 3D cloud visibility & two-tone directional palette
  const cloudAmount = clamp(
    (isOvercast
      ? 0.58 + weather.cloudCover * 0.34
      : isPartlyCloudy
        ? 0.34 + weather.cloudCover * 0.32
        : 0.16 + weather.cloudCover * 0.2) +
      weather.rainIntensity * 0.3,
    0.16,
    0.95,
  );

  const cloudOpacity = hasRain
    ? 0.66
    : isOvercast
      ? 0.58
      : isPartlyCloudy
        ? 0.48
        : 0.26;

  const warmCrest = mixRgb([1.0, 0.98, 0.95], [1.0, 0.88, 0.82], solar.warmth * 0.65);
  const dayHighlight = hasRain
    ? [0.78, 0.82, 0.9] as [number, number, number]
    : isOvercast
      ? [0.97, 0.96, 1.0] as [number, number, number]
      : warmCrest;
  const cloudHighlight = mixRgb(dayHighlight, [0.64, 0.66, 0.88], solar.nightBlend);

  const dayShadow = hasRain
    ? ([0.42, 0.48, 0.64] as [number, number, number])
    : isOvercast
      ? ([0.58, 0.6, 0.76] as [number, number, number])
      : ([0.72, 0.7, 0.88] as [number, number, number]);
  const cloudShadow = mixRgb(dayShadow, [0.13, 0.11, 0.25], solar.nightBlend);

  const cloudColor = mixRgb(cloudShadow, cloudHighlight, 0.45);
  const fogColor = mixRgb([0.88, 0.89, 0.94], [0.16, 0.17, 0.25], solar.nightBlend);

  const windRad = ((weather.windDirection % 360) * Math.PI) / 180;
  const rawEastWest = -Math.sin(windRad);
  const windDirX =
    Math.abs(rawEastWest) < 0.25 ? (rawEastWest >= 0 ? 0.35 : -0.35) : rawEastWest;
  const rainSlantX = clamp(rawEastWest * 0.42 * weather.windIntensity, -0.45, 0.45);

  const targetActiveLeaves =
    weather.isWindy && weather.rainIntensity < 0.7 && weather.fogIntensity < 0.5
      ? Math.min(maxLeaves, Math.round(maxLeaves * (0.45 + weather.windIntensity * 0.55)))
      : 0;

  return {
    skyBottom,
    skyMid,
    skyTop,
    sunCore,
    sunRim,
    celestialGlowColor,
    cloudColor,
    cloudHighlight,
    cloudShadow,
    fogColor,
    sunOpacity,
    moonOpacity,
    lunarPhase: solar.lunarPhase,
    celestialGlow,
    celestialRingOpacity,
    sunXFactor: solar.sunArc.xFactor,
    sunYFactor: solar.sunArc.yFactor,
    moonXFactor: solar.moonArc.xFactor,
    moonYFactor: solar.moonArc.yFactor,
    sunDesktopX,
    sunDesktopY,
    moonDesktopX,
    moonDesktopY,
    beamMix: dayMix * solarIntensity * (1 - weather.fogIntensity * 0.65),
    beamDirectionX: Math.abs(sunDesktopX) > 0.05 ? clamp(-sunDesktopX * 0.65, -0.7, 0.7) : -0.12,
    beamDirectionY: clamp(-0.26 - solar.sunArc.elevation * 0.52, -0.78, -0.2),
    cloudAmount,
    cloudDarkness: clamp(weather.rainIntensity * 0.75 + (isOvercast ? 0.28 : 0), 0, 0.9),
    cloudOpacity,
    cloudSpeed: 0.018 + weather.windIntensity * 0.055 + (weather.isStorm ? 0.025 : 0),
    fogOpacity: weather.fogIntensity * 0.58,
    starOpacity:
      clamp(solar.nightBlend + solar.weights.sunset * 0.22, 0, 1) *
      (isDark ? 0.9 : 0.34) *
      cloudDim,
    dayDustOpacity:
      dayMix *
      solarIntensity *
      (isOvercast || hasRain || hasFog ? 0.05 : 0.42) *
      clamp(cloudDim, 0.3, 1),
    rainOpacity: weather.rainIntensity > 0 ? clamp(0.24 + weather.rainIntensity * 0.36, 0.24, 0.62) : 0,
    rainSlantX,
    windDirX,
    windSpeedNorm: Math.max(0.35, weather.windIntensity),
    targetActiveLeaves,
    leafBaseOpacity: isDark ? 0.9 : 0.84,
    stormActive: weather.isStorm ? 1 : 0,
    isDark: isDark ? 1 : 0,
    nightBlend: solar.nightBlend,
  };
}

export function createInitialVisualState(
  targets: AtmosphericVisualTargets,
): AtmosphericVisualState {
  return {
    ...targets,
    skyBottom: [...targets.skyBottom],
    skyMid: [...targets.skyMid],
    skyTop: [...targets.skyTop],
    sunCore: [...targets.sunCore],
    sunRim: [...targets.sunRim],
    celestialGlowColor: [...targets.celestialGlowColor],
    cloudColor: [...targets.cloudColor],
    cloudHighlight: [...targets.cloudHighlight],
    cloudShadow: [...targets.cloudShadow],
    fogColor: [...targets.fogColor],
  };
}

export function stepVisualState(
  cur: AtmosphericVisualState,
  target: AtmosphericVisualTargets,
  dt: number,
  reducedMotion: boolean,
): void {
  const rate = reducedMotion ? 1 : 1 - Math.exp(-dt * ATMOSPHERE_CONFIG.transitionLerpSpeed);

  stepRgb(cur.skyBottom, target.skyBottom, rate);
  stepRgb(cur.skyMid, target.skyMid, rate);
  stepRgb(cur.skyTop, target.skyTop, rate);
  stepRgb(cur.sunCore, target.sunCore, rate);
  stepRgb(cur.sunRim, target.sunRim, rate);
  stepRgb(cur.celestialGlowColor, target.celestialGlowColor, rate);
  stepRgb(cur.cloudColor, target.cloudColor, rate);
  stepRgb(cur.cloudHighlight, target.cloudHighlight, rate);
  stepRgb(cur.cloudShadow, target.cloudShadow, rate);
  stepRgb(cur.fogColor, target.fogColor, rate);

  cur.sunOpacity += (target.sunOpacity - cur.sunOpacity) * rate;
  cur.moonOpacity += (target.moonOpacity - cur.moonOpacity) * rate;
  cur.lunarPhase = target.lunarPhase;
  cur.celestialGlow += (target.celestialGlow - cur.celestialGlow) * rate;
  cur.celestialRingOpacity += (target.celestialRingOpacity - cur.celestialRingOpacity) * rate;
  cur.sunXFactor += (target.sunXFactor - cur.sunXFactor) * rate;
  cur.sunYFactor += (target.sunYFactor - cur.sunYFactor) * rate;
  cur.moonXFactor += (target.moonXFactor - cur.moonXFactor) * rate;
  cur.moonYFactor += (target.moonYFactor - cur.moonYFactor) * rate;
  cur.sunDesktopX += (target.sunDesktopX - cur.sunDesktopX) * rate;
  cur.sunDesktopY += (target.sunDesktopY - cur.sunDesktopY) * rate;
  cur.moonDesktopX += (target.moonDesktopX - cur.moonDesktopX) * rate;
  cur.moonDesktopY += (target.moonDesktopY - cur.moonDesktopY) * rate;
  cur.beamMix += (target.beamMix - cur.beamMix) * rate;
  cur.beamDirectionX += (target.beamDirectionX - cur.beamDirectionX) * rate;
  cur.beamDirectionY += (target.beamDirectionY - cur.beamDirectionY) * rate;
  cur.cloudAmount += (target.cloudAmount - cur.cloudAmount) * rate;
  cur.cloudDarkness += (target.cloudDarkness - cur.cloudDarkness) * rate;
  cur.cloudOpacity += (target.cloudOpacity - cur.cloudOpacity) * rate;
  cur.cloudSpeed += (target.cloudSpeed - cur.cloudSpeed) * rate;
  cur.fogOpacity += (target.fogOpacity - cur.fogOpacity) * rate;
  cur.starOpacity += (target.starOpacity - cur.starOpacity) * rate;
  cur.dayDustOpacity += (target.dayDustOpacity - cur.dayDustOpacity) * rate;
  cur.rainOpacity += (target.rainOpacity - cur.rainOpacity) * rate;
  cur.rainSlantX += (target.rainSlantX - cur.rainSlantX) * rate;
  cur.windDirX += (target.windDirX - cur.windDirX) * rate;
  cur.windSpeedNorm += (target.windSpeedNorm - cur.windSpeedNorm) * rate;
  cur.targetActiveLeaves = target.targetActiveLeaves;
  cur.leafBaseOpacity += (target.leafBaseOpacity - cur.leafBaseOpacity) * rate;
  cur.stormActive += (target.stormActive - cur.stormActive) * rate;
  cur.isDark += (target.isDark - cur.isDark) * rate;
  cur.nightBlend += (target.nightBlend - cur.nightBlend) * rate;
}
