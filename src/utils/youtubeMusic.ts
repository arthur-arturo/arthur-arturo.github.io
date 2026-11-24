import type { DiscordActivity, LanyardPresence } from "../hooks/useLanyardPresence";

export interface LiveMediaTrack {
  source: "youtube-music" | "youtube";
  sourceLabel: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  isPlaying: boolean;
}

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
    const isPaused = smallImage.includes("pause") || smallText.includes("pause");

    return {
      source,
      sourceLabel,
      title: activity.details?.trim() || sourceLabel,
      artist: normalizeArtist(activity.state, sourceLabel),
      artworkUrl: resolveDiscordAssetUrl(activity.assets?.large_image, activity.application_id),
      isPlaying: !isPaused,
    };
  }

  return null;
}
