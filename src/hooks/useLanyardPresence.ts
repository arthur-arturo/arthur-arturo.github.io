import { useEffect, useState } from "react";

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator?: string;
  avatar: string | null;
}

export interface DiscordActivity {
  name: string;
  type: number;
  details?: string | null;
  details_url?: string | null;
  state?: string | null;
  state_url?: string | null;
  application_id?: string;
  buttons?: string[];
  timestamps?: {
    start?: number;
    end?: number;
  };
  assets?: {
    large_image?: string;
    large_text?: string;
    large_url?: string;
    small_image?: string;
    small_text?: string;
  };
}

export interface LanyardPresence {
  discord_user: DiscordUser;
  discord_status: "online" | "idle" | "dnd" | "offline";
  activities: DiscordActivity[];
  listening_to_spotify: boolean;
  spotify: null | {
    track_id: string;
    song: string;
    artist: string;
    album: string;
    album_art_url: string;
    timestamps?: { start: number; end: number };
  };
}

export type LanyardConnection = "connecting" | "connected" | "reconnecting" | "error";

interface LanyardMessage {
  op: number;
  t?: string;
  d?: unknown;
}

const STORAGE_KEY = "portfolio-lanyard-presence-v1";

interface SharedEntry {
  presence: LanyardPresence | null;
  connection: LanyardConnection;
  subscribers: Set<(presence: LanyardPresence | null, connection: LanyardConnection) => void>;
  started: boolean;
  refCount: number;
  cleanupTimer?: number;
  stop?: () => void;
}

const sharedStore = new Map<string, SharedEntry>();

function readCachedPresence(userId: string): LanyardPresence | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, LanyardPresence>;
    const candidate = map?.[userId];
    if (!candidate?.discord_user?.id) return null;
    // Only reuse identity/status from cache so avatars render immediately without flashing stale media activities.
    return {
      ...candidate,
      activities: [],
      listening_to_spotify: false,
      spotify: null,
    };
  } catch {
    return null;
  }
}

function writeCachedPresence(userId: string, presence: LanyardPresence) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, LanyardPresence>) : {};
    map[userId] = presence;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota or privacy restrictions.
  }
}

function getOrCreateEntry(userId: string): SharedEntry {
  let entry = sharedStore.get(userId);
  if (!entry) {
    entry = {
      presence: readCachedPresence(userId),
      connection: "connecting",
      subscribers: new Set(),
      started: false,
      refCount: 0,
    };
    sharedStore.set(userId, entry);
  }
  return entry;
}

function notifySubscribers(entry: SharedEntry) {
  for (const listener of entry.subscribers) {
    listener(entry.presence, entry.connection);
  }
}

function startSharedConnection(userId: string, entry: SharedEntry) {
  if (entry.started) return;
  entry.started = true;

  let socket: WebSocket | null = null;
  let heartbeatTimer: number | undefined;
  let reconnectTimer: number | undefined;
  const restController = new AbortController();
  let closed = false;

  const clearHeartbeat = () => {
    if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  };

  const updatePresence = (data: LanyardPresence) => {
    entry.presence = data;
    entry.connection = "connected";
    writeCachedPresence(userId, data);
    notifySubscribers(entry);
  };

  const updateConnection = (status: LanyardConnection) => {
    entry.connection = status;
    notifySubscribers(entry);
  };

  const connectSocket = () => {
    if (closed) return;

    try {
      socket = new WebSocket("wss://api.lanyard.rest/socket");
    } catch {
      updateConnection("error");
      reconnectTimer = window.setTimeout(connectSocket, 5000);
      return;
    }

    socket.onmessage = (event: MessageEvent<string>) => {
      let message: LanyardMessage;
      try {
        message = JSON.parse(event.data) as LanyardMessage;
      } catch {
        return;
      }

      if (message.op === 1) {
        const hello = message.d as { heartbeat_interval?: number } | undefined;
        const interval = hello?.heartbeat_interval ?? 30000;
        socket?.send(JSON.stringify({ op: 2, d: { subscribe_to_id: userId } }));
        clearHeartbeat();
        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ op: 3 }));
          }
        }, interval);
        return;
      }

      if (message.op === 0 && message.d && typeof message.d === "object") {
        updatePresence(message.d as LanyardPresence);
      }
    };

    socket.onerror = () => {
      if (entry.connection !== "connected") updateConnection("reconnecting");
    };

    socket.onclose = () => {
      clearHeartbeat();
      if (!closed) {
        updateConnection("reconnecting");
        reconnectTimer = window.setTimeout(connectSocket, 5000);
      }
    };
  };

  const fetchRest = async () => {
    try {
      const response = await fetch(`https://api.lanyard.rest/v1/users/${userId}`, {
        signal: restController.signal,
      });

      if (closed) return;
      if (response.status === 404) {
        updateConnection("error");
        return;
      }

      if (response.ok) {
        const result = (await response.json()) as { success?: boolean; data?: LanyardPresence };
        if (result.success && result.data) {
          updatePresence(result.data);
        }
      }
    } catch {
      // WebSocket running in parallel still provides live updates.
    }
  };

  // Run REST and WebSocket in parallel instead of sequentially so avatar & presence resolve immediately.
  void fetchRest();
  connectSocket();

  entry.stop = () => {
    closed = true;
    entry.started = false;
    clearHeartbeat();
    restController.abort();
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}

export function useLanyardPresence(userId: string) {
  const initialEntry = userId ? getOrCreateEntry(userId) : null;
  const [presence, setPresence] = useState<LanyardPresence | null>(
    () => initialEntry?.presence ?? null,
  );
  const [connection, setConnection] = useState<LanyardConnection>(() =>
    userId ? (initialEntry?.connection ?? "connecting") : "error",
  );

  useEffect(() => {
    if (!userId) {
      setConnection("error");
      return;
    }

    const entry = getOrCreateEntry(userId);
    if (entry.cleanupTimer !== undefined) {
      window.clearTimeout(entry.cleanupTimer);
      entry.cleanupTimer = undefined;
    }

    entry.refCount += 1;
    const listener = (nextPresence: LanyardPresence | null, nextConn: LanyardConnection) => {
      setPresence(nextPresence);
      setConnection(nextConn);
    };
    entry.subscribers.add(listener);

    // Sync immediately in case cache populated before effect ran
    setPresence(entry.presence);
    setConnection(entry.connection);
    startSharedConnection(userId, entry);

    return () => {
      entry.subscribers.delete(listener);
      entry.refCount = Math.max(0, entry.refCount - 1);
      if (entry.refCount === 0) {
        entry.cleanupTimer = window.setTimeout(() => {
          if (entry.refCount === 0) {
            entry.stop?.();
          }
        }, 4000);
      }
    };
  }, [userId]);

  return { presence, connection };
}
