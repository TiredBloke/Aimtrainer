/**
 * audio.js — Procedural sound synthesis via Web Audio API
 */

class AudioManager {
    constructor() {
        this.ctx    = null;
        this.master = null;
        this.ready  = false;
    }

    init() {
        if (this.ready) return;
        try {
            this.ctx    = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = GAME_CONFIG.AUDIO.MASTER_VOLUME;
            this.master.connect(this.ctx.destination);
            this.ready = true;
        } catch (e) {
            console.warn('AudioManager: could not create context', e);
        }
    }

    resume() {
        if (this.ctx?.state === 'suspended') this.ctx.resume();
    }

    playGunshot() {
        if (!this.ready) return;
        const now = this.ctx.currentTime;
        this._noiseShot(now);
        this._bassPunch(now);
    }

    playMetalPing(distance, isCenterHit) {
        if (!this.ready) return;
        const now      = this.ctx.currentTime;
        const nearness = 1 - distance;
        const volume   = 0.35 + nearness * 0.5;

        // Main impact — heavy steel clang
        this._steelImpact(now, isCenterHit, volume, nearness);

        // Reverb tail — distant metallic sustain, like a mass impact
        this._impactTail(now, isCenterHit, volume, distance);

        // Distant echo for far targets
        if (distance > GAME_CONFIG.AUDIO.ECHO_THRESHOLD) {
            this._roomEcho(now + distance * 0.12, volume * 0.3, nearness);
        }
    }

    setVolume(v) {
        if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
    }

    // ── Gunshot ───────────────────────────────────────────────

    _noiseShot(t) {
        const size   = this.ctx.sampleRate * 0.12;
        const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
        const data   = buffer.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / size, 0.3);

        const src  = this.ctx.createBufferSource();
        const hpf  = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        src.buffer          = buffer;
        hpf.type            = 'highpass';
        hpf.frequency.value = 600;

        gain.gain.setValueAtTime(0.45, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);

        src.connect(hpf); hpf.connect(gain); gain.connect(this.master);
        src.start(t); src.stop(t + 0.12);
    }

    _bassPunch(t) {
        const osc  = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.1);

        gain.gain.setValueAtTime(0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

        osc.connect(gain); gain.connect(this.master);
        osc.start(t); osc.stop(t + 0.1);
    }

    // ── Hit sounds ────────────────────────────────────────────

    _steelImpact(t, isCenterHit, volume, nearness) {
        // Sharp transient click + high metallic ping
        const baseFreq  = isCenterHit ? 3200 : 2400;
        const harmonics = [1.0, 1.47, 2.08, 2.77, 3.58];
        const hGains    = [1.0, 0.55, 0.35, 0.20, 0.10];

        const mainGain = this.ctx.createGain();
        mainGain.gain.setValueAtTime(0, t);
        mainGain.gain.linearRampToValueAtTime(volume * GAME_CONFIG.AUDIO.METAL_HIT_VOLUME, t + 0.001);
        mainGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        mainGain.connect(this.master);

        harmonics.forEach((ratio, i) => {
            const osc  = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(baseFreq * ratio, t);
            osc.frequency.linearRampToValueAtTime(baseFreq * ratio * 0.97, t + 0.12);
            gain.gain.value = hGains[i];
            osc.connect(gain); gain.connect(mainGain);
            osc.start(t); osc.stop(t + 0.18);
        });
    }

    _impactTail(t, isCenterHit, volume, distance) {
        // The "mass impact" tail — low resonant sustain that fades slowly
        // like a heavy steel plate still vibrating after the hit
        const tailDur  = 0.8 + (1 - distance) * 0.6; // closer = longer ring
        const tailFreq = isCenterHit ? 420 : 310;
        const tailVol  = volume * 0.25;

        // Low resonant body
        const bodyGain = this.ctx.createGain();
        bodyGain.gain.setValueAtTime(0, t + 0.005);
        bodyGain.gain.linearRampToValueAtTime(tailVol, t + 0.015);
        bodyGain.gain.setValueAtTime(tailVol, t + 0.04);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, t + tailDur);

        const lpf = this.ctx.createBiquadFilter();
        lpf.type  = 'lowpass';
        lpf.frequency.value = 900;
        lpf.Q.value         = 2.5;
        lpf.connect(bodyGain); bodyGain.connect(this.master);

        // Two detuned oscillators for a beating, ringing plate sound
        [tailFreq, tailFreq * 1.012].forEach(freq => {
            const osc  = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);
            osc.frequency.linearRampToValueAtTime(freq * 0.985, t + tailDur);
            gain.gain.value = 0.5;
            osc.connect(gain); gain.connect(lpf);
            osc.start(t + 0.005); osc.stop(t + tailDur);
        });

        // Subtle noise shimmer — the plate surface hiss
        const noiseSize = Math.floor(this.ctx.sampleRate * tailDur * 0.5);
        const nBuf  = this.ctx.createBuffer(1, noiseSize, this.ctx.sampleRate);
        const nData = nBuf.getChannelData(0);
        for (let i = 0; i < noiseSize; i++) nData[i] = (Math.random() * 2 - 1) * 0.3;

        const nSrc   = this.ctx.createBufferSource();
        const nBpf   = this.ctx.createBiquadFilter();
        const nGain  = this.ctx.createGain();

        nSrc.buffer         = nBuf;
        nBpf.type           = 'bandpass';
        nBpf.frequency.value = 2200;
        nBpf.Q.value         = 1.5;

        nGain.gain.setValueAtTime(0, t + 0.01);
        nGain.gain.linearRampToValueAtTime(tailVol * 0.15, t + 0.04);
        nGain.gain.exponentialRampToValueAtTime(0.001, t + tailDur * 0.6);

        nSrc.connect(nBpf); nBpf.connect(nGain); nGain.connect(this.master);
        nSrc.start(t + 0.01); nSrc.stop(t + tailDur * 0.6);
    }

    _roomEcho(t, volume, nearness) {
        // Distant room reflection
        const freq = 800 - nearness * 200;
        const dur  = 0.35;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volume, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        const lpf = this.ctx.createBiquadFilter();
        lpf.type  = 'lowpass';
        lpf.frequency.value = 1000;
        lpf.connect(gain); gain.connect(this.master);

        const osc = this.ctx.createOscillator();
        osc.type  = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.93, t + dur);
        osc.connect(lpf);
        osc.start(t); osc.stop(t + dur);
    }
}
