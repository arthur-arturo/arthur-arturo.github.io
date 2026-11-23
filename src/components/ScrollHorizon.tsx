import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";

export function ScrollHorizon() {
  const { t } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = useState(false);

  const interactiveRef = useRef(false);
  const readyRef = useRef(false);
  const currentRef = useRef(0);
  const targetRef = useRef(0);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const applyVisuals = (val: number) => {
      const container = containerRef.current;
      const veil = veilRef.current;
      const visible = val > 0.004;

      if (container) {
        container.style.opacity = val.toFixed(4);
        container.style.visibility = visible ? "visible" : "hidden";
        container.style.transform = `translate3d(0, ${((1 - val) * 14).toFixed(2)}px, 0)`;
      }

      if (veil) {
        const blurValue = visible ? `blur(${(val * 9).toFixed(2)}px)` : "none";
        veil.style.backdropFilter = blurValue;
        veil.style.setProperty("-webkit-backdrop-filter", blurValue);
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

      if (Math.abs(diff) < 0.002) {
        currentRef.current = target;
        applyVisuals(target);
        rafId = 0;
        return;
      }

      const alpha = 1 - Math.exp(-10 * dt);
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
      const topFade = Math.max(0, Math.min(1, 1 - window.scrollY / 200));
      const remaining = Math.max(0, maxScroll - window.scrollY);
      const bottomFade = Math.max(0, Math.min(1, remaining / 120));

      targetRef.current = readyRef.current ? overflowFactor * Math.min(topFade, bottomFade) : 0;
      ensureLoop();
    };

    // Initialize hidden state cleanly before first frame
    applyVisuals(0);

    const readyTimer = window.setTimeout(() => {
      readyRef.current = true;
      evaluateTarget();
    }, 450);

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
      ref={containerRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 will-change-[opacity,transform]"
      style={{ opacity: 0, visibility: "hidden", transform: "translate3d(0, 14px, 0)" }}
      aria-hidden={!interactive}
    >
      {/* Progressive soft atmospheric blur interpolated smoothly on scroll */}
      <div
        ref={veilRef}
        className="scroll-horizon-veil h-24 w-full bg-gradient-to-t from-[#f7efff]/80 via-[#f7efff]/30 to-transparent dark:from-[#060310]/80 dark:via-[#060310]/30 dark:to-transparent md:h-32"
        aria-hidden="true"
      />

      {/* Pulsing lower horizon glow & 1px hair-line */}
      <div
        className="scroll-horizon-glow pointer-events-none absolute bottom-0 left-1/2 h-16 w-[min(78vw,460px)] -translate-x-1/2 rounded-full bg-purple-500/25 blur-2xl dark:bg-purple-400/30"
        aria-hidden="true"
      />
      <div
        className="scroll-horizon-glow pointer-events-none absolute bottom-0 left-1/2 h-px w-[min(64vw,340px)] -translate-x-1/2 bg-gradient-to-r from-transparent via-purple-600/70 to-transparent dark:via-purple-300/75"
        aria-hidden="true"
      />

      {/* Interactive non-intrusive luminous trail trigger */}
      <button
        type="button"
        data-sound="card"
        onClick={handleScrollDown}
        aria-label={t("scrollAria")}
        tabIndex={interactive ? 0 : -1}
        className={`group absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-0.5 px-5 py-1.5 text-[#432968]/80 transition-transform duration-300 hover:translate-y-0.5 hover:text-[#2a1547] dark:text-purple-200/80 dark:hover:text-white ${
          interactive ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
        }`}
      >
        <span
          className="relative block h-6 w-px overflow-hidden bg-gradient-to-b from-transparent via-purple-500/50 to-purple-600/80 dark:via-purple-300/40 dark:to-purple-200/80"
          aria-hidden="true"
        >
          <span className="scroll-horizon-drop absolute left-1/2 top-0 h-2.5 w-[2px] -translate-x-1/2 rounded-full bg-purple-600 dark:bg-white" />
        </span>
        <ChevronDown
          className="-mt-1 h-3.5 w-3.5 opacity-80 transition-transform duration-300 group-hover:translate-y-0.5"
          aria-hidden="true"
        />
        <ChevronDown
          className="-mt-2.5 h-3.5 w-3.5 opacity-50 transition-transform duration-300 group-hover:translate-y-1"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
