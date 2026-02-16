/**
 * crosshair.js — Crosshair preset selector and renderer
 * Loads/saves to localStorage. Draws on the HUD canvas.
 */

const CrosshairSettings = (() => {
    const STORAGE_KEY = 'aimtrainer_crosshair';

    const PRESETS = ['dot', 'small_cross', 'large_cross', 'ring', 'cross_gap'];
    const COLORS  = {
        white:  'rgba(255,255,255,0.92)',
        green:  'rgba(0,255,120,0.92)',
        cyan:   'rgba(0,220,255,0.92)',
        yellow: 'rgba(255,230,0,0.92)',
        pink:   'rgba(255,80,180,0.92)',
    };

    let _preset = 'cross_gap';
    let _color  = 'white';

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const d = JSON.parse(raw);
                if (PRESETS.includes(d.preset)) _preset = d.preset;
                if (COLORS[d.color])            _color  = d.color;
            }
        } catch(e) {}
    }

    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: _preset, color: _color })); }
        catch(e) {}
    }

    function set(preset, color) {
        if (preset && PRESETS.includes(preset)) _preset = preset;
        if (color  && COLORS[color])            _color  = color;
        save();
    }

    function draw(ctx, cx, cy, spreadRatio = 0) {
        const col     = COLORS[_color];
        const outline = 'rgba(0,0,0,0.65)';

        ctx.save();
        ctx.lineCap = 'round';

        switch (_preset) {
            case 'dot': {
                const r = 2.5;
                ctx.fillStyle = outline;
                ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = col;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case 'small_cross': {
                const s = 5, t = 1.5;
                _drawCross(ctx, cx, cy, s, t, col, outline, 0);
                break;
            }
            case 'large_cross': {
                const s = 12, t = 2;
                _drawCross(ctx, cx, cy, s, t, col, outline, 0);
                break;
            }
            case 'ring': {
                const r = 9, t = 1.8;
                ctx.lineWidth   = t + 2;
                ctx.strokeStyle = outline;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
                ctx.lineWidth   = t;
                ctx.strokeStyle = col;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
                // centre dot
                ctx.fillStyle = col;
                ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case 'cross_gap': {
                // Dynamic gap expands with spread
                const s   = 8 + spreadRatio * 10;
                const gap = 4 + spreadRatio * 8;
                const t   = 1.8;
                _drawCrossGap(ctx, cx, cy, s, gap, t, col, outline);
                break;
            }
        }

        ctx.restore();
    }

    function _drawCross(ctx, cx, cy, size, thickness, col, outline, gap) {
        [[cx, cy - size, cx, cy + size], [cx - size, cy, cx + size, cy]].forEach(([x1,y1,x2,y2]) => {
            ctx.lineWidth   = thickness + 2;
            ctx.strokeStyle = outline;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.lineWidth   = thickness;
            ctx.strokeStyle = col;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        });
    }

    function _drawCrossGap(ctx, cx, cy, size, gap, thickness, col, outline) {
        const arms = [
            [cx, cy - gap - size, cx, cy - gap],
            [cx, cy + gap,        cx, cy + gap + size],
            [cx - gap - size, cy, cx - gap, cy],
            [cx + gap,        cy, cx + gap + size, cy],
        ];
        arms.forEach(([x1,y1,x2,y2]) => {
            ctx.lineWidth   = thickness + 2;
            ctx.strokeStyle = outline;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.lineWidth   = thickness;
            ctx.strokeStyle = col;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        });
    }

    // Public API
    load();
    return {
        draw,
        set,
        get preset() { return _preset; },
        get color()  { return _color;  },
        PRESETS,
        COLORS,
    };
})();
