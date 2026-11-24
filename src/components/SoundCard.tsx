import { ArrowUpRight, Disc3, Loader2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { useAudio } from "../audio/AudioProvider";
import type { LanyardPresence } from "../hooks/useLanyardPresence";
import { useLocale } from "../i18n/LocaleProvider";
import { extractYouTubePresence } from "../utils/youtubeMusic";
import { useBento3DTilt } from "./Bento3DCard";

const CORE_HALO_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CORE_HALO_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - vec2(0.5)) * 2.0;
    float glow = exp(-d * d * 4.4);
    gl_FragColor = vec4(uColor, glow * uOpacity);
  }
`;

function createTiltedEllipseShape(cx: number, cy: number, rx: number, ry: number, rotRad: number) {
  const shape = new THREE.Shape();
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);
  const steps = 20;

  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const lx = rx * Math.cos(a);
    const ly = ry * Math.sin(a);
    const x = cx + lx * cosR - ly * sinR;
    const y = cy + lx * sinR + ly * cosR;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function createEighthNoteGeometry(): THREE.ExtrudeGeometry {
  const head = createTiltedEllipseShape(-0.06, -0.15, 0.11, 0.078, 0.42);

  const stemFlag = new THREE.Shape();
  stemFlag.moveTo(0.015, -0.14);
  stemFlag.lineTo(0.015, 0.25);
  stemFlag.lineTo(0.055, 0.25);
  stemFlag.bezierCurveTo(0.16, 0.2, 0.21, 0.1, 0.15, -0.01);
  stemFlag.bezierCurveTo(0.16, 0.08, 0.12, 0.13, 0.055, 0.14);
  stemFlag.lineTo(0.055, -0.14);
  stemFlag.closePath();

  const geom = new THREE.ExtrudeGeometry([head, stemFlag], {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.018,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geom.center();
  return geom;
}

function createDoubleEighthNoteGeometry(): THREE.ExtrudeGeometry {
  const leftHead = createTiltedEllipseShape(-0.15, -0.16, 0.095, 0.068, 0.38);
  const rightHead = createTiltedEllipseShape(0.11, -0.12, 0.095, 0.068, 0.38);

  const frame = new THREE.Shape();
  frame.moveTo(-0.085, -0.15);
  frame.lineTo(-0.085, 0.2);
  frame.lineTo(0.215, 0.26);
  frame.lineTo(0.215, -0.11);
  frame.lineTo(0.175, -0.11);
  frame.lineTo(0.175, 0.19);
  frame.lineTo(-0.045, 0.13);
  frame.lineTo(-0.045, -0.15);
  frame.closePath();

  const geom = new THREE.ExtrudeGeometry([leftHead, rightHead, frame], {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.018,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geom.center();
  return geom;
}

interface NoteAgent {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  grayColor: THREE.Color;
  grayEmissive: THREE.Color;
  activeColor: THREE.Color;
  activeEmissive: THREE.Color;
  angle: number;
  phase: number;
  baseScale: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  wobbleAmp: number;
}

const GRAY_COLORS = ["#9ca3af", "#cbd5e1", "#6b7280"];
const ACTIVE_COLORS = ["#c084fc", "#e879f9", "#f472b6", "#93c5fd", "#f5d0fe"];
const EQUALIZER_BARS = [48, 86, 60, 96, 54, 80, 44];

interface SoundCardProps {
  enterDelayMs?: number;
  presence?: LanyardPresence | null;
}

export function SoundCard({ enterDelayMs = 125, presence = null }: SoundCardProps) {
  const {
    enabled,
    toggleEnabled,
    getAudioEnergy,
    liveTrack: audioLiveTrack,
    isPlaying,
    isBuffering,
    embedBlocked,
  } = useAudio();
  const { t } = useLocale();
  const tilt = useBento3DTilt();
  const liveTrack = audioLiveTrack ?? extractYouTubePresence(presence);
  const [artFailed, setArtFailed] = useState(false);

  const visualActive = isPlaying || isBuffering;
  const showArtwork = Boolean(liveTrack?.artworkUrl && !artFailed);
  const statusLabel = liveTrack && liveTrack.isPlaying ? t("listeningNow") : t("recentlyPlayed");
  const subtitleLabel = embedBlocked
    ? t("openOnYtMusic")
    : liveTrack
      ? liveTrack.artist
      : "Katsura Kotonoha";
  const badgeText = liveTrack?.source === "youtube-music" ? "YT Music" : "YouTube";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const enabledRef = useRef(visualActive);
  enabledRef.current = visualActive;
  const energyFnRef = useRef(getAudioEnergy);
  energyFnRef.current = getAudioEnergy;
  const reducedRedrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setArtFailed(false);
  }, [liveTrack?.artworkUrl]);

  useEffect(() => {
    reducedRedrawRef.current?.();
  }, [visualActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    let renderer: THREE.WebGLRenderer | null = null;

    try {
      if (canvas) {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        });
      }
    } catch {
      renderer = null;
    }

    if (!canvas || !host || !renderer) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 30);
    camera.position.set(0, 0, 5.2);

    const ambientLight = new THREE.AmbientLight(0xf3e8ff, 0.9);
    scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(2.5, 4, 4.5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xc084fc, 1.0);
    rimLight.position.set(-3, -2, 2.5);
    scene.add(rimLight);

    // Central soft core halo behind the centered vinyl disc
    const haloGeom = new THREE.PlaneGeometry(2.7, 2.7);
    const haloUniforms = {
      uColor: { value: new THREE.Color("#9ca3af") },
      uOpacity: { value: 0.16 },
    };
    const haloMat = new THREE.ShaderMaterial({
      uniforms: haloUniforms,
      vertexShader: CORE_HALO_VERTEX,
      fragmentShader: CORE_HALO_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    const haloMesh = new THREE.Mesh(haloGeom, haloMat);
    haloMesh.position.set(0, 0.02, -0.5);
    scene.add(haloMesh);

    // 14 extruded 3D musical symbols (single eighth & beamed eighth notes) radiating from core
    const singleNoteGeom = createEighthNoteGeometry();
    const doubleNoteGeom = createDoubleEighthNoteGeometry();
    const grayEmissiveBase = new THREE.Color("#4b5563");
    const notes: NoteAgent[] = [];

    for (let i = 0; i < 14; i += 1) {
      const grayHex = GRAY_COLORS[i % GRAY_COLORS.length];
      const activeHex = ACTIVE_COLORS[i % ACTIVE_COLORS.length];
      const grayColor = new THREE.Color(grayHex);
      const activeColor = new THREE.Color(activeHex);

      const mat = new THREE.MeshStandardMaterial({
        color: grayColor.clone(),
        emissive: grayEmissiveBase.clone(),
        emissiveIntensity: 0.2,
        roughness: 0.28,
        metalness: 0.35,
        transparent: true,
        opacity: 0.5,
      });

      const geom = i % 2 === 0 ? singleNoteGeom : doubleNoteGeom;
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);

      const angle = (i / 14) * Math.PI * 2 + (i % 2 === 0 ? 0.16 : -0.14);
      notes.push({
        mesh,
        material: mat,
        grayColor,
        grayEmissive: grayEmissiveBase.clone(),
        activeColor,
        activeEmissive: activeColor.clone(),
        angle,
        phase: i / 14,
        baseScale: 0.54 + (i % 3) * 0.11,
        rotSpeedX: (i % 2 === 0 ? 1 : -1) * (0.45 + (i % 3) * 0.22),
        rotSpeedY: (i % 3 === 0 ? -1 : 1) * (0.7 + (i % 4) * 0.25),
        rotSpeedZ: (i % 2 === 0 ? -1 : 1) * 0.3,
        wobbleAmp: 0.08 + (i % 3) * 0.04,
      });
    }

    const updateSize = () => {
      if (!renderer) return;
      const w = Math.max(host.clientWidth, 1);
      const h = Math.max(host.clientHeight, 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(host);

    const grayHaloColor = new THREE.Color("#9ca3af");
    const activeHaloColor = new THREE.Color("#c084fc");

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let rafId = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let activeMix = enabledRef.current ? 1 : 0;
    let smoothLevel = 0;

    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) * 0.001, 0.05);
      lastTime = now;

      if (!document.hidden) {
        const isOn = enabledRef.current;
        const targetMix = isOn ? 1 : 0;
        const mixRate = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 4.5);
        activeMix += (targetMix - activeMix) * mixRate;

        const energy = energyFnRef.current();
        smoothLevel += (energy.level - smoothLevel) * (1 - Math.exp(-dt * 12));

        const driftSpeed = 0.15 + activeMix * (0.19 + smoothLevel * 0.42);
        if (!reducedMotion.matches) {
          elapsed += dt * driftSpeed;
        }
        const t = now * 0.001;

        for (let i = 0; i < notes.length; i += 1) {
          const n = notes[i];
          const progress = (elapsed + n.phase) % 1;
          const radial = 0.22 + progress * 1.48;
          const arcAngle = n.angle + Math.sin(t * 1.1 + i) * n.wobbleAmp * (0.5 + activeMix);

          const x = Math.cos(arcAngle) * radial;
          const y = Math.sin(arcAngle) * radial * 0.86 + 0.02;
          const z = Math.sin(progress * Math.PI) * 0.85 - 0.15;

          const envelope = Math.sin(progress * Math.PI);
          const beatScale = 1 + activeMix * (0.14 + smoothLevel * 0.48);
          const s = n.baseScale * beatScale * (0.72 + 0.34 * envelope);

          n.mesh.position.set(x, y, z);
          n.mesh.scale.setScalar(s);
          n.mesh.rotation.set(
            Math.sin(t * n.rotSpeedX + i) * 0.35,
            t * n.rotSpeedY * (0.45 + activeMix * 0.55),
            Math.sin(t * n.rotSpeedZ + i) * 0.22,
          );

          n.material.color.copy(n.grayColor).lerp(n.activeColor, activeMix);
          n.material.emissive.copy(n.grayEmissive).lerp(n.activeEmissive, activeMix);
          n.material.emissiveIntensity = 0.18 + activeMix * (0.48 + energy.mid * 0.55);
          n.material.opacity = envelope * (0.52 + activeMix * (0.42 + smoothLevel * 0.06));
        }

        haloUniforms.uColor.value.copy(grayHaloColor).lerp(activeHaloColor, activeMix);
        haloUniforms.uOpacity.value = 0.14 + activeMix * (0.34 + energy.bass * 0.24);

        renderer?.render(scene, camera);
      }

      if (!reducedMotion.matches) {
        rafId = window.requestAnimationFrame(animate);
      }
    };

    const handleVisibility = () => {
      if (!document.hidden) lastTime = performance.now();
    };

    reducedRedrawRef.current = () => {
      if (reducedMotion.matches) {
        rafId = window.requestAnimationFrame(animate);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    rafId = window.requestAnimationFrame(animate);

    return () => {
      reducedRedrawRef.current = null;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);

      haloGeom.dispose();
      haloMat.dispose();
      singleNoteGeom.dispose();
      doubleNoteGeom.dispose();
      for (const n of notes) {
        n.material.dispose();
      }
      renderer?.dispose();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      role="button"
      tabIndex={0}
      data-sound="custom"
      onClick={(event) => toggleEnabled(event.clientX)}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleEnabled();
        }
      }}
      style={{ "--enter-delay": `${enterDelayMs}ms` } as CSSProperties}
      aria-pressed={enabled}
      aria-label={
        liveTrack ? `${t("liveTrackPlayAria")}: ${liveTrack.title}` : t("soundToggleAria")
      }
      className={`bento-card bento-card-interactive bento-enter group relative col-span-1 aspect-square cursor-pointer overflow-hidden rounded-3xl outline-none transition-colors duration-500 focus-visible:ring-2 focus-visible:ring-purple-300/70 ${
        visualActive
          ? "bg-gradient-to-br from-[#2b0b58c4] via-[#1c073acc] to-[#110424e0] shadow-[0_0_32px_-8px_rgba(192,132,252,0.5)] dark:from-[#af72ff56] dark:via-[#5a2b9a5e] dark:to-[#1a0836b8]"
          : "bg-[#1c053a9c] dark:bg-[#23193280]"
      }`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-1/2 bg-gradient-to-t from-black/55 via-black/20 to-transparent"
        aria-hidden="true"
      />

      <div className="absolute inset-0 z-10 flex flex-col justify-between p-2 text-white sm:p-3.5 md:p-4">
        {/* Top bar: Listening status label + subtle live YouTube/YouTube Music badge when active on Discord */}
        <div className="flex shrink-0 items-center justify-between gap-1 leading-none">
          <p
            title={statusLabel}
            className={`min-w-0 truncate text-[6.5px] font-semibold uppercase leading-none tracking-tight transition-colors duration-300 sm:text-[8.5px] md:text-[9px] lg:text-[9.5px] lg:tracking-[0.02em] ${
              visualActive ? "text-purple-100/95" : "text-white/75"
            }`}
          >
            {statusLabel}
          </p>
          {liveTrack &&
            (liveTrack.trackUrl ? (
              <a
                href={liveTrack.trackUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                aria-label={`${liveTrack.sourceLabel}: ${liveTrack.title}`}
                title={liveTrack.sourceLabel}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-300/30 bg-black/30 px-1 py-0.5 text-[8.5px] font-semibold leading-none tracking-wide text-rose-100 backdrop-blur-sm transition hover:border-rose-200/50 hover:bg-black/45 sm:px-1.5 md:text-[9px]"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    liveTrack.isPlaying ? "animate-pulse bg-rose-400" : "bg-zinc-400"
                  }`}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">{badgeText}</span>
                <ArrowUpRight className="h-2.5 w-2.5 opacity-80" aria-hidden="true" />
              </a>
            ) : (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-300/30 bg-black/25 px-1 py-0.5 text-[8.5px] font-semibold leading-none tracking-wide text-rose-100 backdrop-blur-sm sm:px-1.5 md:text-[9px]"
                title={liveTrack.sourceLabel}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    liveTrack.isPlaying ? "animate-pulse bg-rose-400" : "bg-zinc-400"
                  }`}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">{badgeText}</span>
              </span>
            ))}
        </div>

        {/* Center interactive vinyl disc (renders live cover art when YouTube Music is playing on Discord) */}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <span
            className={`relative flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition-all duration-500 group-hover:scale-105 group-active:scale-95 sm:h-14 sm:w-14 md:h-16 md:w-16 lg:h-[72px] lg:w-[72px] ${
              visualActive
                ? "scale-105 border-purple-200/40 bg-gradient-to-br from-purple-400/30 via-fuchsia-500/20 to-indigo-900/40 text-purple-100 shadow-[0_0_28px_rgba(216,180,254,0.55)]"
                : "border-white/20 bg-gradient-to-br from-zinc-500/30 via-zinc-700/40 to-zinc-900/50 text-zinc-300 shadow-[0_0_20px_rgba(0,0,0,0.3)]"
            }`}
            aria-hidden="true"
          >
            {showArtwork && liveTrack?.artworkUrl ? (
              <img
                src={liveTrack.artworkUrl}
                alt=""
                onError={() => setArtFailed(true)}
                className={`h-full w-full rounded-full object-cover p-0.5 transition-all duration-500 ${
                  isPlaying
                    ? "animate-[spin_6.5s_linear_infinite]"
                    : isBuffering
                      ? "opacity-90"
                      : "opacity-95"
                }`}
              />
            ) : (
              <Disc3
                className={`h-full w-full p-1.5 transition-colors duration-300 sm:p-2 ${
                  isPlaying ? "animate-[spin_5.5s_linear_infinite] text-purple-100" : "text-zinc-300/90"
                }`}
              />
            )}

            {isBuffering ? (
              <span className="pointer-events-none absolute flex h-5 w-5 items-center justify-center rounded-full border border-white/30 bg-[#140529]/80 text-purple-100 shadow-[0_0_10px_rgba(0,0,0,0.65)] backdrop-blur-sm sm:h-6 sm:w-6">
                <Loader2 className="h-3 w-3 animate-spin sm:h-3.5 sm:w-3.5" />
              </span>
            ) : embedBlocked ? (
              <span className="pointer-events-none absolute flex h-5 w-5 items-center justify-center rounded-full border border-rose-200/40 bg-[#140529]/85 text-rose-100 shadow-[0_0_10px_rgba(0,0,0,0.65)] backdrop-blur-sm sm:h-6 sm:w-6">
                <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </span>
            ) : isPlaying ? (
              <span className="pointer-events-none absolute flex h-5 w-5 items-center justify-center rounded-full border border-white/35 bg-[#140529]/80 text-white opacity-0 shadow-[0_0_10px_rgba(0,0,0,0.65)] backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:h-6 sm:w-6">
                <Pause className="h-2.5 w-2.5 fill-current sm:h-3 sm:w-3" />
              </span>
            ) : liveTrack ? (
              <span className="pointer-events-none absolute flex h-5 w-5 items-center justify-center rounded-full border border-white/35 bg-[#140529]/80 text-white shadow-[0_0_10px_rgba(0,0,0,0.65)] backdrop-blur-sm transition-transform duration-200 group-hover:scale-110 sm:h-6 sm:w-6">
                <Play className="ml-0.5 h-2.5 w-2.5 fill-current sm:h-3 sm:w-3" />
              </span>
            ) : (
              <span className="pointer-events-none absolute flex items-center justify-center">
                <span className="h-2 w-2 rounded-full bg-zinc-400/80 transition-opacity duration-200 group-hover:opacity-0 sm:h-2.5 sm:w-2.5" />
                <Play className="absolute ml-0.5 h-2.5 w-2.5 fill-current text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:h-3 sm:w-3" />
              </span>
            )}
          </span>
        </div>

        {/* Bottom track metadata + equalizer bars */}
        <div className="min-w-0 shrink-0 text-left">
          <p className="truncate text-[9px] font-bold leading-none text-white sm:text-xs sm:leading-tight md:text-sm">
            {liveTrack ? liveTrack.title : "Still I Love You"}
          </p>
          <p className="hidden truncate text-[9px] text-white/75 sm:mt-0.5 sm:block sm:leading-tight md:text-[11px]">
            {subtitleLabel}
          </p>
          <div
            className={`mt-1 flex h-2 items-center sm:h-3 ${
              isPlaying ? "spotify-wires-active" : "spotify-wires-idle"
            }`}
            aria-hidden="true"
          >
            {EQUALIZER_BARS.map((height, index) => (
              <span key={index} className="spotify-wire" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
