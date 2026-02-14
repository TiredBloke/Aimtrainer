/**
 * input.js — Free-moving crosshair over fixed world
 * 
 * The world never moves. The crosshair moves like a cursor,
 * clamped to the ground area below the horizon.
 */

class InputHandler {
    constructor(game) {
        this.game        = game;
        this.canFire     = true;
        this.locked          = false;
        this._suppressMenu   = false; // true when we release lock programmatically
        this.sensitivity = 1.0; // 1:1 pixel movement

        this.crosshairX  = 0;
        this.crosshairY  = 0;
        this._updateCenter();

        window.addEventListener('resize', () => this._updateCenter());

        document.addEventListener('pointerlockchange', () => {
            const wasLocked = this.locked;
            this.locked = !!document.pointerLockElement;
            // Escape pressed by user (not programmatic release) → show main menu
            if (wasLocked && !this.locked && !this._suppressMenu) {
                game.ui.showModePanel();
            }
            this._suppressMenu = false;
        });

        document.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            if (!this.locked) document.body.requestPointerLock();
        });

        // Crosshair moves freely across the whole screen
        document.addEventListener('mousemove', e => {
            if (!this.locked) return;

            this.crosshairX = Math.max(10, Math.min(game.width - 10,
                this.crosshairX + e.movementX * this.sensitivity
            ));
            this.crosshairY = Math.max(10, Math.min(game.height - 10,
                this.crosshairY + e.movementY * this.sensitivity
            ));
        });

        document.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            if (e.target.closest('button')) return;
            if (this.locked) this._fire();
        });

        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    _updateCenter() {
        this.crosshairX = this.game.width  / 2;
        const hy = this.game.camera.horizonY || this.game.height * 0.45;
        this.crosshairY = hy + (this.game.height - hy) * 0.4;
    }

    _fire() {
        if (!this.canFire || !this.game.weapon.canFire()) return;

        const spread = this.game.weapon.fire();
        this.game.audio.playGunshot();

        const result = this.game.checkTargetHit(
            this.crosshairX, this.crosshairY, spread
        );

        if (result.hit) {
            const reactionMs = result.target.onHit(result.isCenterHit);
            this.game.audio.playMetalPing(result.target.distance, result.isCenterHit);
            this.game.recordShot(true, reactionMs);
        } else {
            this.game.recordShot(false, 0);
        }

        this.canFire = false;
        setTimeout(() => { this.canFire = true; }, GAME_CONFIG.WEAPON.FIRE_RATE_MS);
    }
}
