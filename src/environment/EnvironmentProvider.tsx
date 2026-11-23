import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ATMOSPHERE_CONFIG, DEFAULT_LOCATION } from "../atmosphere/config";
import {
  computeSolarCycle,
  type LunarPhaseKey,
  type SolarCycleState,
  type SolarStage,
} from "../atmosphere/solarCycle";
import {
  fetchLiveWeather,
  readFreshWeatherCache,
  type RawWeatherSample,
} from "../atmosphere/weatherService";
import {
  deriveLegacyMood,
  deriveWeatherConditions,
  type AtmosphereMood,
  type WeatherConditions,
} from "../atmosphere/weatherState";
import { useLocale } from "../i18n/LocaleProvider";

export type { AtmosphereMood, LunarPhaseKey, SolarCycleState, SolarStage, WeatherConditions };

export interface EnvironmentState {
  mood: AtmosphereMood;
  windSpeed: number;
  windIntensity: number;
  windDirection: number;
  cloudCover: number;
  isDay: boolean;
  temperature: number | null;
  isStorm: boolean;
  localTime: string;
  localHour: number;
  weatherCode: number | null;
  isLive: boolean;
  solar: SolarCycleState;
  weather: WeatherConditions;
  locationLabel: string;
}

interface EnvironmentContextValue {
  environment: EnvironmentState;
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

function isBuenosAiresDaytime(date: Date): boolean {
  try {
    const hourStr = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: DEFAULT_LOCATION.timezone,
    }).format(date);
    const parsed = Number.parseInt(hourStr, 10);
    const h = Number.isNaN(parsed) ? date.getHours() : parsed % 24;
    return h >= 6 && h < 19;
  } catch {
    const h = date.getHours();
    return h >= 6 && h < 19;
  }
}

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const [now, setNow] = useState(() => new Date());
  const [weatherSample, setWeatherSample] = useState<RawWeatherSample | null>(() =>
    readFreshWeatherCache(isBuenosAiresDaytime(new Date())),
  );

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), ATMOSPHERE_CONFIG.clockTickMs);
    const controller = new AbortController();

    const syncWeather = async () => {
      const sample = await fetchLiveWeather(controller.signal);
      if (sample && !controller.signal.aborted) {
        setWeatherSample(sample);
      }
    };

    void syncWeather();
    const refresh = window.setInterval(() => {
      void syncWeather();
    }, ATMOSPHERE_CONFIG.weatherRefreshMs);

    return () => {
      controller.abort();
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, []);

  const environment = useMemo<EnvironmentState>(() => {
    const solar = computeSolarCycle(
      now,
      locale,
      weatherSample?.sunriseHour,
      weatherSample?.sunsetHour,
    );
    const weather = deriveWeatherConditions(weatherSample);
    const mood = deriveLegacyMood(weather, solar.isDay);

    return {
      mood,
      windSpeed: weather.windSpeed,
      windIntensity: weather.windIntensity,
      windDirection: weather.windDirection,
      cloudCover: weather.cloudCover,
      isDay: solar.isDay,
      temperature: weather.temperature,
      isStorm: weather.isStorm,
      localTime: solar.localTime,
      localHour: solar.localHour,
      weatherCode: weather.weatherCode,
      isLive: weather.isLive,
      solar,
      weather,
      locationLabel: DEFAULT_LOCATION.label,
    };
  }, [locale, now, weatherSample]);

  useEffect(() => {
    const { dataset } = document.documentElement;
    dataset.atmosphere = environment.mood;
    dataset.solarStage = environment.solar.stage;
    dataset.weatherFog = environment.weather.fogIntensity > 0.1 ? "true" : "false";
    dataset.weatherRain =
      environment.weather.precipitation !== "none" ? environment.weather.precipitation : "none";
  }, [
    environment.mood,
    environment.solar.stage,
    environment.weather.fogIntensity,
    environment.weather.precipitation,
  ]);

  return (
    <EnvironmentContext.Provider value={{ environment }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error("useEnvironment must be used within EnvironmentProvider");
  }
  return context;
}
