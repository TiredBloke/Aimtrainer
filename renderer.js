/**
 * renderer.js
 *
 * FPS model:
 *   - lookX pans the world horizontally. Targets shift left/right.
 *   - Crosshair moves freely on screen (input.crosshairX/Y).
 *   - No vertical world movement. Targets are fixed to ground plane.
 *   - Sky/ground/horizon are always at the same fixed Y positions.
 */

class Renderer {
    constructor(game) {
        this.game = game;
        this.ctx  = game.ctx;
    }

    render() {
        const { ctx, game } = this;

        ctx.clearRect(0, 0, game.width, game.height);

        this._sky();
        this._ground();
        this._horizonLine();
        this._grid();
        this._targetsWithShadows();
        this._particles();

        const cx = game.input ? game.input.crosshairX : game.width  / 2;
        const cy = game.input ? game.input.crosshairY : game.height / 2;
        game.weapon.drawDynamicCrosshair(ctx, cx, cy);
        this._debugPanel();

        if (game.input && !game.input.locked) {
            this._lockPrompt();
        }
    }

    // ── Background ────────────────────────────────────────────

    _sky() {
        const { ctx, game } = this;
        const hy = game.camera.horizonY;
        const w  = game.width;

        // Deep sky gradient - dark blue at top, bright hazy blue at horizon
        const grad = ctx.createLinearGradient(0, 0, 0, hy);
        grad.addColorStop(0,    '#1a3a5c');
        grad.addColorStop(0.3,  '#2e6094');
        grad.addColorStop(0.7,  '#5b9ec9');
        grad.addColorStop(1,    '#c9e8f5');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, hy);

        // Sun
        const sunX = w * 0.72;
        const sunY = hy * 0.28;
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 80);
        sunGrad.addColorStop(0,   'rgba(255,255,220,1)');
        sunGrad.addColorStop(0.1, 'rgba(255,240,150,0.9)');
        sunGrad.addColorStop(0.4, 'rgba(255,200,80,0.3)');
        sunGrad.addColorStop(1,   'rgba(255,180,50,0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 80, 0, Math.PI * 2);
        ctx.fill();

        // Atmospheric haze at horizon
        const hazeGrad = ctx.createLinearGradient(0, hy * 0.6, 0, hy);
        hazeGrad.addColorStop(0, 'rgba(200,230,255,0)');
        hazeGrad.addColorStop(1, 'rgba(220,240,255,0.5)');
        ctx.fillStyle = hazeGrad;
        ctx.fillRect(0, hy * 0.6, w, hy * 0.4);

        // Simple clouds
        this._clouds(ctx, w, hy);
    }

    _clouds(ctx, w, hy) {
        // Deterministic clouds based on fixed positions
        const clouds = [
            { x: 0.12, y: 0.22, r: 55 },
            { x: 0.28, y: 0.15, r: 40 },
            { x: 0.45, y: 0.30, r: 65 },
            { x: 0.63, y: 0.18, r: 45 },
            { x: 0.80, y: 0.25, r: 50 },
            { x: 0.92, y: 0.12, r: 35 },
        ];
        clouds.forEach(c => {
            const cx = c.x * w;
            const cy = c.y * hy;
            const r  = c.r;
            const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            g.addColorStop(0,   'rgba(255,255,255,0.92)');
            g.addColorStop(0.5, 'rgba(240,248,255,0.7)');
            g.addColorStop(1,   'rgba(220,235,255,0)');
            ctx.fillStyle = g;
            // Puff shape: several overlapping circles
            [[0,0,1],[r*0.5,-r*0.2,0.75],[-r*0.45,-r*0.15,0.7],[r*0.25,-r*0.4,0.6]].forEach(([ox,oy,s]) => {
                ctx.beginPath();
                ctx.arc(cx+ox, cy+oy, r*s, 0, Math.PI*2);
                ctx.fillStyle = `rgba(255,255,255,${0.55*s})`;
                ctx.fill();
            });
        });
    }

    _ground() {
        const { ctx, game } = this;
        const hy = game.camera.horizonY;
        const w  = game.width;
        const h  = game.height - hy;

        // Base dirt gradient
        const grad = ctx.createLinearGradient(0, hy, 0, game.height);
        grad.addColorStop(0,    '#b8a070');
        grad.addColorStop(0.08, '#8B6F47');
        grad.addColorStop(0.4,  '#6B5033');
        grad.addColorStop(1,    '#3d2b1a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, hy, w, h);

        // Grass strip along the horizon
        const grassGrad = ctx.createLinearGradient(0, hy, 0, hy + 18);
        grassGrad.addColorStop(0, '#5a7a3a');
        grassGrad.addColorStop(1, '#3d5c28');
        ctx.fillStyle = grassGrad;
        ctx.fillRect(0, hy, w, 18);

        // Ground fog/haze near horizon
        const fogGrad = ctx.createLinearGradient(0, hy, 0, hy + h * 0.25);
        fogGrad.addColorStop(0, 'rgba(200,220,200,0.35)');
        fogGrad.addColorStop(1, 'rgba(200,220,200,0)');
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, hy, w, h * 0.25);
    }

    _horizonLine() {
        // Subtle horizon — the grass strip handles the visual separation
        const { ctx, game } = this;
        ctx.strokeStyle = 'rgba(90,122,58,0.6)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0,              game.camera.horizonY);
        ctx.lineTo(game.width,     game.camera.horizonY);
        ctx.stroke();
    }

    _grid() {
        const { ctx, game } = this;
        const hy  = game.camera.horizonY;
        const gh  = game.height - hy;
        const vpx = game.width / 2; // Fixed vanishing point at centre

        for (let i = 1; i <= 20; i++) {
            const t     = i / 20;
            const y     = hy + gh * (t * t);
            const alpha = 0.06 + t * 0.2;
            ctx.strokeStyle = `rgba(80,55,30,${alpha})`;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(game.width, y);
            ctx.stroke();
        }

        for (let i = 0; i < 14; i++) {
            const offset = (i - 6.5) * 90;
            const alpha  = Math.min(0.3, 0.05 + Math.abs(offset) / (game.width * 0.5) * 0.1);
            ctx.strokeStyle = `rgba(80,55,30,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(vpx + offset, game.height);
            ctx.lineTo(vpx,          hy);
            ctx.stroke();
        }
    }

    // ── Targets ───────────────────────────────────────────────

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
        const alpha = L.SHADOW_ALPHA * (0.5 + pos.scale * 0.5);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = '#000';
        ctx.beginPath();
        ctx.ellipse(
            pos.x + L.SUN_DIR.x * size * 0.5,
            pos.y + L.SUN_DIR.y * size * 0.5 + size * 0.6,
            size * 0.4, size * 0.12, 0, 0, Math.PI * 2
        );
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

    // ── HUD ───────────────────────────────────────────────────

    _debugPanel() {
        const { ctx, game } = this;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(10, 10, 240, 150);
        ctx.font = '14px monospace';
        const locked = game.input?.locked ? '🟢 LOCKED' : '🔴 UNLOCKED';
        [
            ['#0f0', `FPS: ${game.fps}`],
            ['#0f0', `Canvas: ${game.width}×${game.height}`],
            ['#0f0', `Targets: ${game.targets.length}`],
            ['#fa0', `Recoil: ${game.weapon.recoil.current.toFixed(1)}px`],
            ['#fa0', `Spread: ${game.weapon.spread.current.toFixed(1)}px`],
            ['#0ff', `Mouse: ${locked}`],
        ].forEach(([color, text], i) => {
            ctx.fillStyle = color;
            ctx.fillText(text, 20, 30 + i * 20);
        });
    }

    _lockPrompt() {
        const { ctx, game } = this;
        const w = 500, h = 60;
        const x = (game.width - w) / 2;
        const y = game.height / 2 + 80;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 10);
        ctx.fill();
        ctx.fillStyle   = '#fff';
        ctx.font        = 'bold 17px Arial';
        ctx.textAlign   = 'center';
        ctx.fillText('🖱  Click to capture mouse', game.width / 2, y + 24);
        ctx.fillStyle   = '#aaa';
        ctx.font        = '13px Arial';
        ctx.fillText('Move to aim  •  Click to shoot  •  Esc to release', game.width / 2, y + 46);
        ctx.textAlign   = 'left';
    }
}
