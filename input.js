/**
 * input.js — Pointer lock mouse-look + shooting
 * 
 * lookX = horizontal camera pan (moves world left/right)
 * crosshairY = vertical crosshair position on screen (moves crosshair up/down)
 * Targets never move vertically — they are fixed to the ground plane.
 */

class InputHandler {
    constructor(game) {
        this.game        = game;
        this.canFire     = true;
        this.locked      = false;
        this.sensitivity = 0.002;

        // Crosshair lives at screen centre by default
        this.crosshairX  = 0;
        this.crosshairY  = 0;
        this._updateCenter();

        window.addEventListener('resize', () => this._updateCenter());

        // Pointer lock state
        document.addEventListener('pointerlockchange', () => {
            this.locked = !!document.pointerLockElement;
        });

        // Click anywhere non-button → lock mouse
        document.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            if (!this.locked) document.body.requestPointerLock();
        });

        // Mouse move → pan world horizontally, move crosshair vertically
        document.addEventListener('mousemove', e => {
            if (!this.locked) return;

            // Horizontal: pan the camera (world moves, crosshair stays centred X)
            game.camera.lookX = Math.max(-1.5, Math.min(1.5,
                game.camera.lookX + e.movementX * this.sensitivity
            ));

            // Vertical: move crosshair up/down on screen only
            this.crosshairY = Math.max(
                game.height * 0.1,
                Math.min(game.height * 0.9,
                    this.crosshairY + e.movementY
                )
            );
        });

        // Shoot at crosshair position
        document.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            if (e.target.closest('button')) return;
            if (this.locked) this._fire();
        });

        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    _updateCenter() {
        this.crosshairX = this.game.width  / 2;
        this.crosshairY = this.game.height / 2;
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
