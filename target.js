/**
 * target.js — Steel plate target: rendering, movement, hit logic
 */

class Target {
    constructor(worldX, worldY, distance, type = 'static') {
        this.worldX   = worldX;
        this.worldY   = worldY;
        this.distance = distance;
        this.type     = type;

        const TC        = GAME_CONFIG.TARGET;
        this.baseSize   = (type === 'micro') ? TC.MICRO_SIZE : TC.BASE_SIZE;

        // Idle swing
        this.swingAngle = 0;
        this.swingSpeed = _rand(TC.SWING.SPEED[0], TC.SWING.SPEED[1]);
        this.swingAmp   = _rand(TC.SWING.AMP[0],   TC.SWING.AMP[1]);
        this.swingPhase = Math.random() * Math.PI * 2;

        // Fall animation
        this.isFalling   = false;
        this.fallAngle   = 0;
        this.fallVel     = 0;
        this.fallTimer   = 0;
        this.impactFlash = 0;

        // Movement (strafe)
        this.strafe = {
            active:    type === 'strafe',
            speed:     _rand(TC.STRAFE_BOUNDS.MIN < 0 ? 0.25 : 0, 0.45),
            dir:       Math.random() > 0.5 ? 1 : -1,
            originX:   worldX
        };

        // Peek behaviour
        this.peek = this._initPeek(type);

        // Reaction-time measurement
        this.reaction = { glowStart: 0, activeAt: 0, isGlowing: false };

        this.isActive = (type !== 'peek'); // Peek targets start inactive
        this.isHit    = false;
    }

    // ── Per-frame update ──────────────────────────────────────

    update(dt, totalTime) {
        if (this.isFalling) {
            this._updateFall(dt);
        } else {
            this._updateBehaviour(dt);
            if (this.isActive || !this.peek.active)
                this.swingAngle = Math.sin(totalTime * this.swingSpeed + this.swingPhase) * this.swingAmp;
        }

        if (this.impactFlash > 0)
            this.impactFlash = Math.max(0, this.impactFlash - dt * 5);
    }

    // ── Draw ──────────────────────────────────────────────────

    draw(ctx, game) {
        const pos  = game.worldToScreen(this.worldX, this.worldY, this.distance);
        const size = this.baseSize * pos.scale;

        ctx.save();
        ctx.translate(pos.x, pos.y);

        if (this.isFalling) {
            ctx.translate(0, size * 0.7 / 2);
            ctx.rotate(this.fallAngle * Math.PI / 180);
            ctx.translate(0, -size * 0.7 / 2);
        } else {
            ctx.rotate(this.swingAngle * Math.PI / 180);
        }

        ctx.globalAlpha = 0.5 + pos.scale * 0.5;

        if (this.reaction.isGlowing) this._drawGlow(ctx, size);
        this._drawLegs(ctx, size);
        this._drawPlate(ctx, size);
        if (this.impactFlash > 0) this._drawFlash(ctx, size);

        ctx.restore();

        // Fog overlay
        if (pos.fogAmount > 0) {
            const { r, g, b } = GAME_CONFIG.LIGHTING.FOG_COLOR;
            ctx.save();
            ctx.globalAlpha = pos.fogAmount * 0.6;
            ctx.fillStyle   = `rgb(${r},${g},${b})`;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, this.baseSize * pos.scale * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ── Hit detection ─────────────────────────────────────────

    checkHit(sx, sy, game) {
        if (this.isFalling && this.fallAngle < -45) return false;
        if (this.peek.active && !this.isActive) return false;

        const pos    = game.worldToScreen(this.worldX, this.worldY, this.distance);
        const radius = this.baseSize * pos.scale * 0.5;
        const dx = sx - pos.x, dy = sy - pos.y;
        return dx * dx + dy * dy <= radius * radius;
    }

    isCenterHit(sx, sy, game) {
        const pos    = game.worldToScreen(this.worldX, this.worldY, this.distance);
        const radius = this.baseSize * pos.scale * 0.5 * 0.3; // center zone = 30% radius
        const dx = sx - pos.x, dy = sy - pos.y;
        return dx * dx + dy * dy <= radius * radius;
    }

    /** Returns reaction time ms (0 if not measured) */
    onHit(isCenterHit) {
        if (this.isFalling) return 0;
        this.isHit       = true;
        this.isFalling   = true;
        this.fallTimer   = 0;
        this.impactFlash = 1;
        this.fallVel     = isCenterHit ? 120 : 80;

        let reactionMs = 0;
        if (this.reaction.activeAt > 0)
            reactionMs = performance.now() - this.reaction.activeAt;
        return reactionMs;
    }

    reset() {
        this.isHit    = false;
        this.isFalling = false;
        this.fallAngle = 0;
        this.fallVel   = 0;
        this.fallTimer = 0;
        this.impactFlash = 0;
        this.reaction  = { glowStart: 0, activeAt: 0, isGlowing: false };

        if (this.strafe.active) this.worldX = this.strafe.originX;

        if (this.peek.active) {
            this.peek.phase     = 'hidden';
            this.peek.hiddenFor = 0;
            this.peek.upFor     = 0;
            this.worldY         = GAME_CONFIG.TARGET.PEEK.HIDDEN_Y;
            this.isActive       = false;
        }
    }

    // ── Private ───────────────────────────────────────────────

    _initPeek(type) {
        if (type !== 'peek') return { active: false };
        this.worldY = GAME_CONFIG.TARGET.PEEK.HIDDEN_Y;
        return {
            active:    true,
            phase:     'hidden',
            hiddenFor: 0,
            upFor:     0
        };
    }

    _updateFall(dt) {
        this.fallTimer += dt;
        this.fallVel   += GAME_CONFIG.TARGET.FALL_ACCEL * dt;
        this.fallAngle  = Math.max(-90, this.fallAngle - this.fallVel * dt);
    }

    _updateBehaviour(dt) {
        const TC = GAME_CONFIG.TARGET;

        // Strafe
        if (this.strafe.active) {
            this.worldX += this.strafe.speed * this.strafe.dir * dt;
            if (this.worldX >= TC.STRAFE_BOUNDS.MAX) { this.worldX = TC.STRAFE_BOUNDS.MAX; this.strafe.dir = -1; }
            if (this.worldX <= TC.STRAFE_BOUNDS.MIN) { this.worldX = TC.STRAFE_BOUNDS.MIN; this.strafe.dir =  1; }
        }

        // Peek
        if (!this.peek.active) return;
        const PK = TC.PEEK;
        switch (this.peek.phase) {
            case 'hidden':
                this.isActive = false;
                this.peek.hiddenFor += dt;
                if (this.peek.hiddenFor >= PK.REST_S) { this.peek.phase = 'rising'; this.peek.hiddenFor = 0; }
                break;
            case 'rising':
                this.worldY += PK.RISE_SPEED * dt;
                if (this.worldY >= 0) {
                    this.worldY = 0;
                    this.peek.phase = 'exposed';
                    this.peek.upFor = 0;
                    this._startGlow();
                }
                break;
            case 'exposed':
                this.peek.upFor += dt;
                // Glow timing
                if (this.reaction.isGlowing &&
                    performance.now() - this.reaction.glowStart >= PK.GLOW_MS) {
                    this.reaction.isGlowing = false;
                    this.reaction.activeAt  = performance.now();
                    this.isActive = true;
                }
                if (this.peek.upFor >= PK.EXPOSE_S) this.peek.phase = 'dropping';
                break;
            case 'dropping':
                this.isActive = false;
                this.reaction.isGlowing = false;
                this.worldY -= PK.DROP_SPEED * dt;
                if (this.worldY <= PK.HIDDEN_Y) {
                    this.worldY = PK.HIDDEN_Y;
                    this.peek.phase = 'hidden';
                }
                break;
        }
    }

    _startGlow() {
        this.reaction.glowStart = performance.now();
        this.reaction.isGlowing = true;
        this.reaction.activeAt  = 0;
        this.isActive = false;
    }

    _drawLegs(ctx, size) {
        const legW = size * 0.08, legH = size * 0.7, spacing = size * 0.6;

        ctx.fillStyle   = '#2a2a2a';
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth   = 1;

        [[-1, 1], [1, -1]].forEach(([signA, signB]) => {
            const bx = signB < 0 ? -spacing / 2 : spacing / 2;
            ctx.beginPath();
            ctx.moveTo(bx - legW / 2, 0);
            ctx.lineTo(bx + legW / 2, 0);
            ctx.lineTo(bx + legW * 0.4 * signA, legH);
            ctx.lineTo(bx - legW * 0.4 * signA, legH);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        });

        // Cross brace
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth   = legW * 0.4;
        ctx.beginPath();
        ctx.moveTo(-spacing / 2, legH * 0.3);
        ctx.lineTo( spacing / 2, legH * 0.3);
        ctx.stroke();
    }

    _drawPlate(ctx, size) {
        const r = size * 0.5;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.arc(2, 2, r, 0, Math.PI * 2); ctx.fill();

        // Steel plate
        ctx.fillStyle   = '#f5f5f5';
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth   = 2;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        // Black edge ring
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth   = size * 0.08;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();

        // Red centre
        ctx.fillStyle = '#d32f2f';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();

        // Specular highlight
        const shine = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
        shine.addColorStop(0,   'rgba(255,255,255,0.4)');
        shine.addColorStop(0.5, 'rgba(255,255,255,0.1)');
        shine.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

        // Rivets
        this._drawRivets(ctx, r, size);
    }

    _drawRivets(ctx, r, size) {
        const n = 8, rr = size * 0.02;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const rx = Math.cos(a) * r * 0.85, ry = Math.sin(a) * r * 0.85;
            ctx.fillStyle = '#888';
            ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#aaa';
            ctx.beginPath(); ctx.arc(rx - rr * 0.3, ry - rr * 0.3, rr * 0.4, 0, Math.PI * 2); ctx.fill();
        }
    }

    _drawFlash(ctx, size) {
        const r    = size * 0.5;
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.5);
        grad.addColorStop(0,   `rgba(255,255,255,${this.impactFlash * 0.9})`);
        grad.addColorStop(0.3, `rgba(255,255,200,${this.impactFlash * 0.6})`);
        grad.addColorStop(0.6, `rgba(255,200,100,${this.impactFlash * 0.3})`);
        grad.addColorStop(1,   'rgba(255,150,50,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.fill();
    }

    _drawGlow(ctx, size) {
        const r       = size * 0.5;
        const elapsed = performance.now() - this.reaction.glowStart;
        const progress = elapsed / GAME_CONFIG.TARGET.PEEK.GLOW_MS;
        const pulse   = Math.sin(progress * Math.PI * 4) * 0.3 + 0.7;
        const alpha   = progress * pulse;

        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.8);
        grad.addColorStop(0,   `rgba(255,255,0,${alpha * 0.6})`);
        grad.addColorStop(0.4, `rgba(255,200,0,${alpha * 0.4})`);
        grad.addColorStop(1,   'rgba(255,100,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2); ctx.fill();
    }
}

// Small helper used internally
function _rand(min, max) { return min + Math.random() * (max - min); }
