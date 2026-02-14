/**
 * renderer.js — All canvas drawing. No game logic here.
 */

class Renderer {
    constructor(game) {
        this.game = game;
        this.ctx  = game.ctx;
    }

    // ── Main entry point ──────────────────────────────────────

    render() {
        const { ctx, game } = this;
        const recoil = game.weapon.getRecoilOffset();

        ctx.save();
        ctx.translate(game.camera.sway.x + recoil.x, game.camera.sway.y + recoil.y);
        ctx.clearRect(-100, -100, game.width + 200, game.height + 200);

        this._sky();
        this._ground();
        this._horizonLine();
        this._grid();
        this._targetsWithShadows();
        this._particles();

        ctx.restore();

        // These are drawn in canvas-space (unaffected by camera shake)
        game.weapon.drawDynamicCrosshair(ctx, game.width / 2, game.height / 2);
        this._debugPanel();
    }

    // ── Scene layers ──────────────────────────────────────────

    _sky() {
        const { ctx, game } = this;
        const colors = GAME_CONFIG.COLORS.SKY;
        const grad   = ctx.createLinearGradient(0, 0, 0, game.camera.horizonY);
        grad.addColorStop(0,   colors[0]);
        grad.addColorStop(0.5, colors[1]);
        grad.addColorStop(1,   colors[2]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, game.width, game.camera.horizonY);
    }

    _ground() {
        const { ctx, game } = this;
        const colors = GAME_CONFIG.COLORS.GROUND;
        const h      = game.height - game.camera.horizonY;
        const grad   = ctx.createLinearGradient(0, game.camera.horizonY, 0, game.height);
        grad.addColorStop(0,   colors[0]);
        grad.addColorStop(0.4, colors[1]);
        grad.addColorStop(1,   colors[2]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, game.camera.horizonY, game.width, h);
    }

    _horizonLine() {
        const { ctx, game } = this;
        ctx.strokeStyle = 'rgba(135,206,235,0.3)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(0,          game.camera.horizonY);
        ctx.lineTo(game.width, game.camera.horizonY);
        ctx.stroke();
    }

    _grid() {
        const { ctx, game } = this;
        const horizonY = game.camera.horizonY;
        const gh       = game.height - horizonY;
        const cx       = game.width / 2;

        // Horizontal lines fading into distance
        for (let i = 1; i <= 20; i++) {
            const t     = i / 20;
            const y     = horizonY + gh * (t * t);
            const alpha = 0.08 + t * 0.35;
            ctx.strokeStyle = `rgba(139,115,85,${alpha})`;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(game.width, y);
            ctx.stroke();
        }

        // Vertical vanishing lines
        for (let i = 0; i < 10; i++) {
            const offset = (i - 4.5) * 80;
            const alpha  = 0.12 + Math.abs(offset) / (game.width * 0.5) * 0.2;
            ctx.strokeStyle = `rgba(139,115,85,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(cx + offset, game.height);
            ctx.lineTo(cx,          horizonY);
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
        const pos    = game.worldToScreen(target.worldX, target.worldY, target.distance);
        const size   = target.baseSize * pos.scale;
        const L      = GAME_CONFIG.LIGHTING;
        const ox     = L.SUN_DIR.x * size * 0.5;
        const oy     = L.SUN_DIR.y * size * 0.5 + size * 0.6;
        const alpha  = L.SHADOW_ALPHA * (0.5 + pos.scale * 0.5);

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
        ctx.fillRect(10, 10, 225, 145);

        ctx.font = '14px monospace';
        const lines = [
            ['#0f0', `FPS: ${game.fps}`],
            ['#0f0', `Delta: ${(game.deltaTime * 1000).toFixed(1)}ms`],
            ['#0f0', `Canvas: ${game.width}×${game.height}`],
            ['#0f0', `Targets: ${game.targets.length}  Particles: ${game.particles.length}`],
            ['#fa0', `Recoil: ${game.weapon.recoil.current.toFixed(1)}px`],
            ['#fa0', `Spread: ${game.weapon.spread.current.toFixed(1)}px`],
        ];
        lines.forEach(([color, text], i) => {
            ctx.fillStyle = color;
            ctx.fillText(text, 20, 30 + i * 20);
        });
    }
}
