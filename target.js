/**
 * target.js — Target state and behaviour only.
 * No canvas drawing — the Renderer manages 3D meshes.
 * Hit detection is handled by Three.js Raycaster in renderer.castRay().
 */

class Target {
    constructor(worldX, worldY, distance, type = 'static') {
        this.worldX   = worldX;
        this.worldY   = worldY;
        this.distance = distance;
        this.type     = type;

        const TC      = GAME_CONFIG.TARGET;
        this.baseSize = (type === 'micro') ? TC.MICRO_SIZE : TC.BASE_SIZE;

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

        // Strafe movement
        this.strafe = {
            active:  type === 'strafe',
            speed:   _rand(0.25, 0.45),
            dir:     Math.random() > 0.5 ? 1 : -1,
            originX: worldX
        };

        // Peek behaviour
        this.peek = this._initPeek(type);

        // Reaction timing
        this.reaction = { glowStart: 0, activeAt: 0, isGlowing: false };

        this.isActive = (type !== 'peek');
        this.isHit    = false;
    }

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

        // Update hit reaction timer (120ms duration)
        if (this.hitReaction?.active) {
            this.hitReaction.t += dt / 0.12;
            if (this.hitReaction.t >= 1.0) {
                this.hitReaction.active = false;
            }
        }
    }

    onHit(isCenterHit) {
        if (this.isFalling) return 0;
        this.isHit       = true;
        this.isFalling   = true;
        this.fallTimer   = 0;
        this.impactFlash = 1;
        this.fallVel     = isCenterHit ? 120 : 80;

        // Hit reaction state (consumed by renderer)
        this.hitReaction = {
            active:      true,
            t:           0,              // 0→1 over 120ms
            scaleStart:  1.18,           // pop scale
            knockbackZ:  0.15,           // backward nudge distance
        };

        let reactionMs = 0;
        if (this.reaction.activeAt > 0)
            reactionMs = performance.now() - this.reaction.activeAt;
        return reactionMs;
    }

    reset() {
        this.isHit       = false;
        this.isFalling   = false;
        this.fallAngle   = 0;
        this.fallVel     = 0;
        this.fallTimer   = 0;
        this.impactFlash = 0;
        this.reaction    = { glowStart: 0, activeAt: 0, isGlowing: false };

        if (this.strafe.active) this.worldX = this.strafe.originX;

        if (this.peek.active) {
            this.peek.phase     = 'hidden';
            this.peek.hiddenFor = 0;
            this.peek.upFor     = 0;
            this.worldY         = GAME_CONFIG.TARGET.PEEK.HIDDEN_Y;
            this.isActive       = false;
        }
    }

    _initPeek(type) {
        if (type !== 'peek') return { active: false };
        this.worldY = GAME_CONFIG.TARGET.PEEK.HIDDEN_Y;
        return { active: true, phase: 'hidden', hiddenFor: 0, upFor: 0 };
    }

    _updateFall(dt) {
        this.fallTimer += dt;
        this.fallVel   += GAME_CONFIG.TARGET.FALL_ACCEL * dt;
        this.fallAngle  = Math.max(-90, this.fallAngle - this.fallVel * dt);
    }

    _updateBehaviour(dt) {
        const TC = GAME_CONFIG.TARGET;

        if (this.strafe.active) {
            this.worldX += this.strafe.speed * this.strafe.dir * dt;
            if (this.worldX >= TC.STRAFE_BOUNDS.MAX) { this.worldX = TC.STRAFE_BOUNDS.MAX; this.strafe.dir = -1; }
            if (this.worldX <= TC.STRAFE_BOUNDS.MIN) { this.worldX = TC.STRAFE_BOUNDS.MIN; this.strafe.dir =  1; }
        }

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
                if (this.worldY >= 0) { this.worldY = 0; this.peek.phase = 'exposed'; this.peek.upFor = 0; this._startGlow(); }
                break;
            case 'exposed':
                this.peek.upFor += dt;
                if (this.reaction.isGlowing && performance.now() - this.reaction.glowStart >= PK.GLOW_MS) {
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
                if (this.worldY <= PK.HIDDEN_Y) { this.worldY = PK.HIDDEN_Y; this.peek.phase = 'hidden'; }
                break;
        }
    }

    _startGlow() {
        this.reaction.glowStart = performance.now();
        this.reaction.isGlowing = true;
        this.reaction.activeAt  = 0;
        this.isActive = false;
    }
}

function _rand(min, max) { return min + Math.random() * (max - min); }
