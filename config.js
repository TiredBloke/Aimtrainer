/**
 * config.js — Central game constants
 * All magic numbers live here. Nothing else imports from here;
 * the global GAME_CONFIG object is available to every script.
 */

const GAME_CONFIG = {

    // ── Camera ────────────────────────────────────────────────
    CAMERA: {
        HORIZON_RATIO: 0.45,
        PERSPECTIVE_SCALE: 0.95
    },

    // ── Lighting & Fog ────────────────────────────────────────
    LIGHTING: {
        SUN_DIR: { x: 0.7, y: -0.7 }, // Normalised sun direction
        SHADOW_ALPHA: 0.3,
        FOG_COLOR: { r: 135, g: 206, b: 235 },
        FOG_NEAR: 0.5,   // Fog starts at 50% distance
        FOG_FAR:  1.0    // Full fog at horizon
    },

    // ── Particles ─────────────────────────────────────────────
    PARTICLES: {
        MAX: 50,
        SPARK: {
            COUNT:     [8, 12],   // [min, max]
            LIFE:      [0.3, 0.5],
            SIZE:      [2,   4],
            SPEED:     [50,  150],
            UP_BIAS:   50,        // Extra upward velocity
            GRAVITY:   300
        },
        DUST: {
            COUNT:     [5,  10],
            LIFE:      [0.4, 0.7],
            SIZE:      [3,   7],
            SPEED:     [30,  90],
            GRAVITY:   200,
            DRAG:      0.95
        }
    },

    // ── Targets ───────────────────────────────────────────────
    TARGET: {
        BASE_SIZE:  80,
        MICRO_SIZE: 40,
        RESET_DELAY: 0.8,    // Seconds on ground before respawn
        FALL_ACCEL:  180,    // Deg/s² when knocked back
        SWING: {
            SPEED: [0.8, 1.2],       // [min, max] Hz
            AMP:   [2,   5]          // [min, max] degrees
        },
        PEEK: {
            GLOW_MS:    500,  // Warning glow duration
            EXPOSE_S:   2.0,  // Time target stays up
            REST_S:     1.5,  // Time target hides before rising
            RISE_SPEED: 2.0,
            DROP_SPEED: 2.5,
            HIDDEN_Y:  -0.8
        },
        STRAFE_BOUNDS: { MIN: -0.8, MAX: 0.8 }
    },

    // ── Weapon ────────────────────────────────────────────────
    WEAPON: {
        FIRE_RATE_MS: 150,
        RECOIL: {
            KICK:     15,   // Per-shot kick (px)
            MAX:      80,
            RECOVERY: 60    // px/s
        },
        SPREAD: {
            BASE:     0,
            PER_SHOT: 8,
            MAX:      40,
            RECOVERY: 25    // px/s
        },
        CROSSHAIR: {
            SIZE_BASE: 20,
            SIZE_MAX:  35,
            THICKNESS: 2,
            GAP:       5
        },
        RAPID_FIRE: {
            WINDOW_MS:  500,
            MULTIPLIER_INC: 0.15,
            MULTIPLIER_MAX: 2.0
        }
    },

    // ── Audio ─────────────────────────────────────────────────
    AUDIO: {
        MASTER_VOLUME:    0.3,
        GUNSHOT_VOLUME:   0.8,
        METAL_HIT_VOLUME: 0.7,
        ECHO_THRESHOLD:   0.4  // Distance beyond which echo plays
    },

    // ── Training Presets ──────────────────────────────────────
    PRESETS: {
        flick: {
            name: 'Flick Training',
            description: 'Large angles, single target, fast respawn',
            timerS: 60,
            count: 1,
            spawnDelayS: 0.3,
            spawnRadius: 0.7,
            distances: [0.4, 0.5, 0.6, 0.7]
        },
        tracking: {
            name: 'Tracking Training',
            description: 'Follow moving targets, smooth pursuit',
            timerS: 60,
            count: 3,
            speeds: [0.25, 0.35, 0.45],
            distances: [0.35, 0.45, 0.55]
        },
        'micro-adjust': {
            name: 'Micro-Adjustment',
            description: 'Tiny clustered targets, precision aiming',
            timerS: 90,
            count: 3,
            spawnRadius: 0.3,
            distances: [0.5, 0.6, 0.7]
        }
    },

    // ── Drill Layouts ─────────────────────────────────────────
    DRILLS: {
        static: [
            { x: -0.3, y: 0, d: 0.10 },
            { x:  0.4, y: 0, d: 0.25 },
            { x:  0.0, y: 0, d: 0.45 },
            { x: -0.5, y: 0, d: 0.60 },
            { x:  0.3, y: 0, d: 0.80 }
        ],
        strafe: [
            { x: -0.5, y: 0, d: 0.3 },
            { x:  0.4, y: 0, d: 0.4 },
            { x: -0.3, y: 0, d: 0.6 },
            { x:  0.6, y: 0, d: 0.7 },
            { x:  0.0, y: 0, d: 0.5 }
        ],
        peek: [
            { x: -0.6, y: 0, d: 0.35 },
            { x: -0.2, y: 0, d: 0.45 },
            { x:  0.2, y: 0, d: 0.5  },
            { x:  0.6, y: 0, d: 0.55 },
            { x:  0.0, y: 0, d: 0.65 }
        ],
        micro: [
            { x: -0.4, y: 0, d: 0.7  },
            { x:  0.4, y: 0, d: 0.75 },
            { x:  0.0, y: 0, d: 0.8  },
            { x: -0.6, y: 0, d: 0.65 },
            { x:  0.6, y: 0, d: 0.7  },
            { x:  0.2, y: 0, d: 0.85 }
        ]
    },

    // ── Colors ────────────────────────────────────────────────
    COLORS: {
        SKY:    ['#1e3a5f', '#4a7ba7', '#87CEEB'],
        GROUND: ['#9B8368', '#7A6450', '#4A3C2F']
    }
};
