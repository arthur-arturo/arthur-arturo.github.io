import { ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";
import { siDiscord } from "simple-icons";
import { useBento3DTilt } from "./Bento3DCard";
import type { LanyardConnection, LanyardPresence } from "../hooks/useLanyardPresence";
import { useLocale } from "../i18n/LocaleProvider";
import { getDiscordAvatar } from "../utils/discord";

interface DiscordCardProps {
  presence: LanyardPresence | null;
  connection: LanyardConnection;
  userId: string;
  enterDelayMs?: number;
}

export function DiscordCard({ presence, connection, userId, enterDelayMs = 345 }: DiscordCardProps) {
  const { t } = useLocale();
  const tilt = useBento3DTilt();
  const status = presence?.discord_status ?? "offline";
  const statusLabel = {
    online: t("discordOnline"),
    idle: t("discordIdle"),
    dnd: t("discordDnd"),
    offline: t("discordOffline"),
  }[status];

  const statusDot = {
    online: "bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]",
    idle: "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.85)]",
    dnd: "bg-rose-300 shadow-[0_0_8px_rgba(253,164,175,0.9)]",
    offline: "bg-white/50",
  }[status];

  const activity = presence?.activities.find((item) => item.type !== 4);
  const customStatus = presence?.activities.find((item) => item.type === 4)?.state;
  const activityText = activity?.details || customStatus || activity?.name;

  const statusBackground = !presence
    ? "bg-[#909090cc] dark:bg-[#9a9a9acc]"
    : {
        online: "bg-[#37c982d9] dark:bg-[#2eb372cc]",
        idle: "bg-[#e3b34fd9] dark:bg-[#cfa03dcc]",
        dnd: "bg-[#ff5b5bd9] dark:bg-[#e33e3ecc]",
        offline: "bg-[#909090cc] dark:bg-[#9a9a9acc]",
      }[status];

  return (
    <a
      data-sound="card"
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      style={{ "--enter-delay": `${enterDelayMs}ms` } as CSSProperties}
      className={`bento-card bento-card-interactive bento-enter relative col-span-1 flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl p-3 text-white ${statusBackground}`}
      href={`https://discord.com/users/${userId}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Discord: ${statusLabel}`}
      title={connection === "error" ? t("discordJoin") : undefined}
    >
      <ArrowUpRight
        className="pointer-events-none absolute right-2.5 top-2.5 z-20 h-3 w-3 text-white/90 dark:text-[#ffffffaa] sm:right-3.5 sm:top-3.5 sm:h-4 sm:w-4 md:right-6 md:top-6 md:h-5 md:w-5"
        aria-hidden="true"
      />

      <div className="flex flex-col items-center justify-center text-center">
        <svg
          className="h-9 w-9 fill-current text-white sm:h-12 sm:w-12 md:h-16 md:w-16 lg:h-20 lg:w-20"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d={siDiscord.path} />
        </svg>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-white/95 backdrop-blur-sm sm:mt-2 sm:gap-1.5 sm:px-2.5 sm:text-[11px] md:text-xs">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${statusDot}`}
            aria-hidden="true"
          />
          <span className="truncate">{statusLabel}</span>
        </span>
      </div>

      {presence?.discord_user && activityText && (
        <div className="absolute inset-x-3 bottom-3 z-10 hidden items-center gap-2 rounded-2xl bg-black/25 px-2.5 py-1.5 backdrop-blur-sm lg:flex">
          <img
            className="h-6 w-6 shrink-0 rounded-full object-cover"
            src={getDiscordAvatar(presence.discord_user, userId, 128)}
            alt=""
            decoding="async"
            loading="lazy"
          />
          <p className="min-w-0 truncate text-xs font-medium text-white/95">{activityText}</p>
        </div>
      )}
    </a>
  );
}
