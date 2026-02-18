/**
 * game.js — Core game loop. All modes run 30s.
 */

class Game {
    constructor() {
        this.width  = window.innerWidth;
        this.height = window.innerHeight;

        this.lastFrameTime = 0;
        this.deltaTime     = 0;
        this.totalTime     = 0;
        this.fps           = 0;
        this._fpsTimer     = 0;
        this._fpsCount     = 0;

        this.camera = { horizonY: window.innerHeight * 0.45 };

        this.audio        = new AudioManager();
        this.weapon       = new Weapon();
        this.statsManager = new StatsManager();

        this.targets        = [];
        this.particles      = [];
        this.mode           = 'static';
        this._lastMode      = 'static';
        this.timer          = { active: false, remaining: 0 };
        this.stats          = this._blankStats();
        this._presetCfg     = null;
        this._presetSpawnWait = 0;

        // Streak system
        this.streak = 0;
        this.streakEffects = {
            crosshairBrightness: 0,   // 0→1 lerped
            spawnIntervalMult:   1.0, // 1.0→0.8 at 10+
            targetScaleMult:     1.0, // 1.0→0.9 at 15+
            hitSoundRate:        1.0, // 1.0→1.25 at 20+
        };

        window.addEventListener('resize', () => {
            this.width  = window.innerWidth;
            this.height = window.innerHeight;
            this.camera.horizonY = this.height * 0.45;
        });

        this._init();
    }

    _init() {
        this.renderer = new Renderer(this);
        this.ui       = new UIManager(this);
        this.input    = new InputHandler(this);

        document.addEventListener('click', () => {
            this.audio.init();
            this.audio.resume();
        }, { once: true });

        // Start with targets visible in background while on menu
        this._createTargets('static');
        this._loop(0);
    }

    _loop(timestamp) {
        this.deltaTime     = Math.min((timestamp - this.lastFrameTime) / 1000, 0.1);
        this.lastFrameTime = timestamp;
        this.totalTime    += this.deltaTime;

        this._fpsCount++;
        this._fpsTimer += this.deltaTime;
        if (this._fpsTimer >= 0.5) {
            this.fps       = Math.round(this._fpsCount / this._fpsTimer);
            this._fpsTimer = 0;
            this._fpsCount = 0;
        }

        this._update(this.deltaTime);
        this.renderer.render();
        requestAnimationFrame(ts => this._loop(ts));
    }

    _update(dt) {
        this.weapon.update(dt);

        if (this.timer.active) {
            this.timer.remaining -= dt;
            this.ui.updateTimer(this.timer.remaining);
            if (this.timer.remaining <= 0) this._endSession();
        }

        this.targets.forEach(t => t.update(dt, this.totalTime));
        this._handleRespawns(dt);
    }

    _handleRespawns(dt) {
        // Flick mode: spawn new single target after it falls
        if (this._presetCfg?.key === 'flick') {
            const t = this.targets[0];
            if (!t || (t.isFalling && t.fallAngle <= -88)) {
                this._presetSpawnWait -= dt;
                if (this._presetSpawnWait <= 0) {
                    this._spawnFlickTarget();
                    this._presetSpawnWait = GAME_CONFIG.PRESETS.flick.spawnDelayS;
                }
            }
            return;
        }

        // Peek mode: targets manage their own show/hide cycle, no batch reset
        if (this.mode === 'peek') {
            this.targets.forEach(t => {
                if (t.isFalling && t.fallAngle <= -89 && t.fallTimer > GAME_CONFIG.TARGET.RESET_DELAY)
                    t.reset();
            });
            return;
        }

        // All other modes: wait until EVERY target is down, then reset all at once
        const activePeek = this.targets.filter(t => !t.isFalling);
        const allDown    = activePeek.length === 0 && this.targets.length > 0;

        if (allDown) {
            // Count up a shared reset timer
            this._allDownTimer = (this._allDownTimer || 0) + dt;
            if (this._allDownTimer >= 0.6) {
                this._allDownTimer = 0;
                this.targets.forEach(t => t.reset());
            }
        } else {
            this._allDownTimer = 0;
        }
    }

    // ── Hit detection ─────────────────────────────────────────

    checkTargetHit(cx, cy, spreadOffset) {
        const result = this.renderer.castRay(
            cx + spreadOffset.x,
            cy + spreadOffset.y
        );
        return result.hit ? result : { hit: false, target: null, isCenterHit: false };
    }

    // ── Stats ─────────────────────────────────────────────────

    recordShot(hit, reactionMs = 0) {
        const s = this.stats;
        s.shots++;
        if (hit) {
            s.hits++;
            this.streak++;
            this._updateStreakEffects();
            if (reactionMs > 0 && reactionMs < 5000) {
                s.reactionTimes.push(reactionMs);
                if (reactionMs < s.bestReaction) s.bestReaction = reactionMs;
                const sum = s.reactionTimes.reduce((a, b) => a + b, 0);
                s.avgReaction = sum / s.reactionTimes.length;
                if (s.reactionTimes.length > 1) {
                    const mean = s.avgReaction;
                    const v = s.reactionTimes.reduce((a, t) => a + (t - mean) ** 2, 0) / s.reactionTimes.length;
                    s.consistency = Math.sqrt(v);
                }
            }
        } else {
            // Miss — break streak
            if (this.streak > 0) {
                this.streak = 0;
                this._breakStreak();
            }
        }
        const accuracy = s.shots > 0 ? (s.hits / s.shots) * 100 : 0;
        this.ui.updateStats(s.shots, s.hits, accuracy);
        this.ui.updateReactionStats(s.avgReaction, s.bestReaction, s.consistency);
    }

    // ── Streak system ─────────────────────────────────────────

    _updateStreakEffects() {
        const e = this.streakEffects;
        const s = this.streak;

        // Crosshair brightness: 5+ streak, lerp to white
        e.crosshairBrightness = s >= 5 ? Math.min((s - 5) / 15, 1.0) : 0;

        // Spawn interval: 10+ streak, reduce by 20%
        e.spawnIntervalMult = s >= 10 ? 0.8 : 1.0;

        // Target scale: 15+ streak, reduce by 10%
        e.targetScaleMult = s >= 15 ? 0.9 : 1.0;

        // Hit sound rate: 20+ streak, increase up to 1.25
        if (s >= 20) {
            e.hitSoundRate = 1.0 + Math.min((s - 20) / 40, 0.25);
        } else {
            e.hitSoundRate = 1.0;
        }
    }

    _breakStreak() {
        // Smoothly lerp effects back to defaults over 400ms
        const e = this.streakEffects;
        const startValues = {
            brightness: e.crosshairBrightness,
            interval:   e.spawnIntervalMult,
            scale:      e.targetScaleMult,
            rate:       e.hitSoundRate,
        };

        const duration = 0.4; // 400ms
        let elapsed = 0;

        const lerp = () => {
            elapsed += this.deltaTime;
            const t = Math.min(elapsed / duration, 1.0);
            const ease = t * t * (3 - 2 * t); // smoothstep

            e.crosshairBrightness = startValues.brightness * (1 - ease);
            e.spawnIntervalMult   = startValues.interval   + (1.0 - startValues.interval)   * ease;
            e.targetScaleMult     = startValues.scale      + (1.0 - startValues.scale)      * ease;
            e.hitSoundRate        = startValues.rate       + (1.0 - startValues.rate)       * ease;

            if (t < 1.0) {
                requestAnimationFrame(lerp);
            }
        };
        lerp();
    }

    // ── Mode start — always 30 seconds ────────────────────────

    startMode(mode) {
        this._lastMode      = mode;
        this.mode           = mode;
        this._presetCfg     = null;
        this._presetSpawnWait = 0;
        this._allDownTimer  = 0;

        this._reset();

        if (mode === 'flick') {
            this.targets = [];
            this._spawnFlickTarget();
            this._presetCfg = { key: 'flick', cfg: GAME_CONFIG.PRESETS.flick };
        } else {
            const typeMap = { static: 'static', strafe: 'strafe', peek: 'peek', micro: 'micro' };
            this._createTargets(typeMap[mode] || 'static');
        }

        this.timer = { active: true, remaining: 30 };
        this.ui.showTimer();
        this.ui.updateTimer(30);
    }

    // kept for compatibility but not used in new flow
    startPreset(key) { this.startMode(key); }
    restartLastMode() { this.startMode(this._lastMode || 'static'); }

    // ── Session end ───────────────────────────────────────────

    _endSession() {
        this.timer = { active: false, remaining: 0 };
        this.ui.updateTimer(0);

        const s        = this.stats;
        const accuracy = s.shots > 0 ? (s.hits / s.shots) * 100 : 0;

        this.statsManager.save({
            mode:       this.mode,
            shots:      s.shots,
            hits:       s.hits,
            accuracy,
            reactionMs: s.bestReaction < Infinity ? s.bestReaction : null
        });

        this.ui.showGameOver({
            shots:       s.shots,
            hits:        s.hits,
            accuracy,
            avgReaction:  s.avgReaction,
            bestReaction: s.bestReaction < Infinity ? s.bestReaction : 0,
            consistency:  s.consistency
        });
    }

    // ── Target creation ───────────────────────────────────────

    _createTargets(drillKey) {
        this.targets = [];
        const layouts = GAME_CONFIG.DRILLS[drillKey] || GAME_CONFIG.DRILLS.static;
        layouts.forEach((cfg, i) => {
            const t = new Target(cfg.x, cfg.y, cfg.d, drillKey);
            if (drillKey === 'peek') t.peek.hiddenFor = i * 0.4;
            this.targets.push(t);
        });
    }

    _spawnFlickTarget() {
        const cfg   = GAME_CONFIG.PRESETS.flick;
        const angle = Math.random() * Math.PI * 2;
        const x     = Math.cos(angle) * cfg.spawnRadius;
        const d     = cfg.distances[Math.floor(Math.random() * cfg.distances.length)];
        this.targets = [new Target(x, 0, d, 'static')];
    }

    // ── Helpers ───────────────────────────────────────────────

    _reset() {
        this.stats     = this._blankStats();
        this.particles = [];
        if (this.input) {
            this.input.crosshairX = this.width  / 2;
            this.input.crosshairY = this.height * 0.6;
        }
        this.ui.resetStats();
        this.weapon.reset();
    }

    _blankStats() {
        return { shots: 0, hits: 0, reactionTimes: [], avgReaction: 0, bestReaction: Infinity, consistency: 0 };
    }
}

function _rand(min, max)    { return min + Math.random() * (max - min); }
function _randInt(min, max) { return Math.floor(_rand(min, max + 1)); }

window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
