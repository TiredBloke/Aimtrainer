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

    /**
     * Steel plate hit — procedural metal impact.
     * @param {number} distance  0 (close) → 1 (far)
     * @param {boolean} isCenterHit
     * @param {number} playbackRate 1.0 default, up to 1.25 for high streaks
     */
    playMetalPing(distance, isCenterHit, playbackRate = 1.0) {
        if (!this.ready) return;
        this._steelPlateHit(this.ctx.currentTime, distance, isCenterHit, playbackRate);
    }

    setVolume(v) {
        if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
    }

    // ── Gunshot ───────────────────────────────────────────────

    _noiseShot(t) {
        const size   = this.ctx.sampleRate * 0.12;
        const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
        const data   = buffer.getChannelData(0);
        for (let i = 0; i < size; i++)
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / size, 0.3);

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

    // ── Steel plate hit ───────────────────────────────────────

    _steelPlateHit(t, distance, isCenterHit, playbackRate = 1.0) {
        const ctx      = this.ctx;
        const nearness = 1.0 - distance;
        const vol      = (0.30 + nearness * 0.45) * GAME_CONFIG.AUDIO.METAL_HIT_VOLUME;

        // Per-hit pitch randomisation ±5%, plus playbackRate multiplier
        const pitchVar = (0.95 + Math.random() * 0.10) * playbackRate;

        // Per-hit decay randomisation ±10%
        const decayVar = 0.90 + Math.random() * 0.20;

        // Stereo panner — small random spread so repeated hits feel distinct
        const panner = ctx.createStereoPanner();
        panner.pan.value = (Math.random() - 0.5) * 0.35;
        panner.connect(this.master);

        // High-pass filter on the whole hit chain — removes low rumble
        const hpf = ctx.createBiquadFilter();
        hpf.type            = 'highpass';
        hpf.frequency.value = 280;
        hpf.Q.value         = 0.7;
        hpf.connect(panner);

        // ── 1. Impact transient — very short noise burst ──────
        // Gives the "mass" — the physical collision before the ring
        {
            const burstLen = Math.floor(ctx.sampleRate * 0.018);
            const buf      = ctx.createBuffer(1, burstLen, ctx.sampleRate);
            const data     = buf.getChannelData(0);
            for (let i = 0; i < burstLen; i++) {
                // Short sharp click shape: instant attack, very fast decay
                const env  = Math.pow(1.0 - i / burstLen, 3.5);
                data[i]    = (Math.random() * 2 - 1) * env;
            }
            const src  = ctx.createBufferSource();
            const gain = ctx.createGain();
            src.buffer        = buf;
            gain.gain.value   = vol * 1.4;
            src.connect(gain); gain.connect(hpf);
            src.start(t); src.stop(t + 0.020);
        }

        // ── 2. Inharmonic metallic partials ──────────────────
        // Real steel plate resonances are NOT harmonic.
        // These ratios come from measured thin-plate vibration modes.
        // Base frequency shifts with distance and center/edge hit.
        const baseHz = (isCenterHit ? 1340 : 980) * pitchVar;

        // [frequency ratio, relative gain, decay multiplier]
        // Ratios are inharmonic (not integer multiples) — that's what makes
        // it sound like metal rather than a musical instrument.
        const partials = [
            [ 1.000, 1.00, 1.00 ],   // fundamental mode
            [ 1.493, 0.72, 0.82 ],   // 2nd plate mode
            [ 2.121, 0.50, 0.65 ],   // 3rd mode
            [ 2.917, 0.33, 0.52 ],   // 4th mode
            [ 3.841, 0.20, 0.40 ],   // 5th mode — fades fast
            [ 5.278, 0.10, 0.28 ],   // high shimmer
            [ 7.143, 0.05, 0.18 ],   // upper partial — brief brightness
        ];

        partials.forEach(([ratio, relGain, decayMult]) => {
            const freq    = baseHz * ratio;
            // Slight per-partial pitch drift — metal rings, then settles
            const freqEnd = freq * (0.991 + Math.random() * 0.006);

            // Decay time: closer targets ring longer; center hits ring longer
            const baseDur   = (isCenterHit ? 0.75 : 0.45) * decayMult * decayVar;
            const dur       = baseDur * (0.6 + nearness * 0.8);

            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();

            // Sine for lower partials (rounder), triangle for upper (more bite)
            osc.type = freq < 3000 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, t);
            osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);

            // Attack: near-instant (0.5ms) then exponential decay
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.linearRampToValueAtTime(vol * relGain, t + 0.0005);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

            osc.connect(gain); gain.connect(hpf);
            osc.start(t); osc.stop(t + dur + 0.01);
        });

        // ── 3. Body resonance — low sustain thud ─────────────
        // The plate has mass — a short low-mid boom under the ring.
        // This is what makes it feel physical rather than tinny.
        {
            const bodyFreq = (isCenterHit ? 220 : 165) * pitchVar;
            const bodyDur  = 0.12 * decayVar;

            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(bodyFreq, t);
            osc.frequency.exponentialRampToValueAtTime(bodyFreq * 0.88, t + bodyDur);

            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.linearRampToValueAtTime(vol * 0.55, t + 0.001);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + bodyDur);

            // Low-pass so it doesn't muddy the ring
            const lpf = ctx.createBiquadFilter();
            lpf.type            = 'lowpass';
            lpf.frequency.value = 600;
            lpf.Q.value         = 1.2;

            osc.connect(gain); gain.connect(lpf); lpf.connect(hpf);
            osc.start(t); osc.stop(t + bodyDur + 0.01);
        }
    }
}
