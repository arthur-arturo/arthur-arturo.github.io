import { DEFAULT_LOCATION } from "./config";

export type SolarStage =
  | "dawn"
  | "morning"
  | "midday"
  | "afternoon"
  | "sunset"
  | "night";

export type LunarPhaseKey =
  | "new"
  | "waxing-crescent"
  | "first-quarter"
  | "waxing-gibbous"
  | "full"
  | "waning-gibbous"
  | "last-quarter"
  | "waning-crescent";

export type SolarStageWeights = Record<SolarStage, number>;

export interface CelestialArcPoint {
  xFactor: number;
  yFactor: number;
  elevation: number;
}

export interface SkyPalette {
  bottom: string;
  mid: string;
  top: string;
  sunCore: string;
  sunRim: string;
  glow: string;
  themeColor: string;
}

export interface SolarCycleState {
  stage: SolarStage;
  weights: SolarStageWeights;
  localHour: number;
  fractionalHour: number;
  localTime: string;
  sunriseHour: number;
  sunsetHour: number;
  isDay: boolean;
  dayProgress: number;
  nightProgress: number;
  nightBlend: number;
  warmth: number;
  sunArc: CelestialArcPoint;
  moonArc: CelestialArcPoint;
  lunarPhase: number;
  lunarPhaseKey: LunarPhaseKey;
  skyPalette: SkyPalette;
}

const SYNODIC_MONTH_DAYS = 29.53058867;
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

const STAGE_PALETTES: Record<SolarStage, SkyPalette> = {
  dawn: {
    bottom: "#ffd8bf",
    mid: "#f0b8dc",
    top: "#a992d8",
    sunCore: "#fff1c4",
    sunRim: "#ff7e5f",
    glow: "#ffa67a",
    themeColor: "#e9c8ea",
  },
  morning: {
    bottom: "#f8f1ff",
    mid: "#e9ddf9",
    top: "#d5c5f6",
    sunCore: "#fff5cc",
    sunRim: "#ffb347",
    glow: "#ffd07a",
    themeColor: "#f4ecff",
  },
  midday: {
    bottom: "#faf6ff",
    mid: "#ede6ff",
    top: "#dccfff",
    sunCore: "#fff9db",
    sunRim: "#ffc14d",
    glow: "#ffe08a",
    themeColor: "#f7efff",
  },
  afternoon: {
    bottom: "#fff1e2",
    mid: "#efdaf7",
    top: "#d5bef2",
    sunCore: "#fff2bf",
    sunRim: "#ff9e44",
    glow: "#ffc170",
    themeColor: "#f5e6f8",
  },
  sunset: {
    bottom: "#fca97e",
    mid: "#b85d96",
    top: "#3a1d63",
    sunCore: "#ffe19c",
    sunRim: "#ff5964",
    glow: "#ff7b6b",
    themeColor: "#2a1444",
  },
  night: {
    bottom: "#090517",
    mid: "#130a2b",
    top: "#1d1244",
    sunCore: "#fff2c9",
    sunRim: "#f5b873",
    glow: "#9ec2ff",
    themeColor: "#09030e",
  },
};

const ALL_STAGES: SolarStage[] = [
  "dawn",
  "morning",
  "midday",
  "afternoon",
  "sunset",
  "night",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-5), 0, 1);
  return t * t * (3 - 2 * t);
}

function raisedCosine(x: number, center: number, halfWidth: number): number {
  const d = Math.abs(x - center);
  if (d >= halfWidth) return 0;
  return Math.pow(0.5 + 0.5 * Math.cos((Math.PI * d) / halfWidth), 1.35);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function blendPalette(weights: SolarStageWeights): SkyPalette {
  const keys: Array<keyof SkyPalette> = [
    "bottom",
    "mid",
    "top",
    "sunCore",
    "sunRim",
    "glow",
    "themeColor",
  ];
  const out = {} as SkyPalette;

  for (const key of keys) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const stage of ALL_STAGES) {
      const w = weights[stage];
      if (w <= 0) continue;
      const [sr, sg, sb] = hexToRgb(STAGE_PALETTES[stage][key]);
      r += sr * w;
      g += sg * w;
      b += sb * w;
    }
    out[key] = rgbToHex(r, g, b);
  }

  return out;
}

const LUNAR_OCTANTS: LunarPhaseKey[] = [
  "new",
  "waxing-crescent",
  "first-quarter",
  "waxing-gibbous",
  "full",
  "waning-gibbous",
  "last-quarter",
  "waning-crescent",
];

export function getLunarPhaseKey(phase: number): LunarPhaseKey {
  const normalized = ((phase % 1) + 1) % 1;
  const idx = Math.round(normalized * 8) % 8;
  return LUNAR_OCTANTS[idx];
}

export function computeLunarPhase(date: Date): number {
  const daysSinceNew = (date.getTime() - NEW_MOON_EPOCH_MS) / 86_400_000;
  const phaseDays = ((daysSinceNew % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
  return phaseDays / SYNODIC_MONTH_DAYS;
}

function getBuenosAiresClock(date: Date): {
  hour: number;
  minute: number;
  second: number;
} {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
      timeZone: DEFAULT_LOCATION.timezone,
    }).formatToParts(date);

    const readPart = (type: string, fallback: number) => {
      const val = parts.find((p) => p.type === type)?.value;
      const n = Number.parseInt(val ?? "", 10);
      return Number.isNaN(n) ? fallback : n;
    };

    return {
      hour: readPart("hour", date.getHours()) % 24,
      minute: readPart("minute", date.getMinutes()),
      second: readPart("second", date.getSeconds()),
    };
  } catch {
    return {
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
}

export function computeSolarCycle(
  date: Date,
  locale: string,
  sunriseHour = 6.2,
  sunsetHour = 19.2,
): SolarCycleState {
  const clock = getBuenosAiresClock(date);
  const localHour = clock.hour;
  const fractionalHour = clock.hour + clock.minute / 60 + clock.second / 3600;
  const localTime = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_LOCATION.timezone,
  }).format(date);

  const safeSunrise = clamp(sunriseHour, 4.0, 9.5);
  const safeSunset = clamp(sunsetHour, 16.0, 22.0);
  const daySpan = Math.max(6, safeSunset - safeSunrise);
  const nightSpan = 24 - daySpan;

  // Smooth daylight presence across astronomical dawn/dusk transitions
  const risePresence = smoothstep(safeSunrise - 0.85, safeSunrise + 0.7, fractionalHour);
  const setPresence = 1 - smoothstep(safeSunset - 0.7, safeSunset + 0.85, fractionalHour);
  const dayPresence = clamp(Math.min(risePresence, setPresence), 0, 1);
  const nightBlend = 1 - dayPresence;

  const rawDawn = raisedCosine(fractionalHour, safeSunrise + 0.15, Math.max(1.25, daySpan * 0.14));
  const rawMorning = raisedCosine(
    fractionalHour,
    safeSunrise + daySpan * 0.24,
    Math.max(2.0, daySpan * 0.24),
  );
  const rawMidday = raisedCosine(
    fractionalHour,
    safeSunrise + daySpan * 0.5,
    Math.max(2.1, daySpan * 0.25),
  );
  const rawAfternoon = raisedCosine(
    fractionalHour,
    safeSunrise + daySpan * 0.76,
    Math.max(2.0, daySpan * 0.24),
  );
  const rawSunset = raisedCosine(fractionalHour, safeSunset - 0.15, Math.max(1.25, daySpan * 0.14));

  const daySum = rawDawn + rawMorning + rawMidday + rawAfternoon + rawSunset;
  const norm = daySum > 1e-4 ? dayPresence / daySum : 0;

  const weights: SolarStageWeights = {
    dawn: daySum > 1e-4 ? rawDawn * norm : dayPresence,
    morning: rawMorning * norm,
    midday: rawMidday * norm,
    afternoon: rawAfternoon * norm,
    sunset: rawSunset * norm,
    night: nightBlend,
  };

  let dominantStage: SolarStage = "night";
  let highestWeight = -1;
  for (const stage of ALL_STAGES) {
    if (weights[stage] > highestWeight) {
      highestWeight = weights[stage];
      dominantStage = stage;
    }
  }

  const dayProgress = clamp((fractionalHour - safeSunrise) / daySpan, 0, 1);
  const hoursAfterSunset =
    fractionalHour >= safeSunset
      ? fractionalHour - safeSunset
      : fractionalHour + (24 - safeSunset);
  const nightProgress = clamp(hoursAfterSunset / Math.max(nightSpan, 1), 0, 1);

  const sunElev = Math.sin(dayProgress * Math.PI);
  const moonElev = Math.sin(nightProgress * Math.PI);

  const sunArc: CelestialArcPoint = {
    xFactor: -(0.91 - sunElev * 0.07),
    yFactor: 0.34 + sunElev * 0.56,
    elevation: sunElev,
  };
  const moonArc: CelestialArcPoint = {
    xFactor: 0.91 - moonElev * 0.06,
    yFactor: 0.38 + moonElev * 0.5,
    elevation: moonElev,
  };

  const isDay = dayPresence >= 0.48;
  const warmth = clamp(weights.dawn * 0.9 + weights.afternoon * 0.45 + weights.sunset, 0, 1);
  const lunarPhase = computeLunarPhase(date);

  return {
    stage: dominantStage,
    weights,
    localHour,
    fractionalHour,
    localTime,
    sunriseHour: safeSunrise,
    sunsetHour: safeSunset,
    isDay,
    dayProgress,
    nightProgress,
    nightBlend,
    warmth,
    sunArc,
    moonArc,
    lunarPhase,
    lunarPhaseKey: getLunarPhaseKey(lunarPhase),
    skyPalette: blendPalette(weights),
  };
}
