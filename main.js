import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

// ---------- basics ----------
const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.debug.onShaderError = (gl, prog, vs, fs) => { console.warn('shader compile problem (continuing):', gl.getProgramInfoLog(prog)); };
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xcfe6f2, 0.01);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 1200);
camera.position.set(2.5, 2.4, 9.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(4.0, 1.05, 0);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.enablePan = false; controls.enableZoom = false; controls.enableRotate = false;
controls.update();

const SUN_DIR = new THREE.Vector3(0.55, 0.55, -0.63).normalize();
const LIGHT_DIR = new THREE.Vector3(0.35, 0.72, -0.60).normalize();

// ---------- path along X (side-scroll L→R) ----------
const sstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
function pathCZ(x) { return 0.12 * Math.sin(x * 0.18) + 0.08 * Math.sin(x * 0.07 + 1.2); }
function pathHW(x) { return 1.15 + 0.15 * Math.sin(x * 0.11); }
function pathU(x, z) { return Math.abs(z - pathCZ(x)) / pathHW(x); }
const GLSL_PATH = `
float pathCZ(float x){ return 0.12*sin(x*0.18) + 0.08*sin(x*0.07+1.2); }
float pathHW(float x){ return 1.15 + 0.15*sin(x*0.11); }
float pathU(vec2 p){ return abs(p.y - pathCZ(p.x)) / pathHW(p.x); }`;
const PATH_Z = [-1.1, 1.1];
function clampToPath(v, margin = 0.35) {
  v.y = THREE.MathUtils.clamp(v.y, PATH_Z[0], PATH_Z[1]);
  const c = pathCZ(v.x), h = Math.max(0.15, pathHW(v.x) - margin);
  v.y = THREE.MathUtils.clamp(v.y, c - h, c + h);
  return v;
}
function hgt(x, z) {
  let h = 0.28 * Math.sin(x * 0.07 + 1.0) * Math.sin(z * 0.11) + 0.18 * Math.sin(x * 0.13 - z * 0.09) + 0.12 * Math.sin(x * 0.04 + z * 0.05 + 2.0);
  const d = Math.hypot(x * 0.15, z);
  const t = Math.min(Math.max((d - 2) / 10, 0), 1); const s = t * t * (3 - 2 * t);
  h *= 0.35 + 0.65 * s;
  return h;
}
const GLSL_H = `
float hgt(vec2 p){
  float h = 0.28*sin(p.x*0.07+1.0)*sin(p.y*0.11) + 0.18*sin(p.x*0.13 - p.y*0.09) + 0.12*sin(p.x*0.04+p.y*0.05+2.0);
  float d = length(vec2(p.x*0.15, p.y));
  h *= mix(0.35,1.0,smoothstep(2.0,12.0,d));
  return h;
}`;
const GLSL_FOG = `
uniform vec3 uFogColor; uniform float uFogDensity;
vec3 applyFog(vec3 c, float d){ float f = 1.0 - exp(-uFogDensity*uFogDensity*d*d); return mix(c, uFogColor, clamp(f,0.0,1.0)); }`;
const scaleU = { value: 500 };
const fogUniforms = { uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.01 } };

let seed = 12345; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + (b - a) * rnd();

// ---------- season presets ----------
const C = (h) => new THREE.Color(h);
const PRESETS = {
  spring: {
    skyTop: C(0x7a8794), skyHor: C(0xb8c2cb), glow: 0.0, sun: 0.25, sunCol: C(0xdde4ec), hemi: 1.35,
    fogCol: C(0xaeb8c2), fogD: 0.028, cloudCol: C(0x9aa3ad), cloud: 1, grey: 1,
    rain: 1, snow: 0, leaves: 0, wind: 0.32, lines: 0, cover: 0, fly: 0, cloudSpd: 1.1, exp: 1.0,
    groundA: C(0x6fb828), groundB: C(0xa8d83a), sand: 0, ocean: 0, night: 0, blossom: 1, palm: 0, pine: 0, mountain: 0, leafTint: 0,
  },
  summer: {
    skyTop: C(0x3a9ae8), skyHor: C(0xb8e4f8), glow: 1.0, sun: 2.7, sunCol: C(0xfff0d0), hemi: 1.55,
    fogCol: C(0xd0ebf5), fogD: 0.009, cloudCol: C(0xffffff), cloud: 0.85, grey: 0,
    rain: 0, snow: 0, leaves: 0, wind: 0.55, lines: 0.7, cover: 0, fly: 0.4, cloudSpd: 2.2, exp: 1.05,
    groundA: C(0xd8c078), groundB: C(0xe8d49a), sand: 1, ocean: 1, night: 0, blossom: 0, palm: 1, pine: 0, mountain: 0, leafTint: 0,
  },
  autumn: {
    skyTop: C(0x1a0e38), skyHor: C(0xa85848), glow: 0.08, sun: 0.35, sunCol: C(0xffe0b8), hemi: 1.15,
    fogCol: C(0x3a2858), fogD: 0.018, cloudCol: C(0x8a8098), cloud: 0.7, grey: 0.55,
    rain: 0, snow: 0, leaves: 1, wind: 0.75, lines: 0.35, cover: 0, fly: 0, cloudSpd: 1.6, exp: 0.95,
    groundA: C(0xb89048), groundB: C(0xd4a858), sand: 0, ocean: 0, night: 1, blossom: 0, palm: 0, pine: 0, mountain: 0, leafTint: 1,
  },
  winter: {
    skyTop: C(0xb8c4d4), skyHor: C(0xe8ecf2), glow: 0.25, sun: 0.7, sunCol: C(0xfffcf6), hemi: 1.7,
    fogCol: C(0xe4e8ee), fogD: 0.026, cloudCol: C(0xe2e6ec), cloud: 0.9, grey: 0.35,
    rain: 0, snow: 1, leaves: 0, wind: 0.22, lines: 0, cover: 1, fly: 0, cloudSpd: 0.5, exp: 1.0,
    groundA: C(0xd8e0ea), groundB: C(0xeef2f6), sand: 0, ocean: 0, night: 0, blossom: 0, palm: 0, pine: 1, mountain: 1, leafTint: 0,
  },
};
const SEASON_META = {
  spring: { han: '春', en: 'SPRING', sub: '春雨', idx: '01 / 04', accent: '#ff8fb8', i: 0 },
  summer: { han: '夏', en: 'SUMMER', sub: '海风', idx: '02 / 04', accent: '#ffd23a', i: 1 },
  autumn: { han: '秋', en: 'AUTUMN', sub: '秋夜', idx: '03 / 04', accent: '#ff9a40', i: 2 },
  winter: { han: '冬', en: 'WINTER', sub: '冬雪', idx: '04 / 04', accent: '#7eb8ff', i: 3 },
};
const cur = {}; for (const k in PRESETS.spring) cur[k] = PRESETS.spring[k] instanceof THREE.Color ? PRESETS.spring[k].clone() : PRESETS.spring[k];
let target = PRESETS.spring, currentName = 'spring';
// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xd6ecff, 0x9cbf55, 1.35); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.6); sun.position.set(0, 0, 0).addScaledVector(LIGHT_DIR, 30); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 8, bottom: -8, near: 10, far: 55 }); sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
const sunTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,250,1)'); gr.addColorStop(0.1, 'rgba(255,253,240,1)'); gr.addColorStop(0.15, 'rgba(255,244,200,0.8)'); gr.addColorStop(0.4, 'rgba(255,225,150,0.22)'); gr.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true, toneMapped: false }));
sunSprite.position.copy(SUN_DIR).multiplyScalar(500); sunSprite.scale.setScalar(230); sunSprite.renderOrder = -6; scene.add(sunSprite);
const fill = new THREE.DirectionalLight(0xfff4e6, 1.3); fill.position.set(-2, 4, 8); scene.add(fill);

// ---------- sky ----------
const skyU = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: 1 }, uSunDir: { value: SUN_DIR }, uNight: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
  fragmentShader: `uniform vec3 uTop,uHor; uniform float uGlow,uNight; uniform vec3 uSunDir; varying vec3 vDir;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  void main(){ vec3 d = normalize(vDir); float t = clamp(d.y,0.0,1.0);
    vec3 c = mix(uHor, uTop, pow(t,0.55));
    float s = max(dot(d,uSunDir),0.0);
    c += uGlow * (vec3(1.0,0.93,0.72)*pow(s,6.0)*0.35 + vec3(1.0,0.97,0.85)*pow(s,40.0)*0.6 + vec3(1.0)*smoothstep(0.9993,0.9997,s)*1.2);
    if (uNight > 0.01 && d.y > 0.15) {
      vec2 g = floor(d.xz * 80.0); float h = hash(g);
      float star = step(0.97, h) * smoothstep(0.15, 0.55, d.y) * uNight;
      c += vec3(1.0) * star * (0.6 + 0.4*hash(g+1.7));
    }
    gl_FragColor = vec4(c,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`
}));
sky.renderOrder = -10; scene.add(sky);

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function cloudTex(variant) {
  return canvasTex(512, 256, (g, w, h) => {
    let s = variant * 977 + 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const puffs = [];
    const n = 9 + variant * 2;
    for (let i = 0; i < n; i++) { const x = 90 + r() * 330; const rad = 40 + r() * 55 * (1 - Math.abs(x - 256) / 300); puffs.push([x, 175 - rad * (0.55 + r() * 0.5), rad]); }
    for (const pass of [0, 1]) for (const [x, y, rad] of puffs) {
      const gr = g.createRadialGradient(x, y - (pass ? rad * 0.25 : 0), 0, x, y, rad);
      if (pass === 0) { gr.addColorStop(0, 'rgba(225,232,242,1)'); gr.addColorStop(0.7, 'rgba(225,232,242,0.9)'); gr.addColorStop(1, 'rgba(225,232,242,0)'); }
      else { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, 160, 0, 215); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade; g.fillRect(0, 160, w, 96);
  });
}
const cloudTexs = [0, 1, 2, 3].map(cloudTex);
const clouds = [];
function addCloud(x, y, z, sc, grey) {
  const m = new THREE.SpriteMaterial({ map: cloudTexs[clouds.length % 4], transparent: true, depthWrite: false, fog: false, opacity: grey ? 0 : 1 });
  const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.set(sc, sc * 0.5, 1); s.renderOrder = -5;
  s.userData = { grey, base: x }; scene.add(s); clouds.push(s);
}
for (let i = 0; i < 14; i++) { const a = -1.5 + i * 0.22 + rr(-0.05, 0.05); addCloud(Math.sin(a) * 380, rr(50, 130), -Math.cos(a) * 380, rr(140, 230), false); }
for (let i = 0; i < 18; i++) { const a = -1.6 + i * 0.17; addCloud(Math.sin(a) * 340, rr(45, 140), -Math.cos(a) * 340, rr(180, 280), true); }

// ---------- moon (autumn) ----------
const moonTex = canvasTex(256, 256, (g) => {
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 120);
  gr.addColorStop(0, 'rgba(255,255,245,1)'); gr.addColorStop(0.55, 'rgba(250,248,235,1)'); gr.addColorStop(0.85, 'rgba(240,235,210,0.55)'); gr.addColorStop(1, 'rgba(240,235,210,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(220,215,195,0.35)';
  [[90,100,18],[150,130,12],[110,160,10],[160,90,8]].forEach(([x,y,r]) => { g.beginPath(); g.arc(x,y,r,0,7); g.fill(); });
});
const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true, toneMapped: false, opacity: 0 }));
moonSprite.position.set(180, 160, -420); moonSprite.scale.setScalar(90); moonSprite.renderOrder = -4; scene.add(moonSprite);

// ---------- ocean (summer) ----------
const oceanGroup = new THREE.Group(); scene.add(oceanGroup);
{
  const oceanMat = new THREE.MeshLambertMaterial({ color: 0x3aa0d8, transparent: true, opacity: 0 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(400, 80), oceanMat);
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -0.4, -28); oceanGroup.add(ocean);
  oceanGroup.userData.mat = oceanMat;
  for (let i = 0; i < 6; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(80 + i * 20, 0.15), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    w.rotation.x = -Math.PI / 2; w.position.set(-20 + i * 15, -0.35, -22 - i * 3.5); w.userData.wave = true; oceanGroup.add(w);
  }
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.7), new THREE.MeshLambertMaterial({ color: 0xffffff })); hull.position.y = 0.2; boat.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a40 })); mast.position.y = 1.8; boat.add(mast);
  const sail = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 3), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  sail.rotation.z = Math.PI; sail.position.set(0.55, 1.6, 0); boat.add(sail);
  boat.position.set(12, -0.15, -32); boat.scale.setScalar(1.4); oceanGroup.add(boat);
  const lh = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 5.5, 10), new THREE.MeshLambertMaterial({ color: 0xffffff })); tower.position.y = 2.75; lh.add(tower);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.72, 1.2, 10), new THREE.MeshLambertMaterial({ color: 0xe04040 })); stripe.position.y = 3.5; lh.add(stripe);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0x333340 })); top.position.y = 5.7; lh.add(top);
  lh.position.set(28, -0.3, -38); lh.scale.setScalar(1.6); oceanGroup.add(lh);
}

// ---------- mountains (winter) ----------
const mountainGroup = new THREE.Group(); scene.add(mountainGroup);
{
  const mkPeak = (x, z, w, h, col) => {
    const g = new THREE.ConeGeometry(w, h, 4); g.rotateY(Math.PI / 4);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: col }));
    m.position.set(x, h * 0.35, z); mountainGroup.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.55, h * 0.35, 4), new THREE.MeshLambertMaterial({ color: 0xf4f8fc }));
    cap.rotation.y = Math.PI / 4; cap.position.set(x, h * 0.55, z); mountainGroup.add(cap);
  };
  mkPeak(-25, -55, 18, 22, 0x8aa8c8);
  mkPeak(-5, -62, 22, 28, 0x7a9ab8);
  mkPeak(18, -58, 16, 20, 0x90b0c8);
  mkPeak(38, -65, 20, 26, 0x6e90b0);
  mkPeak(55, -52, 14, 16, 0x88a8c0);
  mountainGroup.visible = false;
}
// ---------- ground ----------
const groundGeo = new THREE.PlaneGeometry(220, 120, 180, 100); groundGeo.rotateX(-Math.PI / 2);
{
  const p = groundGeo.attributes.position, col = []; const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); p.setY(i, hgt(x, z));
    const v = 0.5 + 0.5 * Math.sin(x * 0.23 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.19);
    c.setHex(0x86c832).lerp(C(0xb2de46), v * 0.6); col.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); groundGeo.computeVertexNormals();
}
const snowCover = { value: 0 };
const groundTintU = { uSnow: snowCover, uSand: { value: 0 }, uA: { value: C(0x86c832) }, uB: { value: C(0xb2de46) } };
const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
groundMat.onBeforeCompile = (s) => {
  Object.assign(s.uniforms, groundTintU);
  s.fragmentShader = 'uniform float uSnow,uSand; uniform vec3 uA,uB;\n' + s.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     vec3 meadow = mix(uA, uB, diffuseColor.r);
     vec3 sand = mix(vec3(0.82,0.72,0.48), vec3(0.90,0.82,0.58), diffuseColor.r);
     diffuseColor.rgb = mix(meadow, sand, uSand);
     diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92,0.94,0.97), uSnow*0.9);`
  );
};
{ const gm = new THREE.Mesh(groundGeo, groundMat); gm.receiveShadow = true; scene.add(gm); }
const snowLayerU = { value: 0 };
const kidPosU = { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector2(99, 99)) };
const snowLayer = (() => {
  const g = new THREE.PlaneGeometry(160, 40, 200, 60); g.rotateX(-Math.PI / 2); g.translate(20, 0, 0);
  const p = g.attributes.position, lay = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i);
    const bump = 0.07 * Math.sin(x * 1.3 + Math.sin(z * 0.9) * 1.5) * Math.sin(z * 1.1 + x * 0.3) + 0.04 * Math.sin(x * 3.1 + z * 2.3);
    lay[i] = 0.22 + bump * 0.8; p.setY(i, hgt(x, z) + lay[i]); }
  g.computeVertexNormals(); g.setAttribute('aLayer', new THREE.BufferAttribute(lay, 1));
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xfcfbf8, emissiveIntensity: 0.64 });
  m.onBeforeCompile = (sh) => { sh.uniforms.uCov = snowLayerU;
    sh.vertexShader = 'attribute float aLayer; uniform float uCov;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float pu = abs(transformed.z - (0.12*sin(transformed.x*0.18)+0.08*sin(transformed.x*0.07+1.2))) / (1.15+0.15*sin(transformed.x*0.11));
       float keep = uCov * mix(0.28, 1.0, smoothstep(0.8, 1.25, pu));
       transformed.y -= aLayer * (1.0 - keep) + 0.03*(1.0-uCov);`); };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.visible = false; scene.add(mesh); return mesh;
})();

// ---------- path ribbon (along X) ----------
{
  const xs = [], N = 11; for (let x = -20; x <= 90.01; x += 0.2) xs.push(x);
  const pos = [], col = [], idx = []; const c = new THREE.Color(), dirt = C(0xcfae78), dark = C(0xa9875a), stone = C(0xe8dcc6);
  xs.forEach((x, j) => { const cz = pathCZ(x), hw = pathHW(x);
    for (let i = 0; i < N; i++) { const u = -1.3 + 2.6 * i / (N - 1); const z = cz + u * hw;
      const n = 0.5 + 0.5 * Math.sin(x * 7.3 + Math.sin(z * 5.1) * 2) * Math.sin(z * 6.7 + x * 1.3);
      const peb = Math.max(0, Math.sin(x * 23.0 + z * 3.1) * Math.sin(z * 19.0 - x * 2.7)) ** 6;
      c.copy(dirt).lerp(dark, n * 0.45).lerp(stone, peb * 0.8).lerp(C(0x9dbf4a), sstep(0.7, 1.25, Math.abs(u)) * 0.55);
      const a = 1 - sstep(0.8, 1.3, Math.abs(u));
      pos.push(x, hgt(x, z) + 0.012, z); col.push(c.r, c.g, c.b, a);
      if (j > 0 && i > 0) { const k = j * N + i; idx.push(k - N - 1, k - 1, k - N, k - N, k - 1, k); } } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  m.receiveShadow = true; m.renderOrder = 1; scene.add(m);
}

// ---------- grass ----------
const kidHU = { value: [1, 1, 1, 1, 1] }, shadowU = { value: 1 };
const windU = { value: 0.1 }, timeU = { value: 0 }, buryU = { value: 0 };
const lightU = { uAmb: { value: 1 }, uSunI: { value: 1 }, uSunCol: { value: new THREE.Color() } };
const grassBaseU = { value: C(0x4f9a1c) }, grassTipU = { value: C(0xb6e04e) };
{
  const bw = 0.075, ys = [0, 0.35, 0.7], ws = [1, 0.75, 0.42];
  const pos = []; ys.forEach((y, i) => { pos.push(-bw / 2 * ws[i], y, 0, bw / 2 * ws[i], y, 0); }); pos.push(0, 1, 0);
  const idx = [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6];
  const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const off = [], vr = [];
  const add = (n, x0, x1, z0, z1, h0, h1) => { for (let i = 0; i < n; i++) { const x = rr(x0, x1), z = rr(z0, z1); if (pathU(x, z) < 1.15) continue; off.push(x, z, rr(0, Math.PI), rr(h0, h1)); vr.push(rnd()); } };
  add(22000, -15, 85, -4, 5.5, 0.12, 0.28);
  add(28000, -20, 90, -18, -3.5, 0.18, 0.38);
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(off), 4));
  g.setAttribute('aVar', new THREE.InstancedBufferAttribute(new Float32Array(vr), 1));
  g.instanceCount = vr.length;
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: timeU, uWind: windU, uSnow: snowCover, uKids: kidPosU, uKidH: kidHU, uShadow: shadowU, uSunXZ: { value: new THREE.Vector2(-LIGHT_DIR.x, -LIGHT_DIR.z).normalize() }, uTanE: { value: LIGHT_DIR.y / Math.hypot(LIGHT_DIR.x, LIGHT_DIR.z) }, uBury: buryU, uBase: grassBaseU, uTip: grassTipU, ...lightU, ...fogUniforms },
    vertexShader: `${GLSL_PATH}
    attribute vec4 aOff; attribute float aVar; uniform float uTime,uWind,uBury,uKidH[5],uShadow,uTanE; uniform vec2 uKids[5],uSunXZ; varying float vSh; varying float vT,vVar,vDist; ${GLSL_H}
    void main(){ vec2 b = aOff.xy; float gy = hgt(b); vec3 root = vec3(b.x,gy,b.y);
      float d = distance(root, cameraPosition); float fade = 1.0 - smoothstep(28.0,42.0,d);
      float s = sin(aOff.z), c = cos(aOff.z); float hs = aOff.w*fade*(0.85+0.3*aVar);
      float kd = 99.0; float sh = 0.0; vec2 perp = vec2(-uSunXZ.y, uSunXZ.x);
      for(int i=0;i<5;i++){ vec2 dd = b - uKids[i]; kd = min(kd, length(dd));
        float L = uKidH[i] / uTanE; float al = dot(dd, uSunXZ), pp = abs(dot(dd, perp));
        float wdt = 0.36 + 0.1*step(1.6, uKidH[i]) * smoothstep(0.6, 1.0, al / L) * 2.0;
        sh = max(sh, smoothstep(-0.1, 0.25, al) * (1.0 - smoothstep(L*0.8, L*1.05, al)) * (1.0 - smoothstep(wdt*0.6, wdt, pp))); }
      vSh = sh * uShadow;
      float pu = pathU(b); hs *= (1.0 - 0.55*sh*uShadow) * mix(0.12, 1.0, smoothstep(0.85, 1.25, pu)) * (1.0 - 0.9*uBury);
      vec3 lp = vec3(position.x*c, position.y*hs, position.x*s);
      float t = position.y; float bend = t*t*hs;
      float gust = 0.5+0.5*sin(uTime*1.3 - b.x*0.35 + b.y*0.12);
      float sway = 0.12 + uWind*(0.35+0.55*gust);
      float wob = sin(uTime*1.1 + aVar*6.283)*(0.05 + 0.08*uWind);
      lp.x += (sway + wob)*bend; lp.z += wob*0.5*bend; lp.y -= sway*sway*0.25*bend;
      vec4 mv = viewMatrix*vec4(root+lp,1.0); vDist = -mv.z; vT = t; vVar = aVar; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uBase,uTip,uSunCol; uniform float uAmb,uSunI,uSnow; varying float vT,vVar,vDist,vSh; ${GLSL_FOG}
    void main(){ vec3 c = mix(uBase,uTip,smoothstep(0.0,1.0,vT)) * (0.82+0.36*vVar);
      c *= uAmb*0.42 + uSunCol*uSunI*0.26*(0.6+0.4*vT);
      c = mix(c, vec3(0.93,0.95,0.98)*(uAmb*0.7+uSunI*0.1), uSnow*smoothstep(0.35,1.0,vT)*0.85);
      c = mix(c, min(c, vec3(0.85))*vec3(0.26,0.36,0.32), vSh);
      gl_FragColor = vec4(applyFog(c,vDist),1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; scene.add(m);
}
// ---------- flowers ----------
window.__flowers = [];
{
  const shape = new THREE.Shape(); const N = 80;
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const r = 0.55 + 0.45 * Math.pow(Math.abs(Math.cos(a * 2.5)), 0.7); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? shape.lineTo(x, y) : shape.moveTo(x, y); }
  const petalGeo = new THREE.ShapeGeometry(shape); const centerGeo = new THREE.CircleGeometry(0.28, 16); centerGeo.translate(0, 0, 0.02);
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.01, 1, 4); stemGeo.translate(0, -0.5, 0);
  const pal = [0xff8fb8, 0xff7a2e, 0xffd23a, 0xffffff, 0xffffff, 0x7c9cff, 0xc79bff, 0xff5a5a, 0xffe066].map(C);
  const flowers = [];
  for (let i = 0; i < 2400; i++) { const x = rr(-10, 80), z = rr(-16, 4.5); if (pathU(x, z) < 1.2) continue; flowers.push([x, z, rr(0.035, 0.07), rr(0.2, 0.38)]); }
  const n = flowers.length;
  const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, n); scene.add(m); window.__flowers.push(m); return m; };
  const swayMat = (opts, isStem) => { const m = new THREE.MeshLambertMaterial(opts);
    m.onBeforeCompile = (sh) => { sh.uniforms.uTime = timeU; sh.uniforms.uWind = windU;
      sh.vertexShader = 'uniform float uTime, uWind;\n' + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        vec3 org = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float gust = 0.5 + 0.5*sin(uTime*1.3 - org.x*0.35 + org.z*0.12);
        float ph = fract(sin(dot(org.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.283;
        float k = ${isStem ? 'clamp(1.0 + position.y, 0.0, 1.0)' : '1.0'};
        float sway = (0.03*sin(uTime*1.1 + ph) + uWind*(0.12 + 0.2*gust) + 0.04*uWind*sin(uTime*2.3 + ph)) * 0.32 * k*k;
        mvPosition.x += sway; mvPosition.y -= sway*sway*0.6; mvPosition.z += 0.01*sin(uTime*0.9 + ph)*k;
        mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;`); };
    return m; };
  const petals = mk(petalGeo, swayMat({ side: THREE.DoubleSide }, false));
  const centers = mk(centerGeo, swayMat({ side: THREE.DoubleSide }, false));
  const stems = mk(stemGeo, swayMat({ color: 0x5e9e2a }, true));
  const o = new THREE.Object3D(), col = new THREE.Color();
  flowers.forEach(([x, z, s, h], i) => {
    const y = hgt(x, z) + h;
    o.position.set(x, y, z); o.rotation.set(-Math.PI / 2 + rr(0.55, 1.0), rr(-0.4, 0.4), 0); o.scale.setScalar(s); o.updateMatrix();
    petals.setMatrixAt(i, o.matrix); centers.setMatrixAt(i, o.matrix);
    const pc = pal[Math.floor(rnd() * pal.length)]; petals.setColorAt(i, pc);
    centers.setColorAt(i, pc.getHex() === 0xffffff || pc.getHex() === 0x7c9cff ? C(0xffc21a) : col.copy(pc).lerp(C(0xffd84a), 0.6));
    o.rotation.set(0, 0, 0); o.scale.set(1, h, 1); o.updateMatrix(); stems.setMatrixAt(i, o.matrix);
  });
}

const blobTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(30,60,10,0.55)'); gr.addColorStop(0.6, 'rgba(30,60,10,0.25)'); gr.addColorStop(1, 'rgba(30,60,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
function blob(x, z, r, sx = 1) { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2 * sx, r * 2), blobMat); m.rotation.x = -Math.PI / 2; m.position.set(x, hgt(x, z) + 0.03, z); scene.add(m); return m; }

// ---------- trees ----------
const swayers = [];
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a36 });
const leafMats = [0x7cc63a, 0x93d24a, 0x6ab832, 0xa8dc58, 0x86cc40].map(h => new THREE.MeshLambertMaterial({ color: h }));
const leafBase = leafMats.map(m => m.color.clone());
const blossomMats = [0xffb8d0, 0xffc8dc, 0xffa0c0, 0xffd0e0, 0xf090b0].map(h => new THREE.MeshLambertMaterial({ color: h }));
const autumnMats = [0xe87828, 0xf0a030, 0xd85820, 0xe8c040, 0xc84818].map(h => new THREE.MeshLambertMaterial({ color: h }));
const pineMat = new THREE.MeshLambertMaterial({ color: 0x2e6b38 });
const leafSnowU = { value: 0 };
trunkMat.onBeforeCompile = (sh) => { sh.uniforms.uLS = leafSnowU;
  sh.vertexShader = 'varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWN = normalize(mat3(modelMatrix) * objectNormal);');
  sh.fragmentShader = 'varying vec3 vWN; uniform float uLS;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), uLS * smoothstep(0.05, 0.45, vWN.y));'); };
[...leafMats, ...blossomMats, ...autumnMats, pineMat].forEach(m => { m.onBeforeCompile = (sh) => { sh.uniforms.uLS = leafSnowU;
  sh.vertexShader = 'varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWN = normalize(mat3(modelMatrix) * objectNormal);');
  sh.fragmentShader = 'varying vec3 vWN; uniform float uLS;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97,0.98,1.0), uLS * smoothstep(0.15, 0.55, vWN.y));'); }; });
const blobGeo = new THREE.IcosahedronGeometry(1, 3);
function mergeGeos(list) { const pos = [], nor = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g; }
function branchGeo(seedA, detail) { let sd = seedA; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const parts = []; const up = new THREE.Vector3(0, 1, 0);
  const limb = (start, dir, len, r0, r1, depth) => { const g = new THREE.CylinderGeometry(r1, r0, len, detail ? 6 : 4, 1); g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir)); g.translate(start.x, start.y, start.z); parts.push(g);
    if (depth > 0) {
      for (let k = 0; k < 2; k++) { const d2 = dir.clone().add(new THREE.Vector3(r() - 0.5, r() * 0.4, r() - 0.5).multiplyScalar(1.4)).normalize();
        limb(start.clone().addScaledVector(dir, len * (0.55 + 0.4 * r())), d2, len * 0.55, r1 * 1.05, r1 * 0.45, depth - 1); } } };
  const n = detail ? 6 : 4;
  for (let i = 0; i < n; i++) { const a = i / n * 6.283 + r() * 0.6; const dir = new THREE.Vector3(Math.cos(a) * 0.8, 0.9 + r() * 0.5, Math.sin(a) * 0.8).normalize();
    limb(new THREE.Vector3(0, 2.3 + r() * 0.8, 0), dir, 1.3 + r() * 0.6, 0.09, 0.04, detail ? 2 : 1); }
  limb(new THREE.Vector3(0, 3.0, 0), new THREE.Vector3(0.05, 1, 0).normalize(), 1.4, 0.12, 0.04, 1);
  return mergeGeos(parts); }
const BR_GEOS = [branchGeo(11, true), branchGeo(29, true), branchGeo(47, false), branchGeo(83, false)];
const treeGroups = { meadow: [], blossom: [], autumn: [], palm: [], pine: [] };

function makeDeciduous(x, z, s, mats, detail = true, kind = 'meadow') {
  const g = new THREE.Group(); g.position.set(x, hgt(x, z) - 0.05, z); g.scale.setScalar(s);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 3.2, 10), trunkMat); trunk.position.y = 1.6; g.add(trunk);
  if (detail) for (const [a, l] of [[0.7, 1.3], [-0.6, 1.1]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, l, 7), trunkMat); b.position.set(Math.sin(a) * 0.4, 2.5, 0); b.rotation.z = -a; g.add(b); }
  const br = new THREE.Mesh(BR_GEOS[(detail ? 0 : 2) + Math.floor(rnd() * 2)], trunkMat); br.rotation.y = rnd() * 6.28; g.add(br);
  const crown = new THREE.Group(); crown.position.y = 3.1; g.add(crown);
  const n = detail ? 16 : 7;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = rr(0.3, 1.6), y = rr(-0.3, 1.5) * (1 - r / 2.6);
    const m = new THREE.Mesh(blobGeo, mats[Math.floor(rnd() * mats.length)]);
    m.position.set(Math.cos(a) * r, y + 0.4, Math.sin(a) * r * 0.85); m.scale.setScalar(rr(0.8, 1.25) * (1.25 - r * 0.2)); m.userData.base = m.scale.x; m.userData.d = rnd(); crown.add(m);
  }
  crown.userData.ph = rnd() * 6; swayers.push(crown); scene.add(g);
  if (detail) blob(x, z, 2.4 * s);
  treeGroups[kind].push(g);
  return g;
}
function makePalm(x, z, s) {
  const g = new THREE.Group(); g.position.set(x, hgt(x, z) - 0.05, z); g.scale.setScalar(s);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 5.2, 8), trunkMat); trunk.position.y = 2.6; trunk.rotation.z = rr(-0.08, 0.08); g.add(trunk);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + rr(-0.2, 0.2);
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 4), leafMats[i % leafMats.length]);
    frond.rotation.order = 'YXZ'; frond.rotation.set(1.1, a, 0); frond.position.set(Math.cos(a) * 0.2, 5.0, Math.sin(a) * 0.2);
    frond.userData.base = 1; frond.userData.d = rnd(); g.add(frond);
  }
  const crown = new THREE.Group(); crown.position.y = 5; g.add(crown); crown.userData.ph = rnd() * 6; swayers.push(crown);
  scene.add(g); blob(x, z, 1.6 * s); treeGroups.palm.push(g); return g;
}
function makePine(x, z, s) {
  const g = new THREE.Group(); g.position.set(x, hgt(x, z) - 0.05, z); g.scale.setScalar(s);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.8, 8), trunkMat); trunk.position.y = 0.9; g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const r = 1.5 - i * 0.28, h = 1.6 - i * 0.1, y = 1.4 + i * 1.05;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), pineMat); cone.position.y = y; g.add(cone);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.92, h * 0.35, 8), new THREE.MeshLambertMaterial({ color: 0xf2f6fa }));
    cap.position.y = y + h * 0.28; g.add(cap);
  }
  scene.add(g); blob(x, z, 1.8 * s); treeGroups.pine.push(g); return g;
}

seed = 4242;
for (let i = 0; i < 18; i++) {
  const x = -8 + i * 5.5 + rr(-1, 1); const z = rr(-10, -6);
  makeDeciduous(x, z, rr(0.85, 1.25), leafMats, i % 3 !== 0, 'meadow');
  makeDeciduous(x + rr(-1, 1), z - 1.5, rr(0.9, 1.3), blossomMats, false, 'blossom');
  makeDeciduous(x + rr(-0.8, 0.8), z - 0.5, rr(0.85, 1.2), autumnMats, i % 2 === 0, 'autumn');
}
for (let i = 0; i < 14; i++) {
  const x = -5 + i * 6.5 + rr(-1.2, 1.2);
  makePalm(x, rr(-12, -7), rr(0.9, 1.35));
  makePine(x + rr(-2, 2), rr(-14, -8), rr(0.85, 1.3));
}
[...treeGroups.blossom, ...treeGroups.autumn, ...treeGroups.palm, ...treeGroups.pine].forEach(g => { g.visible = false; });
// ---------- egg pair (cream + pink), short limbs, foot-planted gait ----------
const lam = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
const mats = {}; const M = (c) => (mats[c] ||= lam(c));
const EGG_R = 0.5, EGG_CY = 0.86, SCALE = 1.48;
const HIP_Y = 0.286, HIP_SEP = 0.12, L1 = 0.175, L2 = 0.165, FOOT_DROP = 0.034;
const REACH_L = 0.09, BOB = 0.034;
const STEP_W = REACH_L * 2 * SCALE, STRIDE_W = STEP_W * 2, LIFT_W = 0.048, SPEED = 0.9;
const YAW = Math.PI / 2;
function makeEggGeo(r) {
  const g = new THREE.SphereGeometry(r, 32, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = y / r;
    const widen = 1.07 - 0.22 * Math.max(0, ny) + 0.07 * Math.max(0, -ny);
    x *= widen; z *= widen * 0.94; y *= 1.18;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
function smileGeo() {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.092, Math.PI * 1.12, Math.PI * 1.88, false);
  s.absarc(0, 0.01, 0.064, Math.PI * 1.88, Math.PI * 1.12, true);
  return new THREE.ShapeGeometry(s, 18);
}
function eggSurface(lat, lon) {
  let x = Math.sin(lon) * Math.cos(lat) * EGG_R;
  let y = Math.sin(lat) * EGG_R;
  let z = Math.cos(lon) * Math.cos(lat) * EGG_R;
  const ny = y / EGG_R;
  const widen = 1.07 - 0.22 * Math.max(0, ny) + 0.07 * Math.max(0, -ny);
  x *= widen; z *= widen * 0.94; y = y * 1.18 + EGG_CY;
  return new THREE.Vector3(x, y, z);
}
function orientOut(obj, lat, lon, push = 0.016) {
  const p = eggSurface(lat, lon);
  const n = p.clone().sub(new THREE.Vector3(0, EGG_CY, 0)).normalize();
  obj.position.copy(p).addScaledVector(n, push);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
}
const eggGeo = makeEggGeo(EGG_R);
const geo = {
  eyeW: new THREE.SphereGeometry(0.09, 18, 14),
  pupil: new THREE.SphereGeometry(0.052, 14, 10),
  glint: new THREE.SphereGeometry(0.022, 8, 6),
  blush: new THREE.CircleGeometry(0.078, 20),
  smile: smileGeo(),
  thigh: new THREE.CapsuleGeometry(0.058, 0.062, 4, 10),
  shin: new THREE.CapsuleGeometry(0.05, 0.068, 4, 10),
  foot: new THREE.SphereGeometry(0.07, 14, 12),
  arm: new THREE.CapsuleGeometry(0.048, 0.03, 3, 8),
  hand: new THREE.SphereGeometry(0.055, 12, 10),
  tuft: new THREE.SphereGeometry(0.048, 10, 8),
  lobe: new THREE.SphereGeometry(0.072, 12, 10),
  knot: new THREE.SphereGeometry(0.034, 10, 8),
};
const blushMat = {
  cream: new THREE.MeshBasicMaterial({ color: 0xff8a9b, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
  pink: new THREE.MeshBasicMaterial({ color: 0xe44568, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
};
const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const mouthMat = M(0xd4536a);
function addEye(parent, lat, lon) {
  const g = new THREE.Group();
  const white = new THREE.Mesh(geo.eyeW, M(0xfffdf8)); white.scale.set(1.02, 1.16, 0.3);
  const pupil = new THREE.Mesh(geo.pupil, M(0x3a2926)); pupil.position.z = 0.055; pupil.scale.set(0.92, 1.05, 0.45);
  const glint = new THREE.Mesh(geo.glint, glintMat); glint.position.set(-0.028, 0.038, 0.095); glint.scale.setScalar(1);
  const glint2 = new THREE.Mesh(geo.glint, glintMat); glint2.position.set(0.03, -0.02, 0.09); glint2.scale.setScalar(0.45);
  g.add(white, pupil, glint, glint2);
  orientOut(g, lat, lon, 0.02);
  parent.add(g);
}
function addBlush(parent, lat, lon, key) {
  const m = new THREE.Mesh(geo.blush, blushMat[key]);
  m.scale.set(1.2, 0.78, 1);
  orientOut(m, lat, lon, 0.012);
  parent.add(m);
}
function addSmile(parent) {
  const m = new THREE.Mesh(geo.smile, mouthMat);
  orientOut(m, -0.34, -0.22, 0.014);
  parent.add(m);
}
function solveLeg(tz, ty, out) {
  const dist = Math.hypot(tz, ty) || 1e-8;
  const maxL = (L1 + L2) * 0.998;
  const minL = Math.abs(L1 - L2) + 1e-4;
  const d = Math.min(Math.max(dist, minL), maxL);
  const ux = tz / dist, uy = ty / dist;
  const tx = ux * d, ty2 = uy * d;
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  let best = null;
  for (const sgn of [1, -1]) {
    const px = -uy * sgn, py = ux * sgn;
    const kz = ux * a + px * h, ky = uy * a + py * h;
    const thigh = Math.atan2(-kz, -ky);
    let shin = Math.atan2(-(tx - kz), -(ty2 - ky)) - thigh;
    if (shin > Math.PI) shin -= Math.PI * 2; else if (shin < -Math.PI) shin += Math.PI * 2;
    const lineZ = tx * (a / Math.max(d, 1e-6));
    const behind = lineZ - kz;
    if (!best || behind > best.behind) best = { thigh, shin, behind };
  }
  out.thigh = best.thigh; out.shin = best.shin; out.behind = best.behind;
}
function makeEgg(o) {
  const root = new THREE.Group();
  root.scale.setScalar(SCALE);
  const body = new THREE.Group(); root.add(body);
  const squash = new THREE.Group(); body.add(squash);
  const shell = new THREE.Mesh(eggGeo, lam(o.shell, { side: THREE.BackSide }));
  shell.scale.setScalar(1.045); shell.position.y = EGG_CY; squash.add(shell);
  const egg = new THREE.Mesh(eggGeo, M(o.body)); egg.position.y = EGG_CY; squash.add(egg);
  // Face sits on the front, shifted toward the camera (-X local = +Z world at yaw π/2)
  addEye(squash, 0.2, -0.34);
  addEye(squash, 0.2, 0.16);
  addBlush(squash, -0.08, -0.55, o.blush);
  addBlush(squash, -0.1, 0.38, o.blush);
  addSmile(squash);
  if (o.tuft) {
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(geo.tuft, M(o.tuft));
      t.scale.set(0.72, 1.55, 0.72);
      t.position.set((i - 1) * 0.05, EGG_CY + 0.64, 0.04);
      t.rotation.z = (i - 1) * 0.42;
      squash.add(t);
    }
  }
  if (o.bow) {
    const b = new THREE.Group();
    for (const sx of [-1, 1]) {
      const lobe = new THREE.Mesh(geo.lobe, M(o.bow));
      lobe.scale.set(1.85, 0.32, 0.26);
      lobe.position.set(sx * 0.07, 0, 0);
      b.add(lobe);
    }
    b.add(new THREE.Mesh(geo.knot, M(0xffe08a)));
    b.position.set(0.0, EGG_CY + 0.8, 0.04);
    b.scale.setScalar(0.72);
    b.rotation.set(-0.35, 0, 0.1);
    squash.add(b);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * HIP_SEP, HIP_Y, 0); body.add(piv);
    const thigh = new THREE.Mesh(geo.thigh, M(o.limb)); thigh.position.y = -L1 * 0.5; piv.add(thigh);
    const shinPiv = new THREE.Group(); shinPiv.position.y = -L1; piv.add(shinPiv);
    const shin = new THREE.Mesh(geo.shin, M(o.limb)); shin.position.y = -L2 * 0.5; shinPiv.add(shin);
    const foot = new THREE.Mesh(geo.foot, M(0xfff8f2));
    foot.scale.set(1.08, 0.48, 1.4); foot.position.set(0, -L2 + FOOT_DROP, 0.016); shinPiv.add(foot);
    const soleMesh = new THREE.Mesh(geo.foot, M(0xe8c9a8));
    soleMesh.scale.set(1.02, 0.18, 1.32); soleMesh.position.set(0, -L2 + 0.01, 0.016); shinPiv.add(soleMesh);
    const sole = new THREE.Object3D(); sole.position.set(0, -L2, 0); shinPiv.add(sole);
    piv.userData = { shin: shinPiv, foot, sole, sx, ik: { thigh: 0, shin: 0, behind: 0 } };
    legs.push(piv);
  }
  const arms = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.5, 0.62, 0.08); body.add(piv);
    const arm = new THREE.Mesh(geo.arm, M(o.limb)); arm.position.y = -0.08; piv.add(arm);
    const hand = new THREE.Mesh(geo.hand, M(o.limb)); hand.position.y = -0.17; piv.add(hand);
    piv.userData = { sx, hand }; arms.push(piv);
  }
  root.traverse(m => { if (m.isMesh && m.material && !m.material.transparent && m.material.side !== THREE.BackSide) m.castShadow = true; });
  root.userData = { body, squash, arms, legs, name: o.name, holdUmbrella: !!o.umbrella };
  return root;
}
function makeUmbrella() {
  const g = new THREE.Group();
  const tex = canvasTex(128, 8, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fff6f2' : '#e23b4a'; c.fillRect(i * 16, 0, 16, 8); } });
  const can = new THREE.Group(); can.position.y = 1.05; g.add(can);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.58, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2.15), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  dome.scale.y = 0.5; can.add(dome);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), M(0xfff8f2)); tip.position.y = 0.28; can.add(tip);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.05, 6), M(0x8a5a3a)); shaft.position.y = 0.48; g.add(shaft);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12, Math.PI), M(0x8a5a3a));
  handle.rotation.z = Math.PI; handle.position.set(0.04, -0.08, 0); g.add(handle);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  g.position.set(0.02, -0.06, 0.02);
  return g;
}
const eggDefs = [
  { name: 'cream', body: 0xffe3a6, limb: 0xf6c56e, shell: 0xe8a44c, blush: 'cream', tuft: 0xf0a030, xOff: -0.82, lane: 0.5, phase: 0, umbrella: true },
  { name: 'pink', body: 0xffb3c8, limb: 0xff8eae, shell: 0xe86b90, blush: 'pink', bow: 0xff5e8a, xOff: 0.82, lane: -0.48, phase: 0.2 * STRIDE_W, umbrella: false },
];
const eggs = [];
const kids = [];
let umbrella = null;
for (const o of eggDefs) {
  const e = makeEgg(o);
  e.rotation.y = YAW;
  scene.add(e);
  const sh = blob(o.xOff, pathCZ(o.xOff) + o.lane, 0.5, 1.05);
  Object.assign(e.userData, { xOff: o.xOff, lane: o.lane, gait: o.phase, blob: sh });
  if (o.umbrella) {
    umbrella = makeUmbrella();
    const holdArm = e.userData.arms.find(a => a.userData.sx < 0);
    holdArm.userData.hand.add(umbrella);
    e.userData.umb = umbrella;
  }
  eggs.push(e); kids.push(e);
}
while (kids.length < 5) kids.push({ position: { x: 99, z: 99 }, visible: false });
let pairX = 4;
const _yAxis = new THREE.Vector3(0, 1, 0);
const _up = new THREE.Vector3();
const _q = new THREE.Quaternion();
const heroes = { cream: eggs[0], pink: eggs[1] };
let hero = eggs[0];
const WALK_X0 = -2, WALK_X1 = 72;
// ---------- butterflies ----------
const wingTex = (a, b) => canvasTex(64, 64, (g) => { g.fillStyle = a; g.beginPath(); g.ellipse(32, 22, 26, 20, -0.3, 0, 7); g.fill(); g.beginPath(); g.ellipse(26, 46, 16, 14, 0.4, 0, 7); g.fill(); g.fillStyle = b; g.beginPath(); g.ellipse(36, 20, 12, 9, -0.3, 0, 7); g.fill(); });
const wingTexs = [wingTex('#ffb52e', '#fff1a0'), wingTex('#ffd54a', '#ffffff'), wingTex('#8ec8ff', '#e6f4ff')];
const flies = [];
for (let i = 0; i < 5; i++) {
  const f = new THREE.Group(); const mat = new THREE.MeshBasicMaterial({ map: wingTexs[i % 3], transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 });
  const wg = new THREE.PlaneGeometry(0.14, 0.14); wg.translate(0.07, 0, 0);
  const L = new THREE.Mesh(wg, mat), R = new THREE.Mesh(wg, mat); R.scale.x = -1; f.add(L, R);
  f.userData = { L, R, cx: rr(0, 40), cy: rr(1.5, 3.0), cz: rr(-3, 1), ax: rr(2, 5), az: rr(0.4, 1.2), sp: rr(0.2, 0.35), ph: rnd() * 6 };
  scene.add(f); flies.push(f);
}

// ---------- rain ----------
const rainU = { uKids: kidPosU, uUmb: { value: 0 }, uTime: timeU, uOpacity: { value: 0 }, uSlant: { value: new THREE.Vector2(0.12, 0.02) }, ...fogUniforms };
{
  const N = 14000; const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3)); g.setIndex([0, 1, 2, 1, 3, 2]);
  const a = new Float32Array(N * 4); for (let i = 0; i < N; i++) { a.set([rr(-8, 80), rr(-14, 6), rnd(), rr(0.8, 1.2)], i * 4); }
  g.setAttribute('aDrop', new THREE.InstancedBufferAttribute(a, 4)); g.instanceCount = N;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: rainU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec4 aDrop; uniform float uTime; uniform vec2 uSlant; uniform vec2 uKids[5]; uniform float uUmb; varying vec2 vUv; varying float vDist,vNear; ${GLSL_H}
    void main(){ float H = 14.0; float fall = mod(aDrop.z*H + uTime*13.0*aDrop.w, H);
      vec2 xz = aDrop.xy + uSlant*fall; float y = hgt(xz) + H - fall;
      vec3 head = vec3(xz.x,y,xz.y); vec3 dir = normalize(vec3(uSlant.x,-1.0,uSlant.y));
      vec3 side = normalize(cross(dir, normalize(cameraPosition-head)));
      vec3 p = head - dir*0.55*aDrop.w*position.y + side*position.x*0.016;
      vec4 mv = viewMatrix*vec4(p,1.0); vDist = -mv.z; vNear = smoothstep(0.6,2.0,vDist);
      float kd = 99.0; for(int i=0;i<5;i++) kd = min(kd, distance(xz, uKids[i]));
      if (kd < 0.68 && y < hgt(xz) + 1.85) vNear *= 1.0 - uUmb; vUv = position.xy; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uOpacity; varying vec2 vUv; varying float vDist,vNear; ${GLSL_FOG}
    void main(){ float a = (1.0-abs(vUv.x)) * pow(1.0-vUv.y,0.7) * vNear * uOpacity * 0.6;
      vec3 c = applyFog(vec3(0.93,0.96,1.0), vDist*0.35);
      gl_FragColor = vec4(c,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` }));
  m.frustumCulled = false; scene.add(m);
}

// ---------- snow ----------
const snowU = { uTime: timeU, uOpacity: { value: 0 }, uWind: windU, uScale: scaleU, ...fogUniforms };
{
  const N = 10000; const g = new THREE.BufferGeometry(); const p = new Float32Array(N * 3), a = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { p.set([rr(-10, 85), rnd(), rr(-16, 6)], i * 3); a.set([rnd(), rr(0.6, 1.4)], i * 2); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aR', new THREE.BufferAttribute(a, 2));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: snowU, transparent: true, depthWrite: false,
    vertexShader: `attribute vec2 aR; uniform float uTime, uScale, uWind; varying float vA, vDist; ${GLSL_H}
    void main(){ float H = 12.0; float t = uTime;
      float fall = mod(position.y*H + t*0.75*(0.7+0.3*aR.y), H);
      vec2 xz = position.xz + vec2(sin(t*0.45 + aR.x*40.0)*0.7 + sin(t*0.9+aR.x*13.0)*0.25, cos(t*0.38 + aR.x*27.0)*0.6);
      xz.x += uWind*fall*0.5;
      vec3 wp = vec3(xz.x, hgt(xz) + H - fall, xz.y);
      vec4 mv = viewMatrix*vec4(wp,1.0); vDist = -mv.z;
      float px = 0.07*aR.y*uScale/max(vDist,0.1);
      vA = clamp(px/2.0,0.0,1.0) * smoothstep(0.5,1.5,vDist) * smoothstep(0.0,0.6,H-fall) * smoothstep(0.0,0.3,fall);
      gl_PointSize = max(px,2.0); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uOpacity; varying float vA, vDist; ${GLSL_FOG}
    void main(){ float d = length(gl_PointCoord*2.0-1.0); float a = pow(1.0-smoothstep(0.0,1.0,d),1.5);
      gl_FragColor = vec4(applyFog(vec3(1.0),vDist*0.4), a*vA*uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` }));
  pts.frustumCulled = false; scene.add(pts);
}

// ---------- falling leaves (autumn) ----------
const leafU = { uTime: timeU, uOpacity: { value: 0 }, uWind: windU, uScale: scaleU, ...fogUniforms };
{
  const N = 3500; const g = new THREE.BufferGeometry(); const p = new Float32Array(N * 3), a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { p.set([rr(-10, 85), rnd(), rr(-14, 5)], i * 3); a.set([rnd(), rr(0.8, 1.6), rnd()], i * 3); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aR', new THREE.BufferAttribute(a, 3));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: leafU, transparent: true, depthWrite: false,
    vertexShader: `attribute vec3 aR; uniform float uTime, uScale, uWind; varying float vA, vDist; varying float vHue; ${GLSL_H}
    void main(){ float H = 10.0; float t = uTime;
      float fall = mod(position.y*H + t*0.55*(0.7+0.3*aR.y), H);
      vec2 xz = position.xz + vec2(sin(t*0.7 + aR.x*30.0)*1.2 + uWind*fall*0.9, cos(t*0.5 + aR.x*20.0)*0.8);
      vec3 wp = vec3(xz.x, hgt(xz) + H - fall, xz.y);
      vec4 mv = viewMatrix*vec4(wp,1.0); vDist = -mv.z; vHue = aR.z;
      float px = 0.11*aR.y*uScale/max(vDist,0.1);
      vA = clamp(px/2.5,0.0,1.0) * smoothstep(0.4,1.4,vDist) * smoothstep(0.0,0.5,H-fall);
      gl_PointSize = max(px,2.5); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uOpacity; varying float vA, vDist, vHue; ${GLSL_FOG}
    void main(){ vec2 q = gl_PointCoord*2.0-1.0; float d = length(q*vec2(1.0,1.6)); if(d>1.0) discard;
      float a = pow(1.0-d,1.2); vec3 col = mix(vec3(0.90,0.35,0.12), vec3(0.95,0.72,0.18), vHue);
      col = mix(col, vec3(0.75,0.18,0.10), step(0.66, vHue));
      gl_FragColor = vec4(applyFog(col,vDist*0.4), a*vA*uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` }));
  pts.frustumCulled = false; scene.add(pts);
}

// ---------- wind lines ----------
const windLineU = { uTime: timeU, uOpacity: { value: 0 }, ...fogUniforms };
{
  const SEG = 120, N = 22; const g = new THREE.InstancedBufferGeometry();
  const pos = [], idx = [];
  for (let i = 0; i <= SEG; i++) { pos.push(i / SEG, -1, 0, i / SEG, 1, 0); if (i < SEG) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const a = new Float32Array(N * 4), b = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { a.set([rr(-5, 60), rr(0.4, 3.0), rr(-8, 3.0), rr(18, 28)], i * 4); b.set([rnd(), rr(0.22, 0.4), rnd(), rnd() < 0.4 ? 1 : 0], i * 4); }
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(a, 4)); g.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 4)); g.instanceCount = N;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: windLineU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec4 aA, aB; uniform float uTime; varying float vS, vV, vDist, vOn; ${GLSL_H}
    vec3 path(float u){ float L = aA.w; vec3 p = vec3(aA.x + u*L, 0.0, aA.z);
      p.y = aA.y + sin(u*5.0 + aB.x*20.0)*0.35 + sin(u*11.0+aB.z*9.0)*0.12;
      p.z += sin(u*3.5 + aB.z*13.0)*0.9;
      float u0 = 0.35 + aB.z*0.3; float lw = 0.07;
      if (aB.w > 0.5 && u > u0 && u < u0+lw) { float ang = (u-u0)/lw*6.2832; float r = 0.45;
        p.x += -sin(ang)*r; p.y += (1.0-cos(ang))*r; }
      p.y += hgt(p.xz); return p; }
    void main(){ float u = position.x; float cyc = uTime*aB.y*0.55 + aB.x; float k = floor(cyc); float c = fract(cyc);
      float head = c*1.5 - 0.1; float len = 0.22;
      float s = (u - (head-len))/len; vS = s; vOn = step(0.0,s)*step(s,1.0);
      vec3 p = path(u); vec3 tng = normalize(path(u+0.01)-p);
      vec3 side = normalize(cross(tng, normalize(cameraPosition-p)));
      float w = 0.045*smoothstep(0.0,0.5,s)*smoothstep(1.0,0.85,s);
      p += vec3(0.0, sin(k*3.7)*0.6, cos(k*5.1)*1.2) + side*position.y*w;
      vec4 mv = viewMatrix*vec4(p,1.0); vDist = -mv.z; vV = position.y; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uOpacity; varying float vS, vV, vDist, vOn; ${GLSL_FOG}
    void main(){ if(vOn<0.5) discard; float a = smoothstep(0.0,0.7,vS)*smoothstep(1.0,0.9,vS) * (1.0-vV*vV);
      a *= smoothstep(1.0,3.0,vDist);
      gl_FragColor = vec4(applyFog(vec3(1.0),vDist*0.5), a*uOpacity*0.9);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` }));
  m.frustumCulled = false; scene.add(m);
}
// ---------- audio ----------
const AUD = {}; for (const n of ['sunny', 'kids', 'overcast', 'rain', 'snow', 'wind']) { const a = new Audio(`./audio/${n}.mp3`); a.loop = true; a.volume = 0; a.preload = 'auto'; AUD[n] = a; }
const MIX = {
  spring: { rain: 0.8 },
  summer: { wind: 0.45, sunny: 0.35, kids: 0.12 },
  autumn: { wind: 0.7, sunny: 0.05 },
  winter: { snow: 0.4 },
};
let audioOn = false;
const VOICE = { spring: ['rain_1', 'rain_2'], summer: ['sunny_1', 'sunny_2'], autumn: ['wind_1', 'wind_2'], winter: ['snow_1', 'snow_2'] };
const VA = {}; for (const k of [...Object.values(VOICE).flat(), 'laugh']) { const a = new Audio(`./audio/voice/${k}.mp3`); a.preload = 'auto'; a.volume = 1; VA[k] = a; }
let voiceBusyUntil = 0, nextChatter = 30, duck = 1, simTime = 0;
function playVoice(name, withLaugh) {
  if (!audioOn) return; const v = VOICE[name]; if (!v) return;
  const a = VA[v[Math.floor(Math.random() * v.length)]]; a.currentTime = 0; a.play().catch(() => {});
  voiceBusyUntil = simTime + (a.duration || 2.5) + 0.3;
  if (withLaugh) a.onended = () => { a.onended = null; const l = VA.laugh; l.currentTime = 0; l.volume = 0.8; l.play().catch(() => {}); voiceBusyUntil = simTime + (l.duration || 5); };
  else a.onended = null;
  nextChatter = simTime + 30 + Math.random() * 25;
}
function startAudio() { if (audioOn) return; audioOn = true; for (const a of Object.values(AUD)) a.play().catch(() => {}); for (const a of Object.values(VA)) a.load(); }
addEventListener('pointerdown', startAudio, { once: false });

// ---------- season UI ----------
const btns = [...document.querySelectorAll('#ui button')];
const badgeHan = document.getElementById('badge-han');
const badgeEn = document.getElementById('badge-en');
const badgeSub = document.getElementById('badge-sub');
const badgeIdx = document.getElementById('badge-idx');
const progressSegs = [...document.querySelectorAll('#progress i')];

function updateBadge(name) {
  const m = SEASON_META[name]; if (!m) return;
  badgeHan.textContent = m.han; badgeEn.textContent = m.en; badgeEn.style.color = m.accent;
  badgeSub.textContent = m.sub; badgeIdx.textContent = m.idx;
  progressSegs.forEach((el, i) => { el.classList.toggle('on', i === m.i); el.style.background = i === m.i ? m.accent : 'rgba(40,50,65,.45)'; });
}

function setTreesForSeason(name) {
  for (const [kind, list] of Object.entries(treeGroups)) {
    list.forEach((g, i) => {
      if (name === 'spring') {
        if (kind === 'meadow') g.visible = i % 3 !== 0;
        else if (kind === 'blossom') g.visible = true;
        else g.visible = false;
      } else if (name === 'summer') {
        g.visible = kind === 'palm';
      } else if (name === 'autumn') {
        g.visible = kind === 'autumn';
      } else if (name === 'winter') {
        g.visible = kind === 'pine';
      }
    });
  }
  mountainGroup.visible = name === 'winter';
}

function wrap(a, n) { return ((a % n) + n) % n; }
function camGoal() {
  const aspect = camera.aspect;
  const portrait = aspect < 0.9;
  return {
    x: pairX + (portrait ? 0.6 : 5.0),
    y: portrait ? 5.2 : 3.35 + (aspect < 1.35 ? 0.4 : 0),
    z: portrait ? 18.8 : 9.4 + (aspect < 1.35 ? 2.0 : 0),
    tx: pairX, ty: 1.12, tz: 0,
  };
}
function snapCamera() {
  const cam = camGoal();
  camera.position.set(cam.x, cam.y, cam.z);
  controls.target.set(cam.tx, cam.ty, cam.tz);
  controls.update();
}
function posePair(dt) {
  if (dt > 0) {
    pairX += SPEED * dt;
    if (pairX > WALK_X1) pairX = WALK_X0;
    for (const e of eggs) e.userData.gait += SPEED * dt;
  }
  const cy = Math.cos(YAW), sy = Math.sin(YAW);
  const inv = 1 / SCALE;
  for (const e of eggs) {
    const u = e.userData;
    const x = pairX + u.xOff;
    const z = pathCZ(x) + u.lane;
    e.position.set(x, hgt(x, z), z);
    e.rotation.y = YAW;
    const cycle = wrap(u.gait, STRIDE_W);
    const p = cycle / STRIDE_W;
    const bob = Math.sin(p * Math.PI * 2) ** 2 * BOB;
    u.body.position.y = bob;
    const squat = 1 - bob / BOB;
    u.squash.scale.set(1 + squat * 0.035, 1 - squat * 0.05, 1 + squat * 0.035);
    u.squash.rotation.y = -0.42;
    u.squash.rotation.x = 0.04;
    u.blob.position.set(x, hgt(x, z) + 0.03, z + 0.02);
    u.legs.forEach((leg) => {
      const sx = leg.userData.sx;
      const reachW = STEP_W * 0.5;
      const cyc = wrap(u.gait + (sx < 0 ? 0 : STRIDE_W * 0.5), STRIDE_W);
      let fz, lift;
      if (cyc < STEP_W) {
        fz = x - cyc + reachW;
        lift = 0;
      } else {
        const sT = (cyc - STEP_W) / STEP_W;
        const ease = sT * sT * (3 - 2 * sT);
        const f0 = x - cyc + reachW;
        const f1 = x + (STRIDE_W - cyc) + reachW;
        fz = f0 + (f1 - f0) * ease;
        lift = Math.sin(sT * Math.PI) * LIFT_W;
      }
      const footZ = z - sx * HIP_SEP * SCALE;
      const footY = hgt(fz, footZ) + lift;
      const dx = (fz - x) * inv, dy = (footY - e.position.y) * inv, dz = (footZ - z) * inv;
      const lz = dx * sy + dz * cy;
      const py = dy - (HIP_Y + bob);
      const ik = leg.userData.ik;
      solveLeg(lz, py, ik);
      leg.rotation.set(ik.thigh, 0, 0);
      leg.userData.shin.rotation.set(ik.shin, 0, 0);
      leg.userData.plant = { x: fz, y: footY, z: footZ, lift };
    });
    const hold = u.holdUmbrella && umbrella && umbrella.visible;
    u.arms.forEach((arm) => {
      const sx = arm.userData.sx;
      if (hold && sx < 0) {
        arm.rotation.set(-0.15, 0, -1.35);
      } else {
        // Same-side arm swings opposite the foot, staying beside the body.
        const legP = wrap(u.gait + (sx < 0 ? 0 : STRIDE_W * 0.5), STRIDE_W) / STRIDE_W;
        arm.rotation.set(Math.cos(legP * Math.PI * 2) * 0.5, 0, sx * 0.38);
      }
    });
    if (u.umb && hold) {
      const hand = u.umb.parent;
      hand.updateWorldMatrix(true, false);
      hand.getWorldQuaternion(_q).invert();
      _up.copy(_yAxis).applyQuaternion(_q);
      u.umb.quaternion.setFromUnitVectors(_yAxis, _up);
      u.umb.rotateZ(Math.sin(simTime * 1.4 + p * 2) * 0.05);
    }
  }
  hero = eggs[0];
}
function setWeather(name, instant = false) {
  if (!PRESETS[name]) return;
  target = PRESETS[name]; currentName = name;
  btns.forEach(b => b.classList.toggle('on', b.dataset.w === name));
  updateBadge(name);
  if (umbrella) umbrella.visible = name === 'spring';
  const startX = instant ? WALK_X0 + 5 : camera.position.x - 6.5;
  pairX = Math.max(WALK_X0, Math.min(WALK_X1 - 14, startX));
  posePair(0);
  if (instant) snapCamera();
  setTreesForSeason(name);
  if (instant) for (const k in target) target[k] instanceof THREE.Color ? cur[k].copy(target[k]) : (cur[k] = target[k]);
}
btns.forEach(b => b.addEventListener('click', () => { startAudio(); setTimeout(() => playVoice(b.dataset.w, b.dataset.w === 'summer'), 350); }));
window.setWeather = setWeather;
setWeather(window.__pendingWeather || params.get('w') || 'spring', true);

// ---------- loop ----------
function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  scaleU.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); }
addEventListener('resize', onResize);
let cloudOff = 0, accum = 0;

function update(dt) {
  simTime += dt; timeU.value = simTime;
  const k = 1 - Math.exp(-dt * 1.4);
  for (const key in target) { const v = target[key]; if (v instanceof THREE.Color) cur[key].lerp(v, k); else cur[key] += (v - cur[key]) * k; }
  skyU.uTop.value.copy(cur.skyTop); skyU.uHor.value.copy(cur.skyHor); skyU.uGlow.value = cur.glow; skyU.uNight.value = cur.night;
  sun.intensity = cur.sun; fill.intensity = 0.35 + cur.sun * 0.38; sun.color.copy(cur.sunCol); hemi.intensity = cur.hemi;
  scene.fog.color.copy(cur.fogCol); scene.fog.density = cur.fogD;
  fogUniforms.uFogColor.value.copy(cur.fogCol); fogUniforms.uFogDensity.value = cur.fogD;
  lightU.uAmb.value = cur.hemi; lightU.uSunI.value = cur.sun; lightU.uSunCol.value.copy(cur.sunCol);
  windU.value = cur.wind; snowCover.value = cur.cover;
  groundTintU.uSand.value = cur.sand;
  groundTintU.uA.value.copy(cur.groundA); groundTintU.uB.value.copy(cur.groundB);
  grassBaseU.value.copy(cur.sand > 0.5 ? C(0xb8a050) : (cur.leafTint > 0.5 ? C(0xa87828) : C(0x4f9a1c)));
  grassTipU.value.copy(cur.sand > 0.5 ? C(0xd0bc70) : (cur.leafTint > 0.5 ? C(0xd4a848) : C(0xb6e04e)));
  accum += ((target.cover || 0) - accum) * (1 - Math.exp(-dt * (target.cover ? 0.45 : 0.9)));
  snowLayerU.value = accum; snowLayer.visible = accum > 0.005; hemi.color.setHex(0xdcefff).lerp(C(0xfffefa), accum);
  for (const cr of swayers) for (const m of cr.children) {
    if (!m.userData.base) continue;
    const kk = THREE.MathUtils.clamp((1 - accum * 1.15) * 1.4 - (m.userData.d || 0) * 0.4, 0, 1); const e = kk * kk * (3 - 2 * kk);
    const loss = cur.leafTint * 0.35;
    const ee = e * (1 - loss * (m.userData.d || 0));
    m.visible = ee > 0.01; m.scale.setScalar(m.userData.base * Math.max(ee, 0.01));
  }
  for (const f of window.__flowers) f.position.y = -0.32 * Math.max(accum, cur.sand * 0.6); buryU.value = Math.max(accum, cur.sand * 0.35); leafSnowU.value = accum;
  oceanGroup.userData.mat.opacity = cur.ocean * 0.92;
  oceanGroup.visible = cur.ocean > 0.02;
  oceanGroup.traverse(o => { if (o.userData && o.userData.wave && o.material) o.material.opacity = cur.ocean * 0.55; });
  moonSprite.material.opacity = cur.night;
  moonSprite.position.set(camera.position.x + 18, 22, -55);
  moonSprite.scale.setScalar(28 + 10 * cur.night);
  sunSprite.material.opacity = THREE.MathUtils.clamp(cur.glow, 0, 1) * (1 - cur.night * 0.85);

  posePair(dt);

  kids.forEach((kd, i) => {
    if (!kd.position) return;
    const vis = kd.visible !== false && kd.position.x < 90;
    kidPosU.value[i].set(vis ? kd.position.x : 99, vis ? (kd.position.z || 0) : 99);
    kidHU.value[i] = vis ? 1.25 : 0;
  });

  const shStr = THREE.MathUtils.clamp((cur.sun - 0.4) / 2.0, 0, 1) * (1 - THREE.MathUtils.clamp(cur.fogD / 0.06, 0, 1) * 0.8) * (1 - cur.night * 0.7);
  shadowU.value = shStr; sun.shadow.intensity = shStr; blobMat.opacity = 1 - 0.45 * shStr;
  sun.target.position.set(pairX, 0, 0); sun.position.set(pairX, 0, 0).addScaledVector(LIGHT_DIR, 30); sun.target.updateMatrixWorld();

  rainU.uOpacity.value = cur.rain; rainU.uUmb.value = THREE.MathUtils.smoothstep(cur.rain, 0.3, 0.9);
  snowU.uOpacity.value = cur.snow; leafU.uOpacity.value = cur.leaves; windLineU.uOpacity.value = cur.lines;
  leafMats.forEach((m, i) => m.color.copy(leafBase[i]).lerp(C(0xe6eef0), accum * 0.2));

  cloudOff += dt * cur.cloudSpd;
  for (const c of clouds) { const span = 900; let x = c.userData.base + cloudOff; x = ((x + span / 2) % span + span) % span - span / 2; c.position.x = x;
    c.material.color.copy(cur.cloudCol); c.material.opacity = (c.userData.grey ? cur.grey : 1) * cur.cloud; }
  for (const s of swayers) { const ph = s.userData.ph; s.rotation.z = Math.sin(simTime * 0.7 + ph) * 0.015 - cur.wind * (0.07 + 0.045 * Math.sin(simTime * 1.1 + ph)); s.rotation.x = Math.sin(simTime * 0.53 + ph) * 0.01 * (1 + cur.wind * 3.5); }

  for (const f of flies) {
    const uu = f.userData, t = simTime * uu.sp + uu.ph;
    f.visible = cur.fly > 0.05; f.scale.setScalar(Math.max(cur.fly, 0.001));
    f.position.set(pairX + uu.cx * 0.15 + Math.sin(t) * uu.ax, uu.cy + Math.sin(t * 2.3) * 0.25, uu.cz + Math.sin(t * 1.7) * uu.az);
    const flap = Math.sin(simTime * 9 + uu.ph * 3) * 0.9; uu.L.rotation.z = flap; uu.R.rotation.z = -flap;
  }

  const cam = camGoal();
  const desiredCamX = cam.x, desiredCamY = cam.y, desiredCamZ = cam.z;
  const desiredTgtX = cam.tx, desiredTgtY = cam.ty, desiredTgtZ = cam.tz;
  const ck = 1 - Math.exp(-dt * 1.15); // slower than hero
  camera.position.x += (desiredCamX - camera.position.x) * ck;
  camera.position.y += (desiredCamY - camera.position.y) * ck;
  camera.position.z += (desiredCamZ - camera.position.z) * ck;
  controls.target.x += (desiredTgtX - controls.target.x) * ck;
  controls.target.y += (desiredTgtY - controls.target.y) * ck;
  controls.target.z += (desiredTgtZ - controls.target.z) * ck;

  if (audioOn && simTime > nextChatter && simTime > voiceBusyUntil) playVoice(currentName, currentName === 'summer' && Math.random() < 0.5);
  duck += ((simTime < voiceBusyUntil ? 0.45 : 1) - duck) * Math.min(1, dt * 3);
  if (audioOn) { const mix = MIX[currentName]; for (const n in AUD) { const tv = (mix[n] || 0) * duck; const a = AUD[n]; a.volume = Math.min(1, Math.max(0, a.volume + (tv - a.volume) * Math.min(1, dt * 1.2))); } }
}
let last = performance.now();
function frame() { try { frameInner(); } catch (e) { if (!frame.warned) { console.warn('frame error', e); frame.warned = true; } } }
function frameInner() { const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.05); last = now; controls.update(); update(dt); renderer.render(scene, camera); }
onResize();
window.simulate = (sec, step = 1 / 30) => { for (let t = 0; t < sec; t += step) update(step); renderer.render(scene, camera); };
window.renderOnce = () => renderer.render(scene, camera);
window.kidAct = () => {};
if (params.has('shot')) { window.__dbg = { kids, camera, controls, scene, renderer, heroes, eggs }; renderer.render(scene, camera); window.__ready = true; }
else { renderer.setAnimationLoop(frame); window.__ready = true; }

window.THREE_V = THREE.Vector3;
