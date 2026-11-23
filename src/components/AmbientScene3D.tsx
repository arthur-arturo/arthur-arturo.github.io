import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { PortfolioRippleDetail, RippleKind } from "../audio/AudioProvider";
import { useEnvironment, type AtmosphereMood } from "../environment/EnvironmentProvider";
import { useTheme } from "../theme/ThemeProvider";

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
  uniform vec4 uMoodWeights; // x=clearDay, y=overcast, z=night, w=rain
  uniform float uIsDark;
  uniform float uCloudCover;
  uniform float uSunsetMix;
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

    // 1. Base sky gradients per mood & theme
    vec3 nightDark = mix(vec3(0.024, 0.014, 0.06), vec3(0.058, 0.036, 0.135), pow(uv.y, 0.85));
    vec3 nightLight = mix(vec3(0.86, 0.84, 0.94), vec3(0.74, 0.72, 0.88), uv.y);
    vec3 nightCol = mix(nightLight, nightDark, uIsDark);

    vec3 clearDayDark = mix(vec3(0.06, 0.025, 0.12), vec3(0.16, 0.075, 0.28), uv.y);
    vec3 clearDayLight = mix(vec3(0.95, 0.92, 0.99), vec3(0.84, 0.82, 0.98), uv.y);
    vec3 goldenTintLight = mix(vec3(0.99, 0.90, 0.88), vec3(0.93, 0.78, 0.92), uv.y);
    vec3 goldenTintDark = mix(vec3(0.11, 0.04, 0.14), vec3(0.24, 0.10, 0.22), uv.y);
    vec3 clearCol = mix(
      mix(clearDayLight, goldenTintLight, uSunsetMix * 0.68),
      mix(clearDayDark, goldenTintDark, uSunsetMix * 0.65),
      uIsDark
    );

    vec3 overDark = mix(vec3(0.07, 0.072, 0.10), vec3(0.12, 0.125, 0.165), uv.y);
    vec3 overLight = mix(vec3(0.86, 0.87, 0.93), vec3(0.76, 0.78, 0.87), uv.y);
    vec3 overCol = mix(overLight, overDark, uIsDark);

    vec3 rainDark = mix(vec3(0.035, 0.045, 0.085), vec3(0.085, 0.105, 0.18), uv.y);
    vec3 rainLight = mix(vec3(0.73, 0.77, 0.85), vec3(0.61, 0.67, 0.79), uv.y);
    vec3 rainCol = mix(rainLight, rainDark, uIsDark);

    vec3 col =
      clearCol * uMoodWeights.x +
      overCol * uMoodWeights.y +
      nightCol * uMoodWeights.z +
      rainCol * uMoodWeights.w;

    // 2. Corner celestial radial & diagonal volumetric wash (from top-right moon/sun)
    vec2 fromCorner = uv - uCelestialUv;
    float cornerDist = length(fromCorner * vec2(1.45, 1.0));
    float cloudDim = 1.0 - clamp(uMoodWeights.y * 0.48 + uCloudCover * 0.25 + uMoodWeights.w * 0.65, 0.0, 0.72);

    // Diagonal sweep heading down-left from the upper-right corner
    vec2 diagDir = normalize(vec2(-0.78, -0.62));
    float proj = max(dot(normalize(fromCorner + vec2(-0.0001)), diagDir), 0.0);
    float beamSpread = pow(proj, 2.2) * exp(-cornerDist * 1.15);

    // Nocturnal lunar wash
    if (uMoodWeights.z > 0.01) {
      float lunarGlow = exp(-cornerDist * cornerDist * 4.2);
      vec3 moonHue = mix(vec3(0.74, 0.78, 0.96), vec3(0.32, 0.40, 0.82), uIsDark);
      float nightGain = uMoodWeights.z * cloudDim * mix(0.26, 0.42, uIsDark);
      col += moonHue * (lunarGlow * 0.75 + beamSpread * 0.62) * nightGain;

      // Subtle atmospheric aurora shimmer along upper sky
      float mistWave = fbm(vec2(uv.x * 2.2 + uTime * 0.018, uv.y * 1.6 - uTime * 0.012));
      float nightSheen = smoothstep(0.45, 0.88, mistWave) * smoothstep(0.3, 0.98, uv.y);
      col += mix(vec3(0.58, 0.50, 0.90), vec3(0.24, 0.22, 0.56), uIsDark) * nightSheen * uMoodWeights.z * cloudDim * 0.24;
    }

    // Daytime solar radiance & beams
    if (uMoodWeights.x > 0.01 || uMoodWeights.y > 0.01) {
      float angle = atan(fromCorner.y, fromCorner.x);
      float rays = 0.5 + 0.5 * sin(angle * 10.0 + uTime * 0.18);
      float rayNoise = fbm(vec2(angle * 2.6, cornerDist * 2.1 - uTime * 0.03));
      float sunRays = smoothstep(0.3, 0.95, rays * 0.52 + rayNoise * 0.6) * beamSpread;
      float sunCoreGlow = exp(-cornerDist * cornerDist * 3.8);

      vec3 daySunHue = mix(vec3(1.0, 0.85, 0.56), vec3(1.0, 0.70, 0.44), uSunsetMix);
      float dayFactor = (uMoodWeights.x + uMoodWeights.y * 0.38) * cloudDim;
      vec3 lightSunCol = mix(
        col,
        daySunHue,
        clamp((sunCoreGlow * 0.65 + sunRays * 0.42) * dayFactor, 0.0, 0.72)
      );
      vec3 darkSunCol = col + daySunHue * (sunCoreGlow * 0.8 + sunRays * 0.7) * dayFactor * 0.44;
      col = mix(lightSunCol, darkSunCol, uIsDark);
    }

    // 3. Soft overcast/rain cloud canopy
    float cloudAmount = clamp(uMoodWeights.y * (0.58 + uCloudCover * 0.28) + uMoodWeights.w * 0.52 + uCloudCover * 0.22, 0.0, 0.9);
    if (cloudAmount > 0.02) {
      float clA = fbm(uv * vec2(3.1, 2.0) + vec2(uTime * 0.022, 0.1));
      float clB = fbm(uv * vec2(4.6, 2.6) - vec2(uTime * 0.015, 0.35));
      float cloudPattern = smoothstep(0.28, 0.82, mix(clA, clB, 0.48));
      vec3 cloudTone = mix(vec3(0.96, 0.95, 0.99), vec3(0.22, 0.23, 0.31), uIsDark);
      col = mix(col, cloudTone, cloudPattern * cloudAmount * 0.34);
    }

    // 4. Distant storm lightning bloom
    if (uLightning > 0.004) {
      float boltZone = exp(-length(uv - vec2(0.76, 0.84)) * 2.1);
      col += vec3(0.68, 0.80, 1.0) * uLightning * (0.14 + 0.34 * boltZone);
    }

    // 5. Gentle interactive cursor light halo
    vec2 mouseDiff = (uv - uMouse) * vec2(1.5, 1.0);
    float cursorHalo = exp(-dot(mouseDiff, mouseDiff) / 0.09);
    vec3 cursorTint =
      uMoodWeights.x * mix(vec3(1.0, 0.92, 1.0), vec3(0.80, 0.60, 1.0), uIsDark) +
      uMoodWeights.y * vec3(0.76, 0.78, 0.88) +
      uMoodWeights.z * vec3(0.56, 0.65, 1.0) +
      uMoodWeights.w * vec3(0.46, 0.68, 0.98);
    col += cursorTint * cursorHalo * mix(0.06, 0.12, uIsDark);

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
    vec3 lightDir = normalize(vec3(-0.46, 0.34, 0.82));
    float lit = smoothstep(-0.22, 0.52, dot(N, lightDir));
    float rim = pow(1.0 - max(dot(N, vec3(0.0, 0.0, 1.0)), 0.0), 2.3);

    float maria = fbm(vUv * 6.5);
    float craters = noise(vUv * 18.0) * 0.5 + noise(vUv * 34.0) * 0.5;
    vec3 moonLit = mix(vec3(0.84, 0.88, 0.98), vec3(0.95, 0.97, 1.0), uIsDark);
    vec3 moonDarkSide = mix(vec3(0.60, 0.62, 0.78), vec3(0.12, 0.11, 0.25), uIsDark);

    vec3 surface = mix(moonDarkSide, moonLit * (0.80 + 0.14 * maria + 0.1 * craters), lit);
    surface += vec3(0.76, 0.86, 1.0) * rim * 0.55;

    float alpha = uOpacity * (0.28 * uIsDark + 0.74 * lit + rim * 0.35);
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
  uniform float uSunsetMix;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalView;

  void main() {
    if (uOpacity <= 0.004) discard;
    vec3 N = normalize(vNormalView);
    float facing = max(dot(N, vec3(0.0, 0.0, 1.0)), 0.0);
    float limb = pow(1.0 - facing, 1.35);
    float pulse = 0.96 + 0.04 * sin(uTime * 1.1 + vUv.y * 4.0);

    vec3 coreDay = vec3(1.0, 0.96, 0.80);
    vec3 rimDay = vec3(1.0, 0.70, 0.30);
    vec3 coreSunset = vec3(1.0, 0.87, 0.62);
    vec3 rimSunset = vec3(0.98, 0.48, 0.42);

    vec3 core = mix(coreDay, coreSunset, uSunsetMix);
    vec3 rim = mix(rimDay, rimSunset, uSunsetMix);
    vec3 color = mix(core, rim, limb) * pulse;

    float alpha = clamp(uOpacity * (0.92 + 0.08 * limb), 0.0, 0.98);
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
    float alpha = clamp(softHalo + subtleOrbit + outerHalo, 0.0, 0.9);
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
  uniform float uTime;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3 uMistColor;
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
    vec2 uv = vUv * vec2(2.6, 1.6) + vec2(uTime * 0.025 + uSeed, uSeed * 0.37);
    float n = fbm(uv);
    float n2 = fbm(uv * 1.4 - vec2(uTime * 0.018, 0.4));
    float density = smoothstep(0.28, 0.84, mix(n, n2, 0.45));
    float edgeFade = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
    gl_FragColor = vec4(uMistColor, density * uOpacity * (0.45 + 0.55 * edgeFade));
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computeTargetState(
  mood: AtmosphereMood,
  windSpeed: number,
  windIntensity: number,
  cloudCover: number,
  isDay: boolean,
  localHour: number,
  isDark: boolean,
) {
  const isNight = !isDay && (mood === "night-clear" || mood === "night-wind" || mood === "rain");
  const isOvercast = mood === "overcast-day";
  const isRain = mood === "rain";
  const isClearDay = mood === "clear-day";

  const isDawnOrDusk = isDay && ((localHour >= 6 && localHour <= 8) || (localHour >= 17 && localHour <= 19));
  const sunsetMix = isDawnOrDusk ? 1 : 0;

  // Leaves ONLY appear when wind really reaches >= 16 km/h (and never during heavy rain)
  let targetActiveLeaves = 0;
  if (!isRain && windSpeed >= 16) {
    targetActiveLeaves = Math.min(42, Math.round(24 + ((windSpeed - 16) / 24) * 18));
  }

  const cloudDim = 1 - clamp(cloudCover * 0.55 + (isOvercast ? 0.3 : 0) + (isRain ? 0.45 : 0), 0, 0.84);

  const mistOpacity = isOvercast
    ? isDark
      ? 0.28 + cloudCover * 0.14
      : 0.24 + cloudCover * 0.14
    : isRain
      ? isDark
        ? 0.32
        : 0.30
      : isClearDay && cloudCover > 0.35
        ? 0.06 + (cloudCover - 0.35) * 0.24
        : 0.02;

  const sunOpacity = !isDay
    ? 0.0
    : isRain
      ? 0.16
      : isOvercast
        ? 0.36 * clamp(1 - Math.max(0, cloudCover - 0.75) * 1.4, 0.55, 1)
        : (isDark ? 0.92 : 0.96) * clamp(1 - cloudCover * 0.22, 0.76, 1.0);

  const celestialGlow = isDay
    ? (isOvercast ? 0.34 : isRain ? 0.16 : isDark ? 0.52 : 0.68) *
      clamp(1 - cloudCover * 0.22, 0.72, 1.0)
    : (isDark ? 0.42 : 0.28) * Math.max(0.22, cloudDim);

  return {
    targetActiveLeaves,
    leafBaseOpacity: isDark ? 0.9 : 0.84,
    mistOpacity,
    starOpacity: !isDay ? (isDark ? 0.88 : 0.3) * cloudDim : 0.0,
    dayDustOpacity: isClearDay ? (isDark ? 0.32 : 0.44) * cloudDim : 0.0,
    rainOpacity: isRain ? (isDark ? 0.5 : 0.4) : 0.0,
    sunOpacity,
    moonOpacity: !isDay ? (isDark ? 0.96 : 0.54) * Math.max(0.25, cloudDim) : 0.0,
    celestialGlow,
    celestialRingOpacity: (isDay ? 0.16 : 0.17) * Math.max(0.45, cloudDim),
    sunsetMix,
    clearWeight: isClearDay ? 1 : 0,
    overcastWeight: isOvercast ? 1 : 0,
    nightWeight: isNight || (!isDay && !isRain && !isOvercast) ? 1 : 0,
    rainWeight: isRain ? 1 : 0,
    windStrength: windIntensity,
  };
}

export function AmbientScene3D() {
  const { environment } = useEnvironment();
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const envRef = useRef(environment);
  envRef.current = environment;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const reducedRedrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    reducedRedrawRef.current?.();
  }, [
    environment.mood,
    environment.cloudCover,
    environment.windIntensity,
    environment.windSpeed,
    environment.isDay,
    environment.localHour,
    theme,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    let renderer: THREE.WebGLRenderer | null = null;

    try {
      if (canvas) {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: false,
          antialias: true,
          powerPreference: "high-performance",
        });
      }
    } catch {
      renderer = null;
    }

    if (!canvas || !renderer) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / Math.max(window.innerHeight, 1), 0.1, 100);
    camera.position.set(0, 0, 10);

    // Subtle lighting for wind leaves
    const ambientLight = new THREE.AmbientLight(0xd9cff2, 0.95);
    scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight(0xf3f5ff, 1.45);
    keyLight.position.set(6, 7, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xa78bfa, 0.85);
    rimLight.position.set(-5, -3, 3);
    scene.add(rimLight);

    // 1. Atmospheric Sky Backdrop (GLSL aurora/rays/clouds synced to top-right celestial body)
    const skyPlaneGeom = new THREE.PlaneGeometry(60, 32);
    const skyUniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uCelestialUv: { value: new THREE.Vector2(0.9, 0.88) },
      uMoodWeights: { value: new THREE.Vector4(0, 0, 1, 0) },
      uIsDark: { value: 1 },
      uCloudCover: { value: 0.1 },
      uSunsetMix: { value: 0 },
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

    // 2. Corner 3D Celestial Body (Moon at night / Sun by day) in Top-Right corner
    const celestialGroup = new THREE.Group();
    scene.add(celestialGroup);

    const moonGeom = new THREE.SphereGeometry(1.12, 48, 36);
    const moonUniforms = {
      uOpacity: { value: 0 },
      uIsDark: { value: 1 },
    };
    const moonMat = new THREE.ShaderMaterial({
      uniforms: moonUniforms,
      vertexShader: MOON_VERTEX_SHADER,
      fragmentShader: MOON_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });
    const moonMesh = new THREE.Mesh(moonGeom, moonMat);
    celestialGroup.add(moonMesh);

    const sunGeom = new THREE.SphereGeometry(1.22, 48, 36);
    const sunUniforms = {
      uOpacity: { value: 0 },
      uSunsetMix: { value: 0 },
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
    celestialGroup.add(sunMesh);

    const celestialGlowGeom = new THREE.PlaneGeometry(9.6, 9.6);
    const celestialGlowUniforms = {
      uColor: { value: new THREE.Color("#b8d0ff") },
      uIntensity: { value: 0.35 },
      uRingOpacity: { value: 0.16 },
    };
    const celestialGlowMat = new THREE.ShaderMaterial({
      uniforms: celestialGlowUniforms,
      vertexShader: CELESTIAL_GLOW_VERTEX,
      fragmentShader: CELESTIAL_GLOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    const celestialGlowMesh = new THREE.Mesh(celestialGlowGeom, celestialGlowMat);
    celestialGlowMesh.position.set(0, 0, -0.4);
    celestialGroup.add(celestialGlowMesh);

    // 3. Volumetric Mist / Cloud Strata
    const mistGeom = new THREE.PlaneGeometry(36, 20);
    const mistLayers: Array<{
      mesh: THREE.Mesh;
      uniforms: {
        uTime: { value: number };
        uOpacity: { value: number };
        uSeed: { value: number };
        uMistColor: { value: THREE.Color };
      };
    }> = [];
    const mistDepths = [-8.6, -7.8, -5.6];
    for (let i = 0; i < 3; i += 1) {
      const uniforms = {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uSeed: { value: i * 4.3 },
        uMistColor: { value: new THREE.Color("#2b2a3c") },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: MIST_VERTEX_SHADER,
        fragmentShader: MIST_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(mistGeom, mat);
      mesh.position.set(0, 0, mistDepths[i]);
      scene.add(mesh);
      mistLayers.push({ mesh, uniforms });
    }

    // 4. Living Nocturnal Starfield (280 stars fading in/out and twinkling organically)
    const starCount = 280;
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

      // Realistic distribution: mostly delicate pinpoints, ~6% slightly brighter guide stars
      const roll = Math.random();
      starSizes[i] = roll > 0.94 ? 4.5 + Math.random() * 1.7 : roll > 0.72 ? 3.2 + Math.random() * 1.0 : 1.8 + Math.random() * 1.4;
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
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.75) },
    };
    const starMat = new THREE.ShaderMaterial({
      uniforms: starUniforms,
      vertexShader: STARS_VERTEX_SHADER,
      fragmentShader: STARS_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeom, starMat);
    scene.add(stars);

    // 5. 3 Procedural Shooting Stars
    const shootingGeom = new THREE.PlaneGeometry(1.45, 0.026);
    const shootingStars: ShootingStar[] = [];
    for (let i = 0; i < 3; i += 1) {
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

    // 6. Clear-day sunlit dust motes
    const dustCount = 65;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustSizes = new Float32Array(dustCount);
    const dustPhases = new Float32Array(dustCount);
    const dustColors = new Float32Array(dustCount * 3);
    const dustColorA = new THREE.Color("#e9d5ff");
    for (let i = 0; i < dustCount; i += 1) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 20;
      dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 11;
      dustPositions[i * 3 + 2] = -1.8 - Math.random() * 5;
      dustSizes[i] = 3.8 + Math.random() * 5.8;
      dustPhases[i] = Math.random() * Math.PI * 2;
      dustColors[i * 3] = dustColorA.r;
      dustColors[i * 3 + 1] = dustColorA.g;
      dustColors[i * 3 + 2] = dustColorA.b;
    }
    const dayDustGeom = new THREE.BufferGeometry();
    dayDustGeom.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    dayDustGeom.setAttribute("aSize", new THREE.BufferAttribute(dustSizes, 1));
    dayDustGeom.setAttribute("aPhase", new THREE.BufferAttribute(dustPhases, 1));
    dayDustGeom.setAttribute("aColor", new THREE.BufferAttribute(dustColors, 3));

    const dayDustUniforms = {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.75) },
    };
    const dayDustMat = new THREE.ShaderMaterial({
      uniforms: dayDustUniforms,
      vertexShader: PARTICLES_VERTEX_SHADER,
      fragmentShader: PARTICLES_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });
    const dayDust = new THREE.Points(dayDustGeom, dayDustMat);
    scene.add(dayDust);

    // 7. Wind Botanical Leaves (strictly shown only when real wind >= 16 km/h)
    const leafCount = 42;
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

    // 8. 3D Rain streaks (170 instances)
    const rainCount = 170;
    const rainGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xcbd8f5,
      transparent: true,
      opacity: 0,
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
    scene.add(rainMesh);

    // 9. Click-reactive 3D Shockwave Ring Pool (6 slots)
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

    // 10. Click-reactive 3D Crystalline Spark Pool (96 points)
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
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.75) },
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

    const updateSize = () => {
      if (!renderer) return;
      const width = window.innerWidth;
      const height = Math.max(window.innerHeight, 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      starUniforms.uPixelRatio.value = dpr;
      dayDustUniforms.uPixelRatio.value = dpr;
      sparkUniforms.uPixelRatio.value = dpr;

      // Dynamic top-right corner placement using frustum halfW/halfH at z = -7.0
      const dist = 17.0; // camera z=10 to celestial z=-7
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * dist;
      const halfW = halfH * camera.aspect;

      const xFactor = camera.aspect >= 1.2 ? 0.9 : 0.84;
      const yFactor = camera.aspect >= 1.2 ? 0.84 : 0.88;
      celestialGroup.position.set(halfW * xFactor, halfH * yFactor, -7.0);
      const bodyScale = camera.aspect < 0.75 ? 0.82 : 1.05;
      celestialGroup.scale.setScalar(bodyScale);

      // Compute exact 2D UV coordinate on screen for synced diagonal sky beams
      projVec.copy(celestialGroup.position).project(camera);
      skyUniforms.uCelestialUv.value.set(projVec.x * 0.5 + 0.5, projVec.y * 0.5 + 0.5);
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
    let nextRippleIdx = 0;
    let nextSparkIdx = 0;

    const handlePointerMove = (event: PointerEvent) => {
      const w = Math.max(window.innerWidth, 1);
      const h = Math.max(window.innerHeight, 1);
      pointerTargetX = (event.clientX / w - 0.5) * 2;
      pointerTargetY = (event.clientY / h - 0.5) * -2;
      pointerUvTargetX = event.clientX / w;
      pointerUvTargetY = 1 - event.clientY / h;
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    const rippleColorByKind = (kind: RippleKind, mood: AtmosphereMood): string => {
      if (kind === "ai") return "#fbbf24";
      if (mood === "rain") return "#7dd3fc";
      if (mood === "overcast-day") return "#cbd5e1";
      if (mood === "clear-day") return "#f0abfc";
      return "#c4b5fd";
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleRippleEvent = (event: Event) => {
      const detail = (event as CustomEvent<PortfolioRippleDetail>).detail;
      if (!detail || reducedMotion.matches) return;

      const w = Math.max(window.innerWidth, 1);
      const h = Math.max(window.innerHeight, 1);
      const ndcX = (detail.x / w) * 2 - 1;
      const ndcY = -(detail.y / h) * 2 + 1;

      rayVec.set(ndcX, ndcY, 0.5).unproject(camera);
      rayDir.copy(rayVec).sub(camera.position).normalize();
      const tHit = (1.5 - camera.position.z) / (rayDir.z || -1);
      const worldX = camera.position.x + rayDir.x * tHit;
      const worldY = camera.position.y + rayDir.y * tHit;

      const tintHex = rippleColorByKind(detail.kind, envRef.current.mood);

      const slot = rippleSlots[nextRippleIdx];
      nextRippleIdx = (nextRippleIdx + 1) % rippleSlots.length;
      slot.active = true;
      slot.age = 0;
      slot.duration = detail.kind === "card" || detail.kind === "ai" ? 0.9 : 0.74;
      slot.mesh.position.set(worldX, worldY, 1.5);
      slot.mesh.visible = true;
      slot.uniforms.uProgress.value = 0;
      slot.uniforms.uColor.value.set(tintHex);
      slot.uniforms.uStrength.value = detail.kind === "ai" ? 0.82 : 0.6;

      const burstCount = detail.kind === "ai" ? 14 : 10;
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
    window.addEventListener("portfolio:ripple", handleRippleEvent);

    const initialEnv = envRef.current;
    const initialDark = themeRef.current === "dark";
    const initialTargets = computeTargetState(
      initialEnv.mood,
      initialEnv.windSpeed,
      initialEnv.windIntensity,
      initialEnv.cloudCover,
      initialEnv.isDay,
      initialEnv.localHour,
      initialDark,
    );

    const currentState = {
      mistOpacity: initialTargets.mistOpacity,
      starOpacity: initialTargets.starOpacity,
      dayDustOpacity: initialTargets.dayDustOpacity,
      rainOpacity: initialTargets.rainOpacity,
      sunOpacity: initialTargets.sunOpacity,
      moonOpacity: initialTargets.moonOpacity,
      celestialGlow: initialTargets.celestialGlow,
      celestialRingOpacity: initialTargets.celestialRingOpacity,
      sunsetMix: initialTargets.sunsetMix,
      clearWeight: initialTargets.clearWeight,
      overcastWeight: initialTargets.overcastWeight,
      nightWeight: initialTargets.nightWeight,
      rainWeight: initialTargets.rainWeight,
      windStrength: initialTargets.windStrength,
      cloudCover: initialEnv.cloudCover,
      isDark: initialDark ? 1 : 0,
      lightning: 0,
    };

    skyUniforms.uMoodWeights.value.set(
      currentState.clearWeight,
      currentState.overcastWeight,
      currentState.nightWeight,
      currentState.rainWeight,
    );
    skyUniforms.uIsDark.value = currentState.isDark;
    skyUniforms.uCloudCover.value = currentState.cloudCover;
    skyUniforms.uSunsetMix.value = currentState.sunsetMix;
    sunUniforms.uOpacity.value = currentState.sunOpacity;
    sunUniforms.uSunsetMix.value = currentState.sunsetMix;
    moonUniforms.uOpacity.value = currentState.moonOpacity;
    moonUniforms.uIsDark.value = currentState.isDark;
    celestialGlowUniforms.uColor.value.set(
      initialEnv.isDay
        ? initialTargets.sunsetMix > 0.5
          ? "#ff9e68"
          : "#ffd07a"
        : initialDark
          ? "#a8c5ff"
          : "#c4b5fd",
    );
    celestialGlowUniforms.uIntensity.value = currentState.celestialGlow;
    celestialGlowUniforms.uRingOpacity.value = currentState.celestialRingOpacity;

    let stormTimer = 3.4;
    const targetGlowColor = new THREE.Color();
    const targetMistColor = new THREE.Color();
    const targetDustColor = new THREE.Color();

    let rafId = 0;
    let lastTime = performance.now();
    let elapsedTotal = 0;
    let entranceElapsed = reducedMotion.matches ? 1.4 : 0;

    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) * 0.001, 0.05);
      lastTime = now;

      if (!document.hidden) {
        elapsedTotal += reducedMotion.matches ? 0 : dt;
        if (!reducedMotion.matches && entranceElapsed < 1.4) {
          entranceElapsed = Math.min(1.4, entranceElapsed + dt);
        }
        const t = elapsedTotal;

        const env = envRef.current;
        const isDark = themeRef.current === "dark";
        const targets = computeTargetState(
          env.mood,
          env.windSpeed,
          env.windIntensity,
          env.cloudCover,
          env.isDay,
          env.localHour,
          isDark,
        );

        const lerpRate = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 2.5);
        currentState.mistOpacity += (targets.mistOpacity - currentState.mistOpacity) * lerpRate;
        currentState.starOpacity += (targets.starOpacity - currentState.starOpacity) * lerpRate;
        currentState.dayDustOpacity += (targets.dayDustOpacity - currentState.dayDustOpacity) * lerpRate;
        currentState.rainOpacity += (targets.rainOpacity - currentState.rainOpacity) * lerpRate;
        currentState.sunOpacity += (targets.sunOpacity - currentState.sunOpacity) * lerpRate;
        currentState.moonOpacity += (targets.moonOpacity - currentState.moonOpacity) * lerpRate;
        currentState.celestialGlow += (targets.celestialGlow - currentState.celestialGlow) * lerpRate;
        currentState.celestialRingOpacity +=
          (targets.celestialRingOpacity - currentState.celestialRingOpacity) * lerpRate;
        currentState.sunsetMix += (targets.sunsetMix - currentState.sunsetMix) * lerpRate;
        currentState.clearWeight += (targets.clearWeight - currentState.clearWeight) * lerpRate;
        currentState.overcastWeight += (targets.overcastWeight - currentState.overcastWeight) * lerpRate;
        currentState.nightWeight += (targets.nightWeight - currentState.nightWeight) * lerpRate;
        currentState.rainWeight += (targets.rainWeight - currentState.rainWeight) * lerpRate;
        currentState.windStrength += (targets.windStrength - currentState.windStrength) * lerpRate;
        currentState.cloudCover += (env.cloudCover - currentState.cloudCover) * lerpRate;
        currentState.isDark += ((isDark ? 1 : 0) - currentState.isDark) * lerpRate;

        // Storm lightning pulses
        if (env.mood === "rain" && env.isStorm && !reducedMotion.matches) {
          stormTimer -= dt;
          if (stormTimer <= 0) {
            currentState.lightning = 0.85;
            stormTimer = 4.2 + Math.random() * 5.8;
          }
        }
        currentState.lightning *= Math.exp(-dt * 5.2);

        // Smooth camera parallax + scroll depth + spatial arrival
        const entranceP = clamp(entranceElapsed / 1.4, 0, 1);
        const entranceEase = 1 - Math.pow(1 - entranceP, 4);
        pointerX += (pointerTargetX - pointerX) * 0.06;
        pointerY += (pointerTargetY - pointerY) * 0.06;
        pointerUvX += (pointerUvTargetX - pointerUvX) * 0.08;
        pointerUvY += (pointerUvTargetY - pointerUvY) * 0.08;

        const scrollShift = Math.min(window.scrollY / 900, 1.2);
        camera.position.z = 10 + (1 - entranceEase) * 1.8;
        camera.position.x = pointerX * 0.35;
        camera.position.y = pointerY * 0.28 - scrollShift * 0.45 + (1 - entranceEase) * 0.35;
        camera.lookAt(0, -scrollShift * 0.3, 0);

        // Sync corner celestial UV on backdrop
        projVec.copy(celestialGroup.position).project(camera);
        skyUniforms.uCelestialUv.value.set(projVec.x * 0.5 + 0.5, projVec.y * 0.5 + 0.5);

        // Sky uniforms
        skyUniforms.uTime.value = t;
        skyUniforms.uMouse.value.set(pointerUvX, pointerUvY);
        skyUniforms.uMoodWeights.value.set(
          currentState.clearWeight,
          currentState.overcastWeight,
          currentState.nightWeight,
          currentState.rainWeight,
        );
        skyUniforms.uIsDark.value = currentState.isDark;
        skyUniforms.uCloudCover.value = currentState.cloudCover;
        skyUniforms.uSunsetMix.value = currentState.sunsetMix;
        skyUniforms.uLightning.value = currentState.lightning;

        // Corner 3D Moon / Sun
        moonMesh.visible = currentState.moonOpacity > 0.01;
        moonUniforms.uOpacity.value = currentState.moonOpacity;
        moonUniforms.uIsDark.value = currentState.isDark;
        moonMesh.rotation.y = 0.35 + t * 0.012;

        sunMesh.visible = currentState.sunOpacity > 0.01;
        sunUniforms.uOpacity.value = currentState.sunOpacity;
        sunUniforms.uSunsetMix.value = currentState.sunsetMix;
        sunUniforms.uTime.value = t;

        targetGlowColor.set(
          env.isDay
            ? targets.sunsetMix > 0.5
              ? "#ff9e68"
              : "#ffd07a"
            : isDark
              ? "#a8c5ff"
              : "#c4b5fd",
        );
        celestialGlowUniforms.uColor.value.lerp(targetGlowColor, lerpRate);
        celestialGlowUniforms.uIntensity.value = currentState.celestialGlow;
        celestialGlowUniforms.uRingOpacity.value = currentState.celestialRingOpacity;

        // Mist strata
        targetMistColor.set(
          env.mood === "rain"
            ? isDark
              ? "#242c42"
              : "#aeb8d0"
            : env.mood === "overcast-day"
              ? isDark
                ? "#282838"
                : "#d7dae8"
              : isDark
                ? "#2b2a3c"
                : "#f8f7ff",
        );
        for (let i = 0; i < mistLayers.length; i += 1) {
          const layer = mistLayers[i];
          layer.uniforms.uTime.value = t * (0.8 + i * 0.25);
          layer.uniforms.uOpacity.value = currentState.mistOpacity * (i === 2 ? 0.42 : 1 - i * 0.15);
          layer.uniforms.uMistColor.value.lerp(targetMistColor, lerpRate);
        }

        // Stars + Shooting stars
        stars.visible = currentState.starOpacity > 0.01;
        starUniforms.uTime.value = t;
        starUniforms.uOpacity.value = currentState.starOpacity;

        if (currentState.starOpacity > 0.2 && !reducedMotion.matches) {
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
                s.uniforms.uOpacity.value = currentState.starOpacity * 0.85;
              }
            }
          }
        } else {
          for (const s of shootingStars) s.mesh.visible = false;
        }

        // Clear-day sunlit motes
        targetDustColor.set(isDark ? "#e6d2ff" : "#8b5cf6");
        const dustColAttr = dayDustGeom.getAttribute("aColor") as THREE.BufferAttribute;
        if (!reducedMotion.matches && currentState.dayDustOpacity > 0.01) {
          const dPos = dayDustGeom.getAttribute("position") as THREE.BufferAttribute;
          for (let i = 0; i < dustCount; i += 1) {
            let dx = dPos.getX(i) + dt * 0.14;
            let dy = dPos.getY(i) + Math.sin(t * 0.5 + dustPhases[i]) * dt * 0.08;
            if (dx > 10) dx = -10;
            if (dy > 5.5) dy = -5.5;
            if (dy < -5.5) dy = 5.5;
            dPos.setXY(i, dx, dy);
            dustColAttr.setXYZ(i, targetDustColor.r, targetDustColor.g, targetDustColor.b);
          }
          dPos.needsUpdate = true;
          dustColAttr.needsUpdate = true;
        }
        dayDust.visible = currentState.dayDustOpacity > 0.01;
        dayDustUniforms.uTime.value = t;
        dayDustUniforms.uOpacity.value = currentState.dayDustOpacity;

        // Wind Leaves — strictly active ONLY when wind >= 16 km/h
        const windRad = ((env.windDirection % 360) * Math.PI) / 180;
        const windDirX = Math.cos(windRad) * 0.5 + 0.85;
        const windSpeedNorm = Math.max(0.5, env.windIntensity);
        let anyLeafVisible = false;

        for (let i = 0; i < leafCount; i += 1) {
          const agent = leafAgents[i];
          const shouldBeActive = i < targets.targetActiveLeaves;
          const targetVis = shouldBeActive ? 1 : 0;
          agent.visibility += (targetVis - agent.visibility) * lerpRate;

          if (agent.visibility > 0.02) {
            anyLeafVisible = true;
            if (!reducedMotion.matches) {
              const gust = Math.sin(t * 1.25 + agent.phase) * 0.42;
              agent.x += (agent.vx * windDirX * windSpeedNorm + gust) * dt;
              agent.y += (agent.vy * (0.75 + windSpeedNorm * 0.6) + Math.cos(t * 1.6 + agent.phase) * 0.34) * dt;
              agent.z += Math.sin(t * 0.85 + agent.phase) * 0.22 * dt;

              agent.rx += agent.vrx * (0.65 + windSpeedNorm) * dt;
              agent.ry += agent.vry * (0.65 + windSpeedNorm) * dt;
              agent.rz += agent.vrz * (0.65 + windSpeedNorm) * dt;

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
          leafMat.opacity = targets.leafBaseOpacity;
          leafMesh.instanceMatrix.needsUpdate = true;
        }

        // 3D Rain streaks
        rainMesh.visible = currentState.rainOpacity > 0.015;
        if (rainMesh.visible) {
          rainMat.opacity = currentState.rainOpacity;
          const slant = -0.18 - currentState.windStrength * 0.24;
          for (let i = 0; i < rainCount; i += 1) {
            const drop = rainAgents[i];
            if (!reducedMotion.matches) {
              drop.y -= drop.speed * dt;
              drop.x += drop.speed * -slant * dt;
              if (drop.y < -6.5) {
                drop.y = 6.5;
                drop.x = (Math.random() - 0.5) * 20;
              }
              if (drop.x > 10.5) drop.x = -10.5;
            }
            dummy.position.set(drop.x, drop.y, drop.z);
            dummy.rotation.set(0, 0, slant);
            dummy.scale.set(1, drop.scaleY, 1);
            dummy.updateMatrix();
            rainMesh.setMatrixAt(i, dummy.matrix);
          }
          rainMesh.instanceMatrix.needsUpdate = true;
        }

        // 3D Click shockwaves
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

        // 3D Crystalline sparks
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

        renderer.render(scene, camera);
      }

      if (!reducedMotion.matches) {
        rafId = window.requestAnimationFrame(animate);
      }
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        lastTime = performance.now();
      }
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
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("portfolio:ripple", handleRippleEvent);
      document.removeEventListener("visibilitychange", handleVisibility);

      skyPlaneGeom.dispose();
      skyMat.dispose();
      moonGeom.dispose();
      moonMat.dispose();
      sunGeom.dispose();
      sunMat.dispose();
      celestialGlowGeom.dispose();
      celestialGlowMat.dispose();
      mistGeom.dispose();
      for (const layer of mistLayers) {
        (layer.mesh.material as THREE.Material).dispose();
      }
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
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="ambient-canvas-enter pointer-events-none fixed inset-0 z-0 h-screen w-screen"
    />
  );
}
