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
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.8;

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
        this._buildFog();
        this._buildFoliage();
    }

    _buildSky() {
        // Procedural sky using a large sphere with a shader material
        const skyGeo = new THREE.SphereGeometry(800, 32, 15);

        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor:    { value: new THREE.Color(0x0d2b4e) },
                midColor:    { value: new THREE.Color(0x1a6090) },
                horizonColor:{ value: new THREE.Color(0x9dd4f0) },
                sunDir:      { value: new THREE.Vector3(-0.5, 0.6, -0.6).normalize() },
                sunColor:    { value: new THREE.Color(1.0, 0.95, 0.7) },
                sunSize:     { value: 0.99985 },
                sunGlowSize: { value: 0.9985 },
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

                    // Sky gradient based on elevation
                    float h = dir.y; // -1 (down) to 1 (up)
                    vec3 sky;
                    if (h > 0.0) {
                        sky = mix(horizonColor, mix(midColor, topColor, h), h);
                    } else {
                        sky = horizonColor;
                    }

                    // Sun disc + glow
                    float cosAngle = dot(dir, normalize(sunDir));
                    float sun  = smoothstep(sunSize,      sunSize + 0.001, cosAngle);
                    float glow = smoothstep(sunGlowSize - 0.04, sunGlowSize, cosAngle) * 0.5;
                    vec3 col = sky + sunColor * (sun + glow);

                    // Horizon haze
                    float haze = 1.0 - smoothstep(-0.05, 0.15, h);
                    col = mix(col, horizonColor * 1.2, haze * 0.55);

                    gl_FragColor = vec4(col, 1.0);
                }
            `,
            side: THREE.BackSide
        });

        this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyMesh);

        // Clouds — textured planes floating in sky
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

        const mat = new THREE.MeshLambertMaterial({ map: tex });
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
        const postMat = new THREE.MeshLambertMaterial({ color: 0xddcc88 });
        const post    = new THREE.Mesh(postGeo, postMat);
        post.position.set(-12, 0.6, -dist);
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
        sign.position.set(-12, 1.35, -dist);
        this.scene.add(sign);
    }

    _buildLighting() {
        // Ambient
        this.scene.add(new THREE.AmbientLight(0x8ab4d4, 0.6));

        // Sun directional light
        const sun = new THREE.DirectionalLight(0xfff4d0, 1.8);
        sun.position.set(-50, 80, 60);
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

        // Soft fill from sky
        const fill = new THREE.HemisphereLight(0x8ab4d4, 0x7a6040, 0.5);
        this.scene.add(fill);
    }

    _buildFog() {
        this.scene.fog = new THREE.FogExp2(0x9dd4f0, 0.008);
    }


        // Reusable geometries
        const trunkGeo  = new THREE.CylinderGeometry(0.12, 0.18, 1.8, 7);
        const cone1Geo  = new THREE.ConeGeometry(1.4, 2.4, 7);
        const cone2Geo  = new THREE.ConeGeometry(1.1, 2.0, 7);
        const cone3Geo  = new THREE.ConeGeometry(0.8, 1.6, 7);
        const bushGeo   = new THREE.SphereGeometry(1, 7, 5);

        const trunkMat  = new THREE.MeshLambertMaterial({ color: 0x4a3020 });
        const foliageMat= new THREE.MeshLambertMaterial({ color: 0x2d5a1b });
        const foliageMat2=new THREE.MeshLambertMaterial({ color: 0x3a6e22 });
        const bushMat   = new THREE.MeshLambertMaterial({ color: 0x3d6b1a });
        const bushMat2  = new THREE.MeshLambertMaterial({ color: 0x4a7d28 });

        const addTree = (x, z, scale = 1) => {
            const g = new THREE.Group();

            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = 0.9 * scale;
            g.add(trunk);

            // Three layered cones for a pine tree look
            const c1 = new THREE.Mesh(cone1Geo, foliageMat);
            c1.position.y = 2.2 * scale;
            g.add(c1);
            const c2 = new THREE.Mesh(cone2Geo, foliageMat2);
            c2.position.y = 3.2 * scale;
            g.add(c2);
            const c3 = new THREE.Mesh(cone3Geo, foliageMat);
            c3.position.y = 4.0 * scale;
            g.add(c3);

            g.scale.setScalar(scale);
            g.position.set(x, 0, z);
            g.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(g);
        };

        const addBush = (x, z, scale = 1) => {
            const mat = Math.random() > 0.5 ? bushMat : bushMat2;
            const bush = new THREE.Mesh(bushGeo, mat);
            bush.scale.set(scale, scale * 0.7, scale);
            bush.position.set(x, scale * 0.5, z);
            this.scene.add(bush);
        };

        // Left side tree line
        const leftX  = -16;
        const rightX =  16;
        const depths = [8, 14, 20, 28, 36, 44, 52, 62, 75, 90, 110, 130];

        depths.forEach((d, i) => {
            const jitter = (Math.random() - 0.5) * 4;
            const scale  = 0.7 + Math.random() * 0.6;

            // Trees on both sides
            addTree(leftX  + jitter, -d, scale);
            addTree(rightX - jitter, -d, scale);

            // Extra trees clustered in groups
            if (i % 3 === 0) {
                addTree(leftX  + jitter - 3, -d - 2, scale * 0.8);
                addTree(rightX - jitter + 3, -d - 2, scale * 0.8);
            }
        });

        // Bushes scattered near treeline and between trees
        for (let z = -5; z > -140; z -= 6) {
            const s = 0.4 + Math.random() * 0.5;
            if (Math.random() > 0.4) addBush(leftX  + (Math.random() - 0.5) * 6, z, s);
            if (Math.random() > 0.4) addBush(rightX + (Math.random() - 0.5) * 6, z, s);
            // Occasional bush cluster inside the range edges
            if (Math.random() > 0.7) addBush(leftX  + 4 + Math.random() * 2, z + Math.random() * 3, s * 0.7);
            if (Math.random() > 0.7) addBush(rightX - 4 - Math.random() * 2, z + Math.random() * 3, s * 0.7);
        }
    }

    // ── Target management ─────────────────────────────────────

    /** Call every frame — syncs 3D meshes with game target list */
    syncTargets() {
        const game    = this.game;
        const current = new Set(game.targets);

        // Remove meshes for targets no longer in game
        this.targets3d.forEach((mesh, target) => {
            if (!current.has(target)) {
                this.scene.remove(mesh);
                this.targets3d.delete(target);
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
            const z = -(8 + target.distance * 52);
            const y =  0.8 + target.worldY * 3; // 0.8m = target centre above ground

            group.position.set(x, y, z);

            if (target.isFalling) {
                group.rotation.x = target.fallAngle * Math.PI / 180;
                group.rotation.z = 0;
            } else {
                group.rotation.x = 0;
                group.rotation.z = target.swingAngle * Math.PI / 180;
            }

            const scale = target.baseSize / GAME_CONFIG.TARGET.BASE_SIZE;
            group.scale.setScalar(scale);

            // Impact flash
            if (target.impactFlash > 0) {
                disc.material.emissive.setRGB(
                    target.impactFlash,
                    target.impactFlash * 0.8,
                    target.impactFlash * 0.4
                );
            } else {
                disc.material.emissive.setRGB(0, 0, 0);
            }

            if (target.reaction?.isGlowing) {
                disc.material.emissive.setRGB(0.4, 0.3, 0.0);
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
        const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true });

        const disc = new THREE.Mesh(geo, mat);
        // Bake: rotate disc so its face points toward +Z (camera direction)
        disc.rotation.x = Math.PI / 2;
        disc.castShadow = true;

        group.add(disc);
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

    // ── Main render ───────────────────────────────────────────

    render() {
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
