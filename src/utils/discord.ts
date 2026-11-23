import type { DiscordUser } from "../hooks/useLanyardPresence";

export type DiscordAvatarSize = 128 | 256 | 512;

export function getDiscordAvatar(
  user: DiscordUser | null | undefined,
  fallbackId: string,
  size: DiscordAvatarSize = 512,
) {
  if (user?.avatar) {
    const format = user.avatar.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${format}?size=${size}`;
  }

  try {
    const defaultAvatarIndex = (BigInt(user?.id ?? fallbackId) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}
