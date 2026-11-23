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

export function DiscordCard({ presence, connection, userId, enterDelayMs = 385 }: DiscordCardProps) {
  const { t } = useLocale();
  const tilt = useBento3DTilt();
  const status = presence?.discord_status ?? "offline";
  const statusLabel = {
    online: t("discordOnline"),
    idle: t("discordIdle"),
    dnd: t("discordDnd"),
    offline: t("discordOffline"),
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
      className={`bento-card bento-card-interactive bento-enter relative col-span-1 flex aspect-square items-center justify-center overflow-hidden rounded-3xl p-3 text-white ${statusBackground}`}
      href={`https://discord.com/users/${userId}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Discord: ${statusLabel}`}
      title={connection === "error" ? t("discordJoin") : undefined}
    >
      <div className="flex items-center justify-center gap-1.5 text-center text-sm font-bold sm:text-base md:gap-2 md:text-xl lg:text-2xl xl:text-[1.75rem]">
        <svg
          className="h-4 w-4 shrink-0 fill-current sm:h-5 sm:w-5 md:h-6 md:w-6 lg:h-7 lg:w-7"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d={siDiscord.path} />
        </svg>
        <span className="leading-tight">{statusLabel}</span>
      </div>

      {presence?.discord_user && activityText && (
        <div className="absolute inset-x-3 bottom-3 z-10 hidden items-center gap-2 rounded-2xl bg-black/25 px-3 py-1.5 backdrop-blur-sm md:flex">
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
