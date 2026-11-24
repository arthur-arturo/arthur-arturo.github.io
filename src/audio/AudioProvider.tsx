import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { profile } from "../data/portfolio";
import { useEnvironment } from "../environment/EnvironmentProvider";
import { useLanyardPresence } from "../hooks/useLanyardPresence";
import {
  extractYouTubePresence,
  getSyncStartSeconds,
  type LiveMediaTrack,
} from "../utils/youtubeMusic";
import { soundEngine } from "./SoundEngine";
import { YouTubeAudioController, type YouTubePlayerStatus } from "./youtubePlayer";

export type RippleKind = "optical" | "card" | "filter" | "ai";

export interface PortfolioRippleDetail {
  x: number;
  y: number;
  kind: RippleKind;
}

export interface AudioEnergy {
  level: number;
  bass: number;
  mid: number;
  treble: number;
}

interface AudioContextValue {
  enabled: boolean;
  liveTrack: LiveMediaTrack | null;
  playbackMode: "youtube" | "fallback";
  isPlaying: boolean;
  isBuffering: boolean;
  embedBlocked: boolean;
  toggleEnabled: (clientX?: number) => void;
  playOptical: (clientX?: number) => void;
  playCard: (clientX?: number) => void;
  playSkill: (index: number, isAi: boolean, clientX?: number) => void;
  playToggleSound: (kind: "light" | "dark" | "locale", clientX?: number) => void;
  playFilter: (clientX?: number) => void;
  playModal: (action: "open" | "close", clientX?: number) => void;
  getAudioEnergy: () => AudioEnergy;
}

interface MusicGraph {
  ctx: AudioContext;
  analyser: AnalyserNode;
  gainNode: GainNode;
  freqData: Uint8Array<ArrayBuffer>;
}

const AudioContextReact = createContext<AudioContextValue | null>(null);

const ZERO_ENERGY: AudioEnergy = { level: 0, bass: 0, mid: 0, treble: 0 };
const INITIAL_YT_STATUS: YouTubePlayerStatus = { state: "idle", videoId: null, errorCode: null };

function toXNorm(clientX?: number): number {
  if (typeof window === "undefined" || typeof clientX !== "number") return 0.5;
  return clientX / Math.max(window.innerWidth, 1);
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const { environment } = useEnvironment();
  const { presence } = useLanyardPresence(profile.discordId);
  const liveTrack = useMemo(() => extractYouTubePresence(presence), [presence]);

  const [enabled, setEnabled] = useState(false);
  const [ytStatus, setYtStatus] = useState<YouTubePlayerStatus>(INITIAL_YT_STATUS);
  const [blockedVideoId, setBlockedVideoId] = useState<string | null>(null);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const moodRef = useRef(environment.mood);
  moodRef.current = environment.mood;
  const liveTrackRef = useRef<LiveMediaTrack | null>(liveTrack);
  liveTrackRef.current = liveTrack;
  const ytStatusRef = useRef<YouTubePlayerStatus>(ytStatus);
  ytStatusRef.current = ytStatus;
  const blockedVideoIdRef = useRef<string | null>(blockedVideoId);
  blockedVideoIdRef.current = blockedVideoId;

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const musicGraphRef = useRef<MusicGraph | null>(null);
  const graphAttemptedRef = useRef(false);
  const pauseTimeoutRef = useRef<number | null>(null);
  const ytControllerRef = useRef<YouTubeAudioController | null>(null);
  const prevLiveRef = useRef<{ hasLive: boolean; videoId: string | null } | null>(null);

  const ensureAudioElement = useCallback((): HTMLAudioElement | null => {
    if (typeof document === "undefined") return null;
    if (!audioElRef.current) {
      const audio = document.createElement("audio");
      audio.loop = true;
      audio.preload = "none";
      audio.crossOrigin = "anonymous";

      const srcWebm = document.createElement("source");
      srcWebm.src = "/audio/still-i-love-you.webm";
      srcWebm.type = "audio/webm; codecs=opus";

      const srcM4a = document.createElement("source");
      srcM4a.src = "/audio/still-i-love-you.m4a";
      srcM4a.type = "audio/mp4";

      audio.appendChild(srcWebm);
      audio.appendChild(srcM4a);
      audioElRef.current = audio;
    }
    return audioElRef.current;
  }, []);

  const ensureMusicGraph = useCallback((audio: HTMLAudioElement): MusicGraph | null => {
    if (musicGraphRef.current) return musicGraphRef.current;
    if (graphAttemptedRef.current || typeof window === "undefined") return null;
    graphAttemptedRef.current = true;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      const ctx = new AudioCtx();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;

      const gainNode = ctx.createGain();
      gainNode.gain.value = 0;

      source.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      const freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      const graph: MusicGraph = { ctx, analyser, gainNode, freqData };
      musicGraphRef.current = graph;
      return graph;
    } catch {
      return null;
    }
  }, []);

  const stopFallbackAudio = useCallback((immediate = false) => {
    if (pauseTimeoutRef.current !== null) {
      window.clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }

    const audio = audioElRef.current;
    if (!audio) return;

    const graph = musicGraphRef.current;
    if (immediate) {
      if (graph) {
        try {
          const now = graph.ctx.currentTime;
          graph.gainNode.gain.cancelScheduledValues(now);
          graph.gainNode.gain.setValueAtTime(0, now);
        } catch {
          // Ignore gain reset error.
        }
      }
      audio.volume = 0;
      audio.pause();
      return;
    }

    if (graph) {
      try {
        const now = graph.ctx.currentTime;
        graph.gainNode.gain.cancelScheduledValues(now);
        graph.gainNode.gain.setValueAtTime(graph.gainNode.gain.value, now);
        graph.gainNode.gain.linearRampToValueAtTime(0, now + 0.4);
      } catch {
        audio.volume = 0;
      }
    } else {
      audio.volume = 0;
    }

    pauseTimeoutRef.current = window.setTimeout(() => {
      if (!enabledRef.current || Boolean(liveTrackRef.current)) {
        audio.pause();
      }
    }, 420);
  }, []);

  const startFallbackAudio = useCallback(() => {
    if (pauseTimeoutRef.current !== null) {
      window.clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }

    const audio = ensureAudioElement();
    if (!audio) return;

    const graph = ensureMusicGraph(audio);
    if (graph) {
      try {
        if (graph.ctx.state === "suspended") {
          void graph.ctx.resume();
        }
        const now = graph.ctx.currentTime;
        graph.gainNode.gain.cancelScheduledValues(now);
        graph.gainNode.gain.setValueAtTime(graph.gainNode.gain.value, now);
        graph.gainNode.gain.linearRampToValueAtTime(0.42, now + 0.75);
        audio.volume = 1;
      } catch {
        audio.volume = 0.42;
      }
    } else {
      audio.volume = 0.42;
    }
    void audio.play().catch(() => {});
  }, [ensureAudioElement, ensureMusicGraph]);

  // Mount & tear down YouTube IFrame AudioController once (StrictMode-safe).
  useEffect(() => {
    const controller = new YouTubeAudioController((status) => {
      ytStatusRef.current = status;
      setYtStatus(status);

      if (status.state === "error") {
        if (status.videoId) {
          blockedVideoIdRef.current = status.videoId;
          setBlockedVideoId(status.videoId);
        }
        enabledRef.current = false;
        setEnabled(false);
        stopFallbackAudio(true);
      }
    });

    ytControllerRef.current = controller;

    return () => {
      controller.destroy();
      if (ytControllerRef.current === controller) {
        ytControllerRef.current = null;
      }
    };
  }, [stopFallbackAudio]);

  // Clear stale blocked flag when the live track changes or stops.
  useEffect(() => {
    if (!liveTrack?.videoId) {
      setBlockedVideoId(null);
    } else if (blockedVideoId && blockedVideoId !== liveTrack.videoId) {
      setBlockedVideoId(null);
    }
  }, [liveTrack?.videoId, blockedVideoId]);

  // React to live YT Music changes: pre-warm player when idle, enforce School Days exclusivity, and follow track changes.
  useEffect(() => {
    const nextHasLive = Boolean(liveTrack);
    const nextVideoId = liveTrack?.videoId ?? null;
    const prev = prevLiveRef.current;
    prevLiveRef.current = { hasLive: nextHasLive, videoId: nextVideoId };

    if (nextHasLive) {
      stopFallbackAudio(true);
    }

    if (!enabledRef.current) {
      if (nextVideoId && blockedVideoIdRef.current !== nextVideoId) {
        ytControllerRef.current?.prepare(nextVideoId);
      } else if (prev?.hasLive && !nextHasLive) {
        ytControllerRef.current?.pause();
      }
      return;
    }

    if (!prev) {
      if (nextVideoId && blockedVideoIdRef.current !== nextVideoId) {
        ytControllerRef.current?.play(nextVideoId, getSyncStartSeconds(liveTrack?.timestamps));
      }
      return;
    }

    // Arthur switched from idle (fallback) -> live YT Music while visitor was listening
    if ((!prev.hasLive && nextHasLive) || (prev.videoId === null && nextVideoId !== null)) {
      stopFallbackAudio(true);
      if (nextVideoId && blockedVideoIdRef.current !== nextVideoId) {
        ytControllerRef.current?.play(nextVideoId, getSyncStartSeconds(liveTrack?.timestamps));
      } else {
        enabledRef.current = false;
        setEnabled(false);
      }
      return;
    }

    // Arthur switched tracks on YT Music while visitor is listening
    if (prev.videoId !== null && nextVideoId !== null && prev.videoId !== nextVideoId) {
      blockedVideoIdRef.current = null;
      setBlockedVideoId(null);
      ytControllerRef.current?.play(nextVideoId, getSyncStartSeconds(liveTrack?.timestamps));
      return;
    }

    // Arthur stopped listening to YT Music completely while visitor was listening to live track
    if (prev.hasLive && !nextHasLive) {
      ytControllerRef.current?.pause();
      stopFallbackAudio(true);
      enabledRef.current = false;
      setEnabled(false);
    }
  }, [liveTrack?.videoId, liveTrack, stopFallbackAudio]);

  useEffect(() => {
    return () => {
      if (pauseTimeoutRef.current !== null) {
        window.clearTimeout(pauseTimeoutRef.current);
      }
      const audio = audioElRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
        audioElRef.current = null;
      }
      if (musicGraphRef.current) {
        void musicGraphRef.current.ctx.close().catch(() => {});
        musicGraphRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleGlobalPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const soundEl = target?.closest("[data-sound]") as HTMLElement | null;
      const soundType = soundEl?.dataset.sound;
      const isAi = soundEl?.dataset.ai === "true";

      const rippleKind: RippleKind = isAi
        ? "ai"
        : soundType === "card"
          ? "card"
          : soundType === "filter"
            ? "filter"
            : "optical";

      window.dispatchEvent(
        new CustomEvent<PortfolioRippleDetail>("portfolio:ripple", {
          detail: { x: event.clientX, y: event.clientY, kind: rippleKind },
        }),
      );

      if (!enabledRef.current) return;

      const xNorm = event.clientX / Math.max(window.innerWidth, 1);
      soundEngine.unlock();

      if (soundType === "custom") return;
      if (soundType === "card") {
        soundEngine.playCardClick(xNorm, moodRef.current);
      } else if (soundType === "filter") {
        soundEngine.playFilterClick(xNorm, moodRef.current);
      } else {
        soundEngine.playOpticalClick(xNorm, moodRef.current);
      }
    };

    window.addEventListener("pointerdown", handleGlobalPointerDown, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", handleGlobalPointerDown);
    };
  }, []);

  const toggleEnabled = useCallback(
    (clientX?: number) => {
      const next = !enabledRef.current;
      const currentLive = liveTrackRef.current;

      if (currentLive) {
        stopFallbackAudio(true);

        if (next) {
          if (currentLive.videoId && blockedVideoIdRef.current !== currentLive.videoId) {
            enabledRef.current = true;
            setEnabled(true);
            soundEngine.unlock();
            soundEngine.playToggle("light", toXNorm(clientX));
            ytControllerRef.current?.play(
              currentLive.videoId,
              getSyncStartSeconds(currentLive.timestamps),
            );
          } else {
            enabledRef.current = false;
            setEnabled(false);
            if (currentLive.trackUrl) {
              window.open(currentLive.trackUrl, "_blank", "noopener,noreferrer");
            }
          }
        } else {
          enabledRef.current = false;
          setEnabled(false);
          ytControllerRef.current?.pause();
        }
        return;
      }

      // Fallback mode: Arthur is not listening to anything, toggle local "Still I Love You" track.
      ytControllerRef.current?.pause();
      enabledRef.current = next;
      setEnabled(next);

      if (next) {
        soundEngine.unlock();
        soundEngine.playToggle("light", toXNorm(clientX));
        startFallbackAudio();
      } else {
        stopFallbackAudio(false);
      }
    },
    [startFallbackAudio, stopFallbackAudio],
  );

  const getAudioEnergy = useCallback((): AudioEnergy => {
    if (!enabledRef.current) return ZERO_ENERGY;

    if (liveTrackRef.current) {
      const status = ytStatusRef.current.state;
      if (status === "error" || status === "paused" || status === "idle") {
        return ZERO_ENERGY;
      }

      const sec = performance.now() * 0.001;
      if (status === "loading") {
        const pulse = 0.12 + 0.04 * (0.5 + 0.5 * Math.sin(sec * 3.1));
        return { level: pulse, bass: pulse, mid: pulse, treble: pulse * 0.8 };
      }

      const bass = 0.28 + 0.18 * (0.5 + 0.5 * Math.sin(sec * 2.35)) + 0.08 * Math.sin(sec * 4.7);
      const mid =
        0.24 + 0.16 * (0.5 + 0.5 * Math.sin(sec * 3.6 + 0.9)) + 0.06 * Math.cos(sec * 6.2);
      const treble = 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(sec * 5.4 + 1.7));
      const level = bass * 0.45 + mid * 0.35 + treble * 0.2;
      return { level, bass, mid, treble };
    }

    const graph = musicGraphRef.current;
    if (graph && audioElRef.current && !audioElRef.current.paused) {
      graph.analyser.getByteFrequencyData(graph.freqData);
      const data = graph.freqData;
      const len = data.length;
      if (len > 0) {
        let bassSum = 0;
        let midSum = 0;
        let trebleSum = 0;

        const bassEnd = Math.min(5, len);
        const midEnd = Math.min(19, len);
        const trebleEnd = Math.min(43, len);

        for (let i = 0; i < bassEnd; i += 1) bassSum += data[i];
        for (let i = bassEnd; i < midEnd; i += 1) midSum += data[i];
        for (let i = midEnd; i < trebleEnd; i += 1) trebleSum += data[i];

        const bass = bassSum / (Math.max(1, bassEnd) * 255);
        const mid = midSum / (Math.max(1, midEnd - bassEnd) * 255);
        const treble = trebleSum / (Math.max(1, trebleEnd - midEnd) * 255);
        const level = bass * 0.45 + mid * 0.35 + treble * 0.2;

        if (level > 0.004) {
          return { level, bass, mid, treble };
        }
      }
    }

    // Gentle fallback harmonic pulse when audio is enabled while decoding/in headless sandbox
    const sec = performance.now() * 0.001;
    const chimePulse =
      0.24 + 0.14 * (0.5 + 0.5 * Math.sin(sec * 2.8)) + 0.06 * Math.sin(sec * 6.4);
    return {
      level: chimePulse,
      bass: chimePulse * 0.85,
      mid: chimePulse,
      treble: chimePulse * 0.9,
    };
  }, []);

  const playOptical = useCallback((clientX?: number) => {
    if (!enabledRef.current) return;
    soundEngine.playOpticalClick(toXNorm(clientX), moodRef.current);
  }, []);

  const playCard = useCallback((clientX?: number) => {
    if (!enabledRef.current) return;
    soundEngine.playCardClick(toXNorm(clientX), moodRef.current);
  }, []);

  const playSkill = useCallback((index: number, isAi: boolean, clientX?: number) => {
    if (!enabledRef.current) return;
    soundEngine.playSkillChime(index, isAi, toXNorm(clientX), moodRef.current);
  }, []);

  const playToggleSound = useCallback((kind: "light" | "dark" | "locale", clientX?: number) => {
    if (!enabledRef.current) return;
    soundEngine.playToggle(kind, toXNorm(clientX));
  }, []);

  const playFilter = useCallback((clientX?: number) => {
    if (!enabledRef.current) return;
    soundEngine.playFilterClick(toXNorm(clientX), moodRef.current);
  }, []);

  const playModal = useCallback((action: "open" | "close", clientX?: number) => {
    if (!enabledRef.current) return;
    soundEngine.playModalAction(action, toXNorm(clientX));
  }, []);

  const playbackMode: "youtube" | "fallback" = liveTrack ? "youtube" : "fallback";
  const isPlaying =
    enabled && (playbackMode === "fallback" || ytStatus.state === "playing");
  const isBuffering =
    enabled && playbackMode === "youtube" && ytStatus.state === "loading";
  const embedBlocked = Boolean(liveTrack?.videoId && blockedVideoId === liveTrack.videoId);

  const value = useMemo<AudioContextValue>(
    () => ({
      enabled,
      liveTrack,
      playbackMode,
      isPlaying,
      isBuffering,
      embedBlocked,
      toggleEnabled,
      playOptical,
      playCard,
      playSkill,
      playToggleSound,
      playFilter,
      playModal,
      getAudioEnergy,
    }),
    [
      embedBlocked,
      enabled,
      getAudioEnergy,
      isBuffering,
      isPlaying,
      liveTrack,
      playCard,
      playFilter,
      playModal,
      playOptical,
      playSkill,
      playToggleSound,
      playbackMode,
      toggleEnabled,
    ],
  );

  return <AudioContextReact.Provider value={value}>{children}</AudioContextReact.Provider>;
}

export function useAudio() {
  const ctx = useContext(AudioContextReact);
  if (!ctx) {
    throw new Error("useAudio must be used within AudioProvider");
  }
  return ctx;
}
