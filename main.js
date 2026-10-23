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
// ---------- kids / hero walkers ----------
const SKIN = 0xffd9c2, HAIR = 0x6b3e20, JEANS = 0x6e9ad6;
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const mats = {}; const M = (c) => (mats[c] ||= lam(c));
const sph = (r, c, ws = 24, hs = 16) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), M(c));
const cap = (r, l, c) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 14), M(c));

function makeKid(o) {
  const k = new THREE.Group();
  const body = new THREE.Group(); k.add(body);
  const legCol = o.legs || JEANS;
  const legs = [];
  // Two-bone lankier chibi legs (~+40% length); hip higher so feet stay on ground
  const thighLen = 0.30, shinLen = 0.26, hipY = 0.62;
  for (const sx of [-1, 1]) {
    const thighCol = o.shorts ? o.shorts : legCol;
    const shinCol = o.shorts ? SKIN : legCol;
    const piv = new THREE.Group(); piv.position.set(sx * 0.085, hipY, 0);
    const thigh = cap(0.07, thighLen - 0.06, thighCol); thigh.position.y = -thighLen * 0.5; piv.add(thigh);
    const shinPiv = new THREE.Group(); shinPiv.position.y = -thighLen; piv.add(shinPiv);
    const shin = cap(0.062, shinLen - 0.05, shinCol); shin.position.y = -shinLen * 0.5; shinPiv.add(shin);
    const shoe = sph(0.09, o.shoes); shoe.scale.set(0.9, 0.6, 1.35); shoe.position.set(0, -shinLen + 0.02, 0.035); shinPiv.add(shoe);
    const sole = sph(0.09, 0xffffff); sole.scale.set(0.92, 0.25, 1.37); sole.position.set(0, -shinLen - 0.005, 0.035); shinPiv.add(sole);
    piv.userData = { thigh, shin: shinPiv }; body.add(piv); legs.push(piv);
  }
  const torso = new THREE.Group(); torso.position.y = 0.68; body.add(torso);
  const tors = cap(0.165, 0.16, o.shirt); tors.scale.set(1, 1, 0.82); tors.position.y = 0.17; torso.add(tors);
  if (o.vest) {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 0.22), M(o.vest)); vest.position.set(0, 0.18, 0.02); torso.add(vest);
  }
  if (o.shorts) {
    for (const sx of [-1, 1]) { const sh = cap(0.075, 0.06, o.shorts); sh.position.set(sx * 0.08, 0.02, 0); torso.add(sh); }
  } else {
    const hip = cap(0.168, 0.04, o.legs || JEANS); hip.scale.set(1, 1, 0.84); hip.position.y = 0.04; torso.add(hip);
  }
  if (o.collar) { const col = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.025, 8, 20), M(o.collar)); col.rotation.x = Math.PI / 2 - 0.25; col.position.set(0, 0.36, 0.02); torso.add(col); }
  if (o.scarf) {
    const sc = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 16), M(o.scarf)); sc.rotation.x = Math.PI / 2; sc.position.set(0, 0.38, 0.02); torso.add(sc);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.04), M(o.scarf)); tail.position.set(-0.05, 0.12, -0.16); tail.rotation.z = 0.35; torso.add(tail);
  }
  if (o.pack) {
    const bp = cap(0.13, 0.1, o.pack); bp.scale.set(1.25, 1, 0.55); bp.position.set(0, 0.2, -0.17); torso.add(bp);
    const flap = cap(0.1, 0.03, o.packFlap || 0xffffff); flap.scale.set(1.2, 1, 0.4); flap.position.set(0, 0.17, -0.225); torso.add(flap);
  }
  const arms = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.17, 0.31, 0); torso.add(piv);
    const sleeve = cap(0.055, 0.17, o.sleeve || o.shirt); sleeve.position.y = -0.12; piv.add(sleeve);
    const hand = sph(0.052, o.mitten || SKIN, 16, 12); hand.position.y = -0.25; piv.add(hand);
    piv.rotation.z = sx * 0.35; piv.rotation.x = 0;
    piv.userData = { base: piv.rotation.z, baseX: piv.rotation.x, sx }; arms.push(piv);
  }
  const head = new THREE.Group(); head.position.y = 1.32; body.add(head);
  const skull = sph(0.27, SKIN, 40, 28); skull.scale.set(1.02, 0.95, 0.95); head.add(skull);
  const onHead = (lat, lon, r = 0.27) => new THREE.Vector3(Math.sin(lon) * Math.cos(lat) * r * 1.02, Math.sin(lat) * r * 0.95, Math.cos(lon) * Math.cos(lat) * r * 0.95);
  for (const sx of [-1, 1]) {
    const eye = sph(0.036, 0x2a1a12, 16, 12); eye.position.copy(onHead(-0.08, sx * 0.36, 0.262)); eye.scale.set(0.9, 1.15, 0.5); eye.lookAt(eye.position.clone().multiplyScalar(2)); head.add(eye);
    const hl = sph(0.012, 0xffffff, 8, 6); hl.position.copy(onHead(-0.04, sx * 0.36 + 0.035, 0.275)); head.add(hl);
    const bl = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), new THREE.MeshBasicMaterial({ color: 0xff8fa0, transparent: true, opacity: 0.45, depthWrite: false }));
    bl.position.copy(onHead(-0.25, sx * 0.58, 0.272)); bl.lookAt(bl.position.clone().multiplyScalar(2)); bl.scale.y = 0.75; head.add(bl);
    const ear = sph(0.055, SKIN, 12, 10); ear.position.set(sx * 0.27, -0.02, 0); ear.scale.set(0.5, 1, 0.8); head.add(ear);
  }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20, Math.PI, Math.PI), M(0xc9384a)); mouth.position.copy(onHead(-0.3, 0, 0.27)); mouth.lookAt(mouth.position.clone().multiplyScalar(2)); mouth.position.multiplyScalar(1.005); head.add(mouth);
  const hair = sph(0.292, o.hair || HAIR, 40, 28); hair.position.set(0, 0.05, -0.045); hair.scale.set(1.02, 0.97, 1); head.add(hair);
  for (let i = -2; i <= 2; i++) { const b = sph(0.085, o.hair || HAIR, 16, 12); b.position.copy(onHead(0.74 - Math.abs(i) * 0.04, i * 0.3, 0.255)); b.scale.set(1.2, 0.6, 0.7); b.lookAt(b.position.clone().multiplyScalar(2)); head.add(b); }
  if (o.boy) { const tuft = sph(0.06, o.hair || HAIR, 12, 10); tuft.position.set(0.02, 0.33, 0.02); tuft.scale.set(0.6, 1, 0.6); tuft.rotation.z = -0.4; head.add(tuft); }
  if (o.ponytail) {
    const pt = sph(0.1, o.hair || HAIR, 16, 12); pt.position.set(0, 0.05, -0.28); pt.scale.set(0.7, 0.9, 1.2); head.add(pt);
    const tip = sph(0.07, o.hair || HAIR, 12, 10); tip.position.set(0, -0.08, -0.38); tip.scale.set(0.7, 1, 0.8); head.add(tip);
  }
  if (o.hat) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 20), M(o.hat)); brim.position.y = 0.22; head.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.2, 16), M(o.hat)); crown.position.y = 0.34; head.add(crown);
  }
  if (o.beanie) {
    const bn = sph(0.28, o.beanie, 24, 16); bn.position.set(0, 0.18, -0.02); bn.scale.set(1.05, 0.75, 1.05); head.add(bn);
    const pom = sph(0.06, 0xffffff, 10, 8); pom.position.set(0, 0.38, -0.02); head.add(pom);
  }
  k.traverse(m => { if (m.isMesh && !m.material.transparent) m.castShadow = true; });
  k.userData = { torso, head, arms, legs, body, ph: rnd() * 6 };
  return k;
}

const heroDefs = {
  spring: { shirt: 0xffb0c8, sleeve: 0xffb0c8, legs: 0x5a8ad0, shoes: 0xf0f0f0, hair: 0x5a3820, ponytail: true, umbrella: true, umbA: 0xe04040, umbB: 0xffffff },
  summer: { shirt: 0xffd84a, sleeve: 0xffd84a, shorts: 0x4a8ad8, legs: 0x4a8ad8, shoes: 0xffffff, hair: HAIR, boy: true, hat: 0xffd23a },
  autumn: { shirt: 0x8a5a30, sleeve: 0x8a5a30, legs: 0x3a4a70, shoes: 0x6a4a30, hair: HAIR, boy: true, scarf: 0xffa020, pack: 0x3a9a8a, packFlap: 0x5cbcac },
  winter: { shirt: 0x2a3a58, sleeve: 0x2a3a58, vest: 0x3a6ab0, legs: 0x2a3a58, shoes: 0x3a3a48, hair: HAIR, boy: true, beanie: 0xe04040, scarf: 0xe04040, mitten: 0xe04040 },
};
const heroes = {};
const kids = [];
['spring', 'summer', 'autumn', 'winter'].forEach((name, i) => {
  const d = heroDefs[name];
  const k = makeKid(d);
  k.position.set(1 + i * 0.01, 0, pathCZ(1));
  k.rotation.y = Math.PI / 2;
  k.scale.setScalar(1.68);
  k.visible = name === 'spring';
  scene.add(k);
  Object.assign(k.userData, {
    season: name, blob: blob(1, pathCZ(1), 0.38, 1.1), heading: Math.PI / 2,
    walkPh: 0, w: { walk: 1, sit: 0, look: 0 }, act: 'walk', speed: 1.05,
  });
  if (d.umbrella) {
    const g = new THREE.Group();
    const can = new THREE.Group(); can.position.y = 0.62; g.add(can);
    const hex = '#' + new THREE.Color(d.umbA).getHexString(), light = '#' + new THREE.Color(d.umbB).getHexString();
    const tex = canvasTex(128, 8, (c) => { for (let kk = 0; kk < 8; kk++) { c.fillStyle = kk % 2 ? light : hex; c.fillRect(kk * 16, 0, 16, 8); } });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    dome.scale.y = 0.62; dome.position.y = -0.1; can.add(dome);
    const tip = sph(0.03, 0xffffff, 8, 6); tip.position.y = 0.22; can.add(tip);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.66, 6), M(0x8a6a50)); shaft.position.y = 0.31; g.add(shaft);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI), M(0x8a6a50)); handle.rotation.z = Math.PI; handle.position.set(0.04, 0, 0); g.add(handle);
    g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    g.position.set(0.12, 0.88, 0); k.add(g); k.userData.umb = { g, can };
  }
  heroes[name] = k; kids.push(k);
});
while (kids.length < 5) kids.push({ position: { x: 99, z: 99 }, userData: { w: {} }, visible: false });

let hero = heroes.spring;
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

function setWeather(name, instant = false) {
  if (!PRESETS[name]) return;
  target = PRESETS[name]; currentName = name;
  btns.forEach(b => b.classList.toggle('on', b.dataset.w === name));
  updateBadge(name);
  for (const [n, k] of Object.entries(heroes)) {
    const on = n === name;
    k.visible = on;
    k.userData.blob.visible = on;
    if (on) {
      hero = k;
      // Start on the left of frame; walk into center while camera lags
      const startX = (instant ? WALK_X0 + 2 : camera.position.x - 4.2);
      hero.position.x = Math.max(WALK_X0, Math.min(WALK_X1 - 10, startX));
      hero.position.z = pathCZ(hero.position.x);
      if (!instant) {
        // Keep camera where it is so hero appears left and walks to center
      } else {
        camera.position.x = hero.position.x - 4.5;
        controls.target.x = hero.position.x - 3.8;
      }
    }
  }
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

  // hero walk L→R
  const hx = hero.position.x + hero.userData.speed * dt;
  if (hx > WALK_X1) { hero.position.x = WALK_X0; } else hero.position.x = hx;
  hero.position.z = pathCZ(hero.position.x) + Math.sin(simTime * 0.4) * 0.02;
  hero.position.y = hgt(hero.position.x, hero.position.z) - 0.01;
  hero.userData.heading = Math.PI / 2;
  hero.rotation.y = hero.userData.heading;
  hero.userData.blob.position.set(hero.position.x, hgt(hero.position.x, hero.position.z) + 0.03, hero.position.z + 0.05);
  // Elegant large strides: slow cadence, long reach
  hero.userData.walkPh += dt * 4.2;
  const ph = hero.userData.walkPh;
  // ease sine for smoother weight transfer
  const wc = Math.sin(ph);
  const armW = Math.sin(ph - 0.4);
  const u = hero.userData;
  const stride = 0.78; // big elegant step
  u.legs.forEach((l, i) => {
    const side = i ? 1 : -1;
    // slight ease-in-out on thigh
    const ang = side * wc * stride;
    l.rotation.x = ang;
    l.rotation.z = side * wc * 0.04;
    // knee folds on swing (shin bends the anatomical way)
    const swing = Math.max(0, side * wc);
    const rear = Math.max(0, -side * wc);
    if (l.userData.shin) l.userData.shin.rotation.x = swing * 0.72 - rear * 0.08;
  });
  const bob = Math.sin(ph * 2);
  u.body.position.y = bob * bob * 0.028;
  u.torso.scale.y = 1 + Math.sin(simTime * 1.0 + u.ph) * 0.006;
  u.torso.rotation.x = 0.06;
  u.torso.rotation.y = -wc * 0.05;
  u.head.rotation.x = -0.025;
  u.head.rotation.z = Math.sin(simTime * 0.45 + u.ph) * 0.018;
  u.head.position.set(0, 1.32, 0);
  u.arms.forEach((a, i) => {
    const sx = a.userData.sx;
    if (u.umb && i === 1) { a.rotation.z = 2.55; a.rotation.x = -0.1; }
    else { a.rotation.z = sx * 0.22; a.rotation.x = (i ? -1 : 1) * armW * 0.45; }
  });
  if (u.umb) { u.umb.g.visible = true; u.umb.g.position.set(0.12, 1.28 + u.body.position.y, 0); u.umb.can.scale.set(1, 1, 1); }

  kids.forEach((kd, i) => {
    if (!kd.position) return;
    const vis = kd.visible !== false;
    kidPosU.value[i].set(vis ? kd.position.x : 99, vis ? (kd.position.z || 0) : 99);
    kidHU.value[i] = vis ? 1.5 : 0;
  });

  const shStr = THREE.MathUtils.clamp((cur.sun - 0.4) / 2.0, 0, 1) * (1 - THREE.MathUtils.clamp(cur.fogD / 0.06, 0, 1) * 0.8) * (1 - cur.night * 0.7);
  shadowU.value = shStr; sun.shadow.intensity = shStr; blobMat.opacity = 1 - 0.45 * shStr;
  sun.target.position.set(hero.position.x, 0, 0); sun.position.set(hero.position.x, 0, 0).addScaledVector(LIGHT_DIR, 30); sun.target.updateMatrixWorld();

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
    f.position.set(hero.position.x + uu.cx * 0.15 + Math.sin(t) * uu.ax, uu.cy + Math.sin(t * 2.3) * 0.25, uu.cz + Math.sin(t * 1.7) * uu.az);
    const flap = Math.sin(simTime * 9 + uu.ph * 3) * 0.9; uu.L.rotation.z = flap; uu.R.rotation.z = -flap;
  }

  // camera side-scroll follow — lag behind so hero walks into center
  const desiredCamX = hero.position.x;
  const desiredCamY = 2.55;
  const desiredCamZ = 10.4;
  const desiredTgtX = hero.position.x;
  const desiredTgtY = 1.25;
  const desiredTgtZ = 0.0;
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
if (params.has('shot')) { window.__dbg = { kids, camera, controls, scene, renderer, heroes }; renderer.render(scene, camera); window.__ready = true; }
else { renderer.setAnimationLoop(frame); window.__ready = true; }

window.THREE_V = THREE.Vector3;
