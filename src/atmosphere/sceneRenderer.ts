import * as THREE from "three";
import type { RippleKind } from "../audio/AudioProvider";
import type { QualityProfile } from "./config";
import type { SolarCycleState } from "./solarCycle";
import {
  computeAtmosphericTargets,
  createInitialVisualState,
  stepVisualState,
} from "./transitions";
import type { AtmosphereMood, WeatherConditions } from "./weatherState";

export interface AtmosphereSceneInput {
  solar: SolarCycleState;
  weather: WeatherConditions;
  isDark: boolean;
  mood: AtmosphereMood;
}

export interface AtmosphereSceneController {
  updateInput: (input: AtmosphereSceneInput) => void;
  setReducedMotion: (reduced: boolean) => void;
  triggerRipple: (x: number, y: number, kind: RippleKind) => void;
  dispose: () => void;
}

interface LeafAgent {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
  scale: number;
  phase: number;
  visibility: number;
}

interface RainAgent {
  x: number;
  y: number;
  z: number;
  speed: number;
  scaleY: number;
}

interface RippleSlot {
  active: boolean;
  age: number;
  duration: number;
  mesh: THREE.Mesh;
  uniforms: {
    uProgress: { value: number };
    uColor: { value: THREE.Color };
    uStrength: { value: number };
  };
}

interface SparkSlot {
  active: boolean;
  age: number;
  duration: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

interface ShootingStar {
  active: boolean;
  age: number;
  duration: number;
  cooldown: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  mesh: THREE.Mesh;
  uniforms: {
    uProgress: { value: number };
    uOpacity: { value: number };
    uColor: { value: THREE.Color };
  };
}

const SKY_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uCelestialUv;
  uniform vec2 uBeamDir;
  uniform vec2 uCloudOffset;
  uniform vec3 uSkyBottom;
  uniform vec3 uSkyMid;
  uniform vec3 uSkyTop;
  uniform vec3 uGlowColor;
  uniform vec3 uCloudColor;
  uniform vec3 uFogColor;
  uniform float uIsDark;
  uniform float uNightBlend;
  uniform float uBeamMix;
  uniform float uCloudAmount;
  uniform float uCloudDarkness;
  uniform float uFogOpacity;
  uniform float uLightning;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;

    // 1. 3-stop continuous gradient smoothly driven by solar stage & weather
    vec3 col = mix(uSkyBottom, uSkyMid, smoothstep(0.0, 0.52, uv.y));
    col = mix(col, uSkyTop, smoothstep(0.45, 1.0, uv.y));

    // 2. Celestial radial corona + tilted volumetric rays from moving celestial body
    vec2 fromCorner = uv - uCelestialUv;
    float cornerDist = length(fromCorner * vec2(1.45, 1.0));
    float cloudDim = 1.0 - clamp(uCloudAmount * 0.45 + uCloudDarkness * 0.35 + uFogOpacity * 0.55, 0.0, 0.78);

    vec2 diagDir = normalize(uBeamDir + vec2(-0.0001));
    float proj = max(dot(normalize(fromCorner + vec2(-0.0001)), diagDir), 0.0);
    float beamSpread = pow(proj, 2.2) * exp(-cornerDist * 1.15);

    if (uBeamMix > 0.01) {
      float angle = atan(fromCorner.y, fromCorner.x);
      float rays = 0.5 + 0.5 * sin(angle * 10.0 + uTime * 0.16);
      float rayNoise = fbm(vec2(angle * 2.6, cornerDist * 2.1 - uTime * 0.03));
      float sunRays = smoothstep(0.28, 0.94, rays * 0.52 + rayNoise * 0.58) * beamSpread;
      float sunCoreGlow = exp(-cornerDist * cornerDist * 2.6);

      float dayFactor = uBeamMix * cloudDim;
      vec3 lightSunCol = mix(
        col,
        uGlowColor,
        clamp((sunCoreGlow * 0.62 + sunRays * 0.4) * dayFactor, 0.0, 0.72)
      );
      vec3 darkSunCol = col + uGlowColor * (sunCoreGlow * 0.75 + sunRays * 0.65) * dayFactor * 0.48;
      col = mix(lightSunCol, darkSunCol, uIsDark);
    }

    if (uNightBlend > 0.01) {
      float lunarGlow = exp(-cornerDist * cornerDist * 4.2);
      float nightGain = uNightBlend * cloudDim * mix(0.26, 0.44, uIsDark);
      col += uGlowColor * (lunarGlow * 0.72 + beamSpread * 0.55) * nightGain;

      // Dreamy subtle nocturnal mist wave in upper sky
      float mistWave = fbm(vec2(uv.x * 2.1 + uTime * 0.015, uv.y * 1.5 - uTime * 0.01));
      float nightSheen = smoothstep(0.45, 0.88, mistWave) * smoothstep(0.3, 0.98, uv.y);
      col += mix(vec3(0.56, 0.5, 0.9), vec3(0.24, 0.22, 0.56), uIsDark) * nightSheen * uNightBlend * cloudDim * 0.24;
    }

    // 3. Subtle background cloud haze (foreground sculpted clouds carry primary detail)
    if (uCloudAmount > 0.02) {
      float clA = fbm(uv * vec2(3.1, 2.0) + uCloudOffset * 0.65);
      float clB = fbm(uv * vec2(4.6, 2.6) - uCloudOffset * 0.42 + vec2(0.0, 0.35));
      float cloudPattern = smoothstep(0.28, 0.82, mix(clA, clB, 0.48));
      col = mix(col, uCloudColor, cloudPattern * uCloudAmount * 0.16);
    }

    // 4. Subtle atmospheric fog lift toward lower horizon
    if (uFogOpacity > 0.01) {
      float horizonFog = smoothstep(0.85, 0.05, uv.y) * 0.55 + 0.25;
      col = mix(col, uFogColor, clamp(uFogOpacity * horizonFog * 0.58, 0.0, 0.65));
    }

    // 5. Restrained storm lightning illumination
    if (uLightning > 0.004) {
      float boltZone = exp(-length(uv - vec2(0.76, 0.84)) * 2.1);
      col += vec3(0.68, 0.8, 1.0) * uLightning * (0.14 + 0.32 * boltZone);
    }

    // 6. Gentle cursor light halo
    vec2 mouseDiff = (uv - uMouse) * vec2(1.5, 1.0);
    float cursorHalo = exp(-dot(mouseDiff, mouseDiff) / 0.09);
    col += mix(vec3(1.0, 0.94, 1.0), uGlowColor, 0.45) * cursorHalo * mix(0.05, 0.11, uIsDark);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const MOON_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormalView;
  void main() {
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MOON_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform float uIsDark;
  uniform float uLunarPhase;
  varying vec2 vUv;
  varying vec3 vNormalView;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      val += amp * noise(p);
      p *= 2.06;
      amp *= 0.5;
    }
    return val;
  }

  void main() {
    if (uOpacity <= 0.004) discard;
    vec3 N = normalize(vNormalView);

    // Real astronomical phase vector across synodic month (0=new, 0.25=quarter, 0.5=full, 0.75=last quarter)
    float phaseAngle = uLunarPhase * 6.2831853;
    vec3 lightDir = normalize(vec3(sin(phaseAngle), 0.16, -cos(phaseAngle) * 0.92));
    float lit = smoothstep(-0.14, 0.36, dot(N, lightDir));
    float rim = pow(1.0 - max(dot(N, vec3(0.0, 0.0, 1.0)), 0.0), 2.35);

    float maria = fbm(vUv * 6.5);
    float craters = noise(vUv * 18.0) * 0.5 + noise(vUv * 34.0) * 0.5;
    vec3 moonLit = mix(vec3(0.86, 0.9, 0.99), vec3(0.96, 0.97, 1.0), uIsDark);
    vec3 moonEarthshine = mix(vec3(0.58, 0.6, 0.78), vec3(0.14, 0.12, 0.28), uIsDark);

    vec3 surface = mix(moonEarthshine, moonLit * (0.8 + 0.14 * maria + 0.1 * craters), lit);
    surface += vec3(0.76, 0.86, 1.0) * rim * (0.38 + 0.26 * lit);

    float alpha = uOpacity * (0.32 + 0.64 * lit + rim * 0.34);
    gl_FragColor = vec4(surface, clamp(alpha, 0.0, 0.98));
  }
`;

const SUN_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormalView;
  void main() {
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform vec3 uSunCore;
  uniform vec3 uSunRim;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalView;

  void main() {
    if (uOpacity <= 0.004) discard;
    vec3 N = normalize(vNormalView);
    float facing = max(dot(N, vec3(0.0, 0.0, 1.0)), 0.0);
    float coreMask = smoothstep(0.08, 0.78, facing);
    float softFalloff = pow(facing, 1.45);
    float pulse = 0.96 + 0.04 * sin(uTime * 1.1 + vUv.y * 4.0);

    vec3 color = mix(uSunRim, uSunCore, coreMask) * pulse;
    float alpha = clamp(uOpacity * softFalloff, 0.0, 0.94);
    gl_FragColor = vec4(color, alpha);
  }
`;

const CELESTIAL_GLOW_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CELESTIAL_GLOW_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uRingOpacity;
  varying vec2 vUv;

  void main() {
    if (uIntensity <= 0.002 && uRingOpacity <= 0.002) discard;
    float d = length(vUv - vec2(0.5)) * 2.0;
    float softHalo = exp(-d * d * 4.2) * uIntensity;
    float subtleOrbit = exp(-pow((d - 0.34) * 28.0, 2.0)) * uRingOpacity;
    float outerHalo = exp(-pow((d - 0.54) * 14.0, 2.0)) * uRingOpacity * 0.45;
    float alpha = clamp(softHalo + subtleOrbit + outerHalo, 0.0, 0.92);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const MIST_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MIST_FRAGMENT_SHADER = `
  uniform vec2 uDrift;
  uniform vec2 uScale;
  uniform vec2 uLightDir;
  uniform float uOpacity;
  uniform float uSeed;
  uniform float uCoverage;
  uniform vec3 uCloudHighlight;
  uniform vec3 uCloudShadow;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      val += amp * noise(p);
      p *= 2.04;
      amp *= 0.5;
    }
    return val;
  }

  void main() {
    if (uOpacity <= 0.004) discard;
    vec2 uv = vUv * uScale + vec2(uDrift.x + uSeed, uSeed * 0.37 + uDrift.y);

    float base = fbm(uv);
    float detail = fbm(uv * 2.15 + vec2(3.2, -1.8));
    float puff = mix(base, detail, 0.35);

    float thresh = mix(0.56, 0.34, clamp(uCoverage, 0.0, 1.0));
    float alphaMask = smoothstep(thresh, thresh + 0.24, puff);
    if (alphaMask <= 0.004) discard;

    vec2 sunStep = normalize(uLightDir + vec2(0.0001)) * 0.09;
    float puffTowardLight = mix(
      fbm(uv + sunStep),
      fbm((uv + sunStep) * 2.15 + vec2(3.2, -1.8)),
      0.35
    );
    float crestLight =
      smoothstep(-0.14, 0.16, puff - puffTowardLight) * 0.55 +
      smoothstep(thresh, thresh + 0.32, puff) * 0.45;
    vec3 cloudCol = mix(uCloudShadow, uCloudHighlight, clamp(crestLight, 0.0, 1.0));

    float verticalBand = smoothstep(0.04, 0.32, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
    float finalAlpha = clamp(alphaMask * uOpacity * (0.45 + 0.55 * verticalBand), 0.0, 0.85);
    gl_FragColor = vec4(cloudCol, finalAlpha);
  }
`;

const FOG_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uFogColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    if (uOpacity <= 0.004) discard;
    float n = noise(vUv * vec2(2.4, 1.5) + vec2(uTime * 0.025, 0.2));
    float verticalVeil = smoothstep(1.0, 0.1, vUv.y) * 0.7 + 0.3;
    float alpha = clamp((0.65 + 0.35 * n) * verticalVeil * uOpacity, 0.0, 0.78);
    gl_FragColor = vec4(uFogColor, alpha);
  }
`;

const STARS_VERTEX_SHADER = `
  attribute float aSize;
  attribute float aPhase;
  attribute float aLifeSpeed;
  attribute float aTwinkleFreq;
  attribute float aPermanent;
  attribute vec3 aColor;
  varying float vPhase;
  varying float vLifeSpeed;
  varying float vTwinkleFreq;
  varying float vPermanent;
  varying vec3 vColor;
  uniform float uPixelRatio;

  void main() {
    vPhase = aPhase;
    vLifeSpeed = aLifeSpeed;
    vTwinkleFreq = aTwinkleFreq;
    vPermanent = aPermanent;
    vColor = aColor;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (13.5 / max(-mvPos.z, 1.0));
    gl_Position = projectionMatrix * mvPos;
  }
`;

const STARS_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform float uTime;
  varying float vPhase;
  varying float vLifeSpeed;
  varying float vTwinkleFreq;
  varying float vPermanent;
  varying vec3 vColor;

  void main() {
    if (uOpacity <= 0.004) discard;
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;

    float core = exp(-d * d * 24.0);
    float halo = exp(-d * d * 5.5) * 0.42;

    float cycle = 0.5 + 0.5 * sin(uTime * vLifeSpeed + vPhase);
    float ephemeralLife = smoothstep(0.18, 0.58, cycle);
    float permanentLife = 0.58 + 0.42 * cycle;
    float lifeEnvelope = mix(ephemeralLife, permanentLife, vPermanent);
    if (lifeEnvelope <= 0.004) discard;

    float twinkle = 0.65 + 0.35 * sin(uTime * vTwinkleFreq + vPhase * 1.7);
    float alpha = clamp((core + halo) * lifeEnvelope * twinkle * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const PARTICLES_VERTEX_SHADER = `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  varying float vPhase;
  varying vec3 vColor;
  uniform float uPixelRatio;

  void main() {
    vPhase = aPhase;
    vColor = aColor;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (4.0 / max(-mvPos.z, 1.0));
    gl_Position = projectionMatrix * mvPos;
  }
`;

const PARTICLES_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform float uTime;
  varying float vPhase;
  varying vec3 vColor;

  void main() {
    if (uOpacity <= 0.004) discard;
    float d = length(gl_PointCoord - vec2(0.5));
    float soft = smoothstep(0.5, 0.05, d);
    if (soft <= 0.004) discard;
    float twinkle = 0.58 + 0.42 * sin(uTime * 1.5 + vPhase);
    gl_FragColor = vec4(vColor, soft * twinkle * uOpacity);
  }
`;

const SPARK_VERTEX_SHADER = `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uPixelRatio;

  void main() {
    vAlpha = aAlpha;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (5.2 / max(-mvPos.z, 1.0));
    gl_Position = projectionMatrix * mvPos;
  }
`;

const SPARK_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.004) discard;
    float d = length(gl_PointCoord - vec2(0.5));
    float soft = smoothstep(0.5, 0.04, d);
    if (soft <= 0.004) discard;
    gl_FragColor = vec4(uColor, soft * vAlpha);
  }
`;

const RIPPLE_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIPPLE_FRAGMENT_SHADER = `
  uniform float uProgress;
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    if (uProgress <= 0.0 || uProgress >= 1.0) discard;
    float d = length(vUv - vec2(0.5)) * 2.0;
    float radius = mix(0.05, 0.92, 1.0 - pow(1.0 - uProgress, 2.4));
    float ringA = exp(-pow((d - radius) * 20.0, 2.0));
    float ringB = exp(-pow((d - radius * 0.66) * 24.0, 2.0)) * 0.55;
    float fade = (1.0 - uProgress) * (1.0 - uProgress);
    float alpha = (ringA + ringB) * fade * uStrength;
    if (alpha <= 0.003) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const SHOOTING_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHOOTING_FRAGMENT_SHADER = `
  uniform float uProgress;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    if (uOpacity <= 0.004) discard;
    float along = smoothstep(0.0, 0.85, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
    float crossMask = smoothstep(0.5, 0.0, abs(vUv.y - 0.5));
    float life = sin(uProgress * 3.14159265);
    gl_FragColor = vec4(uColor, along * crossMask * life * uOpacity);
  }
`;

function createSculptedLeafGeometry(): THREE.BufferGeometry {
  const segments = 10;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const y = (u - 0.5) * 0.48;
    const width = Math.sin(Math.pow(u, 0.72) * Math.PI) * 0.175;
    const archZ = Math.sin(u * Math.PI) * 0.05;
    const foldLift = Math.sin(u * Math.PI) * 0.032;

    positions.push(-width, y, archZ + foldLift);
    positions.push(0, y, archZ);
    positions.push(width, y, archZ + foldLift);
  }

  for (let i = 0; i < segments; i += 1) {
    const row = i * 3;
    const next = (i + 1) * 3;
    indices.push(row + 0, row + 1, next + 1);
    indices.push(row + 0, next + 1, next + 0);
    indices.push(row + 1, row + 2, next + 2);
    indices.push(row + 1, next + 2, next + 1);
  }

  const baseIdx = positions.length / 3;
  positions.push(-0.012, -0.24, 0.0);
  positions.push(0.012, -0.24, 0.0);
  positions.push(0.0, -0.31, -0.015);
  indices.push(baseIdx, baseIdx + 1, baseIdx + 2);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export function createAtmosphereScene(
  canvas: HTMLCanvasElement,
  initialInput: AtmosphereSceneInput,
  quality: QualityProfile,
): AtmosphereSceneController | null {
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: quality.tier !== "low",
      powerPreference: "high-performance",
    });
  } catch {
    renderer = null;
  }

  if (!renderer) return null;

  let currentInput = initialInput;
  let targets = computeAtmosphericTargets(
    currentInput.solar,
    currentInput.weather,
    currentInput.isDark,
    quality.leafCount,
  );
  const state = createInitialVisualState(targets);
  let reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / Math.max(window.innerHeight, 1),
    0.1,
    100,
  );
  camera.position.set(0, 0, 10);

  const ambientLight = new THREE.AmbientLight(0xd9cff2, 0.95);
  scene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(0xf3f5ff, 1.45);
  keyLight.position.set(6, 7, 6);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xa78bfa, 0.85);
  rimLight.position.set(-5, -3, 3);
  scene.add(rimLight);

  // 1. Dynamic 3-stop atmospheric sky backdrop
  const skyPlaneGeom = new THREE.PlaneGeometry(60, 32);
  const skyUniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uCelestialUv: { value: new THREE.Vector2(0.88, 0.82) },
    uBeamDir: { value: new THREE.Vector2(state.beamDirectionX, state.beamDirectionY) },
    uCloudOffset: { value: new THREE.Vector2(0, 0.1) },
    uSkyBottom: { value: new THREE.Color(...state.skyBottom) },
    uSkyMid: { value: new THREE.Color(...state.skyMid) },
    uSkyTop: { value: new THREE.Color(...state.skyTop) },
    uGlowColor: { value: new THREE.Color(...state.celestialGlowColor) },
    uCloudColor: { value: new THREE.Color(...state.cloudColor) },
    uFogColor: { value: new THREE.Color(...state.fogColor) },
    uIsDark: { value: state.isDark },
    uNightBlend: { value: state.nightBlend },
    uBeamMix: { value: state.beamMix },
    uCloudAmount: { value: state.cloudAmount },
    uCloudDarkness: { value: state.cloudDarkness },
    uFogOpacity: { value: state.fogOpacity },
    uLightning: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    depthWrite: false,
  });
  const skyBackdrop = new THREE.Mesh(skyPlaneGeom, skyMat);
  skyBackdrop.position.set(0, 0, -12);
  scene.add(skyBackdrop);

  // 2. Separate Sun & Phased Moon celestial groups following their real sky arcs
  const sunGroup = new THREE.Group();
  const moonGroup = new THREE.Group();
  scene.add(sunGroup);
  scene.add(moonGroup);

  const sunGeom = new THREE.SphereGeometry(1.22, quality.celestialSegments, quality.celestialSegments);
  const sunUniforms = {
    uOpacity: { value: state.sunOpacity },
    uSunCore: { value: new THREE.Color(...state.sunCore) },
    uSunRim: { value: new THREE.Color(...state.sunRim) },
    uTime: { value: 0 },
  };
  const sunMat = new THREE.ShaderMaterial({
    uniforms: sunUniforms,
    vertexShader: SUN_VERTEX_SHADER,
    fragmentShader: SUN_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const sunMesh = new THREE.Mesh(sunGeom, sunMat);
  sunGroup.add(sunMesh);

  const celestialGlowGeom = new THREE.PlaneGeometry(14.0, 14.0);
  const sunGlowUniforms = {
    uColor: { value: new THREE.Color(...state.celestialGlowColor) },
    uIntensity: { value: state.celestialGlow },
    uRingOpacity: { value: state.celestialRingOpacity },
  };
  const sunGlowMat = new THREE.ShaderMaterial({
    uniforms: sunGlowUniforms,
    vertexShader: CELESTIAL_GLOW_VERTEX,
    fragmentShader: CELESTIAL_GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const sunGlowMesh = new THREE.Mesh(celestialGlowGeom, sunGlowMat);
  sunGlowMesh.position.set(0, 0, -0.4);
  sunGroup.add(sunGlowMesh);

  const moonGeom = new THREE.SphereGeometry(1.12, quality.celestialSegments, quality.celestialSegments);
  const moonUniforms = {
    uOpacity: { value: state.moonOpacity },
    uIsDark: { value: state.isDark },
    uLunarPhase: { value: state.lunarPhase },
  };
  const moonMat = new THREE.ShaderMaterial({
    uniforms: moonUniforms,
    vertexShader: MOON_VERTEX_SHADER,
    fragmentShader: MOON_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const moonMesh = new THREE.Mesh(moonGeom, moonMat);
  moonGroup.add(moonMesh);

  const moonGlowUniforms = {
    uColor: { value: new THREE.Color(...state.celestialGlowColor) },
    uIntensity: { value: state.celestialGlow },
    uRingOpacity: { value: state.celestialRingOpacity },
  };
  const moonGlowMat = new THREE.ShaderMaterial({
    uniforms: moonGlowUniforms,
    vertexShader: CELESTIAL_GLOW_VERTEX,
    fragmentShader: CELESTIAL_GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const moonGlowMesh = new THREE.Mesh(celestialGlowGeom, moonGlowMat);
  moonGlowMesh.position.set(0, 0, -0.4);
  moonGroup.add(moonGlowMesh);

  // 3. Multi-layer wind-drifted sculpted 3D clouds (behind + foreground veil across celestial body)
  const mistGeom = new THREE.PlaneGeometry(42, 22);
  const allDepths = [-8.4, -6.2, -4.6];
  const layerScales = [
    new THREE.Vector2(2.1, 1.3),
    new THREE.Vector2(3.0, 1.8),
    new THREE.Vector2(1.6, 1.1),
  ];
  const mistLayers: Array<{
    mesh: THREE.Mesh;
    speedFactor: number;
    uniforms: {
      uDrift: { value: THREE.Vector2 };
      uScale: { value: THREE.Vector2 };
      uLightDir: { value: THREE.Vector2 };
      uOpacity: { value: number };
      uSeed: { value: number };
      uCoverage: { value: number };
      uCloudHighlight: { value: THREE.Color };
      uCloudShadow: { value: THREE.Color };
    };
  }> = [];

  for (let i = 0; i < quality.cloudLayers; i += 1) {
    const uniforms = {
      uDrift: { value: new THREE.Vector2(0, 0) },
      uScale: { value: layerScales[i].clone() },
      uLightDir: { value: new THREE.Vector2(0.4, 0.8) },
      uOpacity: { value: state.cloudOpacity },
      uSeed: { value: i * 4.3 },
      uCoverage: { value: state.cloudAmount },
      uCloudHighlight: { value: new THREE.Color(...state.cloudHighlight) },
      uCloudShadow: { value: new THREE.Color(...state.cloudShadow) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: MIST_VERTEX_SHADER,
      fragmentShader: MIST_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(mistGeom, mat);
    mesh.position.set(0, 0, allDepths[i]);
    scene.add(mesh);
    mistLayers.push({ mesh, speedFactor: 0.72 + i * 0.34, uniforms });
  }

  // 4. Volumetric atmospheric fog depth plane (WMO 45/48)
  const fogGeom = new THREE.PlaneGeometry(36, 22);
  const fogUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: state.fogOpacity },
    uFogColor: { value: new THREE.Color(...state.fogColor) },
  };
  const fogMat = new THREE.ShaderMaterial({
    uniforms: fogUniforms,
    vertexShader: MIST_VERTEX_SHADER,
    fragmentShader: FOG_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const fogMesh = new THREE.Mesh(fogGeom, fogMat);
  fogMesh.position.set(0, 0, -4.2);
  fogMesh.visible = state.fogOpacity > 0.01;
  scene.add(fogMesh);

  // 5. Living twinkling night starfield
  const starCount = quality.starCount;
  const starPositions = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  const starPhases = new Float32Array(starCount);
  const starLifeSpeeds = new Float32Array(starCount);
  const starTwinkleFreqs = new Float32Array(starCount);
  const starPermanent = new Float32Array(starCount);
  const starColors = new Float32Array(starCount * 3);
  const starSwatches = [
    new THREE.Color("#f8fafc"),
    new THREE.Color("#bae6fd"),
    new THREE.Color("#ddd6fe"),
    new THREE.Color("#e0e7ff"),
  ];
  for (let i = 0; i < starCount; i += 1) {
    starPositions[i * 3] = (Math.random() - 0.5) * 32;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 18;
    starPositions[i * 3 + 2] = -3.2 - Math.random() * 6.6;

    const roll = Math.random();
    starSizes[i] =
      roll > 0.94
        ? 4.5 + Math.random() * 1.7
        : roll > 0.72
          ? 3.2 + Math.random() * 1.0
          : 1.8 + Math.random() * 1.4;
    starPhases[i] = Math.random() * Math.PI * 2;
    starLifeSpeeds[i] = 0.07 + Math.random() * 0.17;
    starTwinkleFreqs[i] = 1.1 + Math.random() * 2.1;
    starPermanent[i] = Math.random() < 0.3 ? 1.0 : 0.0;

    const c = starSwatches[i % starSwatches.length];
    starColors[i * 3] = c.r;
    starColors[i * 3 + 1] = c.g;
    starColors[i * 3 + 2] = c.b;
  }
  const starGeom = new THREE.BufferGeometry();
  starGeom.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeom.setAttribute("aSize", new THREE.BufferAttribute(starSizes, 1));
  starGeom.setAttribute("aPhase", new THREE.BufferAttribute(starPhases, 1));
  starGeom.setAttribute("aLifeSpeed", new THREE.BufferAttribute(starLifeSpeeds, 1));
  starGeom.setAttribute("aTwinkleFreq", new THREE.BufferAttribute(starTwinkleFreqs, 1));
  starGeom.setAttribute("aPermanent", new THREE.BufferAttribute(starPermanent, 1));
  starGeom.setAttribute("aColor", new THREE.BufferAttribute(starColors, 3));

  const starUniforms = {
    uOpacity: { value: state.starOpacity },
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, quality.maxDpr) },
  };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: STARS_VERTEX_SHADER,
    fragmentShader: STARS_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeom, starMat);
  stars.visible = state.starOpacity > 0.01;
  scene.add(stars);

  // 6. Shooting stars
  const shootingGeom = new THREE.PlaneGeometry(1.45, 0.026);
  const shootingStars: ShootingStar[] = [];
  for (let i = 0; i < quality.shootingStarCount; i += 1) {
    const uniforms = {
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color("#e9efff") },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SHOOTING_VERTEX_SHADER,
      fragmentShader: SHOOTING_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(shootingGeom, mat);
    mesh.visible = false;
    mesh.rotation.z = -0.52;
    scene.add(mesh);
    shootingStars.push({
      active: false,
      age: 0,
      duration: 0.72,
      cooldown: 2.5 + i * 3.4,
      startX: 0,
      startY: 0,
      dx: 4.5,
      dy: -2.4,
      mesh,
      uniforms,
    });
  }

  // 7. Daytime sunlit dust motes
  const dustCount = quality.dustCount;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSizes = new Float32Array(dustCount);
  const dustPhases = new Float32Array(dustCount);
  const dustColors = new Float32Array(dustCount * 3);
  const dustColorInit = new THREE.Color("#8b5cf6");
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 20;
    dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 11;
    dustPositions[i * 3 + 2] = -1.8 - Math.random() * 5;
    dustSizes[i] = 3.8 + Math.random() * 5.8;
    dustPhases[i] = Math.random() * Math.PI * 2;
    dustColors[i * 3] = dustColorInit.r;
    dustColors[i * 3 + 1] = dustColorInit.g;
    dustColors[i * 3 + 2] = dustColorInit.b;
  }
  const dayDustGeom = new THREE.BufferGeometry();
  dayDustGeom.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dayDustGeom.setAttribute("aSize", new THREE.BufferAttribute(dustSizes, 1));
  dayDustGeom.setAttribute("aPhase", new THREE.BufferAttribute(dustPhases, 1));
  dayDustGeom.setAttribute("aColor", new THREE.BufferAttribute(dustColors, 3));

  const dayDustUniforms = {
    uOpacity: { value: state.dayDustOpacity },
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, quality.maxDpr) },
  };
  const dayDustMat = new THREE.ShaderMaterial({
    uniforms: dayDustUniforms,
    vertexShader: PARTICLES_VERTEX_SHADER,
    fragmentShader: PARTICLES_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const dayDust = new THREE.Points(dayDustGeom, dayDustMat);
  dayDust.visible = state.dayDustOpacity > 0.01;
  scene.add(dayDust);

  // 8. Wind-driven botanical leaves
  const leafCount = quality.leafCount;
  const leafGeom = createSculptedLeafGeometry();
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x3b2a5c,
    emissiveIntensity: 0.4,
    roughness: 0.44,
    metalness: 0.14,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
  });
  const leafMesh = new THREE.InstancedMesh(leafGeom, leafMat, leafCount);
  leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const leafPalette = [
    new THREE.Color("#6b5494"),
    new THREE.Color("#8870b5"),
    new THREE.Color("#a894d4"),
    new THREE.Color("#c0b2e8"),
    new THREE.Color("#523f78"),
  ];
  const leafAgents: LeafAgent[] = [];
  for (let i = 0; i < leafCount; i += 1) {
    leafAgents.push({
      x: (Math.random() - 0.5) * 19,
      y: (Math.random() - 0.5) * 11,
      z: -2.6 + Math.random() * 4.4,
      vx: 1.35 + Math.random() * 2.0,
      vy: -0.4 - Math.random() * 0.7,
      vz: (Math.random() - 0.5) * 0.3,
      rx: Math.random() * Math.PI * 2,
      ry: Math.random() * Math.PI * 2,
      rz: Math.random() * Math.PI * 2,
      vrx: (Math.random() - 0.5) * 2.5,
      vry: (Math.random() - 0.5) * 2.9,
      vrz: (Math.random() - 0.5) * 2.1,
      scale: 0.8 + Math.random() * 0.58,
      phase: Math.random() * Math.PI * 2,
      visibility: 0,
    });
    leafMesh.setColorAt(i, leafPalette[i % leafPalette.length]);
  }
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  leafMesh.visible = false;
  scene.add(leafMesh);

  // 9. Wind-slanted 3D rain particles
  const rainCount = quality.rainCount;
  const rainGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4);
  const rainMat = new THREE.MeshBasicMaterial({
    color: 0xcbd8f5,
    transparent: true,
    opacity: state.rainOpacity,
    depthWrite: false,
  });
  const rainMesh = new THREE.InstancedMesh(rainGeom, rainMat, rainCount);
  rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const rainAgents: RainAgent[] = [];
  for (let i = 0; i < rainCount; i += 1) {
    rainAgents.push({
      x: (Math.random() - 0.5) * 20,
      y: (Math.random() - 0.5) * 13,
      z: -2.6 + Math.random() * 4.5,
      speed: 11.0 + Math.random() * 5.8,
      scaleY: 0.72 + Math.random() * 0.8,
    });
  }
  rainMesh.visible = state.rainOpacity > 0.015;
  scene.add(rainMesh);

  // 10. Interactive click shockwaves & crystalline spark burst pools
  const rippleGeom = new THREE.PlaneGeometry(2.6, 2.6);
  const rippleSlots: RippleSlot[] = [];
  for (let i = 0; i < 6; i += 1) {
    const uniforms = {
      uProgress: { value: 0 },
      uColor: { value: new THREE.Color("#d8b4fe") },
      uStrength: { value: 0.72 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: RIPPLE_VERTEX_SHADER,
      fragmentShader: RIPPLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(rippleGeom, mat);
    mesh.visible = false;
    scene.add(mesh);
    rippleSlots.push({
      active: false,
      age: 0,
      duration: 0.85,
      mesh,
      uniforms,
    });
  }

  const sparkPoolSize = 96;
  const sparkPositions = new Float32Array(sparkPoolSize * 3);
  const sparkSizes = new Float32Array(sparkPoolSize);
  const sparkAlphas = new Float32Array(sparkPoolSize);
  const sparkSlots: SparkSlot[] = Array.from({ length: sparkPoolSize }, () => ({
    active: false,
    age: 0,
    duration: 0.82,
    x: 0,
    y: 0,
    z: 1.5,
    vx: 0,
    vy: 0,
    vz: 0,
    size: 6,
  }));
  const sparkGeom = new THREE.BufferGeometry();
  sparkGeom.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  sparkGeom.setAttribute("aSize", new THREE.BufferAttribute(sparkSizes, 1));
  sparkGeom.setAttribute("aAlpha", new THREE.BufferAttribute(sparkAlphas, 1));
  const sparkUniforms = {
    uColor: { value: new THREE.Color("#e9d5ff") },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, quality.maxDpr) },
  };
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: sparkUniforms,
    vertexShader: SPARK_VERTEX_SHADER,
    fragmentShader: SPARK_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const sparkPoints = new THREE.Points(sparkGeom, sparkMat);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);

  const dummy = new THREE.Object3D();
  const rayVec = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  const projVec = new THREE.Vector3();
  const targetDustColor = new THREE.Color();

  let frustumHalfW = 10;
  let frustumHalfH = 5.6;

  const updateCelestialPlacement = () => {
    const isLandscape = camera.aspect >= 1.05;
    if (isLandscape) {
      sunGroup.position.set(
        frustumHalfW * state.sunDesktopX,
        frustumHalfH * state.sunDesktopY,
        -7.2,
      );
      sunGroup.scale.setScalar(0.92 + Math.min(state.celestialGlow, 1) * 0.14);
      sunGlowMesh.scale.setScalar(1.35);

      moonGroup.position.set(
        frustumHalfW * state.moonDesktopX,
        frustumHalfH * state.moonDesktopY,
        -7.2,
      );
      moonGroup.scale.setScalar(0.94);
      moonGlowMesh.scale.setScalar(1.18);
    } else {
      sunGroup.position.set(
        frustumHalfW * state.sunXFactor,
        frustumHalfH * state.sunYFactor,
        -7.0,
      );
      sunGroup.scale.setScalar(0.82);
      sunGlowMesh.scale.setScalar(0.88);

      moonGroup.position.set(
        frustumHalfW * state.moonXFactor,
        frustumHalfH * state.moonYFactor,
        -7.0,
      );
      moonGroup.scale.setScalar(0.82);
      moonGlowMesh.scale.setScalar(0.9);
    }
  };

  const updateSize = () => {
    if (!renderer) return;
    const width = window.innerWidth;
    const height = Math.max(window.innerHeight, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    starUniforms.uPixelRatio.value = dpr;
    dayDustUniforms.uPixelRatio.value = dpr;
    sparkUniforms.uPixelRatio.value = dpr;

    const dist = 17.0;
    frustumHalfH = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * dist;
    frustumHalfW = frustumHalfH * camera.aspect;
    updateCelestialPlacement();
  };
  updateSize();
  window.addEventListener("resize", updateSize, { passive: true });

  let pointerTargetX = 0;
  let pointerTargetY = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerUvTargetX = 0.5;
  let pointerUvTargetY = 0.5;
  let pointerUvX = 0.5;
  let pointerUvY = 0.5;

  const handlePointerMove = (event: PointerEvent) => {
    const w = Math.max(window.innerWidth, 1);
    const h = Math.max(window.innerHeight, 1);
    pointerTargetX = (event.clientX / w - 0.5) * 2;
    pointerTargetY = (event.clientY / h - 0.5) * -2;
    pointerUvTargetX = event.clientX / w;
    pointerUvTargetY = 1 - event.clientY / h;
  };
  window.addEventListener("pointermove", handlePointerMove, { passive: true });

  let nextRippleIdx = 0;
  let nextSparkIdx = 0;

  const rippleColorByKind = (kind: RippleKind, mood: AtmosphereMood): string => {
    if (kind === "ai") return "#fbbf24";
    if (mood === "rain") return "#7dd3fc";
    if (mood === "overcast-day") return "#cbd5e1";
    if (mood === "clear-day") return "#f0abfc";
    return "#c4b5fd";
  };

  const triggerRipple = (x: number, y: number, kind: RippleKind) => {
    if (reducedMotion) return;

    const w = Math.max(window.innerWidth, 1);
    const h = Math.max(window.innerHeight, 1);
    const ndcX = (x / w) * 2 - 1;
    const ndcY = -(y / h) * 2 + 1;

    rayVec.set(ndcX, ndcY, 0.5).unproject(camera);
    rayDir.copy(rayVec).sub(camera.position).normalize();
    const tHit = (1.5 - camera.position.z) / (rayDir.z || -1);
    const worldX = camera.position.x + rayDir.x * tHit;
    const worldY = camera.position.y + rayDir.y * tHit;

    const tintHex = rippleColorByKind(kind, currentInput.mood);
    const slot = rippleSlots[nextRippleIdx];
    nextRippleIdx = (nextRippleIdx + 1) % rippleSlots.length;
    slot.active = true;
    slot.age = 0;
    slot.duration = kind === "card" || kind === "ai" ? 0.9 : 0.74;
    slot.mesh.position.set(worldX, worldY, 1.5);
    slot.mesh.visible = true;
    slot.uniforms.uProgress.value = 0;
    slot.uniforms.uColor.value.set(tintHex);
    slot.uniforms.uStrength.value = kind === "ai" ? 0.82 : 0.6;

    const burstCount = kind === "ai" ? 14 : 10;
    sparkUniforms.uColor.value.set(tintHex);
    for (let i = 0; i < burstCount; i += 1) {
      const sSlot = sparkSlots[nextSparkIdx];
      nextSparkIdx = (nextSparkIdx + 1) % sparkPoolSize;
      const angle = (i / burstCount) * Math.PI * 2 + Math.random() * 0.45;
      const speed = 0.65 + Math.random() * 1.4;
      sSlot.active = true;
      sSlot.age = 0;
      sSlot.duration = 0.65 + Math.random() * 0.24;
      sSlot.x = worldX;
      sSlot.y = worldY;
      sSlot.z = 1.5;
      sSlot.vx = Math.cos(angle) * speed;
      sSlot.vy = Math.sin(angle) * speed + 0.42;
      sSlot.vz = (Math.random() - 0.5) * 0.45;
      sSlot.size = 5.0 + Math.random() * 4.5;
    }
  };

  let stormCooldown = 6.2;
  let secondaryFlickerTimer = -1;
  let lightning = 0;
  let cloudAccumX = 0;
  let cloudAccumY = 0;

  let rafId = 0;
  let lastTime = performance.now();
  let elapsedTotal = 0;
  let entranceElapsed = reducedMotion ? 1.4 : 0;

  const animate = (now: number) => {
    const dt = Math.min((now - lastTime) * 0.001, 0.05);
    lastTime = now;

    if (!document.hidden) {
      elapsedTotal += reducedMotion ? 0 : dt;
      if (!reducedMotion && entranceElapsed < 1.4) {
        entranceElapsed = Math.min(1.4, entranceElapsed + dt);
      }
      const t = elapsedTotal;

      stepVisualState(state, targets, dt, reducedMotion);

      // Accumulate cloud travel using continuous wind velocity (no jumps when windSpeed changes)
      if (!reducedMotion) {
        const flowSign = state.windDirX >= 0 ? 1 : -1;
        cloudAccumX += dt * state.cloudSpeed * flowSign;
        cloudAccumY += dt * state.cloudSpeed * 0.14;
      }

      // Restrained double-pulse storm lightning
      if (state.stormActive > 0.4 && !reducedMotion) {
        stormCooldown -= dt;
        if (stormCooldown <= 0) {
          lightning = 0.85;
          secondaryFlickerTimer = 0.16;
          stormCooldown = 6.5 + Math.random() * 8.0;
        }
        if (secondaryFlickerTimer > 0) {
          secondaryFlickerTimer -= dt;
          if (secondaryFlickerTimer <= 0) {
            lightning = Math.max(lightning, 0.44);
          }
        }
      }
      lightning *= Math.exp(-dt * 5.8);

      // Camera parallax + spatial entry + subtle scroll tilt
      const entranceP = Math.min(1, Math.max(0, entranceElapsed / 1.4));
      const entranceEase = 1 - Math.pow(1 - entranceP, 4);
      pointerX += (pointerTargetX - pointerX) * 0.06;
      pointerY += (pointerTargetY - pointerY) * 0.06;
      pointerUvX += (pointerUvTargetX - pointerUvX) * 0.08;
      pointerUvY += (pointerUvTargetY - pointerUvY) * 0.08;

      const scrollShift = Math.min(window.scrollY / 900, 1.2);
      camera.position.z = 10 + (1 - entranceEase) * 1.6;
      camera.position.x = pointerX * 0.35;
      camera.position.y = pointerY * 0.28 - scrollShift * 0.45 + (1 - entranceEase) * 0.32;
      camera.lookAt(0, -scrollShift * 0.3, 0);

      updateCelestialPlacement();

      // Track dominant celestial screen UV for synced backdrop illumination
      const dominantGroup = state.sunOpacity >= state.moonOpacity ? sunGroup : moonGroup;
      projVec.copy(dominantGroup.position).project(camera);
      skyUniforms.uCelestialUv.value.set(projVec.x * 0.5 + 0.5, projVec.y * 0.5 + 0.5);

      // Update sky uniforms
      skyUniforms.uTime.value = t;
      skyUniforms.uMouse.value.set(pointerUvX, pointerUvY);
      const beamDx = camera.aspect >= 1.05 ? state.beamDirectionX : -0.78;
      skyUniforms.uBeamDir.value.set(beamDx, state.beamDirectionY);
      skyUniforms.uCloudOffset.value.set(cloudAccumX, cloudAccumY);
      skyUniforms.uSkyBottom.value.setRGB(...state.skyBottom);
      skyUniforms.uSkyMid.value.setRGB(...state.skyMid);
      skyUniforms.uSkyTop.value.setRGB(...state.skyTop);
      skyUniforms.uGlowColor.value.setRGB(...state.celestialGlowColor);
      skyUniforms.uCloudColor.value.setRGB(...state.cloudColor);
      skyUniforms.uFogColor.value.setRGB(...state.fogColor);
      skyUniforms.uIsDark.value = state.isDark;
      skyUniforms.uNightBlend.value = state.nightBlend;
      skyUniforms.uBeamMix.value = state.beamMix;
      skyUniforms.uCloudAmount.value = state.cloudAmount;
      skyUniforms.uCloudDarkness.value = state.cloudDarkness;
      skyUniforms.uFogOpacity.value = state.fogOpacity;
      skyUniforms.uLightning.value = lightning;

      // Sun visuals
      sunGroup.visible = state.sunOpacity > 0.01;
      sunUniforms.uOpacity.value = state.sunOpacity;
      sunUniforms.uSunCore.value.setRGB(...state.sunCore);
      sunUniforms.uSunRim.value.setRGB(...state.sunRim);
      sunUniforms.uTime.value = t;
      sunGlowUniforms.uColor.value.setRGB(...state.celestialGlowColor);
      sunGlowUniforms.uIntensity.value = state.celestialGlow * (state.sunOpacity > 0.01 ? 1 : 0);
      sunGlowUniforms.uRingOpacity.value = state.celestialRingOpacity * Math.min(1, state.sunOpacity * 1.4);

      // Phased Moon visuals
      moonGroup.visible = state.moonOpacity > 0.01;
      moonUniforms.uOpacity.value = state.moonOpacity;
      moonUniforms.uIsDark.value = state.isDark;
      moonUniforms.uLunarPhase.value = state.lunarPhase;
      moonMesh.rotation.y = 0.28 + t * 0.012;
      moonGlowUniforms.uColor.value.setRGB(...state.celestialGlowColor);
      moonGlowUniforms.uIntensity.value = state.celestialGlow * (state.moonOpacity > 0.01 ? 1 : 0);
      moonGlowUniforms.uRingOpacity.value = state.celestialRingOpacity * Math.min(1, state.moonOpacity * 1.5);

      // Sculpted directional-lit cloud strata + brief lightning rim highlight
      for (let i = 0; i < mistLayers.length; i += 1) {
        const layer = mistLayers[i];
        layer.uniforms.uDrift.value.set(
          cloudAccumX * 1.45 * layer.speedFactor,
          cloudAccumY * 0.8,
        );
        layer.uniforms.uLightDir.value.set(
          dominantGroup.position.x,
          Math.max(2.0, dominantGroup.position.y),
        );
        layer.uniforms.uOpacity.value = state.cloudOpacity * (i === 2 ? 0.46 : 1 - i * 0.14);
        layer.uniforms.uCoverage.value = state.cloudAmount;
        layer.uniforms.uCloudHighlight.value.setRGB(...state.cloudHighlight);
        layer.uniforms.uCloudShadow.value.setRGB(...state.cloudShadow);
        if (lightning > 0.01) {
          layer.uniforms.uCloudHighlight.value.lerp(
            new THREE.Color(0.84, 0.91, 1.0),
            lightning * 0.55,
          );
        }
      }

      // Volumetric fog veil
      fogMesh.visible = state.fogOpacity > 0.01;
      if (fogMesh.visible) {
        fogUniforms.uTime.value = t;
        fogUniforms.uOpacity.value = state.fogOpacity;
        fogUniforms.uFogColor.value.setRGB(...state.fogColor);
      }

      // Twinkling stars & shooting stars
      stars.visible = state.starOpacity > 0.01;
      starUniforms.uTime.value = t;
      starUniforms.uOpacity.value = state.starOpacity;

      if (state.starOpacity > 0.2 && !reducedMotion) {
        for (const s of shootingStars) {
          if (!s.active) {
            s.cooldown -= dt;
            if (s.cooldown <= 0) {
              s.active = true;
              s.age = 0;
              s.startX = (Math.random() - 0.5) * 12;
              s.startY = 2.0 + Math.random() * 2.8;
              s.dx = 3.2 + Math.random() * 2.5;
              s.dy = -(1.8 + Math.random() * 1.4);
              s.mesh.rotation.z = Math.atan2(s.dy, s.dx);
              s.mesh.visible = true;
            }
          } else {
            s.age += dt;
            const p = s.age / s.duration;
            if (p >= 1) {
              s.active = false;
              s.mesh.visible = false;
              s.cooldown = 4.5 + Math.random() * 7.5;
            } else {
              s.mesh.position.set(s.startX + s.dx * p, s.startY + s.dy * p, -8.3);
              s.uniforms.uProgress.value = p;
              s.uniforms.uOpacity.value = state.starOpacity * 0.85;
            }
          }
        }
      } else {
        for (const s of shootingStars) s.mesh.visible = false;
      }

      // Daytime sunlit dust motes
      targetDustColor.set(state.isDark > 0.5 ? "#e6d2ff" : "#8b5cf6");
      const dustColAttr = dayDustGeom.getAttribute("aColor") as THREE.BufferAttribute;
      if (!reducedMotion && state.dayDustOpacity > 0.01) {
        const dPos = dayDustGeom.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < dustCount; i += 1) {
          let dx = dPos.getX(i) + dt * (0.14 + state.windDirX * 0.08);
          let dy = dPos.getY(i) + Math.sin(t * 0.5 + dustPhases[i]) * dt * 0.08;
          if (dx > 10) dx = -10;
          if (dx < -10) dx = 10;
          if (dy > 5.5) dy = -5.5;
          if (dy < -5.5) dy = 5.5;
          dPos.setXY(i, dx, dy);
          dustColAttr.setXYZ(i, targetDustColor.r, targetDustColor.g, targetDustColor.b);
        }
        dPos.needsUpdate = true;
        dustColAttr.needsUpdate = true;
      }
      dayDust.visible = state.dayDustOpacity > 0.01;
      dayDustUniforms.uTime.value = t;
      dayDustUniforms.uOpacity.value = state.dayDustOpacity;

      // Wind-driven botanical leaves
      let anyLeafVisible = false;
      const mixLeafRate = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.5);
      for (let i = 0; i < leafCount; i += 1) {
        const agent = leafAgents[i];
        const targetVis = i < Math.round(state.targetActiveLeaves) ? 1 : 0;
        agent.visibility += (targetVis - agent.visibility) * mixLeafRate;

        if (agent.visibility > 0.02) {
          anyLeafVisible = true;
          if (!reducedMotion) {
            const gust = Math.sin(t * 1.25 + agent.phase) * 0.42;
            agent.x += (agent.vx * state.windDirX * state.windSpeedNorm + gust) * dt;
            agent.y +=
              (agent.vy * (0.75 + state.windSpeedNorm * 0.6) + Math.cos(t * 1.6 + agent.phase) * 0.34) * dt;
            agent.z += Math.sin(t * 0.85 + agent.phase) * 0.22 * dt;

            agent.rx += agent.vrx * (0.65 + state.windSpeedNorm) * dt;
            agent.ry += agent.vry * (0.65 + state.windSpeedNorm) * dt;
            agent.rz += agent.vrz * (0.65 + state.windSpeedNorm) * dt;

            if (agent.x > 10.8) {
              agent.x = -10.8;
              agent.y = (Math.random() - 0.3) * 10;
            } else if (agent.x < -10.8) {
              agent.x = 10.8;
            }
            if (agent.y < -6.3) {
              agent.y = 6.3;
              agent.x = (Math.random() - 0.6) * 17;
            }
          }
          const s = agent.scale * agent.visibility;
          dummy.position.set(agent.x, agent.y, agent.z);
          dummy.rotation.set(agent.rx, agent.ry, agent.rz);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          leafMesh.setMatrixAt(i, dummy.matrix);
        } else {
          dummy.position.set(0, -30, -20);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          leafMesh.setMatrixAt(i, dummy.matrix);
        }
      }
      leafMesh.visible = anyLeafVisible;
      if (anyLeafVisible) {
        leafMat.opacity = state.leafBaseOpacity;
        leafMesh.instanceMatrix.needsUpdate = true;
      }

      // Wind-slanted 3D rain streaks
      rainMesh.visible = state.rainOpacity > 0.015;
      if (rainMesh.visible) {
        rainMat.opacity = state.rainOpacity;
        const slantZ = state.rainSlantX;
        for (let i = 0; i < rainCount; i += 1) {
          const drop = rainAgents[i];
          if (!reducedMotion) {
            drop.y -= drop.speed * dt;
            drop.x += drop.speed * state.rainSlantX * dt;
            if (drop.y < -6.5) {
              drop.y = 6.5;
              drop.x = (Math.random() - 0.5) * 20;
            }
            if (drop.x > 10.5) drop.x = -10.5;
            if (drop.x < -10.5) drop.x = 10.5;
          }
          dummy.position.set(drop.x, drop.y, drop.z);
          dummy.rotation.set(0, 0, slantZ);
          dummy.scale.set(1, drop.scaleY, 1);
          dummy.updateMatrix();
          rainMesh.setMatrixAt(i, dummy.matrix);
        }
        rainMesh.instanceMatrix.needsUpdate = true;
      }

      // Click shockwave ripples & sparks
      for (const slot of rippleSlots) {
        if (!slot.active) continue;
        slot.age += dt;
        const p = slot.age / slot.duration;
        if (p >= 1) {
          slot.active = false;
          slot.mesh.visible = false;
        } else {
          slot.uniforms.uProgress.value = p;
        }
      }

      let sparksUpdated = false;
      for (let i = 0; i < sparkPoolSize; i += 1) {
        const s = sparkSlots[i];
        if (!s.active) {
          if (sparkAlphas[i] !== 0) {
            sparkAlphas[i] = 0;
            sparksUpdated = true;
          }
          continue;
        }
        sparksUpdated = true;
        s.age += dt;
        const p = s.age / s.duration;
        if (p >= 1) {
          s.active = false;
          sparkAlphas[i] = 0;
        } else {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.z += s.vz * dt;
          s.vx *= Math.exp(-dt * 2.2);
          s.vy -= 0.45 * dt;
          sparkPositions[i * 3] = s.x;
          sparkPositions[i * 3 + 1] = s.y;
          sparkPositions[i * 3 + 2] = s.z;
          sparkSizes[i] = s.size * (1 - p * 0.45);
          sparkAlphas[i] = (1 - p) * (1 - p) * 0.85;
        }
      }
      if (sparksUpdated) {
        (sparkGeom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        (sparkGeom.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
        (sparkGeom.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
      }

      renderer?.render(scene, camera);
    }

    if (!reducedMotion) {
      rafId = window.requestAnimationFrame(animate);
    }
  };

  const handleVisibility = () => {
    if (!document.hidden) lastTime = performance.now();
  };
  document.addEventListener("visibilitychange", handleVisibility);

  rafId = window.requestAnimationFrame(animate);

  return {
    updateInput(nextInput: AtmosphereSceneInput) {
      currentInput = nextInput;
      targets = computeAtmosphericTargets(
        nextInput.solar,
        nextInput.weather,
        nextInput.isDark,
        quality.leafCount,
      );
      if (reducedMotion) {
        window.cancelAnimationFrame(rafId);
        rafId = window.requestAnimationFrame(animate);
      }
    },
    setReducedMotion(reduced: boolean) {
      reducedMotion = reduced;
      window.cancelAnimationFrame(rafId);
      lastTime = performance.now();
      rafId = window.requestAnimationFrame(animate);
    },
    triggerRipple,
    dispose() {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibility);

      skyPlaneGeom.dispose();
      skyMat.dispose();
      sunGeom.dispose();
      sunMat.dispose();
      moonGeom.dispose();
      moonMat.dispose();
      celestialGlowGeom.dispose();
      sunGlowMat.dispose();
      moonGlowMat.dispose();
      mistGeom.dispose();
      for (const layer of mistLayers) {
        (layer.mesh.material as THREE.Material).dispose();
      }
      fogGeom.dispose();
      fogMat.dispose();
      starGeom.dispose();
      starMat.dispose();
      shootingGeom.dispose();
      for (const s of shootingStars) {
        (s.mesh.material as THREE.Material).dispose();
      }
      dayDustGeom.dispose();
      dayDustMat.dispose();
      leafGeom.dispose();
      leafMat.dispose();
      rainGeom.dispose();
      rainMat.dispose();
      rippleGeom.dispose();
      for (const slot of rippleSlots) {
        (slot.mesh.material as THREE.Material).dispose();
      }
      sparkGeom.dispose();
      sparkMat.dispose();
      renderer?.dispose();
    },
  };
}
