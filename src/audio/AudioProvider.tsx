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
import { useEnvironment } from "../environment/EnvironmentProvider";
import { soundEngine } from "./SoundEngine";

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

function toXNorm(clientX?: number): number {
  if (typeof window === "undefined" || typeof clientX !== "number") return 0.5;
  return clientX / Math.max(window.innerWidth, 1);
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const { environment } = useEnvironment();
  const [enabled, setEnabled] = useState(false);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const moodRef = useRef(environment.mood);
  moodRef.current = environment.mood;

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const musicGraphRef = useRef<MusicGraph | null>(null);
  const graphAttemptedRef = useRef(false);
  const pauseTimeoutRef = useRef<number | null>(null);

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
      enabledRef.current = next;
      setEnabled(next);

      if (pauseTimeoutRef.current !== null) {
        window.clearTimeout(pauseTimeoutRef.current);
        pauseTimeoutRef.current = null;
      }

      const audio = ensureAudioElement();

      if (next) {
        soundEngine.unlock();
        soundEngine.playToggle("light", toXNorm(clientX));

        if (audio) {
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
        }
      } else if (audio) {
        const graph = musicGraphRef.current;
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
          if (!enabledRef.current) {
            audio.pause();
          }
        }, 420);
      }
    },
    [ensureAudioElement, ensureMusicGraph],
  );

  const getAudioEnergy = useCallback((): AudioEnergy => {
    if (!enabledRef.current) return ZERO_ENERGY;

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
    const chimePulse = 0.24 + 0.14 * (0.5 + 0.5 * Math.sin(sec * 2.8)) + 0.06 * Math.sin(sec * 6.4);
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

  const value = useMemo<AudioContextValue>(
    () => ({
      enabled,
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
      enabled,
      getAudioEnergy,
      playCard,
      playFilter,
      playModal,
      playOptical,
      playSkill,
      playToggleSound,
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
