/**
 * input.js — Mouse input handler
 */

class InputHandler {
    constructor(game) {
        this.game        = game;
        this.canFire     = true;
        this.centerX     = 0;
        this.centerY     = 0;

        this._updateCenter();
        window.addEventListener('resize', () => this._updateCenter());

        game.canvas.addEventListener('mousedown', e => {
            if (e.button === 0) this._fire();
        });

        game.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    // ── Private ───────────────────────────────────────────────

    _updateCenter() {
        this.centerX = this.game.width  / 2;
        this.centerY = this.game.height / 2;
    }

    _fire() {
        if (!this.canFire || !this.game.weapon.canFire()) return;

        // Get spread offset from weapon
        const spread = this.game.weapon.fire();
        this.game.audio.playGunshot();

        const result = this.game.checkTargetHit(this.centerX, this.centerY, spread);

        if (result.hit) {
            const reactionMs = result.target.onHit(result.isCenterHit);
            this.game.audio.playMetalPing(result.target.distance, result.isCenterHit);
            this.game.recordShot(true, reactionMs);
        } else {
            this.game.recordShot(false, 0);
        }

        // Brief cooldown to prevent accidental double-tap
        this.canFire = false;
        setTimeout(() => { this.canFire = true; }, GAME_CONFIG.WEAPON.FIRE_RATE_MS);
    }
}
