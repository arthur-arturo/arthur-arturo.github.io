import { ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";
import { siSpotify } from "simple-icons";
import type { LanyardPresence } from "../hooks/useLanyardPresence";
import { useLocale } from "../i18n/LocaleProvider";
import { useBento3DTilt } from "./Bento3DCard";

const CURATED_TRACK = {
  trackId: "2LD2gT7gwAurzdQD6ORds1",
  song: "Veridis Quo",
  artist: "Daft Punk · Discovery",
};

export function SpotifyCard({
  presence,
  enterDelayMs = 345,
}: {
  presence: LanyardPresence | null;
  enterDelayMs?: number;
}) {
  const { t } = useLocale();
  const tilt = useBento3DTilt();
  const spotify = presence?.spotify;

  const trackUrl = spotify
    ? `https://open.spotify.com/track/${spotify.track_id}`
    : `https://open.spotify.com/track/${CURATED_TRACK.trackId}`;
  const songTitle = spotify?.song || CURATED_TRACK.song;
  const artistName = spotify?.artist || CURATED_TRACK.artist;
  const coverSrc = spotify?.album_art_url || "/spotify-cover.svg";
  const coverAlt = spotify?.album || CURATED_TRACK.artist;
  const badgeText = spotify ? t("spotifyBadgeLive") : t("spotifyBadgeCurated");

  return (
    <a
      href={trackUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-sound="card"
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      style={{ "--enter-delay": `${enterDelayMs}ms` } as CSSProperties}
      aria-label={`Spotify: ${songTitle} — ${artistName}`}
      className="bento-card bento-card-interactive bento-enter group relative isolate col-span-2 row-span-1 flex cursor-pointer flex-col justify-between overflow-hidden rounded-3xl bg-[#0b1511cc] p-4 text-white md:p-7 lg:p-8"
    >
      <img
        className="project-cover-image absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-70"
        src={coverSrc}
        alt={coverAlt}
        decoding="async"
        loading="lazy"
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-black/80 via-black/50 to-black/20"
        aria-hidden="true"
      />

      <ArrowUpRight
        className="pointer-events-none absolute right-2.5 top-2.5 z-20 h-3 w-3 text-white/90 dark:text-[#ffffffaa] sm:right-3.5 sm:top-3.5 sm:h-4 sm:w-4 md:right-6 md:top-6 md:h-5 md:w-5"
        aria-hidden="true"
      />

      <div className="relative z-10 flex items-center gap-2 pr-6">
        <svg
          className="h-6 w-6 shrink-0 fill-current text-[#1DB954] transition-transform duration-300 group-hover:scale-110 sm:h-7 sm:w-7 md:h-9 md:w-9"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d={siSpotify.path} />
        </svg>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1DB954]/40 bg-[#1DB954]/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#86efac] sm:text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" aria-hidden="true" />
          {badgeText}
        </span>
      </div>

      <div className="relative z-10 min-w-0">
        <p className="truncate text-sm font-bold leading-snug text-white sm:text-base md:text-xl lg:text-2xl">
          {songTitle}
        </p>
        <p className="mt-0.5 truncate text-xs text-white/80 sm:text-sm md:text-base">
          {artistName}
        </p>
        <div
          className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/20 md:mt-3"
          aria-hidden="true"
        >
          <div className="h-full w-3/5 rounded-full bg-[#1DB954] transition-all duration-500 group-hover:w-4/5" />
        </div>
      </div>
    </a>
  );
}
