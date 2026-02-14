/**
 * renderer.js — All canvas drawing. No game logic here.
 *
 * FPS camera model:
 *   - Crosshair is ALWAYS at screen centre.
 *   - Moving the mouse shifts the WORLD, not the canvas.
 *   - lookX / lookY are world-space offsets applied inside worldToScreen.
 *   - Only breathing sway + recoil kick use ctx.translate (subtle screen shake).
 */

class Renderer {
    constructor(game) {
        this.game = game;
        this.ctx  = game.ctx;
    }

    render() {
        const { ctx, game } = this;
        const recoil = game.weapon.getRecoilOffset();

        // Tiny screen-shake from breathing + recoil only (no look offset here)
        ctx.save();
        ctx.translate(
            game.camera.sway.x + recoil.x,
            game.camera.sway.y + recoil.y
        );
        ctx.clearRect(-50, -50, game.width + 100, game.height + 100);

        this._sky();
        this._ground();
        this._horizonLine();
        this._grid();
        this._targetsWithShadows();
        this._particles();

        ctx.restore();

        // Crosshair and HUD are pure screen-space — never affected by camera
        game.weapon.drawDynamicCrosshair(ctx, game.width / 2, game.height / 2);
        this._debugPanel();

        if (game.input && !game.input.locked) {
            this._lockPrompt();
        }
    }

    // ── Scene layers ──────────────────────────────────────────

    _sky() {
        const { ctx, game } = this;
        // Horizon shifts vertically with lookY (looking up = horizon drops)
        const horizonShift = game.camera.lookY * game.height * 1.5;
        const hy = game.camera.horizonY + horizonShift;

        const colors = GAME_CONFIG.COLORS.SKY;
        const grad   = ctx.createLinearGradient(0, 0, 0, hy);
        grad.addColorStop(0,   colors[0]);
        grad.addColorStop(0.5, colors[1]);
        grad.addColorStop(1,   colors[2]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, game.width, hy);
    }

    _ground() {
        const { ctx, game } = this;
        const horizonShift = game.camera.lookY * game.height * 1.5;
        const hy = game.camera.horizonY + horizonShift;

        const colors = GAME_CONFIG.COLORS.GROUND;
        const h      = game.height - hy;
        const grad   = ctx.createLinearGradient(0, hy, 0, game.height);
        grad.addColorStop(0,   colors[0]);
        grad.addColorStop(0.4, colors[1]);
        grad.addColorStop(1,   colors[2]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, hy, game.width, h);
    }

    _horizonLine() {
        const { ctx, game } = this;
        const horizonShift = game.camera.lookY * game.height * 1.5;
        const hy = game.camera.horizonY + horizonShift;
        ctx.strokeStyle = 'rgba(135,206,235,0.3)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(0,          hy);
        ctx.lineTo(game.width, hy);
        ctx.stroke();
    }

    _grid() {
        const { ctx, game } = this;
        const horizonShift = game.camera.lookY * game.height * 1.5;
        const hy  = game.camera.horizonY + horizonShift;
        const gh  = game.height - hy;
        // Vanishing point tracks horizontal look
        const vpx = game.width / 2 - game.camera.lookX * game.width;

        // Horizontal ground lines
        for (let i = 1; i <= 20; i++) {
            const t     = i / 20;
            const y     = hy + gh * (t * t);
            const alpha = 0.08 + t * 0.35;
            ctx.strokeStyle = `rgba(139,115,85,${alpha})`;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(game.width, y);
            ctx.stroke();
        }

        // Vertical vanishing lines converging to looked-at point
        for (let i = 0; i < 14; i++) {
            const offset = (i - 6.5) * 90;
            const alpha  = 0.12 + Math.abs(offset) / (game.width * 0.5) * 0.15;
            ctx.strokeStyle = `rgba(139,115,85,${alpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.moveTo(vpx + offset, game.height);
            ctx.lineTo(vpx,          hy);
            ctx.stroke();
        }
    }

    _targetsWithShadows() {
        const { game } = this;
        const sorted = [...game.targets].sort((a, b) => b.distance - a.distance);
        sorted.forEach(t => { this._shadow(t); t.draw(this.ctx, game); });
    }

    _shadow(target) {
        const { ctx, game } = this;
        const pos   = game.worldToScreen(target.worldX, target.worldY, target.distance);
        const size  = target.baseSize * pos.scale;
        const L     = GAME_CONFIG.LIGHTING;
        const ox    = L.SUN_DIR.x * size * 0.5;
        const oy    = L.SUN_DIR.y * size * 0.5 + size * 0.6;
        const alpha = L.SHADOW_ALPHA * (0.5 + pos.scale * 0.5);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = '#000';
        ctx.beginPath();
        ctx.ellipse(pos.x + ox, pos.y + oy, size * 0.4, size * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _particles() {
        const { ctx, game } = this;
        game.particles.forEach(p => {
            const ratio = p.life / p.maxLife;
            const grad  = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            if (p.type === 'spark') {
                grad.addColorStop(0,   `rgba(255,255,200,${ratio})`);
                grad.addColorStop(0.5, `rgba(255,200,100,${ratio * 0.8})`);
                grad.addColorStop(1,   'rgba(255,150,50,0)');
            } else {
                grad.addColorStop(0,   `rgba(139,115,85,${ratio * 0.6})`);
                grad.addColorStop(0.5, `rgba(120,100,70,${ratio * 0.4})`);
                grad.addColorStop(1,   'rgba(100,80,60,0)');
            }
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    _debugPanel() {
        const { ctx, game } = this;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(10, 10, 240, 170);
        ctx.font = '14px monospace';
        const locked = game.input?.locked ? '🟢 LOCKED' : '🔴 UNLOCKED';
        [
            ['#0f0', `FPS: ${game.fps}`],
            ['#0f0', `Canvas: ${game.width}×${game.height}`],
            ['#0f0', `Targets: ${game.targets.length}`],
            ['#fa0', `Recoil: ${game.weapon.recoil.current.toFixed(1)}px`],
            ['#fa0', `Spread: ${game.weapon.spread.current.toFixed(1)}px`],
            ['#0ff', `lookX: ${(game.camera.lookX||0).toFixed(3)}`],
            ['#0ff', `lookY: ${(game.camera.lookY||0).toFixed(3)}`],
            ['#0ff', `Mouse: ${locked}`],
        ].forEach(([color, text], i) => {
            ctx.fillStyle = color;
            ctx.fillText(text, 20, 30 + i * 20);
        });
    }

    _lockPrompt() {
        const { ctx, game } = this;
        const w = 360, h = 70;
        const x = (game.width  - w) / 2;
        const y = (game.height - h) / 2 + 100;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 10);
        ctx.fill();

        ctx.fillStyle   = '#fff';
        ctx.font        = 'bold 18px Arial';
        ctx.textAlign   = 'center';
        ctx.fillText('🖱  Click to aim', game.width / 2, y + 28);
        ctx.fillStyle   = '#aaa';
        ctx.font        = '14px Arial';
        ctx.fillText('Move mouse to look  •  Click to shoot  •  Esc to release', game.width / 2, y + 54);
        ctx.textAlign   = 'left';
    }
}
