import { useEffect, useRef, useState } from "react";
import { detectQualityProfile } from "../atmosphere/config";
import {
  createAtmosphereScene,
  type AtmosphereSceneController,
} from "../atmosphere/sceneRenderer";
import type { PortfolioRippleDetail } from "../audio/AudioProvider";
import { useEnvironment } from "../environment/EnvironmentProvider";
import { useTheme } from "../theme/ThemeProvider";

export function AmbientScene3D() {
  const { environment } = useEnvironment();
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<AtmosphereSceneController | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const initialInputRef = useRef({
    solar: environment.solar,
    weather: environment.weather,
    isDark: theme === "dark",
    mood: environment.mood,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const quality = detectQualityProfile();
    const controller = createAtmosphereScene(canvas, initialInputRef.current, quality);
    if (!controller) {
      setWebglUnavailable(true);
      return;
    }

    controllerRef.current = controller;

    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleReducedChange = () => controller.setReducedMotion(reducedQuery.matches);
    const handleRipple = (event: Event) => {
      const detail = (event as CustomEvent<PortfolioRippleDetail>).detail;
      if (detail) {
        controller.triggerRipple(detail.x, detail.y, detail.kind);
      }
    };

    reducedQuery.addEventListener("change", handleReducedChange);
    window.addEventListener("portfolio:ripple", handleRipple);

    return () => {
      reducedQuery.removeEventListener("change", handleReducedChange);
      window.removeEventListener("portfolio:ripple", handleRipple);
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.updateInput({
      solar: environment.solar,
      weather: environment.weather,
      isDark: theme === "dark",
      mood: environment.mood,
    });
  }, [environment.solar, environment.weather, environment.mood, theme]);

  if (webglUnavailable) {
    const { solar, weather } = environment;
    const isDayBody = solar.nightBlend < 0.55;
    const arc = isDayBody ? solar.sunArc : solar.moonArc;
    const topPercent = `${Math.max(4, Math.min(62, (1 - arc.yFactor) * 100)).toFixed(1)}%`;
    const rightPercent = `${Math.max(3, Math.min(18, (1 - arc.xFactor) * 100)).toFixed(1)}%`;
    const bodyOpacity =
      weather.precipitation !== "none"
        ? 0.25
        : weather.fogIntensity > 0
          ? 0.3
          : weather.skyCondition === "overcast"
            ? 0.42
            : 0.92;

    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        style={{
          background: `linear-gradient(to top, ${solar.skyPalette.bottom}, ${solar.skyPalette.mid} 52%, ${solar.skyPalette.top})`,
        }}
      >
        <div
          className="absolute h-36 w-36 rounded-full blur-2xl transition-all duration-1000"
          style={{
            top: topPercent,
            right: rightPercent,
            opacity: bodyOpacity * 0.6,
            background: solar.skyPalette.glow,
          }}
        />
        {isDayBody ? (
          <div
            className="absolute h-20 w-20 rounded-full transition-all duration-1000"
            style={{
              top: topPercent,
              right: rightPercent,
              opacity: bodyOpacity,
              background: `radial-gradient(circle at 35% 35%, ${solar.skyPalette.sunCore}, ${solar.skyPalette.sunRim})`,
              boxShadow: `0 0 42px ${solar.skyPalette.glow}`,
            }}
          />
        ) : (
          <svg
            viewBox="0 0 64 64"
            className="absolute h-20 w-20 transition-all duration-1000"
            style={{ top: topPercent, right: rightPercent, opacity: bodyOpacity }}
          >
            <circle cx="32" cy="32" r="22" fill="#231c3d" opacity="0.45" />
            <path
              d="M36 11a21 21 0 1 0 17 31 17 17 0 1 1-17-31z"
              fill="#e2e8f8"
            />
          </svg>
        )}
        {(weather.fogIntensity > 0 || weather.skyCondition !== "clear") && (
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 55% at 50% 80%, rgba(255,255,255,0.28), transparent 70%)",
              opacity: Math.max(weather.fogIntensity * 0.7, weather.cloudCover * 0.45),
            }}
          />
        )}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="ambient-canvas-enter pointer-events-none fixed inset-0 z-0 h-screen w-screen"
    />
  );
}
