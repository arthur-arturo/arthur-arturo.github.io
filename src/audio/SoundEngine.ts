import type { AtmosphereMood } from "../environment/EnvironmentProvider";

type ToggleKind = "light" | "dark" | "locale";
type ModalAction = "open" | "close";

const SCALES: Record<AtmosphereMood, number[]> = {
  "clear-day": [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98],
  "night-clear": [523.25, 587.33, 783.99, 880, 987.77, 1174.66, 1318.51, 1567.98],
  "night-wind": [523.25, 587.33, 783.99, 880, 987.77, 1174.66, 1318.51, 1567.98],
  "overcast-day": [493.88, 587.33, 659.25, 739.99, 880, 987.77, 1174.66],
  rain: [493.88, 587.33, 659.25, 739.99, 880, 987.77, 1174.66],
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface AudioRig {
  ctx: AudioContext;
  bus: GainNode;
  noiseBuffer: AudioBuffer;
}

class OcularSoundEngine {
  private rig: AudioRig | null = null;
  private scaleStep = 0;

  private ensureRig(): AudioRig | null {
    if (typeof window === "undefined") return null;

    if (!this.rig) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;

        const ctx = new AudioCtx();

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 18;
        compressor.ratio.value = 3.2;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.16;

        const masterGain = ctx.createGain();
        masterGain.gain.value = 0.28;

        const bus = ctx.createGain();
        bus.gain.value = 1;

        // Dry path
        bus.connect(compressor);

        // Subtle stereo micro-reverb / echo network
        const delayL = ctx.createDelay(0.2);
        delayL.delayTime.value = 0.046;
        const delayR = ctx.createDelay(0.2);
        delayR.delayTime.value = 0.074;

        const dampFilter = ctx.createBiquadFilter();
        dampFilter.type = "lowpass";
        dampFilter.frequency.value = 2200;

        const fbGainL = ctx.createGain();
        fbGainL.gain.value = 0.22;
        const fbGainR = ctx.createGain();
        fbGainR.gain.value = 0.22;

        const wetGain = ctx.createGain();
        wetGain.gain.value = 0.14;

        bus.connect(dampFilter);
        dampFilter.connect(delayL);
        dampFilter.connect(delayR);

        delayL.connect(fbGainL);
        fbGainL.connect(delayR);
        delayR.connect(fbGainR);
        fbGainR.connect(delayL);

        if (typeof ctx.createStereoPanner === "function") {
          const panL = ctx.createStereoPanner();
          panL.pan.value = -0.55;
          const panR = ctx.createStereoPanner();
          panR.pan.value = 0.55;
          delayL.connect(panL);
          delayR.connect(panR);
          panL.connect(wetGain);
          panR.connect(wetGain);
        } else {
          delayL.connect(wetGain);
          delayR.connect(wetGain);
        }

        wetGain.connect(compressor);
        compressor.connect(masterGain);
        masterGain.connect(ctx.destination);

        // Precompute short noise buffer for precision optical impulses
        const noiseLen = Math.max(1, Math.floor(ctx.sampleRate * 0.06));
        const noiseBuffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
        const channel = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseLen; i += 1) {
          channel[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.28));
        }

        this.rig = { ctx, bus, noiseBuffer };
      } catch {
        this.rig = null;
        return null;
      }
    }

    return this.rig;
  }

  public unlock() {
    const rig = this.ensureRig();
    if (!rig) return;
    try {
      if (rig.ctx.state === "suspended") {
        void rig.ctx.resume();
      }
    } catch {
      // Ignore audio unlock restriction errors.
    }
  }

  private createPanTarget(rig: AudioRig, xNorm: number): AudioNode {
    const panValue = clamp((xNorm * 2 - 1) * 0.65, -0.65, 0.65);
    if (typeof rig.ctx.createStereoPanner === "function") {
      const panner = rig.ctx.createStereoPanner();
      panner.pan.setValueAtTime(panValue, rig.ctx.currentTime);
      panner.connect(rig.bus);
      return panner;
    }
    return rig.bus;
  }

  private nextNote(mood: AtmosphereMood): number {
    const scale = SCALES[mood] ?? SCALES["night-clear"];
    const freq = scale[this.scaleStep % scale.length];
    this.scaleStep = (this.scaleStep + 1) % scale.length;
    return freq;
  }

  private triggerNoiseImpulse(
    rig: AudioRig,
    dest: AudioNode,
    startTime: number,
    durationSec: number,
    centerHz: number,
    q: number,
    gainAmount: number,
  ) {
    const src = rig.ctx.createBufferSource();
    src.buffer = rig.noiseBuffer;

    const filter = rig.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(centerHz, startTime);
    filter.Q.setValueAtTime(q, startTime);

    const g = rig.ctx.createGain();
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(gainAmount, startTime + 0.0012);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    src.connect(filter);
    filter.connect(g);
    g.connect(dest);

    src.start(startTime);
    src.stop(startTime + durationSec + 0.005);
  }

  private triggerTone(
    rig: AudioRig,
    dest: AudioNode,
    startTime: number,
    startHz: number,
    endHz: number,
    durationSec: number,
    peakGain: number,
    moodFilter?: BiquadFilterNode | null,
    type: OscillatorType = "sine",
  ) {
    const osc = rig.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startHz, startTime);
    if (endHz !== startHz) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endHz), startTime + durationSec);
    }

    const g = rig.ctx.createGain();
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(peakGain, startTime + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    osc.connect(g);
    g.connect(moodFilter ?? dest);

    osc.start(startTime);
    osc.stop(startTime + durationSec + 0.015);
  }

  private createWarmWeatherFilter(rig: AudioRig, dest: AudioNode, mood: AtmosphereMood) {
    if (mood !== "overcast-day" && mood !== "rain") return null;
    const filter = rig.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(mood === "rain" ? 1950 : 2300, rig.ctx.currentTime);
    filter.Q.setValueAtTime(0.9, rig.ctx.currentTime);
    filter.connect(dest);
    return filter;
  }

  public playOpticalClick(xNorm: number, mood: AtmosphereMood) {
    const rig = this.ensureRig();
    if (!rig) return;
    try {
      this.unlock();
      const now = rig.ctx.currentTime;
      const dest = this.createPanTarget(rig, xNorm);
      const moodFilter = this.createWarmWeatherFilter(rig, dest, mood);

      // Precision optical shutter click + micro sine body
      this.triggerNoiseImpulse(rig, dest, now, 0.008, 3200, 3.5, 0.17);
      this.triggerTone(rig, dest, now, 1380, 420, 0.018, 0.12, moodFilter);

      // Crystalline harmonic tail rotating through mood scale
      const note = this.nextNote(mood);
      this.triggerTone(rig, dest, now + 0.004, note, note * 1.002, 0.19, 0.085, moodFilter);
    } catch {
      // Ignore synthesis errors
    }
  }

  public playCardClick(xNorm: number, mood: AtmosphereMood) {
    const rig = this.ensureRig();
    if (!rig) return;
    try {
      this.unlock();
      const now = rig.ctx.currentTime;
      const dest = this.createPanTarget(rig, xNorm);
      const moodFilter = this.createWarmWeatherFilter(rig, dest, mood);

      // Glass optical detent
      this.triggerNoiseImpulse(rig, dest, now, 0.009, 2850, 3.2, 0.15);
      this.triggerTone(rig, dest, now, 1120, 380, 0.02, 0.11, moodFilter);

      // Ascending harmonic dyad (root + staggered fifth)
      const root = this.nextNote(mood);
      const fifth = root * 1.498;
      this.triggerTone(rig, dest, now + 0.004, root, root, 0.24, 0.1, moodFilter);
      this.triggerTone(rig, dest, now + 0.026, fifth, fifth, 0.24, 0.075, moodFilter, "triangle");
    } catch {
      // Ignore
    }
  }

  public playSkillChime(index: number, isAi: boolean, xNorm: number, mood: AtmosphereMood) {
    const rig = this.ensureRig();
    if (!rig) return;
    try {
      this.unlock();
      const now = rig.ctx.currentTime;
      const dest = this.createPanTarget(rig, xNorm);
      const moodFilter = this.createWarmWeatherFilter(rig, dest, mood);

      const scale = SCALES[mood] ?? SCALES["night-clear"];
      const safeIndex = Math.max(0, Math.min(11, index));
      const baseNote = scale[safeIndex % scale.length];
      const octaveMultiplier = safeIndex >= scale.length ? 1.5 : 1;
      const freq = baseNote * octaveMultiplier;

      this.triggerNoiseImpulse(rig, dest, now, 0.008, 3400, 3.6, 0.14);
      this.triggerTone(rig, dest, now + 0.003, freq, freq * 1.003, 0.24, 0.11, moodFilter);

      if (isAi) {
        // Distinctive crystalline AI upper octave shimmer
        this.triggerTone(rig, dest, now + 0.016, freq * 2, freq * 2.004, 0.34, 0.09, moodFilter);
      }
    } catch {
      // Ignore
    }
  }

  public playToggle(kind: ToggleKind, xNorm: number) {
    const rig = this.ensureRig();
    if (!rig) return;
    try {
      this.unlock();
      const now = rig.ctx.currentTime;
      const dest = this.createPanTarget(rig, xNorm);

      // Double mechanical-optical micro-click (0ms + 22ms)
      this.triggerNoiseImpulse(rig, dest, now, 0.008, 3000, 3.4, 0.15);
      this.triggerNoiseImpulse(rig, dest, now + 0.022, 0.009, 3600, 3.2, 0.12);

      if (kind === "light") {
        this.triggerTone(rig, dest, now, 520, 780, 0.13, 0.11);
        this.triggerTone(rig, dest, now + 0.022, 1046.5, 1174.66, 0.16, 0.075);
      } else if (kind === "dark") {
        this.triggerTone(rig, dest, now, 640, 380, 0.15, 0.11);
        this.triggerTone(rig, dest, now + 0.022, 587.33, 440, 0.18, 0.075);
      } else {
        this.triggerTone(rig, dest, now, 783.99, 783.99, 0.14, 0.1);
        this.triggerTone(rig, dest, now + 0.022, 1174.66, 1174.66, 0.15, 0.065);
      }
    } catch {
      // Ignore
    }
  }

  public playFilterClick(xNorm: number, mood: AtmosphereMood) {
    const rig = this.ensureRig();
    if (!rig) return;
    try {
      this.unlock();
      const now = rig.ctx.currentTime;
      const dest = this.createPanTarget(rig, xNorm);
      const moodFilter = this.createWarmWeatherFilter(rig, dest, mood);

      this.triggerNoiseImpulse(rig, dest, now, 0.007, 2400, 3.8, 0.15);
      this.triggerTone(rig, dest, now + 0.002, 660, 620, 0.095, 0.1, moodFilter);
    } catch {
      // Ignore
    }
  }

  public playModalAction(action: ModalAction, xNorm: number) {
    const rig = this.ensureRig();
    if (!rig) return;
    try {
      this.unlock();
      const now = rig.ctx.currentTime;
      const dest = this.createPanTarget(rig, xNorm);

      this.triggerNoiseImpulse(rig, dest, now, 0.008, 2900, 3.0, 0.12);
      if (action === "open") {
        this.triggerTone(rig, dest, now + 0.004, 587.33, 587.33, 0.18, 0.09);
        this.triggerTone(rig, dest, now + 0.022, 880, 880, 0.18, 0.08);
        this.triggerTone(rig, dest, now + 0.042, 1174.66, 1174.66, 0.18, 0.065);
      } else {
        this.triggerTone(rig, dest, now, 880, 523.25, 0.14, 0.085);
        this.triggerTone(rig, dest, now + 0.018, 587.33, 392, 0.14, 0.065);
      }
    } catch {
      // Ignore
    }
  }
}

export const soundEngine = new OcularSoundEngine();
