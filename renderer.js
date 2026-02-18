/**
 * renderer.js — Three.js 3D renderer
 *
 * Renders the 3D scene: sky (procedural shader), ground plane, targets.
 * A separate 2D HUD canvas handles the crosshair.
 * Hit detection uses THREE.Raycaster.
 */

class Renderer {
    constructor(game) {
        this.game    = game;
        this.targets3d = new Map(); // Target instance → THREE.Mesh
        this.hitParticles = [];     // Active hit particles

        this._initThree();
        this._initScene();
        this._initHUD();

        window.addEventListener('resize', () => this._onResize());
    }

    // ── Init ──────────────────────────────────────────────────

    _initThree() {
        const canvas = document.getElementById('gameCanvas');

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled  = true;
        this.renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
        // PBR rendering setup
        this.renderer.physicallyCorrectLights  = true;
        this.renderer.outputColorSpace         = THREE.SRGBColorSpace;
        this.renderer.toneMapping              = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure      = 1.0;
        // Clock for wind animation
        this.clock = new THREE.Clock();
        this.windUniforms = [];   // collect all wind uniforms for update in render()

        // Perspective camera — FOV 75, matches a typical FPS feel
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.01,
            2000
        );
        // Eye height ~1.6m, looking straight down the range
        this.camera.position.set(0, 1.6, 0);
        this.camera.lookAt(0, 1.6, -100);

        this.scene = new THREE.Scene();
    }

    _initScene() {
        this._buildSky();
        this._buildGround();
        this._buildLighting();
        this._buildEnvMap();
        this._buildFog();
        this._buildFoliage();
    }

    _buildSky() {
        const skyGeo = new THREE.SphereGeometry(800, 32, 15);

        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor:    { value: new THREE.Color(0x0d2b4e) },
                midColor:    { value: new THREE.Color(0x1a6090) },
                horizonColor:{ value: new THREE.Color(0x9dd4f0) },
                sunDir:      { value: new THREE.Vector3(-0.55, 0.55, 0.62).normalize() },
                sunColor:    { value: new THREE.Color(1.0, 0.88, 0.25) },
                sunSize:     { value: 0.9997 },
                sunGlowSize: { value: 0.992 },
            },
            vertexShader: `
                varying vec3 vWorldPos;
                void main() {
                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3  topColor;
                uniform vec3  midColor;
                uniform vec3  horizonColor;
                uniform vec3  sunDir;
                uniform vec3  sunColor;
                uniform float sunSize;
                uniform float sunGlowSize;

                varying vec3 vWorldPos;

                void main() {
                    vec3 dir = normalize(vWorldPos);

                    float h = dir.y;
                    vec3 sky;
                    if (h > 0.0) {
                        sky = mix(horizonColor, mix(midColor, topColor, h), h);
                    } else {
                        sky = horizonColor;
                    }

                    float cosAngle = dot(dir, normalize(sunDir));
                    float sun  = smoothstep(sunSize, sunSize + 0.0001, cosAngle);
                    float glow = smoothstep(sunGlowSize - 0.008, sunGlowSize, cosAngle) * 0.45;
                    vec3 col = sky + sunColor * (sun * 2.0 + glow);

                    float haze = 1.0 - smoothstep(-0.05, 0.15, h);
                    col = mix(col, horizonColor * 1.2, haze * 0.55);

                    gl_FragColor = vec4(col, 1.0);
                }
            `,
            side: THREE.BackSide
        });

        this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyMesh);
        this._buildClouds();
    }

    _buildClouds() {
        // Generate soft cloud texture on a canvas
        const makeCloudTex = (w, h) => {
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const cx = cv.getContext('2d');
            // Several overlapping soft blobs
            const blobs = [
                [w*0.5, h*0.55, w*0.38],
                [w*0.32, h*0.62, w*0.26],
                [w*0.68, h*0.60, w*0.28],
                [w*0.50, h*0.40, w*0.22],
                [w*0.20, h*0.68, w*0.18],
                [w*0.80, h*0.66, w*0.20],
            ];
            blobs.forEach(([bx, by, r]) => {
                const g = cx.createRadialGradient(bx, by, 0, bx, by, r);
                g.addColorStop(0,   'rgba(255,255,255,0.9)');
                g.addColorStop(0.4, 'rgba(245,248,255,0.7)');
                g.addColorStop(0.75,'rgba(230,240,255,0.3)');
                g.addColorStop(1,   'rgba(220,235,255,0)');
                cx.fillStyle = g;
                cx.beginPath();
                cx.ellipse(bx, by, r, r * 0.55, 0, 0, Math.PI * 2);
                cx.fill();
            });
            return new THREE.CanvasTexture(cv);
        };

        const cloudDefs = [
            { x: -180, y: 80, z: -350, sx: 220, sy: 60 },
            { x:   60, y: 90, z: -420, sx: 180, sy: 50 },
            { x: -60,  y: 70, z: -280, sx: 260, sy: 70 },
            { x:  200, y: 85, z: -380, sx: 150, sy: 45 },
            { x: -280, y: 95, z: -460, sx: 200, sy: 55 },
        ];

        cloudDefs.forEach(d => {
            const tex = makeCloudTex(512, 256);
            const mat = new THREE.MeshBasicMaterial({
                map: tex, transparent: true, depthWrite: false,
                opacity: 0.88, side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.sx, d.sy), mat);
            mesh.position.set(d.x, d.y, d.z);
            mesh.lookAt(0, d.y, 0); // Face the centre
            this.scene.add(mesh);
        });
    }

    _buildGround() {
        // Large ground plane
        const geo = new THREE.PlaneGeometry(2000, 2000, 80, 80);

        // Procedural ground texture
        const texSize = 1024;
        const cv = document.createElement('canvas');
        cv.width = cv.height = texSize;
        const cx = cv.getContext('2d');

        // Base dirt colour - dark earthy brown
        const grad = cx.createLinearGradient(0, 0, 0, texSize);
        grad.addColorStop(0,    '#6b4e2a');
        grad.addColorStop(0.3,  '#5a3e1e');
        grad.addColorStop(1,    '#3a2810');
        cx.fillStyle = grad;
        cx.fillRect(0, 0, texSize, texSize);

        // Noise-like dirt variation
        for (let i = 0; i < 8000; i++) {
            const x = Math.random() * texSize;
            const y = Math.random() * texSize;
            const r = Math.random() * 6 + 1;
            const b = Math.random() * 30 - 15;
            const lum = 100 + b;
            cx.fillStyle = `rgba(${lum + 20},${lum},${lum - 20},0.18)`;
            cx.beginPath();
            cx.ellipse(x, y, r, r * 0.5, Math.random() * Math.PI, 0, Math.PI * 2);
            cx.fill();
        }

        // Subtle patchy grass variation
        for (let i = 0; i < 300; i++) {
            const x = Math.random() * texSize;
            const y = Math.random() * texSize;
            const r = Math.random() * 8 + 2;
            cx.fillStyle = `rgba(${40 + Math.random()*20},${65 + Math.random()*25},${15 + Math.random()*15},0.12)`;
            cx.beginPath();
            cx.ellipse(x, y, r, r * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
            cx.fill();
        }

        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(40, 40);

        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1.0, metalness: 0.0 });
        const ground = new THREE.Mesh(geo, mat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Range distance markers (poles at 10m, 25m, 50m, 100m)
        [10, 25, 50, 100].forEach(dist => {
            this._addDistanceMarker(dist);
        });
    }

    _addDistanceMarker(dist) {
        // Small post with distance label texture
        const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6);
        const postMat = new THREE.MeshStandardMaterial({ color: 0xddcc88, roughness: 0.9, metalness: 0.0 });
        const post    = new THREE.Mesh(postGeo, postMat);
        post.position.set(-14, 0.6, -dist);
        post.castShadow = true;
        this.scene.add(post);

        // Label
        const cv = document.createElement('canvas');
        cv.width = 128; cv.height = 64;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#ddcc88';
        cx.fillRect(0, 0, 128, 64);
        cx.fillStyle = '#222';
        cx.font = 'bold 28px Arial';
        cx.textAlign = 'center';
        cx.fillText(`${dist}m`, 64, 42);
        const tex = new THREE.CanvasTexture(cv);
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.3),
            new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
        );
        sign.position.set(-14, 1.35, -dist);
        this.scene.add(sign);
    }

    _buildLighting() {
        // PBR directional sun — position matches sky shader sun direction
        const sun = new THREE.DirectionalLight(0xfff4d0, 1.2);
        sun.position.set(10, 20, 10);
        sun.castShadow = true;
        sun.shadow.mapSize.width  = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near   = 0.5;
        sun.shadow.camera.far    = 500;
        sun.shadow.camera.left   = -100;
        sun.shadow.camera.right  =  100;
        sun.shadow.camera.top    =  100;
        sun.shadow.camera.bottom = -100;
        sun.shadow.bias = -0.001;
        this.scene.add(sun);

        // Hemisphere — sky/ground bounce, physically motivated
        const hemi = new THREE.HemisphereLight(0xbfdfff, 0x8b7355, 0.6);
        this.scene.add(hemi);
    }

    _buildEnvMap() {
        // Generate a minimal PMREM environment from the sky/ground colours.
        // Works in Three.js r128 — no RoomEnvironment needed.
        // Gives MeshStandardMaterial objects subtle sky-tinted reflections.
        const pmrem    = new THREE.PMREMGenerator(this.renderer);
        pmrem.compileEquirectangularShader();

        // Build a tiny scene: sky hemisphere above, warm ground below
        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(0x9dd4f0);  // horizon sky

        // Sky dome light baked into the env
        envScene.add(new THREE.HemisphereLight(0xbfdfff, 0x8b7355, 1.0));

        const envTex = pmrem.fromScene(envScene).texture;
        this.scene.environment = envTex;
        pmrem.dispose();
    }

    _buildFog() {
        // Match horizon colour exactly so distant trees fade into sky naturally
        this.scene.fog = new THREE.FogExp2(0x9dd4f0, 0.010);
    }

    _buildFoliage() {
        // ── Billboard tree system ─────────────────────────────
        // Two crossed alpha-cutout planes per tree, always facing camera.
        // Technique used by real engines for mid/far distance trees.
        // Result: proper silhouette, branch layers, depth from any angle.

        this.billboardTrees = [];  // { group, phase, baseY } for render-loop updates

        // ── 1. Paint the tree texture ─────────────────────────
        const makeTreeTexture = (seed) => {
            const W = 256, H = 512;
            const cv = document.createElement('canvas');
            cv.width = W; cv.height = H;
            const cx = cv.getContext('2d');

            const rng = (() => {
                let s = seed * 9301 + 49297;
                return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
            })();

            cx.clearRect(0, 0, W, H);
            const mid = W / 2;

            // ── Trunk first (painted under foliage) ──
            const trunkTop = H * 0.12;
            const trunkBot = H * 0.99;
            const twTop = W * 0.018;
            const twBot = W * 0.032;
            // Two-tone trunk: lighter left edge, darker right (light from upper-left)
            const tg = cx.createLinearGradient(mid - twBot, 0, mid + twBot, 0);
            tg.addColorStop(0,   '#3d2010');
            tg.addColorStop(0.3, '#5a3018');
            tg.addColorStop(0.7, '#3a1c0a');
            tg.addColorStop(1,   '#1e0d04');
            cx.fillStyle = tg;
            cx.beginPath();
            cx.moveTo(mid - twTop, trunkTop);
            cx.lineTo(mid + twTop, trunkTop);
            cx.lineTo(mid + twBot, trunkBot);
            cx.lineTo(mid - twBot, trunkBot);
            cx.closePath();
            cx.fill();

            // ── Branch layers bottom-to-top ──
            // Each layer: irregular teardrop built with bezier curves
            // Vertical spacing is irregular (not evenly spaced)
            const layers = 11;
            // Pre-compute irregular Y positions so layers cluster more at mid
            const layerYs = [];
            for (let i = 0; i < layers; i++) {
                const t = i / (layers - 1);
                // Non-linear: layers bunch toward top where crown is denser
                const raw = H * 0.90 - Math.pow(t, 0.75) * H * 0.82;
                layerYs.push(raw + (rng() - 0.5) * H * 0.04);
            }
            layerYs.sort((a, b) => b - a); // ensure bottom-up order

            for (let i = 0; i < layers; i++) {
                const t    = i / (layers - 1);          // 0=bottom, 1=top
                const yMid = layerYs[i];
                // Width narrows toward tip, with per-layer random variation
                const maxW = W * (0.44 - t * 0.32) * (0.82 + rng() * 0.36);
                // Height of each tier (flatter at bottom, pointer at top)
                const tierH = H * (0.11 + (1 - t) * 0.06) * (0.8 + rng() * 0.4);
                // Asymmetric lean: left side slightly different from right
                const leanX = (rng() - 0.5) * W * 0.06;

                // Colour: dark shadowed green at base → warm bright at top
                // Bottom layers are darker (lit from above, shadowed underneath)
                const green = Math.floor(52 + t * 68 + rng() * 14);
                const red   = Math.floor(10 + t * 30 + rng() * 12);
                const blue  = Math.floor(6  + t * 14 + rng() * 6);

                // ── Draw the tier as a bezier-edged shape ──
                // This gives organic curved branch tips instead of straight lines
                cx.beginPath();

                // Tip point (slightly off-centre for asymmetry)
                const tipX = mid + leanX * 0.5;
                const tipY = yMid - tierH * 0.85;
                cx.moveTo(tipX, tipY);

                // Right side: tip → two bezier bumps → base-right
                // Each bump is a branch cluster
                const bumps = 2 + Math.floor(rng() * 2);
                for (let b = 0; b < bumps; b++) {
                    const bt  = (b + 1) / (bumps + 1);
                    const bx  = mid + leanX + maxW * bt;
                    const by  = yMid - tierH * (0.3 - bt * 0.25) + rng() * tierH * 0.2;
                    const cpx = mid + leanX + maxW * (bt - 0.5 / bumps) + rng() * maxW * 0.15;
                    const cpy = by - tierH * (0.2 + rng() * 0.25);
                    cx.quadraticCurveTo(cpx, cpy, bx, by);
                }
                // Curve into right base
                cx.quadraticCurveTo(
                    mid + leanX + maxW * 0.15, yMid + tierH * 0.3,
                    mid + leanX + maxW * 0.08, yMid + tierH * 0.4
                );

                // Base — slight downward droop (branches droop under gravity)
                cx.quadraticCurveTo(
                    mid + leanX, yMid + tierH * 0.55,
                    mid - leanX, yMid + tierH * 0.55
                );

                // Left side (mirror with independent rng)
                cx.quadraticCurveTo(
                    mid - leanX - maxW * 0.15, yMid + tierH * 0.3,
                    mid - leanX - maxW * 0.08, yMid + tierH * 0.4
                );
                for (let b = bumps - 1; b >= 0; b--) {
                    const bt  = (b + 1) / (bumps + 1);
                    const bx  = mid - leanX - maxW * bt;
                    const by  = yMid - tierH * (0.3 - bt * 0.25) + rng() * tierH * 0.2;
                    const cpx = mid - leanX - maxW * (bt - 0.5 / bumps) - rng() * maxW * 0.15;
                    const cpy = by - tierH * (0.2 + rng() * 0.25);
                    cx.quadraticCurveTo(cpx, cpy, bx, by);
                }
                cx.closePath();

                // Base fill
                cx.fillStyle = `rgb(${red},${green},${blue})`;
                cx.fill();

                // Top-lit highlight: lighter upper surface (light from above-left)
                const hlg = cx.createLinearGradient(mid - maxW, tipY, mid + maxW * 0.4, yMid);
                hlg.addColorStop(0,   `rgba(${Math.min(red+35,255)},${Math.min(green+40,255)},${Math.min(blue+18,255)},0.55)`);
                hlg.addColorStop(0.5, `rgba(${Math.min(red+15,255)},${Math.min(green+18,255)},${blue+5},0.20)`);
                hlg.addColorStop(1,   'rgba(0,0,0,0)');
                cx.fillStyle = hlg;
                cx.fill();

                // Underside shadow: dark band under each tier (AO-like)
                const shg = cx.createLinearGradient(0, yMid + tierH * 0.1, 0, yMid + tierH * 0.55);
                shg.addColorStop(0, 'rgba(0,0,0,0.42)');
                shg.addColorStop(1, 'rgba(0,0,0,0)');
                cx.fillStyle = shg;
                cx.fill();

                // Interior trunk shadow where branch meets trunk
                const tsg = cx.createRadialGradient(mid, yMid, 0, mid, yMid, maxW * 0.25);
                tsg.addColorStop(0,   'rgba(0,0,0,0.30)');
                tsg.addColorStop(1,   'rgba(0,0,0,0)');
                cx.fillStyle = tsg;
                cx.fill();
            }

            // Overdraw trunk on top so it shows through canopy gaps
            cx.fillStyle = tg;
            cx.beginPath();
            cx.moveTo(mid - twTop, trunkTop);
            cx.lineTo(mid + twTop, trunkTop);
            cx.lineTo(mid + twBot, trunkBot);
            cx.lineTo(mid - twBot, trunkBot);
            cx.closePath();
            cx.fill();

            const tex = new THREE.CanvasTexture(cv);
            tex.needsUpdate = true;
            return tex;
        };

        // Pre-generate a small pool of varied textures to avoid clones
        const texPool = [0,1,2,3,4,5,6].map(s => makeTreeTexture(s * 1337 + 42));

        // ── 2. Contact shadow (kept from before) ─────────────
        const shadowTex = (() => {
            const size = 128;
            const cv   = document.createElement('canvas');
            cv.width = cv.height = size;
            const cx   = cv.getContext('2d');
            const mid  = size / 2;
            const grad = cx.createRadialGradient(mid, mid, 0, mid, mid, mid);
            grad.addColorStop(0.00, 'rgba(0,0,0,0.30)');
            grad.addColorStop(0.35, 'rgba(0,0,0,0.14)');
            grad.addColorStop(0.70, 'rgba(0,0,0,0.04)');
            grad.addColorStop(1.00, 'rgba(0,0,0,0.00)');
            cx.fillStyle = grad;
            cx.fillRect(0, 0, size, size);
            return new THREE.CanvasTexture(cv);
        })();
        const shadowMat = new THREE.MeshBasicMaterial({
            map: shadowTex, transparent: true,
            opacity: 1.0, depthWrite: false,
            blending: THREE.MultiplyBlending,
        });

        // ── 3. addTree function ───────────────────────────────
        const addTree = (x, z, height = 1, width = 1) => {
            const g = new THREE.Group();

            // Contact shadow disc
            const sh = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                shadowMat
            );
            sh.rotation.x = -Math.PI / 2;
            sh.position.y = 0.02;
            sh.scale.set(width * 2.8, width * 2.8, 1);
            g.add(sh);

            // Pick a texture from the pool
            const tex = texPool[Math.floor(Math.random() * texPool.length)];
            const mat = new THREE.MeshStandardMaterial({
                map:          tex,
                alphaTest:    0.38,      // hard cutout — no blending artefacts
                transparent:  false,
                roughness:    0.95,
                metalness:    0.0,
                side:         THREE.DoubleSide,
            });

            // Tree proportions
            const tH = (7.0 + Math.random() * 4.0) * height;
            const tW = tH * (0.38 + Math.random() * 0.10) * width;

            // Two crossed planes (X shape) — gives depth from all angles
            [0, Math.PI / 2].forEach(angle => {
                const plane = new THREE.Mesh(
                    new THREE.PlaneGeometry(tW, tH),
                    mat
                );
                plane.rotation.y = angle;
                plane.position.y = tH / 2;
                plane.castShadow  = true;
                plane.receiveShadow = false;
                g.add(plane);
            });

            // Slight random lean
            g.rotation.x = (Math.random() - 0.5) * 0.06;
            g.rotation.z = (Math.random() - 0.5) * 0.06;
            g.position.set(x, 0, z);
            this.scene.add(g);

            // Register for wind update in render loop
            this.billboardTrees.push({
                group:  g,
                phase:  Math.random() * Math.PI * 2,
                baseRX: g.rotation.x,
                baseRZ: g.rotation.z,
            });
        };

        const addBush = (x, z, scale = 1) => {
            const col = new THREE.Color(
                0.10 + Math.random() * 0.06,
                0.26 + Math.random() * 0.10,
                0.03 + Math.random() * 0.03
            );
            [0, 1].forEach(i => {
                const mesh = new THREE.Mesh(
                    new THREE.SphereGeometry(scale * (0.28 + Math.random() * 0.18), 6, 4),
                    new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, metalness: 0.0 })
                );
                mesh.scale.y = 0.60;
                mesh.position.set(
                    x + (Math.random() - 0.5) * scale * 0.5,
                    scale * 0.26,
                    z + (Math.random() - 0.5) * scale * 0.5
                );
                this.scene.add(mesh);
            });
        };

        // ── 4. Place trees ────────────────────────────────────
        const leftX  = -20;
        const rightX =  20;
        const depths = [8, 14, 20, 28, 36, 44, 52, 62, 75, 90, 110, 130];

        depths.forEach((d, i) => {
            const jx  = (Math.random() - 0.5) * 4;
            const jz  = (Math.random() - 0.5) * 3;
            const hL  = 0.82 + Math.random() * 0.38;
            const wL  = 0.87 + Math.random() * 0.28;
            const hR  = 0.82 + Math.random() * 0.38;
            const wR  = 0.87 + Math.random() * 0.28;

            addTree(leftX  + jx,       -d + jz, hL, wL);
            addTree(rightX - jx,       -d - jz, hR, wR);

            if (i % 3 === 0) {
                addTree(leftX  + jx - 4, -d - 4, hL * 0.72, wL * 0.82);
                addTree(rightX - jx + 4, -d - 4, hR * 0.72, wR * 0.82);
            }
        });

        for (let z = -5; z > -140; z -= 5) {
            const s = 0.30 + Math.random() * 0.40;
            if (Math.random() > 0.40) addBush(leftX  + (Math.random() - 0.5) * 5, z, s);
            if (Math.random() > 0.40) addBush(rightX + (Math.random() - 0.5) * 5, z, s);
        }
    }

            // ── Target management ─────────────────────────────────────

    /** Call every frame — syncs 3D meshes with game target list */
    syncTargets() {
        const game    = this.game;
        const current = new Set(game.targets);

        // Remove meshes for targets no longer in game
        this.targets3d.forEach((group, target) => {
            if (!current.has(target)) {
                // Start despawn animation instead of instant removal
                if (!group.userData.despawnAnim.active) {
                    console.log('DESPAWN STARTED for target at', target.worldX, target.distance);
                    group.userData.despawnAnim.active = true;
                    group.userData.despawnAnim.t = 0;
                }
            }
        });

        // Add meshes for new targets
        game.targets.forEach(target => {
            if (!this.targets3d.has(target)) {
                const mesh = this._makeTargetMesh(target);
                this.scene.add(mesh);
                this.targets3d.set(target, mesh);
            }
        });

        // Update all target mesh positions/rotations
        game.targets.forEach(target => {
            const group = this.targets3d.get(target);
            if (!group) return;

            const disc = group.children[0];

            const x =  target.worldX * 10;
            const z = -(5 + target.distance * 45);
            const y =  0.8 + target.worldY * 3;

            // Hit reaction: scale pop + knockback
            let finalScale = target.baseSize / GAME_CONFIG.TARGET.BASE_SIZE;
            let knockbackOffset = 0;

            if (target.hitReaction?.active) {
                const t  = Math.min(target.hitReaction.t, 1.0);
                // Ease-out cubic: 1 - (1-t)^3
                const ease = 1 - Math.pow(1 - t, 3);
                // Scale: 1.18 → 1.0
                const reactScale = target.hitReaction.scaleStart + (1.0 - target.hitReaction.scaleStart) * ease;
                finalScale *= reactScale;
                // Knockback: 0.15 → 0
                knockbackOffset = target.hitReaction.knockbackZ * (1 - ease);
            }

            group.position.set(x, y, z + knockbackOffset);
            group.scale.setScalar(finalScale);

            if (target.isFalling) {
                group.rotation.x = target.fallAngle * Math.PI / 180;
                group.rotation.z = 0;
                // DEBUG: log first few frames of fall
                if (target.fallAngle > -5) {
                    console.log('FALL: angle=' + target.fallAngle.toFixed(2) + ', rotation.x=' + group.rotation.x.toFixed(3));
                }
            } else {
                group.rotation.x = 0;
                group.rotation.z = target.swingAngle * Math.PI / 180;
            }

            // Impact flash — bright orange fade
            if (target.impactFlash > 0) {
                const f = target.impactFlash;
                disc.material.emissive.setRGB(f, f * 0.67, 0); // 0xffaa00 scaled by flash
            } else {
                disc.material.emissive.setRGB(0, 0, 0);
            }

            if (target.reaction?.isGlowing) {
                disc.material.emissive.setRGB(0.4, 0.3, 0.0);
            }

            // Shadow blob — tracks target X/Z, stays at ground height
            const shadow = group.children[1];
            if (shadow) {
                // Position shadow on ground directly below target
                shadow.position.x = 0;  // relative to group, so 0
                shadow.position.y = -y; // offset from group Y to reach ground
                shadow.position.z = 0;

                // Spawn animation: scale 0.3 → 1.0 over 120ms
                if (group.userData.spawnAnim.active) {
                    const t    = Math.min(group.userData.spawnAnim.t, 1.0);
                    const ease = t * t * (3 - 2 * t); // smoothstep
                    const s    = 0.3 + (1.0 - 0.3) * ease;
                    shadow.scale.setScalar(s);
                    if (t >= 1.0) {
                        group.userData.spawnAnim.active = false;
                    }
                }
            }
        });

        // Update despawn animations and cleanup
        this.targets3d.forEach((group, target) => {
            if (!group.userData.despawnAnim.active) return;

            const shadow = group.children[1];
            const t      = group.userData.despawnAnim.t;

            if (shadow) {
                shadow.material.opacity = 0.18 * (1 - t);
            }

            if (t >= 1.0) {
                console.log('DESPAWN COMPLETE - removing mesh for target');
                this.scene.remove(group);
                this.targets3d.delete(target);
                // Dispose geometries and materials
                group.traverse(obj => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (obj.material.map) obj.material.map.dispose();
                        obj.material.dispose();
                    }
                });
            } else {
                if (Math.random() < 0.1) { // log occasionally
                    console.log('DESPAWN animating: t=' + t.toFixed(2));
                }
            }
        });
    }

    _makeTargetMesh(target) {
        // Use a Group so we can bake the disc orientation separately
        // from the game-driven fall/swing rotations
        const group = new THREE.Group();

        const radius    = 0.8;
        const thickness = 0.04;
        const geo = new THREE.CylinderGeometry(radius, radius, thickness, 64);
        const tex = this._makeTargetTexture(target.type === 'micro');
        const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, metalness: 0.0 });

        const disc = new THREE.Mesh(geo, mat);
        // Bake: rotate disc so its face points toward +Z (camera direction)
        disc.rotation.x = Math.PI / 2;
        disc.castShadow = true;

        group.add(disc);

        // Ground shadow blob
        const shadowRadius = radius * 1.3;  // slightly larger than target
        const shadowGeo    = new THREE.CircleGeometry(shadowRadius, 24);
        const shadowMat    = new THREE.MeshBasicMaterial({
            color:       0x000000,
            transparent: true,
            opacity:     0.18,
            depthWrite:  false,
        });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;  // flat on ground
        shadow.renderOrder = -1;           // draw before other objects to avoid z-fighting
        group.add(shadow);

        // Track spawn animation state on the group itself
        group.userData.spawnAnim = {
            active: true,
            t:      0,   // 0→1 over 120ms
        };
        group.userData.despawnAnim = {
            active: false,
            t:      0,
        };

        return group;
    }

    _makeTargetTexture(isMicro) {
        const size = 512;
        const cv   = document.createElement('canvas');
        cv.width = cv.height = size;
        const cx = cv.getContext('2d');
        const c  = size / 2;
        const r  = size / 2 - 4;

        // Classic bullseye rings: white, black, white, black, red
        const rings = [
            { r: 1.00, color: '#1a1a1a' },  // outer black ring
            { r: 0.90, color: '#f5f5f5' },  // white
            { r: 0.75, color: '#1a1a1a' },  // black
            { r: 0.58, color: '#f5f5f5' },  // white
            { r: 0.42, color: '#1a1a1a' },  // black
            { r: 0.28, color: '#f5f5f5' },  // white
            { r: 0.16, color: '#cc2222' },  // red bull
        ];

        rings.forEach(ring => {
            cx.fillStyle = ring.color;
            cx.beginPath();
            cx.arc(c, c, r * ring.r, 0, Math.PI * 2);
            cx.fill();
        });

        // X crosshair lines (subtle)
        cx.strokeStyle = 'rgba(0,0,0,0.15)';
        cx.lineWidth   = 2;
        cx.beginPath(); cx.moveTo(c, c - r); cx.lineTo(c, c + r); cx.stroke();
        cx.beginPath(); cx.moveTo(c - r, c); cx.lineTo(c + r, c); cx.stroke();

        // Specular shine
        const shine = cx.createRadialGradient(c - r*0.3, c - r*0.3, 0, c, c, r);
        shine.addColorStop(0,   'rgba(255,255,255,0.35)');
        shine.addColorStop(0.5, 'rgba(255,255,255,0.08)');
        shine.addColorStop(1,   'rgba(255,255,255,0)');
        cx.fillStyle = shine;
        cx.beginPath(); cx.arc(c, c, r, 0, Math.PI * 2); cx.fill();

        // Outer rim
        cx.strokeStyle = '#111';
        cx.lineWidth   = 6;
        cx.beginPath(); cx.arc(c, c, r - 2, 0, Math.PI * 2); cx.stroke();

        return new THREE.CanvasTexture(cv);
    }

    // ── Raycasting hit detection ──────────────────────────────

    /**
     * Cast a ray from crosshair position through scene.
     * Returns { hit, target, isCenterHit } matching old interface.
     */
    castRay(crosshairX, crosshairY) {
        const w = window.innerWidth, h = window.innerHeight;

        // Normalise to NDC (-1..1)
        const ndcX =  (crosshairX / w) * 2 - 1;
        const ndcY = -(crosshairY / h) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

        // Collect disc meshes (inside groups) for valid targets
        const meshes   = [];
        const meshToTarget = new Map();
        this.targets3d.forEach((group, target) => {
            if (!target.isFalling || target.fallAngle > -45) {
                if (!target.peek?.active || target.isActive) {
                    const disc = group.children[0];
                    meshes.push(disc);
                    meshToTarget.set(disc, target);
                }
            }
        });

        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length === 0) return { hit: false, target: null, isCenterHit: false };

        const hitMesh   = hits[0].object;
        const hitTarget = meshToTarget.get(hitMesh);
        if (!hitTarget) return { hit: false, target: null, isCenterHit: false };

        // Centre hit = within inner 30% of radius
        const uv = hits[0].uv;
        const isCenterHit = uv
            ? Math.hypot(uv.x - 0.5, uv.y - 0.5) < 0.15
            : false;

        return { hit: true, target: hitTarget, isCenterHit };
    }

    // ── Hit particles ─────────────────────────────────────────

    /**
     * Spawn 12 tiny tetrahedron fragments on target hit.
     * Inherits target material colour, random outward velocity, gravity.
     */
    spawnHitParticles(target) {
        const group = this.targets3d.get(target);
        if (!group) return;

        const disc = group.children[0];
        const pos  = group.position.clone();
        
        // Use bright visible colours instead of target colour
        const particleColors = [
            new THREE.Color(0xff6600), // bright orange
            new THREE.Color(0xffaa00), // yellow-orange
            new THREE.Color(0xdddddd), // white
        ];

        for (let i = 0; i < 12; i++) {
            const size = 0.12 + Math.random() * 0.08;  // much larger: 0.12-0.20
            const geo  = new THREE.TetrahedronGeometry(size);
            const col  = particleColors[Math.floor(Math.random() * particleColors.length)];
            const pmat = new THREE.MeshStandardMaterial({
                color:     col,
                emissive:  col,
                emissiveIntensity: 0.4,  // glow so they're visible
                roughness: 0.6,
                metalness: 0.0,
            });
            const mesh = new THREE.Mesh(geo, pmat);

            // Slower, more visible velocities
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.8 + Math.random() * 1.2;  // slower: 0.8-2.0
            const vx = Math.cos(angle) * speed;
            const vy = (0.3 + Math.random() * 0.8) * speed;  // upward
            const vz = Math.sin(angle) * speed * 0.8;        // more depth spread

            mesh.position.copy(pos);
            this.scene.add(mesh);

            this.hitParticles.push({
                mesh,
                geo,
                mat: pmat,
                vel: { x: vx, y: vy, z: vz },
                life: 0,      // 0 → 350ms
                spin: {
                    x: (Math.random() - 0.5) * 12,
                    y: (Math.random() - 0.5) * 12,
                    z: (Math.random() - 0.5) * 12,
                }
            });
        }
    }

    /**
     * Update and cleanup hit particles.
     * Called each frame in render().
     */
    _updateHitParticles(dt) {
        const LIFETIME = 0.35;  // 350ms
        const GRAVITY  = -9.8;

        for (let i = this.hitParticles.length - 1; i >= 0; i--) {
            const p = this.hitParticles[i];
            p.life += dt;

            if (p.life >= LIFETIME) {
                // Cleanup
                this.scene.remove(p.mesh);
                p.geo.dispose();
                p.mat.dispose();
                this.hitParticles.splice(i, 1);
                continue;
            }

            // Physics
            p.vel.y += GRAVITY * dt;
            p.mesh.position.x += p.vel.x * dt;
            p.mesh.position.y += p.vel.y * dt;
            p.mesh.position.z += p.vel.z * dt;

            // Spin
            p.mesh.rotation.x += p.spin.x * dt;
            p.mesh.rotation.y += p.spin.y * dt;
            p.mesh.rotation.z += p.spin.z * dt;

            // Fade out in last 100ms
            const fadeStart = LIFETIME - 0.1;
            if (p.life > fadeStart) {
                const fadeT = (p.life - fadeStart) / 0.1;
                p.mat.opacity = 1 - fadeT;
                p.mat.transparent = true;
            }
        }
    }

    // ── Main render ───────────────────────────────────────────

    render() {
        const t  = this.clock.getElapsedTime();
        const dt = this.clock.getDelta();

        // Billboard wind sway — gentle rotation on the whole group
        if (this.billboardTrees) {
            this.billboardTrees.forEach(({ group, phase, baseRX, baseRZ }) => {
                group.rotation.x = baseRX + Math.sin(t * 1.4 + phase)          * 0.012;
                group.rotation.z = baseRZ + Math.sin(t * 1.1 + phase + 1.2)    * 0.018;
            });
        }

        this._updateHitParticles(dt);

        // Update target shadow spawn/despawn animations
        this.targets3d.forEach(group => {
            if (group.userData.spawnAnim.active) {
                group.userData.spawnAnim.t += dt / 0.12; // 120ms
            }
            if (group.userData.despawnAnim.active) {
                const oldT = group.userData.despawnAnim.t;
                group.userData.despawnAnim.t += dt / 0.12; // 120ms
                if (oldT < 0.05 && Math.random() < 0.2) {
                    console.log('DESPAWN timer update: dt=' + dt.toFixed(4) + ', oldT=' + oldT.toFixed(2) + ', newT=' + group.userData.despawnAnim.t.toFixed(2));
                }
            }
        });

        this.syncTargets();
        this.renderer.render(this.scene, this.camera);
        this._renderHUD();
    }

    // ── HUD (2D crosshair canvas) ─────────────────────────────

    _initHUD() {
        this.hudCanvas = document.getElementById('hudCanvas');
        this.hudCtx    = this.hudCanvas.getContext('2d');
        this._resizeHUD();
    }

    _resizeHUD() {
        const dpr = window.devicePixelRatio || 1;
        this.hudCanvas.width  = window.innerWidth  * dpr;
        this.hudCanvas.height = window.innerHeight * dpr;
        this.hudCanvas.style.width  = window.innerWidth  + 'px';
        this.hudCanvas.style.height = window.innerHeight + 'px';
        this.hudCtx.scale(dpr, dpr);
    }

    _renderHUD() {
        const ctx   = this.hudCtx;
        const game  = this.game;
        const w     = window.innerWidth;
        const h     = window.innerHeight;

        ctx.clearRect(0, 0, w, h);

        if (!game.input?.locked) return;

        const cx = game.input.crosshairX;
        const cy = game.input.crosshairY;
        game.weapon.drawDynamicCrosshair(ctx, cx, cy);
    }

    // ── Resize ────────────────────────────────────────────────

    _onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this._resizeHUD();
    }
}
