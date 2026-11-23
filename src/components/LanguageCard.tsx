import type { CSSProperties } from "react";
import { useAudio } from "../audio/AudioProvider";
import { useBento3DTilt } from "./Bento3DCard";
import { useLocale } from "../i18n/LocaleProvider";

export function LanguageCard({ enterDelayMs = 70 }: { enterDelayMs?: number }) {
  const { locale, setLocale, t } = useLocale();
  const { playToggleSound } = useAudio();
  const tilt = useBento3DTilt();
  const nextLocale = locale === "es" ? "en" : "es";

  const handleToggle = (clientX?: number) => {
    playToggleSound("locale", clientX);
    setLocale(nextLocale);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-sound="custom"
      onClick={(event) => handleToggle(event.clientX)}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      style={{ "--enter-delay": `${enterDelayMs}ms` } as CSSProperties}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleToggle();
        }
      }}
      aria-label={`${t("language")}: ${locale.toUpperCase()}`}
      className="bento-card bento-card-interactive bento-enter col-span-1 flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl bg-[#1c053a9c] text-white dark:bg-[#af72ff56]"
    >
      <p className="text-4xl font-bold uppercase leading-none sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
        {locale}
      </p>
      <div
        className="mt-1.5 flex items-center gap-2 text-xs font-bold sm:mt-2 sm:text-sm md:text-base"
        role="group"
        aria-label={t("language")}
      >
        <button
          type="button"
          data-sound="custom"
          aria-pressed={locale === "en"}
          onClick={(event) => {
            event.stopPropagation();
            if (locale !== "en") playToggleSound("locale", event.clientX);
            setLocale("en");
          }}
          className={`transition-colors duration-200 ${locale === "en" ? "text-purple-400" : "text-white hover:text-white/80"}`}
        >
          EN
        </button>
        <button
          type="button"
          data-sound="custom"
          aria-pressed={locale === "es"}
          onClick={(event) => {
            event.stopPropagation();
            if (locale !== "es") playToggleSound("locale", event.clientX);
            setLocale("es");
          }}
          className={`transition-colors duration-200 ${locale === "es" ? "text-purple-400" : "text-white hover:text-white/80"}`}
        >
          ES
        </button>
      </div>
    </div>
  );
}
