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
  const handle = presence?.discord_user?.username
    ? `@${presence.discord_user.username}`
    : connection === "error"
      ? t("discordJoin")
      : "@arthur-arturo";

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
      className={`bento-card bento-card-interactive bento-enter relative col-span-2 flex h-full w-full flex-col justify-between overflow-hidden rounded-3xl p-3.5 text-white sm:p-5 md:p-6 lg:p-8 ${statusBackground}`}
      href={`https://discord.com/users/${userId}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Discord: ${statusLabel}`}
      title={connection === "error" ? t("discordJoin") : undefined}
    >
      {/* Top row: Discord icon + status badge + external arrow */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <svg
            className="h-5 w-5 shrink-0 fill-current text-white sm:h-7 sm:w-7 md:h-9 md:w-9 lg:h-10 lg:w-10"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d={siDiscord.path} />
          </svg>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-white/95 backdrop-blur-sm sm:px-3 sm:py-1 sm:text-xs md:text-sm">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${statusDot}`} aria-hidden="true" />
            <span className="truncate">{statusLabel}</span>
          </span>
        </div>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-white/80 sm:h-5 sm:w-5 md:h-6 md:w-6"
          aria-hidden="true"
        />
      </div>

      {/* Bottom row: activity pill or handle */}
      {presence?.discord_user && activityText ? (
        <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-black/20 px-2.5 py-1.5 backdrop-blur-sm sm:gap-3 sm:px-3.5 sm:py-2">
          <img
            className="h-6 w-6 shrink-0 rounded-full object-cover sm:h-8 sm:w-8 md:h-10 md:w-10"
            src={getDiscordAvatar(presence.discord_user, userId, 128)}
            alt=""
            decoding="async"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold leading-tight text-white sm:text-sm md:text-base">
              {activityText}
            </p>
            <p className="hidden truncate text-[11px] text-white/75 sm:block">
              @{presence.discord_user.username}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {presence?.discord_user && (
            <img
              className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-white/30 sm:h-8 sm:w-8 md:h-10 md:w-10"
              src={getDiscordAvatar(presence.discord_user, userId, 128)}
              alt=""
              decoding="async"
              loading="lazy"
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-white sm:text-base md:text-xl lg:text-2xl">
              Discord
            </p>
            <p className="truncate text-[10px] font-medium text-white/80 sm:text-xs md:text-sm">
              {handle}
            </p>
          </div>
        </div>
      )}
    </a>
  );
}
