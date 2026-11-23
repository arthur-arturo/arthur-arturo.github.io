import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAudio } from "../audio/AudioProvider";
import { useBento3DTilt } from "./Bento3DCard";
import { technologies } from "../data/technologies";

export function TechnologyGrid({ enterDelayMs = 200 }: { enterDelayMs?: number }) {
  const tilt = useBento3DTilt();
  const { playSkill } = useAudio();
  const [activeTile, setActiveTile] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleTileClick = (name: string, index: number, isAi: boolean, clientX: number) => {
    playSkill(index, isAi, clientX);
    setActiveTile(name);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setActiveTile((current) => (current === name ? null : current));
    }, 420);
  };

  return (
    <section
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      style={{ "--enter-delay": `${enterDelayMs}ms` } as CSSProperties}
      className="bento-card bento-enter relative col-span-3 overflow-hidden rounded-3xl bg-[#ff8e329c] dark:bg-[#ffad7756] md:col-span-3"
      aria-label="Technologies & AI"
    >
      <div className="grid h-full w-full grid-cols-3 gap-2 p-3 text-white sm:grid-cols-4 sm:gap-2.5 sm:p-3.5 lg:grid-cols-6 lg:grid-rows-2 lg:gap-3 lg:p-5 xl:gap-3.5 xl:p-6">
        {technologies.map(({ name, shortName, category, icon }, index) => {
          const isAi = category === "ai";
          const isPulsing = activeTile === name;
          return (
            <button
              key={name}
              type="button"
              title={name}
              data-sound="custom"
              data-ai={isAi ? "true" : undefined}
              onClick={(event) => handleTileClick(name, index, isAi, event.clientX)}
              className={`w-full cursor-pointer appearance-none text-center ${
                isAi
                  ? "group/tech relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/45 bg-white/25 px-2 py-2.5 shadow-[0_8px_22px_-12px_rgba(255,255,255,0.45)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/60 hover:bg-white/30 dark:border-white/30 dark:bg-white/[0.18] dark:hover:border-white/50 dark:hover:bg-white/[0.26] sm:py-2 lg:gap-2 lg:p-2.5 xl:p-3"
                  : "group/tech flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-white/[0.1] px-2 py-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.2] dark:border-white/10 dark:bg-white/[0.07] dark:hover:border-white/25 dark:hover:bg-white/[0.16] sm:py-2 lg:gap-2 lg:p-2.5 xl:p-3"
              } ${isPulsing ? "skill-tile-pulse border-white/75" : ""}`}
            >
              {isAi && (
                <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-black/25 px-1.5 py-[1px] text-[8px] font-bold uppercase tracking-wider text-white dark:bg-white/25 lg:right-1.5 lg:top-1.5 lg:text-[9px] xl:right-2 xl:top-2">
                  AI
                </span>
              )}
              <svg
                className={
                  isAi
                    ? "h-9 w-9 fill-current text-white transition-transform duration-300 group-hover/tech:scale-110 sm:h-8 sm:w-8 md:h-9 md:w-9 lg:h-10 lg:w-10 xl:h-12 xl:w-12"
                    : "h-8 w-8 fill-current text-white/95 transition-transform duration-300 group-hover/tech:scale-110 group-hover/tech:text-white sm:h-7 sm:w-7 md:h-8 md:w-8 lg:h-9 lg:w-9 xl:h-11 xl:w-11"
                }
                role="img"
                aria-label={name}
                viewBox="0 0 24 24"
                focusable="false"
              >
                <title>{name}</title>
                <path d={icon.path} />
              </svg>
              <span
                className={`max-w-full truncate text-center leading-none tracking-tight ${
                  isAi
                    ? "text-[10px] font-bold text-white lg:text-[11px] xl:text-xs"
                    : "text-[10px] font-semibold text-white/95 dark:text-white/90 lg:text-[11px] xl:text-xs"
                }`}
              >
                {shortName ?? name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
