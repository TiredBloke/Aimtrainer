/**
 * game.js — Core game loop, coordinate system, mode/preset management,
 *            particle system, hit detection, and stat recording.
 *
 * Rendering is delegated entirely to Renderer.
 * UI is delegated entirely to UIManager.
 */

class Game {
    constructor() {
        // Canvas
        this.canvas = document.getElementById('gameCanvas');
        this.ctx    = this.canvas.getContext('2d');
        this.width  = 0;
        this.height = 0;

        // Timing
        this.lastFrameTime = 0;
        this.deltaTime     = 0;
        this.totalTime     = 0;
        this.fps           = 0;
        this._fpsTimer     = 0;
        this._fpsCount     = 0;

        // Camera
        this.camera = {
            horizonY: 0,
            sway:  { x: 0, y: 0 },
            lookX: 0,   // Horizontal pan driven by mouse
            lookY: 0    // Vertical tilt driven by mouse
        };

        // Lighting (read by Renderer and Target)
        this.lighting = GAME_CONFIG.LIGHTING;

        // Systems
        this.audio       = new AudioManager();
        this.weapon      = new Weapon();
        this.statsManager = new StatsManager();

        // Runtime state
        this.targets      = [];
        this.particles    = [];
        this.mode         = 'freeplay';
        this._lastMode    = 'freeplay';
        this._lastPreset  = null;

        this.timer = { active: false, remaining: 0 };

        // Session stats (reset per mode)
        this.stats = this._blankStats();

        // Preset spawn state
        this._presetCfg       = null;
        this._presetSpawnWait = 0;

        this._init();
    }

    // ── Initialisation ────────────────────────────────────────

    _init() {
        this._resizeCanvas();
        window.addEventListener('resize', () => this._resizeCanvas());

        this.renderer = new Renderer(this);
        this.ui       = new UIManager(this);
        this.input    = new InputHandler(this);

        // Audio requires a user gesture
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

        // FPS counter
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
        this._updateSway(dt);
        this.weapon.update(dt);

        if (this.timer.active) {
            this.timer.remaining -= dt;
            this.ui.updateTimer(this.timer.remaining);
            if (this.timer.remaining <= 0) this._endSession();
        }

        this.targets.forEach(t => t.update(dt, this.totalTime));
        this._updateParticles(dt);
        this._handleRespawns(dt);
    }

    _updateSway(dt) {
        const C = GAME_CONFIG.CAMERA;
        this.camera.sway.x = Math.sin(this.totalTime * C.SWAY_SPEED * 1.3) * C.SWAY_AMPLITUDE * 0.4;
        this.camera.sway.y = Math.sin(this.totalTime * C.SWAY_SPEED)       * C.SWAY_AMPLITUDE;
    }

    _updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x   += p.vx * dt;
            p.y   += p.vy * dt;
            p.vy  += p.gravity * dt;
            if (p.drag) p.vx *= p.drag, p.vy *= p.drag;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    _handleRespawns(dt) {
        // Preset flick: swap target after it falls
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

        // All other timed modes: reset fallen targets
        if (this.timer.active) {
            this.targets.forEach(t => {
                if (t.isFalling && t.fallAngle <= -88 && t.fallTimer > GAME_CONFIG.TARGET.RESET_DELAY)
                    t.reset();
            });
        }
    }

    // ── Coordinate transform ──────────────────────────────────

    /**
     * Convert world coords to screen coords with perspective + fog.
     * @param {number} wx  World X  (-1 … 1)
     * @param {number} wy  World Y  (0 = ground)
     * @param {number} d   Distance (0 = near, 1 = horizon)
     * @returns {{ x, y, scale, fogAmount }}
     */
    worldToScreen(wx, wy, d) {
        d = Math.max(0.01, Math.min(1, d));

        const scale  = 1 - d * GAME_CONFIG.CAMERA.PERSPECTIVE_SCALE;
        const lookY  = this.camera.lookY || 0;
        const lookX  = this.camera.lookX || 0;

        // lookX pans the world left/right around the fixed crosshair
        const adjustedX = wx - lookX;

        // lookY shifts the horizon up/down
        const horizonShift = lookY * this.height * 1.5;
        const hy     = this.camera.horizonY + horizonShift;
        const gh     = this.height - hy;
        const yDepth = (1 - d) * (1 - d);

        const screenX = this.width  / 2 + adjustedX * this.width * 0.4 * scale;
        const screenY = hy + gh * yDepth - wy * 100 * scale;

        const FL  = GAME_CONFIG.LIGHTING;
        const fog = d < FL.FOG_NEAR ? 0
                  : Math.min(1, (d - FL.FOG_NEAR) / (FL.FOG_FAR - FL.FOG_NEAR));

        return { x: screenX, y: screenY, scale, fogAmount: fog };
    }

    // ── Hit detection ─────────────────────────────────────────

    checkTargetHit(cx, cy, spreadOffset) {
        // worldToScreen already applies lookX/Y, so targets rendered at screen
        // position P are hit-tested directly against screen centre + spread.
        const sx = cx + spreadOffset.x;
        const sy = cy + spreadOffset.y;

        const sorted = [...this.targets].sort((a, b) => a.distance - b.distance);

        for (const t of sorted) {
            if (t.checkHit(sx, sy, this)) {
                this._spawnHitSparks(t.worldX, t.worldY, t.distance);
                return { hit: true, target: t, isCenterHit: t.isCenterHit(sx, sy, this) };
            }
        }

        this._spawnDust(sx, sy);
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
                    const variance = s.reactionTimes.reduce((acc, t) => acc + (t - mean) ** 2, 0) / s.reactionTimes.length;
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

        if (key === 'flick')          this._spawnFlickTarget();
        else if (key === 'tracking')  this._spawnTrackingTargets(cfg);
        else                          this._spawnMicroAdjustTargets(cfg);

        this.timer = { active: true, remaining: cfg.timerS };
        this.ui.showTimer();
        this.ui.updateTimer(cfg.timerS);
    }

    restartLastMode() {
        if (this._lastPreset) this.startPreset(this._lastPreset);
        else                  this.startMode(this._lastMode || 'timed');
    }

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
            avgReaction: s.avgReaction,
            bestReaction: s.bestReaction < Infinity ? s.bestReaction : 0,
            consistency: s.consistency
        });
    }

    // ── Target creation ───────────────────────────────────────

    _createTargets(drillKey) {
        this.targets = [];
        const layouts = GAME_CONFIG.DRILLS[drillKey] || GAME_CONFIG.DRILLS.static;
        layouts.forEach((cfg, i) => {
            const t = new Target(cfg.x, cfg.y, cfg.d, drillKey);
            if (drillKey === 'peek') t.peek.hiddenFor = i * 0.4; // stagger
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

    // ── Particle spawning ─────────────────────────────────────

    _spawnHitSparks(wx, wy, dist) {
        const pos = this.worldToScreen(wx, wy, dist);
        const P   = GAME_CONFIG.PARTICLES.SPARK;
        const n   = _randInt(P.COUNT[0], P.COUNT[1]);

        for (let i = 0; i < n && this.particles.length < GAME_CONFIG.PARTICLES.MAX; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = _rand(P.SPEED[0], P.SPEED[1]);
            this.particles.push({
                type: 'spark',
                x: pos.x, y: pos.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - P.UP_BIAS,
                gravity: P.GRAVITY,
                life: _rand(P.LIFE[0], P.LIFE[1]),
                maxLife: P.LIFE[1],
                size: _rand(P.SIZE[0], P.SIZE[1])
            });
        }
    }

    _spawnDust(sx, sy) {
        const P = GAME_CONFIG.PARTICLES.DUST;
        const n = _randInt(P.COUNT[0], P.COUNT[1]);

        for (let i = 0; i < n && this.particles.length < GAME_CONFIG.PARTICLES.MAX; i++) {
            const angle = Math.random() * Math.PI - Math.PI / 2;
            const speed = _rand(P.SPEED[0], P.SPEED[1]);
            this.particles.push({
                type: 'dust',
                x: sx + (Math.random() - 0.5) * 20,
                y: sy + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                gravity: P.GRAVITY,
                drag: P.DRAG,
                life: _rand(P.LIFE[0], P.LIFE[1]),
                maxLife: P.LIFE[1],
                size: _rand(P.SIZE[0], P.SIZE[1])
            });
        }
    }

    // ── Helpers ───────────────────────────────────────────────

    _reset() {
        this.stats     = this._blankStats();
        this.particles = [];
        this.ui.resetStats();
        this.weapon.reset();
    }

    _blankStats() {
        return { shots: 0, hits: 0, reactionTimes: [], avgReaction: 0, bestReaction: Infinity, consistency: 0 };
    }

    _resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.width  = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width  = this.width  * dpr;
        this.canvas.height = this.height * dpr;
        this.canvas.style.width  = this.width  + 'px';
        this.canvas.style.height = this.height + 'px';
        this.ctx.scale(dpr, dpr);
        this.camera.horizonY = this.height * GAME_CONFIG.CAMERA.HORIZON_RATIO;
        if (this.input) {
            this.input.centerX = this.width  / 2;
            this.input.centerY = this.height / 2;
        }
    }
}

// ── Module-level helpers ──────────────────────────────────────

function _rand(min, max)        { return min + Math.random() * (max - min); }
function _randInt(min, max)     { return Math.floor(_rand(min, max + 1));   }

// Boot
window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
