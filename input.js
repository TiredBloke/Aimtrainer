/**
 * input.js — Mouse look via pointer lock + shooting
 */

class InputHandler {
    constructor(game) {
        this.game        = game;
        this.canFire     = true;
        this.centerX     = 0;
        this.centerY     = 0;
        this.locked      = false;
        this.sensitivity = 0.002;

        this._updateCenter();
        window.addEventListener('resize', () => this._updateCenter());

        // Track pointer lock state
        document.addEventListener('pointerlockchange', () => {
            this.locked = !!document.pointerLockElement;
        });

        // Click anything non-button → request pointer lock on body
        // (body is always in DOM and accepts pointer lock)
        document.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            if (!this.locked) {
                document.body.requestPointerLock();
            }
        });

        // Mouse move → pan camera when locked
        document.addEventListener('mousemove', e => {
            if (!this.locked) return;
            game.camera.lookX += e.movementX * this.sensitivity;
            game.camera.lookY  = Math.max(-0.3, Math.min(0.3,
                game.camera.lookY + e.movementY * this.sensitivity * 0.5
            ));
        });

        // Left click → shoot when locked
        document.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            if (e.target.closest('button')) return;
            if (this.locked) this._fire();
        });

        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    _updateCenter() {
        this.centerX = this.game.width  / 2;
        this.centerY = this.game.height / 2;
    }

    _fire() {
        if (!this.canFire || !this.game.weapon.canFire()) return;

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

        this.canFire = false;
        setTimeout(() => { this.canFire = true; }, GAME_CONFIG.WEAPON.FIRE_RATE_MS);
    }
}
