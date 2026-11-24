import type { DiscordActivity, LanyardPresence } from "../hooks/useLanyardPresence";

export interface LiveMediaTrack {
  source: "youtube-music" | "youtube";
  sourceLabel: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  videoId: string | null;
  trackUrl: string | null;
  isPlaying: boolean;
  timestamps?: {
    start?: number;
    end?: number;
  };
}

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const YTIMG_ID_REGEX = /\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})\//;

export function resolveDiscordAssetUrl(
  asset: string | undefined,
  applicationId?: string,
): string | null {
  if (!asset) return null;
  if (asset.startsWith("mp:external/")) {
    return `https://media.discordapp.net/${asset.slice("mp:".length)}`;
  }
  if (asset.startsWith("https://") || asset.startsWith("http://")) {
    return asset;
  }
  if (applicationId) {
    return `https://cdn.discordapp.com/app-assets/${applicationId}/${asset}.png`;
  }
  return null;
}

export function extractVideoIdFromUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\/+/, "").split("/")[0];
      return YOUTUBE_ID_REGEX.test(id) ? id : null;
    }

    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const vParam = url.searchParams.get("v");
      if (vParam && YOUTUBE_ID_REGEX.test(vParam)) {
        return vParam;
      }

      const pathMatch = url.pathname.match(/^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})(?:\/|$)/);
      if (pathMatch?.[1] && YOUTUBE_ID_REGEX.test(pathMatch[1])) {
        return pathMatch[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function extractYouTubeVideoId(activity: DiscordActivity): string | null {
  const fromDetails = extractVideoIdFromUrl(activity.details_url);
  if (fromDetails) return fromDetails;

  const fromLargeUrl = extractVideoIdFromUrl(activity.assets?.large_url);
  if (fromLargeUrl) return fromLargeUrl;

  const largeImage = activity.assets?.large_image;
  if (largeImage) {
    const ytimgMatch = largeImage.match(YTIMG_ID_REGEX);
    if (ytimgMatch?.[1] && YOUTUBE_ID_REGEX.test(ytimgMatch[1])) {
      return ytimgMatch[1];
    }
  }

  return null;
}

export function getSyncStartSeconds(timestamps?: { start?: number; end?: number }): number {
  const start = timestamps?.start;
  if (typeof start !== "number" || !Number.isFinite(start)) return 0;

  const elapsedSec = Math.floor((Date.now() - start) / 1000);
  if (elapsedSec <= 0) return 0;

  const end = timestamps?.end;
  if (typeof end === "number" && Number.isFinite(end) && end > start) {
    const durationSec = Math.floor((end - start) / 1000);
    if (elapsedSec >= Math.max(0, durationSec - 5)) {
      return 0;
    }
  }

  return elapsedSec;
}

function classifyYouTubeActivity(activity: DiscordActivity): "youtube-music" | "youtube" | null {
  if (activity.type === 4) return null;

  const name = activity.name.trim().toLowerCase();
  const largeText = activity.assets?.large_text?.toLowerCase() ?? "";

  if (
    name === "youtube music" ||
    name.includes("youtube music") ||
    name.includes("pear desktop") ||
    name.includes("ytmdesktop") ||
    largeText.includes("youtube music")
  ) {
    return "youtube-music";
  }

  if (name === "youtube") {
    return "youtube";
  }

  return null;
}

function normalizeArtist(state: string | null | undefined, sourceLabel: string): string {
  if (!state) return sourceLabel;
  const trimmed = state.trim();
  if (!trimmed) return sourceLabel;
  return trimmed.replace(/^by\s+/i, "");
}

export function extractYouTubePresence(presence: LanyardPresence | null): LiveMediaTrack | null {
  const activities = presence?.activities;
  if (!activities || activities.length === 0) return null;

  for (const activity of activities) {
    const source = classifyYouTubeActivity(activity);
    if (!source) continue;

    const sourceLabel = source === "youtube-music" ? "YouTube Music" : "YouTube";
    const smallImage = activity.assets?.small_image?.toLowerCase() ?? "";
    const smallText = activity.assets?.small_text?.toLowerCase() ?? "";
    const isPaused = smallImage.includes("pause") || smallText.includes("paus");
    const videoId = extractYouTubeVideoId(activity);

    let trackUrl: string | null = null;
    if (activity.details_url?.startsWith("https://")) {
      trackUrl = activity.details_url;
    } else if (videoId) {
      trackUrl =
        source === "youtube-music"
          ? `https://music.youtube.com/watch?v=${videoId}`
          : `https://www.youtube.com/watch?v=${videoId}`;
    }

    return {
      source,
      sourceLabel,
      title: activity.details?.trim() || sourceLabel,
      artist: normalizeArtist(activity.state, sourceLabel),
      artworkUrl: resolveDiscordAssetUrl(activity.assets?.large_image, activity.application_id),
      videoId,
      trackUrl,
      isPlaying: !isPaused,
      timestamps: activity.timestamps,
    };
  }

  return null;
}
