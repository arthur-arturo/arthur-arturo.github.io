import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocale } from "../i18n/LocaleProvider";

export type AtmosphereMood =
  | "clear-day"
  | "overcast-day"
  | "night-clear"
  | "night-wind"
  | "rain";

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
}

interface LiveWeatherData {
  temperature: number;
  weatherCode: number;
  isDay: boolean;
  windSpeed: number;
  windDirection: number;
  cloudCover: number;
}

interface EnvironmentContextValue {
  environment: EnvironmentState;
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

function getBuenosAiresHour(date: Date): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
  const parsed = Number.parseInt(hourStr, 10);
  return Number.isNaN(parsed) ? date.getHours() : parsed % 24;
}

function isBuenosAiresDaytime(date: Date): boolean {
  const hour = getBuenosAiresHour(date);
  return hour >= 6 && hour < 19;
}

function classifyMood(data: LiveWeatherData): AtmosphereMood {
  const { weatherCode: code, isDay, windSpeed, cloudCover } = data;
  const isRain =
    (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;

  if (isRain) return "rain";
  if (isDay) {
    if (code === 2 || code === 3 || code === 45 || code === 48 || cloudCover >= 55) {
      return "overcast-day";
    }
    return "clear-day";
  }
  return windSpeed >= 16 ? "night-wind" : "night-clear";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const [now, setNow] = useState(() => new Date());
  const [liveWeather, setLiveWeather] = useState<LiveWeatherData | null>(null);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    const controller = new AbortController();

    const loadWeather = async () => {
      try {
        const url =
          "https://api.open-meteo.com/v1/forecast?latitude=-34.6037&longitude=-58.3816&current=temperature_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,cloud_cover&timezone=America%2FArgentina%2FBuenos_Aires";
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return;
        const result = (await response.json()) as {
          current?: {
            temperature_2m?: number;
            weather_code?: number;
            is_day?: number;
            wind_speed_10m?: number;
            wind_direction_10m?: number;
            cloud_cover?: number;
          };
        };

        const cur = result.current;
        if (cur && typeof cur.temperature_2m === "number") {
          setLiveWeather({
            temperature: cur.temperature_2m,
            weatherCode: cur.weather_code ?? 0,
            isDay: cur.is_day === 1,
            windSpeed: cur.wind_speed_10m ?? 6,
            windDirection: cur.wind_direction_10m ?? 180,
            cloudCover: cur.cloud_cover ?? 15,
          });
        }
      } catch {
        // Keep derived local Buenos Aires day/night fallback when offline or aborted.
      }
    };

    void loadWeather();
    const refresh = window.setInterval(loadWeather, 10 * 60_000);

    return () => {
      controller.abort();
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, []);

  const environment = useMemo<EnvironmentState>(() => {
    const localTime = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(now);
    const localHour = getBuenosAiresHour(now);

    if (liveWeather) {
      return {
        mood: classifyMood(liveWeather),
        windSpeed: liveWeather.windSpeed,
        windIntensity: clamp(liveWeather.windSpeed / 36, 0.1, 1),
        windDirection: liveWeather.windDirection,
        cloudCover: clamp(liveWeather.cloudCover / 100, 0, 1),
        isDay: liveWeather.isDay,
        temperature: liveWeather.temperature,
        isStorm: liveWeather.weatherCode >= 95,
        localTime,
        localHour,
        weatherCode: liveWeather.weatherCode,
        isLive: true,
      };
    }

    const fallbackDay = isBuenosAiresDaytime(now);
    return {
      mood: fallbackDay ? "clear-day" : "night-clear",
      windSpeed: 6,
      windIntensity: 0.16,
      windDirection: 120,
      cloudCover: 0.15,
      isDay: fallbackDay,
      temperature: null,
      isStorm: false,
      localTime,
      localHour,
      weatherCode: null,
      isLive: false,
    };
  }, [liveWeather, locale, now]);

  useEffect(() => {
    document.documentElement.dataset.atmosphere = environment.mood;
  }, [environment.mood]);

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
