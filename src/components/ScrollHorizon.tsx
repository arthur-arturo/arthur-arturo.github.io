import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocale } from "../i18n/LocaleProvider";

interface HorizonMote {
  left: string;
  size: string;
  dx: string;
  rise: string;
  dur: string;
  delay: string;
}

const HORIZON_MOTES: HorizonMote[] = [
  { left: "34%", size: "2.5px", dx: "-6px", rise: "-48px", dur: "4.2s", delay: "-0.8s" },
  { left: "42%", size: "3px", dx: "5px", rise: "-62px", dur: "3.6s", delay: "-2.1s" },
  { left: "49%", size: "3.5px", dx: "-3px", rise: "-68px", dur: "3.9s", delay: "-0.2s" },
  { left: "54%", size: "2px", dx: "7px", rise: "-52px", dur: "3.4s", delay: "-1.6s" },
  { left: "60%", size: "3px", dx: "-5px", rise: "-58px", dur: "4.4s", delay: "-2.9s" },
  { left: "66%", size: "2.5px", dx: "4px", rise: "-44px", dur: "3.7s", delay: "-1.2s" },
];

export function ScrollHorizon() {
  const { t } = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const veilWideRef = useRef<HTMLDivElement>(null);
  const veilCoreRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const beaconRef = useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = useState(false);

  const interactiveRef = useRef(false);
  const readyRef = useRef(false);
  const currentRef = useRef(0);
  const targetRef = useRef(0);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const applyVisuals = (val: number) => {
      const root = rootRef.current;
      const veilWide = veilWideRef.current;
      const veilCore = veilCoreRef.current;
      const scrim = scrimRef.current;
      const beacon = beaconRef.current;
      const visible = val > 0.003;

      if (root) {
        root.style.visibility = visible ? "visible" : "hidden";
      }

      if (veilWide) {
        const wideFilter = visible ? `blur(${(val * 5.5).toFixed(2)}px)` : "none";
        veilWide.style.backdropFilter = wideFilter;
        veilWide.style.setProperty("-webkit-backdrop-filter", wideFilter);
      }

      if (veilCore) {
        const coreFilter = visible
          ? `blur(${(val * 10.5).toFixed(2)}px) saturate(${(1 + val * 0.12).toFixed(3)})`
          : "none";
        veilCore.style.backdropFilter = coreFilter;
        veilCore.style.setProperty("-webkit-backdrop-filter", coreFilter);
      }

      if (scrim) {
        scrim.style.opacity = val.toFixed(4);
      }

      if (beacon) {
        beacon.style.opacity = val.toFixed(4);
        beacon.style.transform = `translate3d(0, ${((1 - val) * 10).toFixed(2)}px, 0)`;
      }

      const nextInteractive = val > 0.15;
      if (nextInteractive !== interactiveRef.current) {
        interactiveRef.current = nextInteractive;
        setInteractive(nextInteractive);
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const target = targetRef.current;
      const diff = target - currentRef.current;

      if (Math.abs(diff) < 0.0015) {
        currentRef.current = target;
        applyVisuals(target);
        rafId = 0;
        return;
      }

      const alpha = 1 - Math.exp(-8.5 * dt);
      currentRef.current += diff * alpha;
      applyVisuals(currentRef.current);
      rafId = window.requestAnimationFrame(tick);
    };

    const ensureLoop = () => {
      if (rafId === 0) {
        lastTime = performance.now();
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const evaluateTarget = () => {
      const docEl = document.documentElement;
      const maxScroll = Math.max(0, docEl.scrollHeight - window.innerHeight);
      const overflowFactor = Math.max(0, Math.min(1, (maxScroll - 90) / 70));
      const topFade = Math.max(0, Math.min(1, 1 - window.scrollY / 260));
      const remaining = Math.max(0, maxScroll - window.scrollY);
      const bottomFade = Math.max(0, Math.min(1, remaining / 120));

      targetRef.current = readyRef.current ? overflowFactor * Math.min(topFade, bottomFade) : 0;
      ensureLoop();
    };

    applyVisuals(0);

    const readyTimer = window.setTimeout(() => {
      readyRef.current = true;
      evaluateTarget();
    }, 350);

    const observer = new ResizeObserver(evaluateTarget);
    observer.observe(document.documentElement);

    window.addEventListener("resize", evaluateTarget, { passive: true });
    window.addEventListener("scroll", evaluateTarget, { passive: true });
    evaluateTarget();

    return () => {
      window.clearTimeout(readyTimer);
      observer.disconnect();
      window.removeEventListener("resize", evaluateTarget);
      window.removeEventListener("scroll", evaluateTarget);
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const handleScrollDown = () => {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const targetY = Math.min(window.innerHeight * 0.84, maxScroll);
    window.scrollTo({ top: targetY, behavior: "smooth" });
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20"
      style={{ visibility: "hidden" }}
      aria-hidden={!interactive}
    >
      {/* 1. Wide upper atmospheric dreamy optical veil (no opacity/transform ancestors so Chromium blurs page behind it) */}
      <div
        ref={veilWideRef}
        className="scroll-horizon-veil-wide pointer-events-none absolute inset-x-0 bottom-0 h-36 md:h-48"
        aria-hidden="true"
      />

      {/* 2. Deep concentrated lower optical blur veil */}
      <div
        ref={veilCoreRef}
        className="scroll-horizon-veil-core pointer-events-none absolute inset-x-0 bottom-0 h-24 md:h-32"
        aria-hidden="true"
      />

      {/* 3. Smooth atmospheric scrim gradient */}
      <div
        ref={scrimRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#f4eaff]/70 via-[#f4eaff]/20 to-transparent dark:from-[#060312]/75 dark:via-[#0b0620]/25 to-transparent md:h-44"
        style={{ opacity: 0 }}
        aria-hidden="true"
      />

      {/* 4. Subtle game-like incandescent guiding beacon (no directional arrows) */}
      <div
        ref={beaconRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 will-change-[opacity,transform]"
        style={{ opacity: 0, transform: "translate3d(0, 10px, 0)" }}
      >
        <button
          type="button"
          data-sound="card"
          onClick={handleScrollDown}
          aria-label={t("scrollAria")}
          tabIndex={interactive ? 0 : -1}
          className={`group absolute bottom-0 left-1/2 h-20 w-[min(64vw,420px)] -translate-x-1/2 outline-none transition-all duration-500 focus-visible:ring-2 focus-visible:ring-purple-300/60 ${
            interactive ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
          }`}
        >
          {/* Ambient radial aura */}
          <span
            className="horizon-incandescent-aura pointer-events-none absolute bottom-0 left-1/2 h-20 w-[min(86vw,540px)] rounded-full blur-2xl transition-all duration-500 group-hover:brightness-125"
            aria-hidden="true"
          />

          {/* Focused pearlescent hearth glow */}
          <span
            className="horizon-incandescent-core pointer-events-none absolute bottom-0 left-1/2 h-9 w-[min(48vw,280px)] rounded-full blur-lg transition-all duration-500 group-hover:scale-110 group-hover:brightness-125"
            aria-hidden="true"
          />

          {/* Incandescent 2px horizon rim + inner white filament */}
          <span
            className="horizon-incandescent-rim pointer-events-none absolute bottom-0 left-1/2 w-[min(56vw,340px)] -translate-x-1/2 transition-all duration-500 group-hover:w-[min(62vw,380px)] group-hover:brightness-125"
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute bottom-0 left-1/2 h-px w-[min(32vw,190px)] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/95 to-transparent transition-all duration-500 group-hover:w-[min(40vw,240px)]"
            aria-hidden="true"
          />

          {/* Drifting incandescent embers rising organically */}
          {HORIZON_MOTES.map((mote, index) => (
            <span
              key={index}
              className="horizon-mote pointer-events-none absolute bottom-1"
              style={
                {
                  left: mote.left,
                  width: mote.size,
                  height: mote.size,
                  "--mote-dx": mote.dx,
                  "--mote-rise": mote.rise,
                  "--mote-dur": mote.dur,
                  "--mote-delay": mote.delay,
                } as CSSProperties
              }
              aria-hidden="true"
            />
          ))}
        </button>
      </div>
    </div>
  );
}
