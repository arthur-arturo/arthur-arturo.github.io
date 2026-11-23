import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useBento3DTilt } from "./Bento3DCard";
import { useLocale } from "../i18n/LocaleProvider";

export function FocusCard({ enterDelayMs = 490 }: { enterDelayMs?: number }) {
  const { t } = useLocale();
  const tilt = useBento3DTilt();

  return (
    <Link
      to="/about"
      data-sound="card"
      aria-label={t("focusTitle")}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      style={{ "--enter-delay": `${enterDelayMs}ms` } as CSSProperties}
      className="bento-card bento-card-interactive bento-enter group relative col-span-3 row-span-1 aspect-[2/1] overflow-hidden rounded-3xl bg-[#281557a8] text-white dark:bg-[#5e46b85c] md:col-span-2 md:aspect-[2/1]"
    >
      {/* Cohesive 3D geometric crystal/rings accent */}
      <div
        className="pointer-events-none absolute inset-y-0 -right-8 flex w-2/5 items-center justify-end overflow-hidden sm:-right-6 md:-right-4 md:pr-4"
        aria-hidden="true"
      >
        <div className="relative h-24 w-24 sm:h-28 sm:w-28 md:h-36 md:w-36 lg:h-40 lg:w-40">
          <div className="absolute inset-0 rounded-full border border-white/10 bg-gradient-to-br from-purple-300/15 via-indigo-400/5 to-transparent shadow-[0_0_40px_rgba(167,139,250,0.18)] transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-3.5 rotate-12 rounded-3xl border border-white/15 bg-white/5 backdrop-blur-sm transition-transform duration-500 group-hover:rotate-45" />
          <div className="absolute inset-7 -rotate-12 rounded-2xl border border-purple-200/20 bg-gradient-to-tr from-white/10 to-transparent transition-transform duration-500 group-hover:rotate-12" />
        </div>
      </div>

      <ArrowUpRight
        className="pointer-events-none absolute right-2.5 top-2.5 z-20 h-3 w-3 text-white/90 dark:text-[#ffffffaa] sm:right-3.5 sm:top-3.5 sm:h-4 sm:w-4 md:right-6 md:top-6 md:h-5 md:w-5"
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full w-full flex-col justify-between p-4 md:p-7 lg:p-8">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-purple-200/90 sm:text-xs">
            {t("focusBadge")}
          </p>
          <h2 className="mt-1 max-w-[70%] text-sm font-bold leading-tight text-white sm:text-lg md:text-2xl lg:text-3xl">
            {t("focusTitle")}
          </h2>
        </div>

        <p className="max-w-[70%] text-xs leading-snug text-white/90 sm:text-sm md:text-base lg:text-lg">
          {t("focusDescription")}
        </p>
      </div>
    </Link>
  );
}
