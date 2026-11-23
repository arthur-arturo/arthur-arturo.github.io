import { useEffect, useRef } from "react";
import type { PortfolioRippleDetail, RippleKind } from "../audio/AudioProvider";
import { useEnvironment, type AtmosphereMood } from "../environment/EnvironmentProvider";
import { useTheme } from "../theme/ThemeProvider";

interface ForegroundRipple {
  x: number;
  y: number;
  age: number;
  duration: number;
  color: string;
}

function getRippleRgb(kind: RippleKind, mood: AtmosphereMood, isDark: boolean): string {
  if (kind === "ai") return isDark ? "251, 191, 36" : "217, 119, 6";
  if (mood === "rain") return isDark ? "125, 211, 252" : "14, 116, 144";
  if (mood === "overcast-day") return isDark ? "203, 213, 225" : "71, 85, 105";
  if (mood === "clear-day") return isDark ? "240, 171, 252" : "126, 34, 206";
  return isDark ? "196, 181, 253" : "91, 33, 182";
}

export function ForegroundAtmosphere() {
  const { environment } = useEnvironment();
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const envRef = useRef(environment);
  envRef.current = environment;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let width = window.innerWidth;
    let height = Math.max(window.innerHeight, 1);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = Math.max(window.innerHeight, 1);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const ripples: ForegroundRipple[] = [];
    let rafId = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min((now - lastTime) * 0.001, 0.05);
      lastTime = now;

      ctx.clearRect(0, 0, width, height);

      if (!document.hidden && !reducedMotion.matches) {
        for (let i = ripples.length - 1; i >= 0; i -= 1) {
          const r = ripples[i];
          r.age += dt;
          const p = r.age / r.duration;
          if (p >= 1) {
            ripples.splice(i, 1);
            continue;
          }
          const easeOut = 1 - Math.pow(1 - p, 3);
          const radius = 6 + easeOut * 50;
          const alpha = (1 - p) * (1 - p) * 0.72;

          ctx.strokeStyle = `rgba(${r.color}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
          ctx.stroke();

          const innerRadius = 3 + easeOut * 30;
          ctx.strokeStyle = `rgba(${r.color}, ${(alpha * 0.52).toFixed(3)})`;
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.arc(r.x, r.y, innerRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ripples.length = 0;
      }

      if (ripples.length > 0) {
        rafId = window.requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, width, height);
        rafId = 0;
      }
    };

    const handleRipple = (event: Event) => {
      const detail = (event as CustomEvent<PortfolioRippleDetail>).detail;
      if (!detail || reducedMotion.matches) return;
      const isDark = themeRef.current === "dark";
      ripples.push({
        x: detail.x,
        y: detail.y,
        age: 0,
        duration: 0.52,
        color: getRippleRgb(detail.kind, envRef.current.mood, isDark),
      });
      if (ripples.length > 10) ripples.shift();

      if (rafId === 0) {
        lastTime = performance.now();
        rafId = window.requestAnimationFrame(frame);
      }
    };
    window.addEventListener("portfolio:ripple", handleRipple);

    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("portfolio:ripple", handleRipple);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-20 h-screen w-screen"
    />
  );
}
