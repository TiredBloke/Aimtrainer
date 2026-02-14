/**
 * stats.js — Persistent player statistics via localStorage
 */

class StatsManager {
    constructor() {
        this.KEY = 'aimTrainerStats';
        this.data = this._load();
    }

    // ── Public API ────────────────────────────────────────────

    /** Call at end of every session */
    save(session) {
        const d = this.data;
        d.totalShots   += session.shots;
        d.totalHits    += session.hits;
        d.sessions     += 1;
        d.lastPlayed    = Date.now();

        if (session.accuracy > d.bestAccuracy)
            d.bestAccuracy = session.accuracy;

        if (session.reactionMs && session.reactionMs < d.bestReactionMs)
            d.bestReactionMs = session.reactionMs;

        // Per-mode bests
        const m = d.modes[session.mode];
        if (m) {
            m.plays += 1;
            if (session.accuracy > m.bestAccuracy) m.bestAccuracy = session.accuracy;
            if (session.mode === 'timed' && session.hits > m.bestScore) m.bestScore = session.hits;
            if (session.reactionMs && session.reactionMs < m.bestReaction) m.bestReaction = session.reactionMs;
        }

        this._persist();
    }

    /** Returns a flat object ready for the UI to display */
    display() {
        const d = this.data;
        const lifetimeAcc = d.totalShots > 0
            ? (d.totalHits / d.totalShots) * 100
            : 0;
        return {
            bestAccuracy:    d.bestAccuracy,
            bestReactionMs:  d.bestReactionMs < Infinity ? d.bestReactionMs : 0,
            totalShots:      d.totalShots,
            totalHits:       d.totalHits,
            lifetimeAcc,
            sessions:        d.sessions,
            lastPlayed:      d.lastPlayed
        };
    }

    reset() {
        this.data = this._defaults();
        this._persist();
    }

    /** Human-readable "X minutes ago" */
    lastPlayedText() {
        const t = this.data.lastPlayed;
        if (!t) return 'Never';
        const diff = Date.now() - t;
        const m = Math.floor(diff / 60000);
        if (m < 1)  return 'Just now';
        if (m < 60) return `${m} min ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }

    // ── Private ───────────────────────────────────────────────

    _load() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (raw) return { ...this._defaults(), ...JSON.parse(raw) };
        } catch (_) {}
        return this._defaults();
    }

    _persist() {
        try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); }
        catch (_) {}
    }

    _defaults() {
        const modeKeys = ['freeplay','timed','strafe','peek','micro',
                          'preset-flick','preset-tracking','preset-micro-adjust'];
        const modes = {};
        modeKeys.forEach(k => {
            modes[k] = { plays: 0, bestAccuracy: 0, bestScore: 0, bestReaction: Infinity };
        });
        return {
            bestAccuracy:   0,
            bestReactionMs: Infinity,
            totalShots:     0,
            totalHits:      0,
            sessions:       0,
            lastPlayed:     null,
            modes
        };
    }
}
