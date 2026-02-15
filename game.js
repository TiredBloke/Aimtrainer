/**
 * game.js — Core game loop, mode management, hit detection, stats.
 * Rendering delegated to Renderer (Three.js).
 * Hit detection uses renderer.castRay() instead of worldToScreen.
 */

class Game {
    constructor() {
        // Dimensions (still needed for crosshair clamping)
        this.width  = window.innerWidth;
        this.height = window.innerHeight;

        // Timing
        this.lastFrameTime = 0;
        this.deltaTime     = 0;
        this.totalTime     = 0;
        this.fps           = 0;
        this._fpsTimer     = 0;
        this._fpsCount     = 0;

        // Camera stub — horizonY kept for input.js crosshair default position
        this.camera = { horizonY: window.innerHeight * 0.45 };

        // Systems
        this.audio        = new AudioManager();
        this.weapon       = new Weapon();
        this.statsManager = new StatsManager();

        // Runtime state
        this.targets   = [];
        this.particles = []; // kept for audio/visual hooks, not rendered in 3D yet
        this.mode      = 'freeplay';
        this._lastMode   = 'freeplay';
        this._lastPreset = null;

        this.timer = { active: false, remaining: 0 };
        this.stats = this._blankStats();

        this._presetCfg       = null;
        this._presetSpawnWait = 0;

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

        const onFirstClick = () => {
            this.audio.init();
            this.audio.resume();
            document.removeEventListener('click', onFirstClick);
        };
        document.addEventListener('click', onFirstClick);

        setTimeout(() => this.ui.showCrosshairHint(), 600);

        this._createTargets('static');
        this._loop(0);
    }

    // ── Main loop ─────────────────────────────────────────────

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

    // ── Update ────────────────────────────────────────────────

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

        this.targets.forEach(t => {
            if (t.isFalling && t.fallAngle <= -89 && t.fallTimer > GAME_CONFIG.TARGET.RESET_DELAY)
                t.reset();
        });
    }

    // ── Hit detection (raycasting via Three.js) ───────────────

    checkTargetHit(cx, cy, spreadOffset) {
        const sx = cx + spreadOffset.x;
        const sy = cy + spreadOffset.y;

        const result = this.renderer.castRay(sx, sy);

        if (result.hit) {
            this._spawnHitSparks(result.target);
            return result;
        }

        return { hit: false, target: null, isCenterHit: false };
    }

    // ── Stat recording ────────────────────────────────────────

    recordShot(hit, reactionMs = 0) {
        const s = this.stats;
        s.shots++;

        if (hit) {
            s.hits++;
            if (reactionMs > 0 && reactionMs < 5000) {
                s.reactionTimes.push(reactionMs);
                if (reactionMs < s.bestReaction) s.bestReaction = reactionMs;
                const sum = s.reactionTimes.reduce((a, b) => a + b, 0);
                s.avgReaction = sum / s.reactionTimes.length;
                if (s.reactionTimes.length > 1) {
                    const mean = s.avgReaction;
                    const variance = s.reactionTimes.reduce((a, t) => a + (t - mean) ** 2, 0) / s.reactionTimes.length;
                    s.consistency = Math.sqrt(variance);
                }
            }
        }

        const accuracy = s.shots > 0 ? (s.hits / s.shots) * 100 : 0;
        this.ui.updateStats(s.shots, s.hits, accuracy);
        this.ui.updateReactionStats(s.avgReaction, s.bestReaction, s.consistency);
    }

    // ── Mode management ───────────────────────────────────────

    startMode(mode) {
        const durations = { timed: 30, strafe: 30, peek: 30, micro: 45, freeplay: 0 };
        this._lastMode   = mode;
        this._lastPreset = null;
        this.mode        = mode;
        this._presetCfg  = null;

        this._reset();

        const typeMap = { timed: 'static', strafe: 'strafe', peek: 'peek', micro: 'micro', freeplay: 'static' };
        this._createTargets(typeMap[mode] || 'static');

        const dur = durations[mode] ?? 0;
        if (dur > 0) {
            this.timer = { active: true, remaining: dur };
            this.ui.showTimer();
            this.ui.updateTimer(dur);
        } else {
            this.timer = { active: false, remaining: 0 };
            this.ui.hideTimer();
        }
    }

    startPreset(key) {
        const cfg = GAME_CONFIG.PRESETS[key];
        if (!cfg) return;

        this._lastMode   = null;
        this._lastPreset = key;
        this.mode        = `preset-${key}`;
        this._presetCfg  = { key, cfg };
        this._presetSpawnWait = 0;

        this._reset();
        this.targets = [];

        if (key === 'flick')         this._spawnFlickTarget();
        else if (key === 'tracking') this._spawnTrackingTargets(cfg);
        else                         this._spawnMicroAdjustTargets(cfg);

        this.timer = { active: true, remaining: cfg.timerS };
        this.ui.showTimer();
        this.ui.updateTimer(cfg.timerS);
    }

    restartLastMode() {
        if (this._lastPreset) this.startPreset(this._lastPreset);
        else                  this.startMode(this._lastMode || 'timed');
    }

    _endSession() {
        this.timer = { active: false, remaining: 0 };
        this.ui.updateTimer(0);

        const s        = this.stats;
        const accuracy = s.shots > 0 ? (s.hits / s.shots) * 100 : 0;

        this.statsManager.save({
            mode: this.mode, shots: s.shots, hits: s.hits,
            accuracy, reactionMs: s.bestReaction < Infinity ? s.bestReaction : null
        });

        this.ui.showGameOver({
            shots: s.shots, hits: s.hits, accuracy,
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

    _spawnTrackingTargets(cfg) {
        cfg.distances.forEach((d, i) => {
            const t = new Target((Math.random() - 0.5) * 1.0, 0, d, 'strafe');
            t.strafe.speed = cfg.speeds[i] ?? 0.35;
            this.targets.push(t);
        });
    }

    _spawnMicroAdjustTargets(cfg) {
        const cx = (Math.random() - 0.5) * 0.4;
        cfg.distances.forEach(d => {
            const x = cx + (Math.random() - 0.5) * cfg.spawnRadius;
            this.targets.push(new Target(x, 0, d, 'micro'));
        });
    }

    // ── Particles (audio/visual triggers only in 3D) ──────────

    _spawnHitSparks(target) {
        // In 3D we handle this via target.impactFlash
        // Audio cue is handled in input.js
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
