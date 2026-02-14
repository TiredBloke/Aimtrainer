/**
 * weapon.js — Recoil, bullet spread, and dynamic crosshair rendering
 */

class Weapon {
    constructor() {
        const C = GAME_CONFIG.WEAPON;

        this.recoil = { current: 0, multiplier: 1 };
        this.spread = { current: C.SPREAD.BASE };

        this._lastShotMs = 0;
        this._recentShots = []; // timestamps for rapid-fire detection
    }

    // ── Per-frame update ──────────────────────────────────────

    update(dt) {
        const C   = GAME_CONFIG.WEAPON;
        const now = performance.now();

        // Recover recoil and spread
        this.recoil.current = Math.max(0, this.recoil.current - C.RECOIL.RECOVERY * dt);
        this.spread.current = Math.max(C.SPREAD.BASE, this.spread.current - C.SPREAD.RECOVERY * dt);

        // Prune stale rapid-fire timestamps
        this._recentShots = this._recentShots.filter(t => now - t < C.RAPID_FIRE.WINDOW_MS);

        // Reset multiplier when no longer rapid-firing
        if (this._recentShots.length <= 2) this.recoil.multiplier = 1;
    }

    // ── Firing ────────────────────────────────────────────────

    /** Returns spread offset {x, y} to apply to the shot ray */
    fire() {
        const C   = GAME_CONFIG.WEAPON;
        const now = performance.now();

        this._recentShots.push(now);
        this._lastShotMs = now;

        // Rapid-fire multiplier
        if (this._recentShots.length > 2) {
            this.recoil.multiplier = Math.min(
                1 + (this._recentShots.length - 2) * C.RAPID_FIRE.MULTIPLIER_INC,
                C.RAPID_FIRE.MULTIPLIER_MAX
            );
        }

        // Apply kick
        const kick = C.RECOIL.KICK * this.recoil.multiplier;
        this.recoil.current = Math.min(this.recoil.current + kick, C.RECOIL.MAX);

        // Apply spread
        const spreadInc = C.SPREAD.PER_SHOT * this.recoil.multiplier;
        this.spread.current = Math.min(this.spread.current + spreadInc, C.SPREAD.MAX);

        // Random bullet deviation within spread circle
        const angle = Math.random() * Math.PI * 2;
        const dist  = Math.random() * this.spread.current;
        return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
    }

    canFire() {
        return (performance.now() - this._lastShotMs) >= GAME_CONFIG.WEAPON.FIRE_RATE_MS;
    }

    /** Returns {x, y} camera offset caused by current recoil */
    getRecoilOffset() {
        const hJitter = (Math.random() - 0.5) * this.recoil.current * 0.2;
        return { x: hJitter, y: -this.recoil.current };
    }

    reset() {
        this.recoil  = { current: 0, multiplier: 1 };
        this.spread  = { current: GAME_CONFIG.WEAPON.SPREAD.BASE };
        this._recentShots = [];
    }

    // ── Crosshair rendering ───────────────────────────────────

    drawDynamicCrosshair(ctx, cx, cy) {
        const C           = GAME_CONFIG.WEAPON.CROSSHAIR;
        const spreadRatio = this.spread.current / GAME_CONFIG.WEAPON.SPREAD.MAX;
        const size        = C.SIZE_BASE + spreadRatio * (C.SIZE_MAX - C.SIZE_BASE);
        const gap         = C.GAP;

        // Color shifts white → red as spread grows
        const r = Math.round(255);
        const g = Math.round(255 * (1 - spreadRatio));
        const b = Math.round(255 * (1 - spreadRatio));
        const color = `rgba(${r},${g},${b},0.85)`;

        ctx.save();
        ctx.strokeStyle    = color;
        ctx.lineWidth      = C.THICKNESS;
        ctx.lineCap        = 'round';
        ctx.shadowColor    = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur     = 3;

        // Four arms
        this._arm(ctx, cx, cy,  cx,              cy - gap - size); // up
        this._arm(ctx, cx, cy,  cx,              cy + gap + size); // down
        this._arm(ctx, cx, cy,  cx - gap - size, cy);              // left
        this._arm(ctx, cx, cy,  cx + gap + size, cy);              // right

        // Centre dot when accurate
        if (spreadRatio < 0.3) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    _arm(ctx, x1, y1, x2, y2) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
}
