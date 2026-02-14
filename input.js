/**
 * input.js — Mouse input: pointer lock for look, click to shoot
 */

class InputHandler {
    constructor(game) {
        this.game    = game;
        this.canFire = true;
        this.centerX = 0;
        this.centerY = 0;
        this.locked  = false;

        // Camera look offset driven by mouse movement
        this._lookX = 0;
        this._lookY = 0;
        this.sensitivity = 0.0015; // Radians per pixel

        this._updateCenter();
        window.addEventListener('resize', () => this._updateCenter());

        // Click the canvas to request pointer lock (FPS standard)
        game.canvas.addEventListener('click', e => {
            const onPanel = e.target.closest('button, #mode-panel, #gameover-panel');
            if (!onPanel && !this.locked) {
                game.canvas.requestPointerLock();
            }
        });

        // Track pointer lock state changes
        document.addEventListener('pointerlockchange', () => {
            this.locked = document.pointerLockElement === game.canvas;
        });

        // Mouse move — only move camera when locked
        document.addEventListener('mousemove', e => {
            if (!this.locked) return;
            this._lookX += e.movementX * this.sensitivity;
            this._lookY += e.movementY * this.sensitivity * 0.4;

            // Clamp vertical look
            this._lookY = Math.max(-0.3, Math.min(0.3, this._lookY));

            // Apply to game camera as a world-space offset
            game.camera.lookX = this._lookX;
            game.camera.lookY = this._lookY;
        });

        // Shoot on left click while locked
        document.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            if (e.target.closest('button, #mode-panel, #gameover-panel')) return;
            if (this.locked) this._fire();
        });

        // Escape releases pointer lock (browser default), update state
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && this.locked) {
                document.exitPointerLock();
            }
        });

        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    // ── Private ───────────────────────────────────────────────

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
