/**
 * audio.js — Procedural sound synthesis via Web Audio API
 * No external files required.
 */

class AudioManager {
    constructor() {
        this.ctx    = null;
        this.master = null;
        this.ready  = false;
    }

    /** Must be called after a user gesture */
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

    // ── Public sounds ─────────────────────────────────────────

    playGunshot() {
        if (!this.ready) return;
        const now = this.ctx.currentTime;
        this._noiseShot(now);
        this._bassPunch(now);
    }

    playMetalPing(distance, isCenterHit) {
        if (!this.ready) return;
        const now          = this.ctx.currentTime;
        const nearness     = 1 - distance;
        const volume       = 0.3 + nearness * 0.5;
        const baseFreq     = isCenterHit ? 2800 : 2200;
        const echoDelay    = distance * 0.15;

        this._metallicTone(now, baseFreq, volume, nearness);

        if (distance > GAME_CONFIG.AUDIO.ECHO_THRESHOLD)
            this._echo(now + echoDelay, baseFreq, volume * 0.4, nearness);
    }

    setVolume(v) {
        if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
    }

    // ── Private helpers ───────────────────────────────────────

    _noiseShot(t) {
        const size   = this.ctx.sampleRate * 0.1;
        const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
        const data   = buffer.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

        const src    = this.ctx.createBufferSource();
        const hpf    = this.ctx.createBiquadFilter();
        const gain   = this.ctx.createGain();

        src.buffer       = buffer;
        hpf.type         = 'highpass';
        hpf.frequency.value = 800;

        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

        src.connect(hpf);
        hpf.connect(gain);
        gain.connect(this.master);
        src.start(t);
        src.stop(t + 0.05);
    }

    _bassPunch(t) {
        const osc  = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);

        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

        osc.connect(gain);
        gain.connect(this.master);
        osc.start(t);
        osc.stop(t + 0.08);
    }

    _metallicTone(t, baseFreq, volume, brightness) {
        const dur       = 0.3;
        const harmonics = [1.0, 1.5, 2.3, 3.1];
        const gains     = [1.0, 0.6, 0.4, 0.2];

        const mainGain = this.ctx.createGain();
        mainGain.gain.setValueAtTime(0, t);
        mainGain.gain.linearRampToValueAtTime(volume * GAME_CONFIG.AUDIO.METAL_HIT_VOLUME, t + 0.002);
        mainGain.gain.exponentialRampToValueAtTime(0.01, t + dur);

        const hpf        = this.ctx.createBiquadFilter();
        hpf.type         = 'highpass';
        hpf.frequency.value = 1000 + brightness * 1000;
        hpf.connect(mainGain);
        mainGain.connect(this.master);

        harmonics.forEach((ratio, i) => {
            const osc  = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type  = 'sine';
            osc.frequency.setValueAtTime(baseFreq * ratio, t);
            osc.frequency.linearRampToValueAtTime(baseFreq * ratio * 0.98, t + 0.1);
            gain.gain.value = gains[i];
            osc.connect(gain);
            gain.connect(hpf);
            osc.start(t);
            osc.stop(t + dur);
        });
    }

    _echo(t, baseFreq, volume, brightness) {
        const dur  = 0.4;
        const freq = baseFreq * 0.8;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volume * 0.5, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

        const lpf        = this.ctx.createBiquadFilter();
        lpf.type         = 'lowpass';
        lpf.frequency.value = 1200 - brightness * 400;
        lpf.connect(gain);
        gain.connect(this.master);

        const osc  = this.ctx.createOscillator();
        osc.type  = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.95, t + dur);
        osc.connect(lpf);
        osc.start(t);
        osc.stop(t + dur);
    }
}
