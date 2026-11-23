import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";

export function ScrollHorizon() {
  const { t } = useLocale();
  const [hasOverflow, setHasOverflow] = useState(false);
  const [fade, setFade] = useState(1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 600);

    const evaluate = () => {
      const docEl = document.documentElement;
      const maxScroll = Math.max(0, docEl.scrollHeight - window.innerHeight);
      const overflow = maxScroll > 140;
      setHasOverflow(overflow);

      if (!overflow) {
        setFade(0);
        return;
      }

      const topFade = Math.max(0, Math.min(1, 1 - window.scrollY / 140));
      const atBottom = window.scrollY + window.innerHeight >= docEl.scrollHeight - 60;
      setFade(atBottom ? 0 : topFade);
    };

    evaluate();
    const observer = new ResizeObserver(evaluate);
    observer.observe(document.documentElement);

    window.addEventListener("resize", evaluate, { passive: true });
    window.addEventListener("scroll", evaluate, { passive: true });

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", evaluate);
      window.removeEventListener("scroll", evaluate);
    };
  }, []);

  if (!hasOverflow) return null;

  const effectiveOpacity = ready ? fade : 0;
  const interactive = effectiveOpacity > 0.15;

  const handleScrollDown = () => {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const targetY = Math.min(window.innerHeight * 0.84, maxScroll);
    window.scrollTo({ top: targetY, behavior: "smooth" });
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 transition-opacity duration-300"
      style={{ opacity: effectiveOpacity }}
      aria-hidden={!interactive}
    >
      {/* Progressive soft atmospheric blur hiding below-the-fold edge until scrolling */}
      <div
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
