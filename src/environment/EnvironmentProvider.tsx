import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ATMOSPHERE_CONFIG, DEFAULT_LOCATION } from "../atmosphere/config";
import {
  computeSolarCycle,
  type SolarCycleState,
  type SolarStage,
} from "../atmosphere/solarCycle";
import {
  fetchLiveWeather,
  readFreshWeatherCache,
  resolveVisitorLocation,
  type RawWeatherSample,
  type WeatherLocation,
} from "../atmosphere/weatherService";
import {
  deriveLegacyMood,
  deriveWeatherConditions,
  type AtmosphereMood,
  type WeatherConditions,
} from "../atmosphere/weatherState";
import { useLocale } from "../i18n/LocaleProvider";

export type { AtmosphereMood, SolarCycleState, SolarStage, WeatherConditions };

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
  locationSource: "geolocation" | "default";
}

interface EnvironmentContextValue {
  environment: EnvironmentState;
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

function isLocalDaytime(date: Date): boolean {
  const h = date.getHours();
  return h >= 6 && h < 19;
}

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const [now, setNow] = useState(() => new Date());
  const [location, setLocation] = useState<WeatherLocation>({
    latitude: DEFAULT_LOCATION.latitude,
    longitude: DEFAULT_LOCATION.longitude,
    source: "default",
  });
  const locationRef = useRef(location);
  locationRef.current = location;

  const [weatherSample, setWeatherSample] = useState<RawWeatherSample | null>(() =>
    readFreshWeatherCache(
      DEFAULT_LOCATION.latitude,
      DEFAULT_LOCATION.longitude,
      isLocalDaytime(new Date()),
    ),
  );

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), ATMOSPHERE_CONFIG.clockTickMs);
    const controller = new AbortController();

    const syncWeather = async () => {
      const expectedIsDay = isLocalDaytime(new Date());
      const defaultCached = readFreshWeatherCache(
        DEFAULT_LOCATION.latitude,
        DEFAULT_LOCATION.longitude,
        expectedIsDay,
      );

      if (!defaultCached) {
        const defaultSample = await fetchLiveWeather(
          DEFAULT_LOCATION.latitude,
          DEFAULT_LOCATION.longitude,
          controller.signal,
        );
        if (defaultSample && !controller.signal.aborted && locationRef.current.source === "default") {
          setWeatherSample(defaultSample);
        }
      }

      const resolvedLoc = await resolveVisitorLocation(controller.signal);
      if (controller.signal.aborted) return;

      if (resolvedLoc.source === "geolocation") {
        setLocation(resolvedLoc);
        locationRef.current = resolvedLoc;

        const geoCached = readFreshWeatherCache(
          resolvedLoc.latitude,
          resolvedLoc.longitude,
          expectedIsDay,
        );
        if (geoCached) {
          setWeatherSample(geoCached);
        } else {
          const geoSample = await fetchLiveWeather(
            resolvedLoc.latitude,
            resolvedLoc.longitude,
            controller.signal,
          );
          if (geoSample && !controller.signal.aborted) {
            setWeatherSample(geoSample);
          }
        }
      }
    };

    void syncWeather();

    const refresh = window.setInterval(() => {
      const loc = locationRef.current;
      void fetchLiveWeather(loc.latitude, loc.longitude, controller.signal).then((sample) => {
        if (sample && !controller.signal.aborted) {
          setWeatherSample(sample);
        }
      });
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
      locationSource: location.source,
    };
  }, [location.source, locale, now, weatherSample]);

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
