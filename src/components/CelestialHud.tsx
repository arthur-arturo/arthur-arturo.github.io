import { useId, useMemo } from "react";
import type { LunarPhaseKey, SolarStage } from "../atmosphere/solarCycle";
import type { WeatherConditions } from "../atmosphere/weatherState";
import { useEnvironment } from "../environment/EnvironmentProvider";
import { useLocale } from "../i18n/LocaleProvider";
import type { TranslationKey } from "../i18n/translations";
import { useTheme } from "../theme/ThemeProvider";

const ZENITH_TICK_HEIGHTS = [6, 9, 12, 15, 18, 15, 12, 9, 6];

const STAGE_KEYS: Record<SolarStage, TranslationKey> = {
  dawn: "stageDawn",
  morning: "stageMorning",
  midday: "stageMidday",
  afternoon: "stageAfternoon",
  sunset: "stageSunset",
  night: "stageNight",
};

const MOON_PHASE_KEYS: Record<LunarPhaseKey, TranslationKey> = {
  new: "moonNew",
  "waxing-crescent": "moonWaxingCrescent",
  "first-quarter": "moonFirstQuarter",
  "waxing-gibbous": "moonWaxingGibbous",
  full: "moonFull",
  "waning-gibbous": "moonWaningGibbous",
  "last-quarter": "moonLastQuarter",
  "waning-crescent": "moonWaningCrescent",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getWeatherKey(weather: WeatherConditions): TranslationKey {
  if (weather.isStorm) return "weatherStorm";
  if (weather.precipitation === "rain") return "weatherRain";
  if (weather.fogIntensity > 0) return "weatherFog";
  if (weather.skyCondition === "overcast") return "weatherOvercast";
  if (weather.skyCondition === "partly-cloudy") return "weatherPartlyCloudy";
  return "weatherClear";
}

function LunarPhaseGlyph({ phase, isDark }: { phase: number; isDark: boolean }) {
  const maskId = useId();
  const angle = ((phase % 1) + 1) % 1 * Math.PI * 2;
  const shadowOffsetX = Math.sin(angle) * 7.2;
  const shadowScale = Math.abs(Math.cos(angle));
  const fill = isDark ? "#e2e8ff" : "#4c2c7a";

  if (phase > 0.44 && phase < 0.56) {
    return (
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" fill={fill} />
      </svg>
    );
  }

  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <mask id={maskId}>
          <rect width="24" height="24" fill="black" />
          <circle cx="12" cy="12" r="7.5" fill="white" />
          <ellipse
            cx={12 - shadowOffsetX}
            cy="12"
            rx={Math.max(1.8, 7.5 * (0.45 + 0.55 * shadowScale))}
            ry="8.2"
            fill="black"
          />
        </mask>
      </defs>
      <circle cx="12" cy="12" r="7.5" fill={fill} opacity="0.22" />
      <circle cx="12" cy="12" r="7.5" fill={fill} mask={`url(#${maskId})`} />
    </svg>
  );
}

function CelestialArcTicks({
  progress,
  elevation,
  isNight,
  isDark,
}: {
  progress: number;
  elevation: number;
  isNight: boolean;
  isDark: boolean;
}) {
  const activePos = clamp(progress, 0, 1) * (ZENITH_TICK_HEIGHTS.length - 1);
  const zenithIntensity = 0.42 + 0.58 * clamp(elevation, 0, 1);

  return (
    <span className="inline-flex h-[18px] items-center gap-[3px]" aria-hidden="true">
      {ZENITH_TICK_HEIGHTS.map((height, index) => {
        const dist = Math.abs(index - activePos);
        const proximity = Math.exp(-dist * dist * 0.9);
        const strength = proximity * zenithIntensity;
        const isLit = proximity > 0.35;

        const inactiveColor = isDark ? "rgba(255, 255, 255, 0.24)" : "rgba(42, 23, 70, 0.22)";
        const activeColor = isNight
          ? isDark
            ? "#d8ccff"
            : "#6d28d9"
          : isDark
            ? "#fbbf24"
            : "#d97706";

        const glow =
          isLit && strength > 0.25
            ? isNight
              ? `0 0 ${Math.round(5 + strength * 6)}px rgba(196, 181, 253, ${(strength * 0.85).toFixed(2)})`
              : `0 0 ${Math.round(5 + strength * 6)}px rgba(245, 158, 11, ${(strength * 0.72).toFixed(2)})`
            : "none";

        return (
          <span
            key={index}
            className="w-[2px] rounded-full transition-all duration-500"
            style={{
              height: `${height}px`,
              backgroundColor: isLit ? activeColor : inactiveColor,
              opacity: isLit ? Number((0.45 + strength * 0.55).toFixed(2)) : 0.65,
              boxShadow: glow,
            }}
          />
        );
      })}
    </span>
  );
}

export function CelestialHud() {
  const { environment } = useEnvironment();
  const { t } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { solar, weather } = environment;
  const isNight = solar.nightBlend >= 0.52;
  const arc = isNight ? solar.moonArc : solar.sunArc;
  const arcProgress = isNight ? solar.nightProgress : solar.dayProgress;

  const conditionText = useMemo(() => {
    const weatherLabel = t(getWeatherKey(weather));
    if (isNight) {
      const moonLabel = t(MOON_PHASE_KEYS[solar.lunarPhaseKey]);
      const notableNightWeather =
        weather.isLive &&
        (weather.precipitation !== "none" ||
          weather.fogIntensity > 0 ||
          weather.skyCondition === "overcast");
      return notableNightWeather ? `${moonLabel} · ${weatherLabel}` : moonLabel;
    }
    return weather.isLive ? weatherLabel : t(STAGE_KEYS[solar.stage]);
  }, [isNight, solar.lunarPhaseKey, solar.stage, t, weather]);

  const tempDisplay =
    weather.temperature !== null ? `${weather.temperature.toFixed(1)}°` : null;

  const textTone = isDark
    ? "text-white/95 drop-shadow-[0_2px_10px_rgba(6,3,18,0.65)]"
    : "text-[#2a1746] drop-shadow-[0_1px_10px_rgba(255,255,255,0.65)]";

  return (
    <div
      aria-label={t("city")}
      className={`pointer-events-none container mx-auto flex select-none items-center justify-between gap-3 pt-1 xl:px-20 md:justify-center md:gap-4 md:pt-2 lg:gap-5 ${textTone}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {tempDisplay && (
          <span className="text-lg font-extrabold leading-none tracking-tight tabular-nums sm:text-xl md:text-2xl">
            {tempDisplay}
          </span>
        )}
        <span className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold sm:text-sm md:text-[15px]">
          {isNight && <LunarPhaseGlyph phase={solar.lunarPhase} isDark={isDark} />}
          <span className="truncate">{conditionText}</span>
        </span>
      </div>

      <span className="hidden h-3.5 w-px bg-current opacity-20 md:block" aria-hidden="true" />

      <div className="flex shrink-0 items-center gap-2.5 md:contents">
        <CelestialArcTicks
          progress={arcProgress}
          elevation={arc.elevation}
          isNight={isNight}
          isDark={isDark}
        />

        <span className="hidden h-3.5 w-px bg-current opacity-20 md:block" aria-hidden="true" />

        <span className="text-[11px] font-medium leading-tight tabular-nums opacity-80 sm:text-xs md:text-sm">
          {solar.localTime} · {t("cityShort")}
        </span>
      </div>
    </div>
  );
}
