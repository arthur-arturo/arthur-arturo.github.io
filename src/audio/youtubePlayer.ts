export type YouTubePlaybackState = "idle" | "loading" | "playing" | "paused" | "error";

export interface YouTubePlayerStatus {
  state: YouTubePlaybackState;
  videoId: string | null;
  errorCode: number | null;
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  cueVideoById: (videoId: string | { videoId: string; startSeconds?: number }) => void;
  loadVideoById: (options: string | { videoId: string; startSeconds?: number }) => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  getPlayerState: () => number;
  getCurrentTime: () => number;
  getIframe: () => HTMLIFrameElement;
  destroy: () => void;
}

interface YTPlayerOptions {
  width?: number | string;
  height?: number | string;
  videoId?: string;
  host?: string;
  playerVars?: Record<string, string | number | undefined>;
  events?: {
    onReady?: () => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: (event: { data: number }) => void;
  };
}

interface YTNamespace {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayerInstance;
  PlayerState?: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_CUED = 5;
const YT_UNSTARTED = -1;

const YOUTUBE_API_SCRIPT_SRC = "https://www.youtube.com/iframe_api";
const AMBIENT_VOLUME = 55;

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("YouTube IFrame API requires a browser environment"));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (apiPromise) {
    return apiPromise;
  }

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      apiPromise = null;
      reject(new Error("Timed out loading YouTube IFrame API"));
    }, 10000);

    const finishSuccess = () => {
      if (settled) return;
      if (window.YT?.Player) {
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(window.YT);
      }
    };

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        previousCallback?.();
      } catch {
        // Ignore errors from any prior listener.
      }
      finishSuccess();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${YOUTUBE_API_SCRIPT_SRC}"]`,
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = YOUTUBE_API_SCRIPT_SRC;
      script.async = true;
      script.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        apiPromise = null;
        reject(new Error("Failed to load YouTube IFrame API script"));
      };
      document.head.appendChild(script);
    } else if (window.YT?.Player) {
      finishSuccess();
    }
  });

  return apiPromise;
}

export class YouTubeAudioController {
  private readonly onStatusChange: (status: YouTubePlayerStatus) => void;
  private hostEl: HTMLDivElement | null = null;
  private player: YTPlayerInstance | null = null;
  private initPromise: Promise<void> | null = null;
  private destroyed = false;
  private ready = false;
  private desiredPlaying = false;
  private desiredVideoId: string | null = null;
  private desiredStartSeconds = 0;
  private loadedVideoId: string | null = null;
  private currentStatus: YouTubePlayerStatus = {
    state: "idle",
    videoId: null,
    errorCode: null,
  };

  constructor(onStatusChange: (status: YouTubePlayerStatus) => void) {
    this.onStatusChange = onStatusChange;
  }

  private emit(state: YouTubePlaybackState, errorCode: number | null = null) {
    const next: YouTubePlayerStatus = {
      state,
      videoId: this.desiredVideoId ?? this.loadedVideoId,
      errorCode,
    };
    this.currentStatus = next;
    this.onStatusChange(next);
  }

  private ensureMount(): HTMLElement | null {
    if (typeof document === "undefined" || this.destroyed) return null;

    if (!this.hostEl) {
      const host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.dataset.ytAudioHost = "true";
      // Keep a 200x200 off-screen box instead of display:none / 0x0 so browsers never throttle media playback.
      Object.assign(host.style, {
        position: "fixed",
        left: "-9999px",
        top: "0",
        width: "200px",
        height: "200px",
        opacity: "0.001",
        pointerEvents: "none",
        overflow: "hidden",
      });

      const target = document.createElement("div");
      host.appendChild(target);
      document.body.appendChild(host);
      this.hostEl = host;
    }

    return (this.hostEl.firstElementChild as HTMLElement | null) ?? this.hostEl;
  }

  private async ensureInitialized(initialVideoId: string): Promise<void> {
    if (this.destroyed || this.player) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const YT = await loadYouTubeIframeApi();
        if (this.destroyed || this.player) return;

        const targetEl = this.ensureMount();
        if (!targetEl || this.destroyed) return;

        this.loadedVideoId = initialVideoId;
        this.player = new YT.Player(targetEl, {
          width: 200,
          height: 200,
          videoId: initialVideoId,
          host: "https://www.youtube.com",
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (this.destroyed || !this.player) return;
              this.ready = true;
              try {
                const iframe = this.player.getIframe();
                iframe.tabIndex = -1;
                iframe.setAttribute("aria-hidden", "true");
                iframe.setAttribute("allow", "autoplay; encrypted-media");
              } catch {
                // Ignore if iframe handle isn't exposed cleanly.
              }

              try {
                this.player.unMute();
                this.player.setVolume(AMBIENT_VOLUME);
              } catch {
                // Ignore initial volume failures.
              }

              if (this.desiredPlaying && this.desiredVideoId) {
                if (this.desiredVideoId !== this.loadedVideoId || this.desiredStartSeconds > 0) {
                  this.loadedVideoId = this.desiredVideoId;
                  this.player.loadVideoById({
                    videoId: this.desiredVideoId,
                    startSeconds: this.desiredStartSeconds,
                  });
                } else {
                  this.player.playVideo();
                }
              }
            },
            onStateChange: (event) => {
              if (this.destroyed || !this.player) return;
              const code = event.data;

              if (code === YT_PLAYING) {
                this.emit("playing");
              } else if (code === YT_BUFFERING) {
                this.emit("loading");
              } else if (code === YT_PAUSED) {
                if (!this.desiredPlaying) {
                  this.emit("paused");
                }
              } else if (code === YT_ENDED) {
                if (this.desiredPlaying && this.desiredVideoId) {
                  try {
                    this.player.seekTo(0, true);
                    this.player.playVideo();
                  } catch {
                    this.emit("paused");
                  }
                }
              }
            },
            onError: (event) => {
              if (this.destroyed) return;
              this.desiredPlaying = false;
              this.emit("error", event.data);
            },
          },
        });
      } catch {
        this.initPromise = null;
        if (!this.destroyed && this.desiredPlaying) {
          this.desiredPlaying = false;
          this.emit("error", -1);
        }
      }
    })();

    return this.initPromise;
  }

  prepare(videoId: string) {
    if (this.destroyed || !videoId) return;

    if (!this.player) {
      void this.ensureInitialized(videoId);
      return;
    }

    if (this.ready && !this.desiredPlaying && this.loadedVideoId !== videoId) {
      try {
        this.loadedVideoId = videoId;
        this.player.cueVideoById(videoId);
      } catch {
        // Ignore cue errors until the user explicitly requests playback.
      }
    }
  }

  play(videoId: string, startSeconds = 0) {
    if (this.destroyed || !videoId) return;

    const normalizedStart = Math.max(0, Math.floor(startSeconds));
    this.desiredPlaying = true;
    this.desiredVideoId = videoId;
    this.desiredStartSeconds = normalizedStart;
    this.emit("loading", null);

    if (this.ready && this.player) {
      try {
        this.player.unMute();
        this.player.setVolume(AMBIENT_VOLUME);

        const state = this.player.getPlayerState();
        if (this.loadedVideoId === videoId && state === YT_PAUSED) {
          if (normalizedStart > 0) {
            const currentTime = this.player.getCurrentTime();
            if (Math.abs(currentTime - normalizedStart) > 15) {
              this.player.seekTo(normalizedStart, true);
            }
          }
          this.player.playVideo();
        } else if (
          this.loadedVideoId === videoId &&
          normalizedStart === 0 &&
          (state === YT_CUED || state === YT_UNSTARTED)
        ) {
          this.player.playVideo();
        } else {
          this.loadedVideoId = videoId;
          this.player.loadVideoById({
            videoId,
            startSeconds: normalizedStart,
          });
        }
      } catch {
        this.desiredPlaying = false;
        this.emit("error", -1);
      }
      return;
    }

    void this.ensureInitialized(videoId);
  }

  pause() {
    if (this.destroyed) return;
    this.desiredPlaying = false;

    if (this.ready && this.player) {
      try {
        this.player.pauseVideo();
      } catch {
        // Ignore pause errors.
      }
    }

    this.emit(this.loadedVideoId ? "paused" : "idle");
  }

  getStatus(): YouTubePlayerStatus {
    return this.currentStatus;
  }

  destroy() {
    this.destroyed = true;
    this.ready = false;
    this.desiredPlaying = false;

    if (this.player) {
      try {
        this.player.destroy();
      } catch {
        // Ignore player teardown errors.
      }
      this.player = null;
    }

    if (this.hostEl) {
      this.hostEl.remove();
      this.hostEl = null;
    }
  }
}
