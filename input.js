/**
 * input.js — Pointer lock mouse-look + shooting
 *
 * Mouse X → pans camera horizontally (lookX)  
 * Mouse Y → moves crosshair vertically, clamped to ground area only
 * Targets are fixed in world space. Crosshair moves to reach them.
 */

class InputHandler {
    constructor(game) {
        this.game        = game;
        this.canFire     = true;
        this.locked      = false;
        this.sensitivity = 0.002;

        this.crosshairX  = 0;
        this.crosshairY  = 0;
        this._updateCenter();

        window.addEventListener('resize', () => this._updateCenter());

        document.addEventListener('pointerlockchange', () => {
            this.locked = !!document.pointerLockElement;
        });

        document.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            if (!this.locked) document.body.requestPointerLock();
        });

        document.addEventListener('mousemove', e => {
            if (!this.locked) return;

            // Horizontal pan — tight clamp so targets stay on screen
            game.camera.lookX = Math.max(-0.8, Math.min(0.8,
                game.camera.lookX + e.movementX * this.sensitivity
            ));

            // Vertical: crosshair moves, clamped strictly to ground area
            const minY = game.camera.horizonY + 10;
            const maxY = game.height - 20;
            this.crosshairY = Math.max(minY, Math.min(maxY,
                this.crosshairY + e.movementY * 0.8
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
        // Start crosshair in the middle of the ground area
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
