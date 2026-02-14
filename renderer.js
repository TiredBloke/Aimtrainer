/**
 * renderer.js — All canvas drawing.
 * World is fixed. Crosshair moves freely via input.crosshairX/Y.
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
        this._grid();
        this._targetsWithShadows();
        this._particles();

        const cx = game.input ? game.input.crosshairX : game.width  / 2;
        const cy = game.input ? game.input.crosshairY : game.height / 2;
        game.weapon.drawDynamicCrosshair(ctx, cx, cy);
    }

    // ── Sky ───────────────────────────────────────────────────

    _sky() {
        const { ctx, game } = this;
        const hy = game.camera.horizonY;
        const w  = game.width;

        // Sky gradient — deep blue top to pale hazy horizon
        const sky = ctx.createLinearGradient(0, 0, 0, hy);
        sky.addColorStop(0,   '#0d2b4e');
        sky.addColorStop(0.25,'#1a4a7a');
        sky.addColorStop(0.65,'#4a8ab8');
        sky.addColorStop(1,   '#aad4ee');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, hy);

        // Sun disc
        const sx = w * 0.75, sy = hy * 0.3;
        // Outer glow
        const glow = ctx.createRadialGradient(sx, sy, 8, sx, sy, 120);
        glow.addColorStop(0,   'rgba(255,250,200,0.25)');
        glow.addColorStop(0.4, 'rgba(255,220,100,0.12)');
        glow.addColorStop(1,   'rgba(255,200,50,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(sx - 120, sy - 120, 240, 240);
        // Sun core
        const disc = ctx.createRadialGradient(sx, sy, 0, sx, sy, 22);
        disc.addColorStop(0,   'rgba(255,255,230,1)');
        disc.addColorStop(0.6, 'rgba(255,240,160,1)');
        disc.addColorStop(1,   'rgba(255,210,80,0.8)');
        ctx.fillStyle = disc;
        ctx.beginPath();
        ctx.arc(sx, sy, 22, 0, Math.PI * 2);
        ctx.fill();

        // Horizon haze
        const haze = ctx.createLinearGradient(0, hy * 0.55, 0, hy);
        haze.addColorStop(0, 'rgba(180,220,245,0)');
        haze.addColorStop(1, 'rgba(210,238,255,0.6)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, hy * 0.55, w, hy * 0.45);

        this._clouds();
    }

    _clouds() {
        const { ctx, game } = this;
        const hy = game.camera.horizonY;
        const w  = game.width;

        // Each cloud is a cluster of soft ellipses
        const defs = [
            { x: 0.08, y: 0.18, puffs: [[-60,0,90,40],[0,-18,70,32],[55,-5,80,36],[-20,12,65,28]] },
            { x: 0.32, y: 0.12, puffs: [[-40,0,65,28],[15,-14,55,24],[45,0,60,26]] },
            { x: 0.55, y: 0.22, puffs: [[-70,0,100,44],[0,-20,80,36],[65,-6,90,40],[-30,14,70,30]] },
            { x: 0.76, y: 0.14, puffs: [[-45,0,70,30],[10,-16,58,26],[48,-2,65,28]] },
            { x: 0.91, y: 0.20, puffs: [[-35,0,55,24],[20,-12,48,20],[42,4,52,22]] },
        ];

        defs.forEach(cloud => {
            const cx = cloud.x * w;
            const cy = cloud.y * hy;
            // Distant clouds are smaller and more transparent
            const depthFade = 0.7 + cloud.y * 0.5;

            cloud.puffs.forEach(([ox, oy, rx, ry]) => {
                const px = cx + ox, py = cy + oy;
                const g = ctx.createRadialGradient(px, py - ry*0.3, 0, px, py, Math.max(rx, ry));
                g.addColorStop(0,   `rgba(255,255,255,${0.88 * depthFade})`);
                g.addColorStop(0.4, `rgba(245,250,255,${0.65 * depthFade})`);
                g.addColorStop(0.8, `rgba(220,238,255,${0.25 * depthFade})`);
                g.addColorStop(1,   'rgba(200,230,255,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
                ctx.fill();
            });
        });
    }

    // ── Ground ────────────────────────────────────────────────

    _ground() {
        const { ctx, game } = this;
        const hy = game.camera.horizonY;
        const w  = game.width;
        const gh = game.height - hy;

        // Dirt base
        const dirt = ctx.createLinearGradient(0, hy, 0, game.height);
        dirt.addColorStop(0,    '#a08858');
        dirt.addColorStop(0.06, '#7a6040');
        dirt.addColorStop(0.3,  '#5c4428');
        dirt.addColorStop(1,    '#2e1e0e');
        ctx.fillStyle = dirt;
        ctx.fillRect(0, hy, w, gh);

        // Grass band at horizon — thick enough to be visible
        const grass = ctx.createLinearGradient(0, hy - 4, 0, hy + 22);
        grass.addColorStop(0,   '#6a9440');
        grass.addColorStop(0.4, '#4e7a2c');
        grass.addColorStop(1,   '#2e4e18');
        ctx.fillStyle = grass;
        ctx.fillRect(0, hy - 4, w, 26);

        // Subtle perspective bands to give ground depth
        for (let i = 0; i < 6; i++) {
            const t  = (i + 1) / 7;
            const y  = hy + gh * t * t;
            const lw = 1 + t;
            ctx.strokeStyle = `rgba(30,15,5,${0.08 + t * 0.12})`;
            ctx.lineWidth   = lw;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Warm light patch — sun hitting the ground
        const patch = ctx.createRadialGradient(w * 0.75, hy + 30, 0, w * 0.75, hy + gh * 0.4, w * 0.4);
        patch.addColorStop(0,   'rgba(255,220,140,0.18)');
        patch.addColorStop(0.5, 'rgba(255,200,100,0.06)');
        patch.addColorStop(1,   'rgba(255,180,80,0)');
        ctx.fillStyle = patch;
        ctx.fillRect(0, hy, w, gh);

        // Horizon ground fog
        const fog = ctx.createLinearGradient(0, hy, 0, hy + gh * 0.3);
        fog.addColorStop(0, 'rgba(180,210,190,0.4)');
        fog.addColorStop(1, 'rgba(180,210,190,0)');
        ctx.fillStyle = fog;
        ctx.fillRect(0, hy, w, gh * 0.3);
    }

    // ── Grid ──────────────────────────────────────────────────

    _grid() {
        const { ctx, game } = this;
        const hy  = game.camera.horizonY;
        const gh  = game.height - hy;
        const vpx = game.width / 2;

        // Perspective horizontal lines
        for (let i = 1; i <= 16; i++) {
            const t     = i / 16;
            const y     = hy + gh * (t * t);
            const alpha = 0.04 + t * 0.14;
            ctx.strokeStyle = `rgba(50,30,10,${alpha})`;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(game.width, y);
            ctx.stroke();
        }

        // Vanishing lines
        for (let i = 0; i < 12; i++) {
            const offset = (i - 5.5) * 110;
            const alpha  = Math.min(0.18, 0.04 + Math.abs(offset) / (game.width * 0.5) * 0.08);
            ctx.strokeStyle = `rgba(50,30,10,${alpha})`;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(vpx + offset, game.height);
            ctx.lineTo(vpx,          hy + 26);
            ctx.stroke();
        }
    }

    // ── Targets & shadows ─────────────────────────────────────

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
        const alpha = L.SHADOW_ALPHA * (0.4 + pos.scale * 0.6);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = '#000';
        ctx.beginPath();
        ctx.ellipse(
            pos.x + L.SUN_DIR.x * size * 0.5,
            pos.y + size * 0.55,
            size * 0.45, size * 0.1, 0, 0, Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
    }

    // ── Particles ─────────────────────────────────────────────

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
                grad.addColorStop(0,   `rgba(160,130,90,${ratio * 0.7})`);
                grad.addColorStop(0.5, `rgba(130,100,60,${ratio * 0.4})`);
                grad.addColorStop(1,   'rgba(100,75,40,0)');
            }
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }
}
