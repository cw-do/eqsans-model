// EQ-SANS (BL-6, SNS) — interactive 3D model.
// Geometry follows Fig. 1 of Zhao, Gao & Liu, J. Appl. Cryst. 43 (2010) 1068:
// every distance below is metres from the moderator face, along the beam.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildSite, BL6_ANGLE } from './site.js?v=4';

const $ = (id) => document.getElementById(id);
const PI = Math.PI, TAU = PI * 2;

// ───────────────────────── instrument numbers ─────────────────────────
const BEAM_Y = 1.9;                       // beam height above the floor (estimated)
const S_BEND0 = 2.304, S_BEND1 = 5.653;   // curved bender (primary shutter + bulk shield inserts)
const R_BEND = 95;                        // bender radius → ~2° total
const S_T1 = 5.7028, S_T2 = 7.8028, S_T3 = 9.5028;
const S_MON = 10.006, S_S1 = 10.08, S_S2 = 11.156, S_S3 = 12.15;
const S_SS = 13.9, S_SAMPLE = 14.0;
const TANK_X0 = 14.62, TANK_X1 = 24.6, TANK_RO = 1.45, TANK_RI = 1.25;
const DET_HALF = 0.5;                     // 1 m × 1 m detector
const BEAMSTOP_R = 0.025;

// Time-of-flight, slowed 180×: one 60 Hz source period (16.7 ms) lasts 3 s here.
const PERIOD = 3;
const KV = 3956 / 180;                    // speed [m/s] = KV / λ[Å]
let LAM_TOP = 10;                         // longest wavelength of the colour scale and of the emitted spectrum
let LAM_MIN = 2.5, LAM_MAX = 6.16, LAM_C = 4.33;   // transmitted band; set by setBand() from λmin and the detector distance

const TH_BEND = (S_BEND1 - S_BEND0) / R_BEND;
function pathAt(s) {
  if (s >= S_BEND1) return { x: s, z: 0, yaw: 0 };
  const th = Math.min((S_BEND1 - s) / R_BEND, TH_BEND);
  let x = S_BEND1 - R_BEND * Math.sin(th), z = R_BEND * (1 - Math.cos(th));
  if (s < S_BEND0) { const d = S_BEND0 - s; x -= d * Math.cos(TH_BEND); z += d * Math.sin(TH_BEND); }
  return { x, z, yaw: th };
}

// ───────────────────────── renderer / scene ─────────────────────────
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e15);
scene.fog = new THREE.Fog(0x0a0e15, 45, 120);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
const HOME_POS = new THREE.Vector3(1.5, 12, 33), HOME_TGT = new THREE.Vector3(10.2, 0.6, 0);
camera.position.copy(HOME_POS);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME_TGT);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.12;
controls.maxDistance = 90;
controls.maxPolarAngle = PI * 0.495;

scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x30343c, 0.55));
const sun = new THREE.DirectionalLight(0xfff4e2, 2.2);
sun.position.set(4, 26, 16);
sun.target.position.set(12, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 12, bottom: -12, near: 1, far: 60 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.5, 0.35, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// floor
let hallFloor;
{
  const floor = hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3d4249, roughness: 0.9, metalness: 0 }));
  floor.position.set(12, 0, 0);
  floor.receiveShadow = true;
  scene.add(floor);
}

const root = new THREE.Group();       // origin = moderator face, on the beam axis
root.position.y = BEAM_Y;
scene.add(root);
const FLOOR = -BEAM_Y;

// ───────────────────────── build helpers ─────────────────────────
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
const shellMats = [];
const shell = (m) => { shellMats.push({ m, base: m.opacity, glassy: m.transparent }); return m; };   // fades in X-ray view

const MAT = {
  steel: std(0xc3c8ce, { metalness: 0.9, roughness: 0.32 }),
  alu: std(0xd9dce0, { metalness: 0.75, roughness: 0.45 }),
  dark: std(0x17191d, { roughness: 0.75 }),
  b4c: std(0x25272b, { roughness: 0.95 }),
  blue: std(0x2f6fd6, { roughness: 0.5, metalness: 0.15 }),
  yellow: std(0xf2c81d, { roughness: 0.5 }),
  concrete: std(0xb9b6ad, { roughness: 0.95 }),
  glass: shell(std(0x9fe6cc, { transparent: true, opacity: 0.3, roughness: 0.08, depthWrite: false })),
  blade: shell(std(0xcfeee2, { transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide })),
  quartz: std(0xe6f4ff, { transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }),
  sapphire: std(0xbfe4ff, { transparent: true, opacity: 0.4, roughness: 0.02, metalness: 0.2, depthWrite: false }),
  white: std(0xf1f1ee, { roughness: 0.5 }),
  green: std(0x8fa390, { roughness: 0.7 }),
  gold: std(0xd8a93a, { metalness: 0.8, roughness: 0.35 }),
  moderator: std(0x9fe8ff, { emissive: 0x38c8ff, emissiveIntensity: 1.2 }),
  proton: std(0xffd98a, { emissive: 0xffa41c, emissiveIntensity: 0.6, transparent: true, opacity: 0.35, depthWrite: false }),
  // shells
  tank: shell(std(0x2f6fd6, { roughness: 0.48, metalness: 0.15 })),
  tankHead: shell(std(0x2f6fd6, { roughness: 0.48, metalness: 0.15, side: THREE.DoubleSide })),
  liner: shell(std(0x2b2d31, { roughness: 0.95, side: THREE.DoubleSide })),
  red: shell(std(0xc9222e, { roughness: 0.65 })),
  hutch: shell(std(0xa9adb1, { metalness: 0.55, roughness: 0.5, side: THREE.DoubleSide })),
  hutchDoor: shell(std(0xbfc3c7, { metalness: 0.6, roughness: 0.4 })),
  hutchFrame: shell(std(0x7d8186, { metalness: 0.6, roughness: 0.45 })),
  mono: shell(std(0x8d8f8a, { metalness: 0.4, roughness: 0.7 })),
  housing: shell(std(0xcdd1d5, { metalness: 0.7, roughness: 0.45 })),
  pipe: shell(std(0xc3c8ce, { metalness: 0.9, roughness: 0.32 })),
  cvi: shell(std(0x17191d, { roughness: 0.75 })),
  deck: shell(std(0x9a9ea3, { metalness: 0.6, roughness: 0.5 })),
  rail: shell(std(0xf2c81d, { roughness: 0.5 })),
  door: shell(std(0x2f6fd6, { roughness: 0.5, metalness: 0.15 })),
  plug: shell(std(0xaab4bd, { roughness: 0.9 })),
  plugFace: shell(std(0x6f9fe0, { roughness: 0.7 })),
  plugStand: shell(std(0x8fa390, { roughness: 0.7 })),
  plugPad: shell(std(0xf1f1ee, { roughness: 0.5 })),
};

const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cylX = (r, len, m, x = 0, y = 0, z = 0, seg = 32) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateZ(PI / 2), m); o.position.set(x, y, z); return o; };
const cylY = (r, len, m, x = 0, y = 0, z = 0, seg = 20) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m); o.position.set(x, y, z); return o; };
const cylZ = (r, len, m, x = 0, y = 0, z = 0, seg = 20) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateX(PI / 2), m); o.position.set(x, y, z); return o; };
const group = (parent, ...kids) => { const g = new THREE.Group(); if (kids.length) g.add(...kids); parent?.add(g); return g; };
const onPath = (o, s, y = 0) => { const p = pathAt(s); o.position.set(p.x, y, p.z); o.rotation.y = p.yaw; return o; };

let doorLabel = null;
const keyed = {};      // key → Object3D (focus + picking)
const anchors = {};    // key → Object3D the label follows
const pieces = [];     // everything that moves in the exploded view
const comp = (key, parent = root) => { const g = group(parent); g.userData.key = key; keyed[key] = g; return g; };
const piece = (o, ex = [0, 0, 0], delay = 0) => { const p = { o, home: o.position.clone(), ex: new THREE.Vector3(...ex), delay }; pieces.push(p); return p; };
const anchor = (key, parent, x = 0, y = 0, z = 0) => { const a = new THREE.Object3D(); a.position.set(x, y, z); parent.add(a); anchors[key] = a; };

// ───────────────────────── source: moderator + target monolith ─────────────────────────
{
  const g = comp('moderator');
  const m = onPath(group(g), -0.06);
  m.add(box(0.12, 0.14, 0.1, MAT.moderator));                        // 100 × 140 mm viewed face
  m.add(box(0.2, 0.2, 0.16, std(0xdfe6ea, { transparent: true, opacity: 0.25, depthWrite: false })));
  m.add(box(0.9, 0.12, 0.42, MAT.steel, -0.25, -0.2, 0));            // mercury target vessel, just below
  m.add(cylZ(0.05, 2.6, MAT.proton, -0.25, -0.2, 1.5));              // proton beam
  anchor('moderator', m, 0, 0.25, 0);

  const mono = comp('monolith');
  const halfA = box(7, 4.4, 1.9, MAT.mono, 1.9, 0.3, -1.4), halfB = box(7, 4.4, 1.9, MAT.mono, 1.9, 0.3, 1.4);
  const cap = box(7, 1.25, 0.9, MAT.mono, 1.9, 1.875, 0), base = box(7, 1.25, 0.9, MAT.mono, 1.9, -1.275, 0);
  mono.add(halfA, halfB, cap, base);
  piece(halfA, [0, 0, -3.4]); piece(halfB, [0, 0, 3.4]); piece(cap, [0, 3.6, 0]);
  anchor('monolith', cap, -1.5, 0.75, 0);
}

// ───────────────────────── neutron optics ─────────────────────────
const optics = comp('optics');
function guide(sA, sB, blades = false, parent = optics) {
  const n = Math.max(1, Math.round((sB - sA) / 0.45)), len = (sB - sA) / n;
  for (let i = 0; i < n; i++) {
    const g = onPath(group(parent), sA + (i + 0.5) * len);
    g.add(box(len, 0.052, 0.052, MAT.glass));
    if (blades) for (let k = 1; k <= 5; k++) g.add(box(len, 0.04, 0.0012, MAT.blade, 0, 0, -0.02 + k * 0.04 / 6));
  }
}
function pipe(sA, sB, r = 0.075, parent = optics) {
  const n = Math.max(1, Math.round((sB - sA) / 0.6)), len = (sB - sA) / n;
  for (let i = 0; i < n; i++) parent.add(onPath(cylX(r, len + 0.002, MAT.pipe), sA + (i + 0.5) * len));
}
{
  optics.add(onPath(box(0.27, 0.22, 0.22, MAT.cvi), 1.135));        // CVI steel collimator, 40 × 40 opening
  guide(1.27, 2.27);                                                  // core-vessel guide
  guide(2.304, 4.162, true);                                          // bender in the primary shutter
  guide(4.193, 5.653, true);                                          // bender in the bulk-shield insert
  pipe(4.193, 5.653, 0.09);
  guide(5.753, 7.753); pipe(5.83, 7.67);                              // T1 → T2
  guide(7.853, 9.453); pipe(7.93, 9.37);                              // T2 → T3
  guide(9.553, 9.985); pipe(9.63, 9.985);
  anchor('optics', optics, 6.75, 0.12, 0);

  const sh = comp('shutter');
  const body = onPath(box(1.8576, 1.7, 0.24, MAT.housing), 3.233, 0.45);
  sh.add(body);
  piece(body, [0, 1.3, 0], 0.3);
  anchor('shutter', body, 0, 0.9, 0);
}

// ───────────────────────── bandwidth choppers ─────────────────────────
const choppers = [];
function chopperDiscGeo(openDeg) {
  const R = 0.3185, rin = 0.17, a = THREE.MathUtils.degToRad(openDeg);
  const A = PI / 2 + a / 2, B = PI / 2 - a / 2 + TAU;
  const sh = new THREE.Shape();
  sh.absarc(0, 0, R, A, B, false);
  sh.absarc(0, 0, rin, B, A + TAU, false);
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false, curveSegments: 64 }).translate(0, 0, -0.004);
}
function makeChopper(key, s, openDeg, edges) {
  const g = onPath(comp(key), s);
  const CY = -0.24;                                                  // disc centre sits below the beam
  const house = group(g,
    box(0.2, 0.86, 0.86, MAT.housing, 0, CY, 0),
    box(0.26, 0.05, 0.92, MAT.housing, 0, CY + 0.455, 0),
    box(0.3, 0.5, 0.5, MAT.dark, 0, CY - 0.68, 0));
  piece(house, [0, 1.5, 0], 0.25);
  const discs = [];
  edges.forEach((edge, i) => {
    const holder = group(g);
    holder.position.set((i - (edges.length - 1) / 2) * 0.03, CY, 0);
    holder.rotation.y = PI / 2;
    const disc = new THREE.Mesh(chopperDiscGeo(openDeg), MAT.b4c);
    disc.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.014, 40).rotateX(PI / 2), MAT.alu));
    disc.add(new THREE.Mesh(new THREE.RingGeometry(0.165, 0.175, 48), MAT.alu));
    holder.add(disc);
    piece(holder, [0, 0, 1.25 + i * 0.5], 0.4);
    discs.push({ disc, edge, lam: 4.3 });
    if (i === 0) anchor(key, holder, 0, 0.42, 0);
  });
  const motor = cylX(0.07, 0.22, MAT.dark, 0.2, CY, 0);
  g.add(motor); piece(motor, [0.5, 0, 0], 0.4);
  const half = THREE.MathUtils.degToRad(openDeg) / 2, w = TAU / PERIOD;
  const c = {
    s, discs,
    // each disc is phased so that the middle of its cut-out meets the wavelength d.lam
    phase: (t, d) => { let p = (w * (t - s * d.lam / KV)) % TAU; if (p > PI) p -= TAU; if (p < -PI) p += TAU; return p; },
    open: (t) => discs.every((d) => Math.abs(c.phase(t, d)) < half),
    // 'lead': the opening edge lets λmin through first; 'trail': the closing edge cuts just after λmax
    setBand: (lmin, lmax) => { const dl = half / w * KV / s; for (const d of discs) d.lam = d.edge === 'lead' ? lmin + dl : lmax - dl; },
  };
  choppers.push(c);
}
makeChopper('t1', S_T1, 129.6, ['lead']);
makeChopper('t2', S_T2, 180, ['trail']);
makeChopper('t3', S_T3, 230, ['lead', 'trail']);    // double disc: one disc sets each edge of the band

// ───────────────────────── monitor, slit wheels, secondary shutter, guard slits ─────────────────────────
const apertures = [];                         // {s, r} — where badly-collimated neutrons are absorbed
function slitWheelGeo() {
  const sh = new THREE.Shape(); sh.absarc(0, 0, 0.17, 0, TAU, false);
  const RW = 0.11, sizes = [0.005, 0.0075, 0.01, 0.005, 0.0075, 0.01, 0.02];
  sizes.forEach((r, k) => {
    const a = PI / 2 + k * PI / 4, cx = RW * Math.cos(a), cy = RW * Math.sin(a), h = new THREE.Path();
    if (k < 3) h.absarc(cx, cy, r, 0, TAU, true);
    else { h.moveTo(cx - r, cy - r); h.lineTo(cx - r, cy + r); h.lineTo(cx + r, cy + r); h.lineTo(cx + r, cy - r); h.closePath(); }
    sh.holes.push(h);
  });
  return new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: false, curveSegments: 48 }).translate(0, 0, -0.003);
}
const wheelGeo = slitWheelGeo();
function makeSlitWheel(key, s, slot, r) {
  const g = onPath(comp(key), s);
  const house = box(0.09, 0.46, 0.46, MAT.housing, 0, -0.11, 0);
  g.add(house); piece(house, [0, 1.2, 0], 0.25);
  const holder = group(g); holder.position.y = -0.11; holder.rotation.y = PI / 2;
  const wheel = new THREE.Mesh(wheelGeo, MAT.b4c);
  wheel.rotation.z = -slot * PI / 4;
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24).rotateX(PI / 2), MAT.alu));
  holder.add(wheel);
  piece(holder, [0, 0, -1.0], 0.4);
  anchor(key, holder, 0, 0.2, 0);
  apertures.push({ s, r });
}
{
  const mon = comp('monitor');
  const m = box(0.03, 0.09, 0.09, MAT.gold, S_MON, 0, 0);
  mon.add(m, box(0.05, 0.14, 0.14, MAT.housing, S_MON, 0, 0));
  anchor('monitor', m, 0, 0.1, 0);
}
makeSlitWheel('s1', S_S1, 2, 0.01);          // source slit: 20 mm circle
{
  const g = comp('shutter2');
  const drum = cylX(0.3, 1.0, MAT.housing, 10.62, -0.13, 0, 40);
  g.add(drum, box(0.9, 0.5, 0.36, MAT.dark, 10.62, -0.72, 0));
  piece(drum, [0, 1.3, 0], 0.25);
  guide(10.13, 11.11, false, g);
  anchor('shutter2', drum, 0, 0.33, 0);
}
makeSlitWheel('s2', S_S2, 1, 0.0075);
pipe(11.21, 12.1, 0.065);
makeSlitWheel('s3', S_S3, 1, 0.0075);
{
  const g = comp('guards');
  pipe(12.2, 13.8, 0.06, g);
  for (let i = 0; i < 6; i++) {
    const s = 12.4 + i * 0.25, r = 0.0075 - i * 0.0003;
    g.add(new THREE.Mesh(new THREE.RingGeometry(r, 0.055, 32).rotateY(PI / 2), std(0x25272b, { roughness: 0.95, side: THREE.DoubleSide })).translateX(s));
    apertures.push({ s, r });
  }
  anchor('guards', g, 13.0, 0.08, 0);
}

// ───────────────────────── beamline shielding (red stacked blocks) ─────────────────────────
{
  const g = comp('shield');
  const X0 = 5.45, N = 5, L = (12.55 - X0) / N;
  const left = group(g), right = group(g), roof = group(g);
  for (let i = 0; i < N; i++) {
    const x = X0 + (i + 0.5) * L;
    for (let r = 0; r < 2; r++) {
      left.add(box(L - 0.02, 1.58, 0.8, MAT.red, x, FLOOR + 0.8 + r * 1.6, -1.0));
      right.add(box(L - 0.02, 1.58, 0.8, MAT.red, x, FLOOR + 0.8 + r * 1.6, 1.0));
    }
    roof.add(box(L - 0.02, 0.7, 2.8, MAT.red, x, 1.65, 0));
  }
  for (const z of [-1.32, 1.32]) {                                    // yellow handrails
    for (let x = X0 + 0.1; x < 12.5; x += 1.17) roof.add(cylY(0.022, 1.05, MAT.rail, x, 2.52, z, 8));
    roof.add(box(7.0, 0.04, 0.04, MAT.rail, 9, 3.04, z), box(7.0, 0.04, 0.04, MAT.rail, 9, 2.55, z));
  }
  piece(left, [0, 0, -3.4]); piece(right, [0, 0, 3.4]); piece(roof, [0, 3.8, 0]);
  anchor('shield', roof, 9, 3.2, 0);
}

// ───────────────────────── sample area ─────────────────────────
function banjoCell(liquid) {
  const g = new THREE.Group();
  g.add(cylX(0.011, 0.005, MAT.quartz));                              // flat round quartz body
  g.add(cylX(0.009, 0.002, std(liquid, { transparent: true, opacity: 0.75, roughness: 0.2 })));
  g.add(cylY(0.003, 0.022, MAT.quartz, 0, 0.021, 0, 12));             // filling neck
  g.add(cylY(0.0042, 0.007, MAT.white, 0, 0.035, 0, 12));             // stopper
  return g;
}
{
  // sample-environment enclosure
  const h = comp('hutch');
  const HX0 = 13.0, HX1 = 14.6, HXC = (HX0 + HX1) / 2, HY = 3.4, yc = FLOOR + HY / 2, top = FLOOR + HY;
  const wl = box(HX1 - HX0, HY, 0.05, MAT.hutch, HXC, yc, -1.3), wr = box(HX1 - HX0, HY, 0.05, MAT.hutch, HXC, yc, 1.3);
  const roofG = group(h, box(HX1 - HX0 + 0.05, 0.05, 2.65, MAT.hutch, HXC, top, 0));
  const up = box(0.05, HY, 2.6, MAT.hutch, HX0, yc, 0);
  const sh = new THREE.Shape();
  sh.moveTo(-1.3, FLOOR); sh.lineTo(1.3, FLOOR); sh.lineTo(1.3, top); sh.lineTo(-1.3, top); sh.closePath();
  sh.holes.push(new THREE.Path().absarc(0, 0, 1.29, 0, TAU, true));
  const down = new THREE.Mesh(new THREE.ShapeGeometry(sh, 48).rotateY(PI / 2), MAT.hutch); down.position.x = HX1;
  roofG.add(down);
  // two equal doors, one above the other, wider than the sample table
  for (const y of [-0.8, 0.8]) {
    const DW = 1.4, DH = 1.5;
    wr.add(box(DW, DH, 0.03, MAT.hutchDoor, 0, y, 0.035));
    for (const [w, h, dx, dy] of [[DW + 0.08, 0.04, 0, DH / 2 + 0.02], [DW + 0.08, 0.04, 0, -DH / 2 - 0.02], [0.04, DH, -DW / 2 - 0.02, 0], [0.04, DH, DW / 2 + 0.02, 0]])
      wr.add(box(w, h, 0.045, MAT.hutchFrame, dx, y + dy, 0.035));                               // frame
    wr.add(box(0.03, 0.34, 0.05, MAT.dark, DW / 2 - 0.12, y, 0.07));                              // handle
    for (const dy of [-0.5, 0.5]) wr.add(box(0.05, 0.14, 0.05, MAT.hutchFrame, -DW / 2 - 0.02, y + dy, 0.045));   // hinges
  }
  h.add(wl, wr, up);
  piece(wl, [0, 0, -2.7]); piece(wr, [0, 0, 2.7]); piece(roofG, [0, 4.4, 0]); piece(up, [-0, 0, 0]);
  anchor('hutch', roofG, HXC, top + 0.1, 0);

  // optical table
  const env = comp('sampleenv');
  env.add(box(1.0, 0.05, 1.3, MAT.dark, 13.65, -0.45, 0));              // ends short of the tank's window neck (14.22 m)
  for (const [x, z] of [[13.22, -0.57], [13.22, 0.57], [14.08, -0.57], [14.08, 0.57]]) env.add(box(0.07, 1.0, 0.07, MAT.alu, x, -0.97, z));
  env.add(box(0.8, 0.05, 1.1, MAT.alu, 13.65, FLOOR + 0.4, 0));
  anchor('sampleenv', env, 13.5, -0.3, -0.45);

  // final flight tube + sample aperture
  const ss = comp('ss');
  const snout = group(ss, cylX(0.046, 1.02, MAT.pipe, 13.31, 0, 0), cylX(0.085, 0.02, MAT.steel, 13.82, 0, 0), cylX(0.085, 0.02, MAT.steel, 12.82, 0, 0));
  const ap = group(ss,
    new THREE.Mesh(new THREE.RingGeometry(0.005, 0.035, 40).rotateY(PI / 2), std(0x25272b, { roughness: 0.95, side: THREE.DoubleSide })),
    new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 40).rotateY(PI / 2), std(0xd9dce0, { metalness: 0.75, roughness: 0.45, side: THREE.DoubleSide })));
  ap.position.x = S_SS;
  piece(snout, [-0.0, 0.0, 0]); piece(ap, [0, 0.35, 0], 0.5);
  anchor('ss', ap, 0, 0.06, 0);
  apertures.push({ s: S_SS, r: 0.005 });

  // sample changer with banjo cells
  const sm = comp('sample');
  const rack = group(sm); rack.position.x = S_SAMPLE;
  rack.add(box(0.014, 0.012, 0.3, MAT.alu, 0, -0.022, 0), box(0.014, 0.012, 0.3, MAT.alu, 0, 0.05, 0),
    box(0.014, 0.084, 0.012, MAT.alu, 0, 0.014, -0.15), box(0.014, 0.084, 0.012, MAT.alu, 0, 0.014, 0.15));
  [0xf2b35e, 0x8fd3ff, 0xffe27a, 0xd9a6ff, 0x9af0b5].forEach((c, i) => { const b = banjoCell(i === 2 ? 0xffc94d : c); b.position.z = (i - 2) * 0.055; rack.add(b); });
  const stage = group(sm, box(0.1, 0.32, 0.14, MAT.alu, S_SAMPLE, -0.19, 0), box(0.16, 0.06, 0.4, MAT.dark, S_SAMPLE, -0.39, 0));
  piece(rack, [0, 0.55, 0], 0.5); piece(stage, [0, 0, 0]);
  anchor('sample', rack, 0, 0.07, 0);
}

// ───────────────────────── detector tank ─────────────────────────
{
  const g = comp('tank');
  const L = TANK_X1 - TANK_X0, xc = (TANK_X0 + TANK_X1) / 2;
  for (const top of [true, false]) {
    const h = group(g), th0 = top ? PI : 0, sgn = top ? 1 : -1;
    h.add(new THREE.Mesh(new THREE.CylinderGeometry(TANK_RO, TANK_RO, L, 72, 1, true, th0, PI).rotateZ(-PI / 2).translate(xc, 0, 0), MAT.tank));
    h.add(new THREE.Mesh(new THREE.CylinderGeometry(TANK_RI, TANK_RI, L, 72, 1, true, th0, PI).rotateZ(-PI / 2).translate(xc, 0, 0), MAT.liner));
    for (const x of [TANK_X0 + 0.06, 17.4, 19.8, 22.2, TANK_X1 - 0.06]) {
      const rib = new THREE.TorusGeometry(TANK_RO + 0.03, 0.05, 10, 40, PI).rotateY(PI / 2);
      if (!top) rib.rotateX(PI);
      h.add(new THREE.Mesh(rib.translate(x, 0, 0), MAT.tank));
    }
    if (top) { piece(h, [0, 3.3, 0], 0.05); anchor('tank', h, xc + 1.5, TANK_RO + 0.1, 0); }
    else {
      for (const z of [-0.45, 0.45]) h.add(box(L - 0.4, 0.05, 0.06, MAT.steel, xc, -0.98, z));     // detector rails
      for (const x of [16.2, 19.8, 23.4]) {                                                          // carts on floor rails
        h.add(box(0.6, 0.34, 2.3, MAT.blue, x, -1.62, 0));
        for (const z of [-0.9, 0.9]) h.add(cylZ(0.09, 0.08, MAT.dark, x, FLOOR + 0.09, z));
      }
    }
  }
  for (const z of [-0.9, 0.9]) g.add(box(13, 0.04, 0.07, MAT.steel, 20.3, FLOOR + 0.02, z));

  // flat front: a short small cylinder carrying the window, stepping out to the flat face of the big cylinder
  const NECK_R = 0.55, NECK_X = 14.22;
  const ringX = (r0, r1, x) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72).rotateY(PI / 2), MAT.tankHead); m.position.x = x; return m; };
  const head = group(g, ringX(0.16, NECK_R, NECK_X), ringX(NECK_R, TANK_RO, TANK_X0),
    new THREE.Mesh(new THREE.CylinderGeometry(NECK_R, NECK_R, TANK_X0 - NECK_X, 72, 1, true).rotateZ(PI / 2).translate((NECK_X + TANK_X0) / 2, 0, 0), MAT.tankHead));
  piece(head, [0, 2.7, 0], 0.15);

  // sapphire window
  const w = comp('window');
  const plate = new THREE.Shape();
  plate.moveTo(-0.27, -0.3); plate.lineTo(0.27, -0.3); plate.lineTo(0.27, 0.3); plate.lineTo(-0.27, 0.3); plate.closePath();
  plate.holes.push(new THREE.Path().absarc(0, 0, 0.1524, 0, TAU, true));
  const wg = group(w,
    new THREE.Mesh(new THREE.ExtrudeGeometry(plate, { depth: 0.03, bevelEnabled: false, curveSegments: 48 }).rotateY(PI / 2), MAT.alu),
    cylX(0.1524, 0.012, MAT.sapphire, 0.015, 0, 0, 48));
  wg.position.x = 14.185;
  piece(wg, [-0.0, 0.9, 0], 0.5);
  anchor('window', wg, 0, 0.33, 0);

  // end door, 17,500 lbs, and the concrete plug behind it
  const door = comp('door');
  const dg = group(door, cylX(TANK_RO + 0.07, 0.14, MAT.door, TANK_X1 + 0.07, 0, 0, 72));
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + 0.3; dg.add(cylX(0.075, 0.05, MAT.door, TANK_X1 + 0.16, 1.18 * Math.sin(a), 1.18 * Math.cos(a), 20)); }
  for (const z of [-1.72, 1.72]) dg.add(box(0.32, 3.7, 0.3, MAT.door, TANK_X1 - 0.1, FLOOR + 1.85, z));
  const tc = document.createElement('canvas'); tc.width = 512; tc.height = 96;
  const tx = tc.getContext('2d'); tx.font = '700 64px Arial'; tx.fillStyle = '#f4f6f8'; tx.textBaseline = 'middle'; tx.fillText('17,500 LBS.', 8, 52);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.17).rotateY(PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(tc), transparent: true }));
  lab.position.set(TANK_X1 + 0.145, 0.78, 0.55); dg.add(lab); doorLabel = lab;
  piece(dg, [2.3, 0, 0], 0.1);
  anchor('door', dg, TANK_X1 + 0.1, TANK_RO + 0.15, 0);

  const plug = comp('plug');
  const px = TANK_X1 + 0.14 + 0.6;
  const pg = group(plug, cylX(0.55, 1.2, MAT.plug, px, 0, 0, 48), cylX(0.552, 0.01, MAT.plugFace, px + 0.6, 0, 0, 48),
    box(1.0, 0.16, 0.9, MAT.plugPad, px, -0.56, 0), box(1.5, 0.08, 1.4, MAT.plugStand, px + 0.1, -0.68, 0));
  for (const [x, z] of [[-0.55, -0.62], [-0.55, 0.62], [0.75, -0.62], [0.75, 0.62]]) pg.add(box(0.1, 1.18, 0.1, MAT.plugStand, px + x, -1.31, z));
  piece(pg, [4.6, 0, 0], 0.05);
  anchor('plug', pg, px, 0.62, 0);
}

// ───────────────────────── detector ─────────────────────────
const NB = 100;                                   // histogram bins per side
const detCanvas = document.createElement('canvas'); detCanvas.width = detCanvas.height = NB;
const detCtx = detCanvas.getContext('2d');
const detTex = new THREE.CanvasTexture(detCanvas);
detTex.colorSpace = THREE.SRGBColorSpace; detTex.magFilter = THREE.LinearFilter; detTex.generateMipmaps = false; detTex.minFilter = THREE.LinearFilter;
let detPiece;
{
  const g = comp('detector');
  g.position.x = S_SAMPLE + 4;
  detPiece = piece(g, [0, 1.75, 0], 0.3);
  const tubeGeo = new THREE.CylinderGeometry(0.004, 0.004, 1.041, 8);
  const tubeMat = std(0xdfe3e7, { metalness: 0.85, roughness: 0.3 });
  const m4 = new THREE.Matrix4();
  const planes = [0, 1].map((p) => {
    const n = 96, im = new THREE.InstancedMesh(tubeGeo, tubeMat, n);
    for (let i = 0; i < n; i++) im.setMatrixAt(i, m4.makeTranslation(0, 0, (i - (n - 1) / 2) * 0.011 + p * 0.0055));
    im.position.x = p * 0.0082;                                       // two planes, 8.2 mm apart
    g.add(im); return im;
  });
  const pattern = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05).rotateY(-PI / 2),
    new THREE.MeshBasicMaterial({ map: detTex, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
  pattern.position.x = -0.012; g.add(pattern);
  const frame = group(g, box(0.06, 0.05, 1.16, MAT.alu, 0.01, 0.555, 0), box(0.06, 0.05, 1.16, MAT.alu, 0.01, -0.555, 0),
    box(0.06, 1.16, 0.05, MAT.alu, 0.01, 0, 0.555), box(0.06, 1.16, 0.05, MAT.alu, 0.01, 0, -0.555), box(0.012, 1.1, 1.1, MAT.dark, 0.035, 0, 0));
  const elec = group(g, box(0.2, 1.0, 0.95, MAT.green, 0.17, 0, 0), box(0.4, 0.07, 1.1, MAT.alu, 0.1, -0.62, 0));
  for (const z of [-0.45, 0.45]) elec.add(box(0.12, 0.3, 0.08, MAT.alu, 0.1, -0.8, z));
  const stop = group(g, cylX(BEAMSTOP_R, 0.006, MAT.b4c, -0.05, 0, 0, 24), box(0.004, 0.56, 0.004, MAT.alu, -0.05, 0.28, 0));
  piece(pattern, [-1.0, 0, 0], 0.55); piece(stop, [-0.6, 0, 0], 0.55); piece(planes[0], [-0.3, 0, 0], 0.55);
  piece(frame, [0.25, 0, 0], 0.55); piece(elec, [0.6, 0, 0], 0.55);
  anchor('detector', g, 0, 0.66, 0);
}

// ───────────────────────── mezzanine over the tank ─────────────────────────
{
  const g = comp('mezz');
  const m = group(g);
  const Y = 1.85;
  m.add(box(6.2, 0.1, 4.0, MAT.deck, 15.6, Y, 0));
  for (const x of [12.6, 15.6, 18.6]) for (const z of [-1.9, 1.9]) m.add(box(0.14, Y - FLOOR, 0.14, MAT.deck, x, (Y + FLOOR) / 2, z));
  for (const z of [-1.95, 1.95]) {
    for (let x = 12.55; x <= 18.7; x += 1.02) m.add(cylY(0.02, 1.05, MAT.deck, x, Y + 0.55, z, 8));
    m.add(box(6.2, 0.04, 0.04, MAT.deck, 15.6, Y + 1.07, z), box(6.2, 0.03, 0.03, MAT.deck, 15.6, Y + 0.55, z));
  }
  piece(m, [0, 5.2, 0], 0);
  anchor('mezz', m, 15.6, Y + 1.2, 1.9);
}

scene.traverse((o) => { if (o.isMesh && !o.material.transparent && o.material.type !== 'MeshBasicMaterial') { o.castShadow = true; o.receiveShadow = true; } });

// ───────────────────────── component catalogue ─────────────────────────
const INFO = [
  { key: 'moderator', major: 1, name: 'Moderator & mercury target', loc: '0 m', inner: 1, text: '1 GeV proton pulses hit the liquid-mercury target 60 times a second and knock neutrons loose. EQ-SANS views the top-downstream coupled supercritical-hydrogen moderator (100 × 140 mm face), which chills those neutrons down to cold, long wavelengths.' },
  { key: 'monolith', name: 'Target monolith', loc: '0 – 5.5 m', text: 'Steel and concrete shielding around the target. Only a cut-away slice is modelled here. The first metres of the beamline — the core-vessel insert, primary shutter and bulk-shield insert — are buried inside it.' },
  { key: 'optics', name: 'Neutron guides & curved bender', loc: '1 – 10 m', inner: 1, text: 'A 40 × 40 mm supermirror-coated glass channel carries neutrons to the sample. Between 2.3 m and 5.65 m it is a six-channel bender with a 95 m radius that turns the beam by 2°, so fast neutrons and gammas — which cannot follow the curve — never get a straight line of sight to the sample.' },
  { key: 'shutter', name: 'Primary shutter', loc: '2.3 – 4.2 m', inner: 1, text: 'A heavy steel block that carries the first half of the bender. It stays open during normal running and is only closed for maintenance.' },
  { key: 't1', hot: 1, name: 'Chopper T1', loc: '5.70 m', inner: 1, text: 'Bandwidth chopper: a 637 mm boron-coated disc with a 129.6° cut-out, spinning once per source pulse. A neutron only gets through if it arrives while the cut-out is in the beam, so the disc picks a band of speeds — that is, of wavelengths — about 4 Å wide.' },
  { key: 't2', hot: 1, name: 'Chopper T2', loc: '7.80 m', inner: 1, text: 'Second bandwidth chopper, with a 180° opening. Working with T1 it trims the leading edge of the band and blocks slow stragglers left over from earlier pulses.' },
  { key: 't3', hot: 1, name: 'Chopper T3 (double disc)', loc: '9.50 m', inner: 1, text: 'Two 230° discs 10 mm apart (drawn further apart here), turning together. Shifting one disc against the other changes the net opening, which sets the final width of the wavelength band. Run at 30 Hz, the choppers do “frame skipping” and pass two bands at once.' },
  { key: 'monitor', name: 'Beam monitor', loc: '10.01 m', inner: 1, text: 'A deliberately inefficient ³He counter that samples the beam to record the incident spectrum. Collimation begins right after it.' },
  { key: 's1', hot: 1, name: 'Source aperture S1', loc: '10.08 m', inner: 1, text: 'First of three slit wheels. Each wheel holds eight positions: 10, 15 and 20 mm circles, 10, 15 and 20 mm squares, fully open (40 × 40 mm) and closed. S1 is the “source” of the pinhole camera, 4 m upstream of the sample.' },
  { key: 'shutter2', name: 'Secondary shutter', loc: '10.1 – 11.1 m', inner: 1, text: 'A 1 m-long rotating drum with four open and four closed positions. Closing it lets people work at the sample position while the rest of the facility keeps running.' },
  { key: 's2', hot: 1, name: 'Aperture wheel S2', loc: '11.16 m', inner: 1, text: 'Second slit wheel. Moving the source aperture here or to S3 shortens the collimation, trading resolution for more neutrons on the sample.' },
  { key: 's3', hot: 1, name: 'Aperture wheel S3', loc: '12.15 m', inner: 1, text: 'Third slit wheel, the same eight-position design as S1 and S2.' },
  { key: 'guards', name: 'Guard slits', loc: '12.4 – 13.7 m', inner: 1, text: 'Six apertures that never touch the main beam. They catch stray neutrons scattered from the slit edges and shielding, keeping the background around the beam low.' },
  { key: 'shield', major: 1, name: 'Beamline shielding', loc: '5.5 – 12.5 m', text: 'Stacked steel-and-concrete blocks (the red blocks with yellow handrails in the hall) that enclose the choppers, guides and collimation.' },
  { key: 'hutch', name: 'Sample enclosure', loc: '13.0 – 14.6 m', text: 'The steel-panelled room around the sample position. It is a radiation shield and a humidity-controlled space; nothing magnetic sits within 2 m of the sample, so magnets can be used.' },
  { key: 'sampleenv', name: 'Sample table', loc: '14 m', inner: 1, text: 'An optical breadboard that carries the sample stage and the sample environment.' },
  { key: 'ss', hot: 1, name: 'Sample aperture', loc: '13.9 m', inner: 1, text: 'The last aperture, normally 10 mm in diameter, on the nose of the evacuated flight tube just before the sample. With the source aperture 4 m upstream it defines the beam size and divergence, and therefore the smallest Q that can be measured.' },
  { key: 'sample', hot: 1, name: 'Sample (banjo cells)', loc: '14.00 m', inner: 1, text: 'Liquids go in “banjo” cells: flat round quartz cells with a 1–5 mm path and a filling neck. A rack holds several, and one is driven into the beam. Most neutrons pass straight through; a small fraction scatter by a few degrees.' },
  { key: 'window', hot: 1, name: 'Sapphire window', loc: '14.2 m', inner: 1, text: 'A 12-inch single-crystal sapphire window is the entrance to the detector tank. Sapphire is strong enough to hold the vacuum yet nearly transparent to cold neutrons and adds almost no small-angle scattering of its own.' },
  { key: 'tank', major: 1, name: 'Detector tank', loc: '14.6 – 24.6 m', text: 'The blue vacuum tank the scattered neutrons fly through. Its double wall is filled with 200 mm of light concrete to slow fast neutrons, and lined with 5 mm of boron carbide to absorb them. The whole tank rolls 2 m along rails to make room for bulky sample equipment.' },
  { key: 'detector', hot: 1, name: 'Detector', loc: '15.3 – 23 m', inner: 1, text: '1 m × 1 m of ³He tubes, 8 mm in diameter, in two staggered planes, each tube read out as 256 pixels. It rides on rails inside the tank, 1.3 to 9 m from the sample. A small beam stop in front absorbs the unscattered beam.' },
  { key: 'door', name: 'Tank end door', loc: '24.6 m', text: 'The 17,500 lb door that closes the downstream end of the tank.' },
  { key: 'plug', major: 1, name: 'Concrete beam-stop plug', loc: '25 m', text: 'A concrete cylinder parked behind the door on the beam axis. Extra shielding: it soaks up whatever makes it through the end of the tank.' },
  { key: 'mezz', name: 'Mezzanine', loc: 'above', text: 'The walkway over the sample area and tank. In the real hall it hides most of the blue tank from view.' },
];
const infoBy = Object.fromEntries(INFO.map((i) => [i.key, i]));

// ───────────────────────── neutrons ─────────────────────────
const NMAX = 7000;
const P = {
  st: new Uint8Array(NMAX), s: new Float32Array(NMAX), lam: new Float32Array(NMAX), v: new Float32Array(NMAX),
  au: new Float32Array(NMAX), av: new Float32Array(NMAX), ku: new Float32Array(NMAX), kv: new Float32Array(NMAX),
  u0: new Float32Array(NMAX), v0: new Float32Array(NMAX), u1: new Float32Array(NMAX), v1: new Float32Array(NMAX),
  vx: new Float32Array(NMAX), vy: new Float32Array(NMAX), vz: new Float32Array(NMAX), life: new Float32Array(NMAX),
};
const pPos = new Float32Array(NMAX * 3).fill(-999), pCol = new Float32Array(NMAX * 3), pSize = new Float32Array(NMAX), pAlpha = new Float32Array(NMAX);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1));
const pMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 800 } },
  vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 color; uniform float uScale; varying vec3 vC; varying float vA;
    void main(){ vC=color; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(aSize*uScale/-mv.z,4.0,34.0); }`,
  fragmentShader: `varying vec3 vC; varying float vA;
    void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=pow(max(0.0,1.0-d),1.6); gl_FragColor=vec4(vC*a*vA*1.9+vec3(a*a*a*vA*0.18),1.0); }`,
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
});
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false; points.visible = false;
root.add(points);

const tmpC = new THREE.Color();
function lamColor(i, lam) {
  const t = THREE.MathUtils.clamp((lam - 1) / (LAM_TOP - 1), 0, 1);
  tmpC.setHSL(0.76 * (1 - t), 1, 0.55);
  pCol[i * 3] = tmpC.r; pCol[i * 3 + 1] = tmpC.g; pCol[i * 3 + 2] = tmpC.b;
}
let cursor = 0;
function spawn() {
  for (let k = 0; k < NMAX; k++) { cursor = (cursor + 1) % NMAX; if (!P.st[cursor]) return cursor; }
  return -1;
}
function kill(i, flash = 0) {
  P.st[i] = 3; P.life[i] = 1;
  if (flash) { pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 1; pSize[i] = 0.03; }
}
function setPos(i, s, u, v) {
  const p = pathAt(s);
  pPos[i * 3] = p.x + u * Math.sin(p.yaw); pPos[i * 3 + 1] = v; pPos[i * 3 + 2] = p.z + u * Math.cos(p.yaw);
}

// sample: dilute spheres, P(q) = [3(sin x − x cos x)/x³]², x = qR
let RS = 60, SDD = 4, simSpeed = 1, viewMode = 'q';
const formFactor = (q) => { const x = q * RS; if (x < 1e-3) return 1; const f = 3 * (Math.sin(x) - x * Math.cos(x)) / (x * x * x); return f * f + 0.0006; };
const qOf = (r, lam) => 4 * PI / lam * Math.sin(Math.atan(r / SDD) / 2);
const hit = { y: 0, z: 0 };
function sampleHit(lam) {                       // where on the detector plane does a scattered neutron land?
  for (let n = 0; n < 4000; n++) {
    const y = (Math.random() - 0.5) * 1.3, z = (Math.random() - 0.5) * 1.3;
    if (Math.random() < formFactor(qOf(Math.hypot(y, z), lam))) { hit.y = y; hit.z = z; return; }
  }
  hit.y = (Math.random() - 0.5) * 1.3; hit.z = (Math.random() - 0.5) * 1.3;
}

// histograms
const rawH = new Float32Array(NB * NB), qH = new Float32Array(NB * NB);
const NQ = 48, iqC = new Float64Array(NQ), iqN = new Float64Array(NQ);
let total = 0, dirty = true;
const qEdge = () => qOf(DET_HALF, LAM_C);       // Q at the detector edge for the band centre
const Q_LO = 0.004;
const qBin = (q) => Math.floor(Math.log(q / Q_LO) / Math.log(qEdge() * 1.6 / Q_LO) * NQ);
function count(y, z, lam) {
  const r = Math.hypot(y, z);
  if (Math.abs(y) >= DET_HALF || Math.abs(z) >= DET_HALF || r < BEAMSTOP_R) return;
  rawH[Math.floor((0.5 - y) * NB) * NB + Math.floor((z + 0.5) * NB)]++;
  const q = qOf(r, lam), k = q / qEdge() / r;                // same direction, radius rescaled to Q
  const qy = y * k * 0.5, qz = z * k * 0.5;
  if (Math.abs(qy) < 0.5 && Math.abs(qz) < 0.5) qH[Math.floor((0.5 - qy) * NB) * NB + Math.floor((qz + 0.5) * NB)]++;
  const b = qBin(q); if (b >= 0 && b < NQ) iqC[b]++;
  total++; dirty = true;
}
function flat(lam) {                            // flat-field normalisation for I(Q)
  const y = Math.random() - 0.5, z = Math.random() - 0.5, r = Math.hypot(y, z);
  if (r < BEAMSTOP_R) return;
  const b = qBin(qOf(r, lam)); if (b >= 0 && b < NQ) iqN[b]++;
}
function clearData() { rawH.fill(0); qH.fill(0); iqC.fill(0); iqN.fill(0); total = 0; dirty = true; }

const LUT = [[0, 0, 0.03, 0.1], [0.12, 0.12, 0.1, 0.55], [0.3, 0.1, 0.45, 0.95], [0.48, 0.1, 0.8, 0.75], [0.62, 0.35, 0.9, 0.3], [0.78, 0.95, 0.9, 0.15], [0.9, 1, 0.5, 0.1], [1, 1, 0.97, 0.9]];
const img = detCtx.createImageData(NB, NB);
function drawDetector() {
  const h = viewMode === 'q' ? qH : rawH;
  let max = 0; for (let i = 0; i < h.length; i++) if (h[i] > max) max = h[i];
  const lm = Math.log(1 + max) || 1;
  for (let i = 0; i < h.length; i++) {
    const t = Math.log(1 + h[i]) / lm;
    let k = 1; while (k < LUT.length - 1 && LUT[k][0] < t) k++;
    const a = LUT[k - 1], b = LUT[k], f = (t - a[0]) / (b[0] - a[0] || 1);
    img.data[i * 4] = 255 * (a[1] + (b[1] - a[1]) * f); img.data[i * 4 + 1] = 255 * (a[2] + (b[2] - a[2]) * f); img.data[i * 4 + 2] = 255 * (a[3] + (b[3] - a[3]) * f);
    img.data[i * 4 + 3] = h[i] > 0 ? 245 : 60;
  }
  detCtx.putImageData(img, 0, 0);
  det2d.drawImage(detCanvas, 0, 0, 200, 200);
  detTex.needsUpdate = true;
}
const iqCtx = $('iq').getContext('2d');
const det2d = $('det2d').getContext('2d'); det2d.imageSmoothingEnabled = false;
function drawIQ() {
  const c = iqCtx, W = 400, H = 300, L = 46, B = 34, T = 12, R = 12;
  c.clearRect(0, 0, W, H);
  const qHi = qEdge() * 1.6, X = (q) => L + Math.log(q / Q_LO) / Math.log(qHi / Q_LO) * (W - L - R), Y = (v) => T + (0 - Math.log10(v)) / 4.5 * (H - T - B);
  c.strokeStyle = 'rgba(255,255,255,0.12)'; c.fillStyle = 'rgba(214,232,242,0.6)'; c.font = '18px Inter, sans-serif'; c.lineWidth = 1;
  c.textAlign = 'center';
  for (const q of [0.01, 0.03, 0.1, 0.3]) if (q < qHi) { c.beginPath(); c.moveTo(X(q), T); c.lineTo(X(q), H - B); c.stroke(); c.fillText(String(q), X(q), H - 12); }
  c.textAlign = 'right';
  for (let d = 0; d >= -4; d--) { c.beginPath(); c.moveTo(L, Y(10 ** d)); c.lineTo(W - R, Y(10 ** d)); c.stroke(); c.fillText('1e' + d, L - 6, Y(10 ** d) + 6); }
  c.fillText('Q (Å⁻¹)', W - R, H - 12);
  c.save(); c.beginPath(); c.rect(L, T, W - L - R, H - T - B); c.clip();
  c.strokeStyle = 'rgba(98,220,255,0.75)'; c.lineWidth = 2; c.beginPath();
  for (let i = 0; i <= 300; i++) { const q = Q_LO * (qHi / Q_LO) ** (i / 300), y = Y(formFactor(q)); i ? c.lineTo(X(q), y) : c.moveTo(X(q), y); }
  c.stroke();
  let sc = 0, sn = 0;                                           // scale data onto the model curve
  const pts = [];
  for (let b = 0; b < NQ; b++) if (iqN[b] > 20 && iqC[b] > 0) { const q = Q_LO * (qHi / Q_LO) ** ((b + 0.5) / NQ), v = iqC[b] / iqN[b]; pts.push([q, v]); sc += v; sn += formFactor(q); }
  c.fillStyle = '#ffb347';
  for (const [q, v] of pts) { c.beginPath(); c.arc(X(q), Y(v * sn / sc), 4, 0, TAU); c.fill(); }
  c.restore();
}

// one pulse of the source
let simT = 0, nextPulse = 0, beamOn = false;
const lamEmitMax = () => Math.max(LAM_TOP * 1.18, LAM_MAX + 2.5);
const pulseTimes = [];                      // emission times of recent pulses (time–distance plot)
function emitPulse() {
  pulseTimes.push(nextPulse); if (pulseTimes.length > 8) pulseTimes.shift();
  for (let n = 0; n < 720; n++) {
    const i = spawn(); if (i < 0) return;
    const lam = 0.8 + (lamEmitMax() - 0.8) * Math.pow(Math.random(), 1.8);            // cold-moderator-like spectrum
    P.st[i] = 1; P.lam[i] = lam; P.v[i] = KV / lam; P.s[i] = -Math.random() * 0.25;
    P.au[i] = (Math.random() * 2 - 1) * 0.019; P.av[i] = (Math.random() * 2 - 1) * 0.019;
    P.ku[i] = 0.6 + Math.random() * 2.2; P.kv[i] = 0.6 + Math.random() * 2.2;
    P.u0[i] = Math.random() * TAU; P.v0[i] = Math.random() * TAU;   // wobble phases while in the guide
    pSize[i] = 0.016; pAlpha[i] = 1; lamColor(i, lam);
  }
}
function stepNeutrons(dt, realDt) {
  const xDet = S_SAMPLE + SDD;
  for (let i = 0; i < NMAX; i++) {
    const st = P.st[i];
    if (!st) continue;
    if (st === 3) {
      P.life[i] -= realDt * 3.5; pAlpha[i] = Math.max(0, P.life[i]);
      if (P.life[i] <= 0) { P.st[i] = 0; pPos[i * 3] = -999; }
      continue;
    }
    if (st === 2) {                                                  // scattered: straight flight to the detector plane
      pPos[i * 3] += P.vx[i] * dt; pPos[i * 3 + 1] += P.vy[i] * dt; pPos[i * 3 + 2] += P.vz[i] * dt;
      if (pPos[i * 3] >= xDet - 0.012) {
        const y = pPos[i * 3 + 1], z = pPos[i * 3 + 2], lam = P.lam[i];
        pPos[i * 3] = xDet - 0.014;
        if (Math.abs(y) < DET_HALF && Math.abs(z) < DET_HALF) {
          count(y, z, lam);
          for (let k = 0; k < 70; k++) { sampleHit(lam); count(hit.y, hit.z, lam); flat(lam); }   // each bead stands for many neutrons
          kill(i, 1);
        } else kill(i);
      }
      continue;
    }
    const s0 = P.s[i], s1 = s0 + P.v[i] * dt;
    let dead = false;
    for (const c of choppers) if (s0 < c.s && s1 >= c.s && !c.open(simT + (c.s - s0) / P.v[i])) { P.s[i] = c.s; dead = true; break; }
    let u, v;
    if (!dead && s0 < S_S1) {
      const sc = Math.min(s1, S_S1);
      u = P.au[i] * Math.sin(P.ku[i] * sc + P.u0[i]); v = P.av[i] * Math.sin(P.kv[i] * sc + P.v0[i]);
      if (s1 >= S_S1) {                                              // source aperture, then free flight
        if (Math.hypot(u, v) > apertures[0].r) { P.s[i] = S_S1; dead = true; }
        else {
          P.u0[i] = u; P.v0[i] = v;
          const good = Math.random() < 0.8, rr = (good ? 0.0045 : 0.045) * Math.sqrt(Math.random()), a = Math.random() * TAU;
          P.u1[i] = rr * Math.cos(a); P.v1[i] = rr * Math.sin(a);
        }
      }
    }
    if (!dead && s1 >= S_S1) {
      const span = S_SAMPLE - S_S1;
      for (let k = 1; k < apertures.length && s0 >= S_S1 - 1e-6; k++) {
        const ap = apertures[k];
        if (s0 < ap.s && s1 >= ap.s) {
          const t = (ap.s - S_S1) / span;
          if (Math.hypot(P.u0[i] + (P.u1[i] - P.u0[i]) * t, P.v0[i] + (P.v1[i] - P.v0[i]) * t) > ap.r) { P.s[i] = ap.s; dead = true; break; }
        }
      }
      const t = (Math.min(s1, dead ? P.s[i] : s1) - S_S1) / span;
      u = P.u0[i] + (P.u1[i] - P.u0[i]) * t; v = P.v0[i] + (P.v1[i] - P.v0[i]) * t;
      if (!dead && s0 < S_SAMPLE && s1 >= S_SAMPLE) {
        if (Math.random() < 0.5) {                                   // scattered by the sample
          sampleHit(P.lam[i]);
          const dx = SDD, dy = hit.y - P.v1[i], dz = hit.z - P.u1[i], n = P.v[i] / Math.hypot(dx, dy, dz);
          P.vx[i] = dx * n; P.vy[i] = dy * n; P.vz[i] = dz * n; P.st[i] = 2;
          pPos[i * 3] = S_SAMPLE; pPos[i * 3 + 1] = P.v1[i]; pPos[i * 3 + 2] = P.u1[i];
          continue;
        }
        P.u0[i] = P.u1[i]; P.v0[i] = P.v1[i];                         // transmitted: carry straight on
      }
      if (!dead && s1 >= xDet - 0.06) { P.s[i] = xDet - 0.06; dead = true; }   // beam stop
    }
    if (dead) { setPos(i, P.s[i], u ?? 0, v ?? 0); kill(i); continue; }
    P.s[i] = s1;
    setPos(i, s1, u, v);
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  pGeo.attributes.aSize.needsUpdate = true; pGeo.attributes.aAlpha.needsUpdate = true;
}
function clearNeutrons() { P.st.fill(0); pPos.fill(-999); pGeo.attributes.position.needsUpdate = true; }

// ───────────────────────── labels, picking, UI ─────────────────────────
const labelEls = {};
for (const it of INFO) {
  const li = document.createElement('li'), b = document.createElement('button');
  b.type = 'button'; b.dataset.key = it.key; if (it.hot) b.className = 'key';
  b.innerHTML = `<span>${it.name}</span><small>${it.loc}</small>`;
  b.onclick = () => select(it.key, true);
  li.append(b); $('partlist').append(li);
  const el = document.createElement('div'); el.className = 'lbl'; el.textContent = it.name.replace(/ \(.*\)| & .*/, '');
  el.onclick = () => select(it.key, true);
  $('labels').append(el); labelEls[it.key] = el;
}
let selected = null, labelsOn = true;
function select(key, fly) {
  selected = key;
  const it = infoBy[key];
  $('info').hidden = false; $('info-name').textContent = it.name; $('info-loc').textContent = it.loc; $('info-text').textContent = it.text;
  document.querySelectorAll('#partlist button').forEach((b) => b.classList.toggle('on', b.dataset.key === key));
  for (const k in labelEls) labelEls[k].classList.toggle('on', k === key);
  if (it.inner && !exploded) setXray(true);
  if (hidden.has(key)) setHidden(key, false);
  if (fly) { stopTour(); focus(key); }
  if (window.innerWidth <= 820) setParts(false);
}
$('info-close').onclick = () => { $('info').hidden = true; };
function setParts(open) {
  $('parts').classList.toggle('collapsed', !open);
  $('parts-toggle').setAttribute('aria-expanded', open);
  $('parts-toggle').firstElementChild.textContent = open ? '▾' : '▸';
}
$('parts-toggle').onclick = () => setParts($('parts').classList.contains('collapsed'));
setParts(window.innerWidth > 820);

// detector window (image + I(Q)); shown with the beam unless the user closes it
let hudOn = true;
function syncHud() {
  $('hud').hidden = !(beamOn && hudOn && !(tour && window.innerWidth <= 820));
  $('btn-hud').hidden = !beamOn;
  $('btn-hud').classList.toggle('on', hudOn);
  $('tof').hidden = !(beamOn && tofOn);
  $('btn-tof').hidden = !beamOn;
  $('btn-tof').classList.toggle('on', tofOn);
}
// time–distance diagram, drawn from the same clock and chopper phases as the 3D beam
let tofOn = false;
function setTof(on) {
  tofOn = on;
  if (on && window.innerWidth <= 820) hudOn = false;
  if (on) setParts(false);
  syncHud();
}
$('btn-tof').onclick = () => setTof(!tofOn);
$('tof-close').onclick = () => setTof(false);
const TOF_LAMS = []; for (let l = 0.9; l <= 22.01; l += 0.2) TOF_LAMS.push(l);
const tofCv = $('tofplot'), tofCtx = tofCv.getContext('2d');
function drawTof() {
  const c = tofCtx, W = tofCv.width, H = tofCv.height, L = 140, R = 12, T = 14, B = 40;
  const pw = W - L - R, ph = H - T - B, sDet = S_SAMPLE + SDD;
  const t0 = simT - 2.6 * PERIOD, span = 3 * PERIOD;
  const X = (t) => L + (t - t0) / span * pw, Y = (d) => T + ph - d / sDet * ph;
  c.clearRect(0, 0, W, H);
  c.font = '500 19px Inter, sans-serif'; c.textBaseline = 'middle'; c.lineCap = 'butt';
  // distance axis: the stations a neutron passes
  const rows = [['Source', 0], ['T1', S_T1], ['T2', S_T2], ['T3', S_T3], ['Sample', S_SAMPLE], ['Detector', sDet]];
  c.textAlign = 'right';
  for (const [name, d] of rows) {
    c.strokeStyle = 'rgba(255,255,255,0.13)'; c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(d)); c.lineTo(W - R, Y(d)); c.stroke();
    c.fillStyle = 'rgba(214,232,242,0.75)'; c.fillText(`${name} ${d.toFixed(1)}`, L - 8, Y(d) + (name === 'Sample' && SDD < 2.2 ? 9 : 0) - (name === 'Detector' && SDD < 2.2 ? 9 : 0));
  }
  c.save(); c.beginPath(); c.rect(L, T - 6, pw, ph + 12); c.clip();
  // pulses
  const k0 = Math.ceil(t0 / PERIOD);
  for (let k = k0; k * PERIOD <= t0 + span; k++) {
    c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(k * PERIOD), T); c.lineTo(X(k * PERIOD), T + ph); c.stroke();
  }
  // rays: one per wavelength per pulse, stopped by the first closed chopper
  c.lineWidth = 1.8;
  for (const tk of pulseTimes) {
    if (tk > simT) continue;
    for (const lam of TOF_LAMS) {
      if (lam > lamEmitMax()) break;
      const v = KV / lam; let stop = sDet, cut = false;
      for (const ch of choppers) if (!ch.open(tk + ch.s / v)) { stop = ch.s; cut = true; break; }
      const d = Math.min(stop, v * (simT - tk)), tEnd = tk + d / v;
      if (tEnd < t0) continue;
      const hue = 0.76 * (1 - THREE.MathUtils.clamp((lam - 1) / (LAM_TOP - 1), 0, 1)) * 360;
      c.strokeStyle = `hsla(${hue},100%,58%,${cut ? 0.5 : 0.95})`;
      c.beginPath(); c.moveTo(X(tk), Y(0)); c.lineTo(X(tEnd), Y(d)); c.stroke();
      if (d >= sDet) { c.fillStyle = `hsl(${hue},100%,62%)`; c.beginPath(); c.arc(X(tEnd), Y(d), 3.4, 0, TAU); c.fill(); }
    }
  }
  // band edges: λmin and λmax of one pulse reach the detector exactly one period apart
  c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1.5; c.setLineDash([3, 4]);
  for (const tk of pulseTimes) for (const lam of [LAM_MIN, LAM_MAX]) {
    const d = Math.min(sDet, KV / lam * (simT - tk)); if (d <= 0) continue;
    c.beginPath(); c.moveTo(X(tk), Y(0)); c.lineTo(X(tk + d * lam / KV), Y(d)); c.stroke();
  }
  c.setLineDash([]);
  // choppers: a thick bar while the disc blocks the beam, a gap while the cut-out is in it
  c.strokeStyle = '#dfe6ea'; c.lineWidth = 7;
  for (const ch of choppers) {
    let from = null; c.beginPath();
    for (let px = 0; px <= pw; px += 2) {
      const closed = !ch.open(t0 + px / pw * span);
      if (closed && from === null) from = px;
      if ((!closed || px + 2 > pw) && from !== null) { c.moveTo(L + from, Y(ch.s)); c.lineTo(L + px, Y(ch.s)); from = null; }
    }
    c.stroke();
  }
  // now
  c.strokeStyle = 'rgba(125,255,178,0.9)'; c.lineWidth = 2; c.setLineDash([6, 5]);
  c.beginPath(); c.moveTo(X(simT), T - 6); c.lineTo(X(simT), T + ph + 6); c.stroke(); c.setLineDash([]);
  c.restore();
  // time axis
  c.textAlign = 'center'; c.fillStyle = 'rgba(214,232,242,0.6)';
  for (let k = k0; k * PERIOD <= t0 + span; k++) if (X(k * PERIOD) > L + 30 && X(k * PERIOD) < W - R - 30) c.fillText('pulse', X(k * PERIOD), H - B + 16);
  c.fillStyle = '#7dffb2'; c.fillText('now', Math.min(X(simT), W - R - 22), H - B + 16);
  c.fillStyle = 'rgba(214,232,242,0.45)'; c.textAlign = 'right'; c.fillText('time →   16.7 ms between pulses', W - R, H - 9);
  c.textAlign = 'left'; c.fillText('distance from source (m)', 4, H - 9);
}
function setHud(on) { hudOn = on; syncHud(); }
$('btn-hud').onclick = () => setHud(!hudOn);
$('hud-close').onclick = () => setHud(false);

let fly = null;
function flyTo(pos, tgt, dur = 1.4) { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: tgt.clone(), t: 0, dur }; }
const bb = new THREE.Box3(), sph = new THREE.Sphere();
function focus(key) {
  bb.setFromObject(keyed[key]).getBoundingSphere(sph);
  const dir = new THREE.Vector3(-0.55, 0.38, 1).normalize();
  if (key === 'door' || key === 'plug') dir.set(1, 0.3, 0.75).normalize();
  if (key === 'detector' || key === 'window') dir.set(-1, 0.3, 0.8).normalize();
  flyTo(sph.center.clone().addScaledVector(dir, Math.max(sph.radius * 3.1, 0.28)), sph.center);
}

// X-ray: fade every shell so the inside of the beamline shows
let xray = false, xrayAmt = 0;
function setXray(on) { xray = on; $('btn-xray').classList.toggle('on', on); }
function applyXray() {
  const tr = xrayAmt > 0.01;
  for (const { m, base, glassy } of shellMats) {
    m.opacity = base * (1 - xrayAmt * (glassy ? 0.8 : 0.9));
    if (glassy) continue;
    if (m.transparent !== tr) { m.transparent = tr; m.depthWrite = !tr; m.needsUpdate = true; }
  }
  if (doorLabel) doorLabel.material.opacity = 1 - xrayAmt * 0.9;
}

// hide the big structures that block the view
const HIDE_GROUPS = [
  { name: 'Target monolith & primary shutter', keys: ['monolith', 'shutter'] },
  { name: 'Beamline shielding', keys: ['shield'] },
  { name: 'Sample enclosure', keys: ['hutch'] },
  { name: 'Mezzanine', keys: ['mezz'] },
  { name: 'Detector tank, end door & plug', keys: ['tank', 'door', 'plug'] },
];
const hidden = new Set();
function setHidden(key, on) {
  on ? hidden.add(key) : hidden.delete(key);
  keyed[key].visible = !on;
  document.querySelector(`#partlist button[data-key="${key}"]`)?.classList.toggle('off', on);
  let n = 0;
  HIDE_GROUPS.forEach((g, i) => { const all = g.keys.every((k) => hidden.has(k)); n += all; $('hide-list').children[i].firstChild.checked = all; });
  $('btn-hide').classList.toggle('on', hidden.size > 0 || !$('hide-menu').hidden);
  $('btn-hide').textContent = n ? `Hide (${n})` : 'Hide';
  if (on && selected === key) $('info').hidden = true;
}
for (const g of HIDE_GROUPS) {
  const l = document.createElement('label');
  l.innerHTML = `<input type="checkbox" /> ${g.name.replace('&', '&amp;')}`;
  l.firstChild.onchange = (e) => { const on = e.target.checked; g.keys.forEach((k) => setHidden(k, on)); };
  $('hide-list').append(l);
}
$('hide-all').onclick = () => { const keys = HIDE_GROUPS.flatMap((g) => g.keys), all = !keys.every((k) => hidden.has(k)); keys.forEach((k) => setHidden(k, all)); };
$('btn-hide').onclick = () => { $('hide-menu').hidden = !$('hide-menu').hidden; $('btn-hide').classList.toggle('on', hidden.size > 0 || !$('hide-menu').hidden); };

// exploded view
let exploded = false, exAmt = 0;
const ease = (t) => t * t * t * (t * (6 * t - 15) + 10);
function applyExplode() {
  for (const p of pieces) p.o.position.copy(p.home).addScaledVector(p.ex, ease(THREE.MathUtils.clamp(exAmt * 1.6 - p.delay, 0, 1)));
}
function setExplode(on) {
  exploded = on;
  $('btn-explode').classList.toggle('on', on); $('btn-explode').textContent = on ? 'Reassemble' : 'Explode';
  if (on) { setBeam(false); setXray(false); flyTo(new THREE.Vector3(2, 21, 40), new THREE.Vector3(12.5, 2.2, 0), 2.6); }
}
function setBeam(on) {
  beamOn = on; points.visible = on || points.visible;
  $('btn-beam').classList.toggle('on', on); $('btn-beam').textContent = on ? 'Stop beam' : 'Neutron beam';
  syncHud();
  if (on) {
    if (exploded) setExplode(false);
    setXray(true); clearData(); nextPulse = Math.ceil(simT / PERIOD) * PERIOD; pulseTimes.length = 0;
    if (window.innerWidth > 820) $('info').hidden = true;
    flyTo(new THREE.Vector3(6, 8.5, 27), new THREE.Vector3(11.5, 1.2, 0), 2.2);
  } else { stopTour(); clearNeutrons(); points.visible = false; }
}
$('btn-explode').onclick = () => setExplode(!exploded);
$('btn-tour').onclick = () => (tour ? stopTour() : startTour());
$('btn-beam').onclick = () => setBeam(!beamOn);
$('btn-xray').onclick = () => setXray(!xray);
$('btn-labels').onclick = () => { labelsOn = !labelsOn; $('btn-labels').classList.toggle('on', labelsOn); $('labels').style.display = labelsOn ? '' : 'none'; };
$('btn-reset').onclick = () => { stopTour(); flyTo(HOME_POS, HOME_TGT); };
document.querySelectorAll('.seg button[data-view]').forEach((b) => (b.onclick = () => {
  viewMode = b.dataset.view; dirty = true;
  document.querySelectorAll('.seg button[data-view]').forEach((o) => o.classList.toggle('on', o === b));
}));
$('sdd').oninput = (e) => {
  SDD = +e.target.value; $('sdd-out').textContent = SDD.toFixed(1) + ' m';
  detPiece.home.x = S_SAMPLE + SDD; applyExplode(); setBand(); clearData();
  for (let i = 0; i < NMAX; i++) if (P.st[i] === 2) P.st[i] = 0, pPos[i * 3] = -999;
};
// Frame-overlap rule: the band is just wide enough that λmin and λmax, leaving in the same pulse,
// arrive at the detector one source period (1/60 s) apart. The choppers are re-phased to cut exactly that band.
function setBand(lmin = LAM_MIN) {
  LAM_MIN = lmin; LAM_MAX = lmin + KV * PERIOD / (S_SAMPLE + SDD); LAM_C = (LAM_MIN + LAM_MAX) / 2;
  for (const c of choppers) c.setBand(LAM_MIN, LAM_MAX);
  const txt = `${LAM_MIN.toFixed(1)} – ${LAM_MAX.toFixed(1)} Å`;
  $('lmin-out').textContent = txt; $('tof-band').textContent = txt;
}
setBand();
$('lmin').oninput = (e) => { setBand(+e.target.value); clearData(); };
document.querySelectorAll('#lamtop button').forEach((b) => (b.onclick = () => {
  LAM_TOP = +b.dataset.top;
  document.querySelectorAll('#lamtop button').forEach((o) => o.classList.toggle('on', o === b));
  document.querySelectorAll('.lam-top').forEach((o) => (o.textContent = LAM_TOP + ' Å'));
  for (let i = 0; i < NMAX; i++) if (P.st[i]) lamColor(i, P.lam[i]);
}));
$('rs').oninput = (e) => { RS = +e.target.value; $('rs-out').textContent = RS + ' Å'; clearData(); };
$('speed').oninput = (e) => { simSpeed = +e.target.value; $('speed-out').textContent = simSpeed.toFixed(2).replace(/0$/, '') + '×'; };

// click a part in 3D
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'inst') { controls.autoRotate = false; downAt = null; return; }
  downAt = [e.clientX, e.clientY]; fly = null; stopTour();
});
canvas.addEventListener('pointerup', (e) => {
  if (mode !== 'inst' || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  mouse.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  for (const h of ray.intersectObject(root, true)) {
    if (h.object.isPoints) continue;
    { let a = h.object, vis = true; while (a) { if (!a.visible) { vis = false; break; } a = a.parent; } if (!vis) continue; }
    if (xrayAmt > 0.5 && shellMats.some((s) => s.m === h.object.material)) continue;   // click through faded shells
    let o = h.object; while (o && !o.userData.key) o = o.parent;
    if (o) { select(o.userData.key, false); return; }
  }
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.fov = w < h ? 55 : 38; camera.updateProjectionMatrix();
  pMat.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
window.addEventListener('resize', resize); resize();

// ───────────────────────── "ride the pulse" tour ─────────────────────────
// The camera travels with the centre-wavelength neutrons of one pulse, in slow motion.
let tour = null;
const camWant = new THREE.Vector3(), tgtWant = new THREE.Vector3();
const TOUR_TEXT = {
  wait: 'Waiting for the next proton pulse…',
  source: 'A proton pulse hits the target. Neutrons of every wavelength leave the moderator at the same instant.',
  guide: 'Inside the guide the pulse stretches out: fast, short-wavelength neutrons (violet, blue) race ahead and slow ones (yellow, red) fall behind. We ride with the {c} Å neutrons, the middle of the band.',
  t1: 'Chopper T1 — its cut-out is in the beam when our {c} Å neutrons arrive. Anything much faster or slower meets the boron-coated disc and is absorbed.',
  t2: 'Chopper T2 — same trick, 2 m further on. Because the pulse has spread more, the timing cut is sharper.',
  t3: 'Chopper T3 — two discs, one for each edge of the band. Only {band} Å survives: just enough to fill the 1/60 s frame at the detector.',
  coll: 'Collimation — the source aperture, slit wheels, guard slits and the 10 mm sample aperture absorb every neutron that is not travelling almost parallel to the axis.',
  sample: 'The sample — most neutrons go straight through to the beam stop. The rest are deflected by a few degrees; the angle depends on the size of the particles in the liquid.',
  flight: 'Scattered neutrons fan out through the evacuated tank towards the detector.',
  det: 'Each one lands on the detector. Thousands of hits build the rings of the sphere form factor.',
};
function startTour() {
  if (!beamOn) setBeam(true);
  fly = null;
  tour = { t0: nextPulse, speed: 1, hold: 0, stage: '' };
  $('btn-tour').classList.add('on'); $('caption').hidden = false;
  syncHud();
}
function stopTour() {
  if (!tour) return;
  tour = null;
  $('btn-tour').classList.remove('on'); $('caption').hidden = true;
  syncHud();
}
function updateTour(realDt) {
  const xDet = S_SAMPLE + SDD, sc = Math.max(0, (simT - tour.t0) * KV / LAM_C);
  let stage, speed = 0.26, off = [-2.0, 0.85, 2.3], look = 0.8;
  const near = choppers.findIndex((c) => sc > c.s - 0.9 && sc < c.s + 0.7);
  if (simT < tour.t0) { stage = 'wait'; speed = 1; }
  else if (sc < 1) stage = 'source';
  else if (near >= 0) { stage = 't' + (near + 1); speed = 0.07; off = [-1.15, 0.5, 1.35]; look = 0.25; }
  else if (sc < S_T3) stage = 'guide';
  else if (sc < S_SS - 0.4) { stage = 'coll'; speed = 0.2; off = [-1.3, 0.55, 1.5]; look = 0.5; }
  else if (sc < S_SAMPLE + 0.5) { stage = 'sample'; speed = 0.04; off = [-0.55, 0.28, 0.75]; look = 0.25; }
  else if (sc < xDet) { stage = 'flight'; speed = 0.22; off = [-2.3, 0.75, 1.7]; look = 1.2; }
  else { stage = 'det'; speed = 0.5; off = [-2.6, 0.5, 1.5]; look = 0; tour.hold += realDt; }
  tour.speed = speed;
  if (stage !== tour.stage) { tour.stage = stage; $('caption').textContent = TOUR_TEXT[stage].replace('{c}', LAM_C.toFixed(1)).replace('{band}', `${LAM_MIN.toFixed(1)}–${LAM_MAX.toFixed(1)}`); }
  const p = pathAt(Math.min(sc, xDet));
  tgtWant.set(Math.min(p.x + look, xDet), BEAM_Y, p.z);
  camWant.set(p.x + off[0], BEAM_Y + off[1], p.z + off[2]);
  const k = 1 - Math.exp(-realDt * 2.2);
  camera.position.lerp(camWant, k); controls.target.lerp(tgtWant, k);
  if (tour.hold > 7) stopTour();
}

// ───────────────────────── main loop ─────────────────────────
const clock = new THREE.Clock(), v3 = new THREE.Vector3();
let texTimer = 0, plotTimer = 0;
function step(realDt) {
  if (dive) updateDive(realDt);
  if (mode !== 'inst') site.update(realDt);
  if (tour) updateTour(realDt);
  const dt = realDt * (tour ? tour.speed : simSpeed);

  if (fly) {
    fly.t = Math.min(1, fly.t + realDt / fly.dur);
    const e = ease(fly.t);
    camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (fly.t >= 1) fly = null;
  }
  controls.update();

  const exT = exploded ? 1 : 0;
  if (exAmt !== exT) { exAmt = THREE.MathUtils.clamp(exAmt + Math.sign(exT - exAmt) * realDt / 2.8, 0, 1); applyExplode(); }
  const xrT = xray ? 1 : 0;
  if (xrayAmt !== xrT) { xrayAmt = THREE.MathUtils.clamp(xrayAmt + Math.sign(xrT - xrayAmt) * realDt / 0.6, 0, 1); applyXray(); }

  simT += dt;
  for (const c of choppers) for (const d of c.discs) d.disc.rotation.z = c.phase(simT, d);
  const since = (simT % PERIOD);
  MAT.moderator.emissiveIntensity = 1 + (beamOn ? 9 * Math.exp(-since * 7) : 0);
  MAT.proton.emissiveIntensity = 0.3 + (beamOn ? 8 * Math.exp(-since * 9) : 0);

  if (beamOn) { while (simT >= nextPulse) { emitPulse(); nextPulse += PERIOD; } }
  if (points.visible) stepNeutrons(dt, realDt);

  if ((texTimer += realDt) > 0.15 && dirty) { texTimer = 0; drawDetector(); dirty = false; $('counts').textContent = total.toLocaleString() + ' counts'; }
  if ((plotTimer += realDt) > 0.6 && beamOn) { plotTimer = 0; drawIQ(); }

  if (tofOn && beamOn) drawTof();

  if (uiSite) layoutSiteLabels(); else if (labelsOn) layoutLabels();
}
const shown = [], rows = [];
function layoutLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  shown.length = 0;
  for (const it of INFO) {
    const el = labelEls[it.key];
    anchors[it.key].getWorldPosition(v3);
    const dist = v3.distanceTo(camera.position);
    v3.project(camera);
    const vis = !hidden.has(it.key) && v3.z < 1 && Math.abs(v3.x) < 1.02 && Math.abs(v3.y) < 1.02 && (it.hot || it.major || dist < 9 || selected === it.key);
    if (!vis) { el.style.opacity = 0; el.style.pointerEvents = 'none'; continue; }
    shown.push({ el, x: (v3.x + 1) / 2 * w, y: (1 - v3.y) / 2 * h, w: (el._w ??= el.offsetWidth) });
  }
  shown.sort((a, b) => a.x - b.x);
  rows.length = 0;
  for (const l of shown) {                       // greedy: lift a label one row when it would cover its neighbour
    let r = 0;
    while (rows[r] !== undefined && l.x - l.w / 2 < rows[r] + 6 && r < 5) r++;
    rows[r] = l.x + l.w / 2;
    const lift = 14 + r * 24;
    l.el.style.opacity = 1; l.el.style.pointerEvents = '';
    l.el.style.setProperty('--lead', lift + 'px');
    l.el.style.transform = `translate(-50%, -100%) translate(${l.x.toFixed(1)}px, ${(l.y - lift).toFixed(1)}px)`;
  }
}
// ───────────────────────── SNS site: aerial landing view and the dive into beamline 6 ─────────────────────────
// The site model is placed so that its beamline-6 direction coincides with the instrument's +x axis,
// which makes the zoom from the air end on the real model without a cut in position.
const site = buildSite(THREE);
site.group.rotation.y = BL6_ANGLE - PI / 2;
scene.add(site.group); site.group.updateMatrixWorld(true);
const SITE_POS = site.group.localToWorld(new THREE.Vector3(120, 230, -640)), SITE_TGT = site.group.localToWorld(new THREE.Vector3(10, 0, -40));
const DIVE_POS = new THREE.Vector3(13, 150, 70), DIVE_TGT = new THREE.Vector3(13, 0, 0), DIVE_T = 9;
const SKY = 0xa8c6de, DARK = 0x0a0e15;
let mode = 'inst', dive = null;
const siteLabelEls = site.labels.map((l) => {
  const el = document.createElement('div'); el.className = 'lbl site-lbl' + (l.hot ? ' on' : ''); el.textContent = l.text;
  if (l.hot) el.onclick = () => startDive();
  $('sitelabels').append(el);
  return { el, pos: site.group.localToWorld(new THREE.Vector3(...l.at)) };
});
function layoutSiteLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  for (const l of siteLabelEls) {
    v3.copy(l.pos).project(camera);
    const vis = v3.z < 1 && Math.abs(v3.x) < 1 && Math.abs(v3.y) < 1 && !(dive && dive.t / DIVE_T > 0.3);
    l.el.style.opacity = vis ? 1 : 0;
    if (vis) l.el.style.transform = `translate(-50%, -100%) translate(${((v3.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v3.y) / 2 * h - 14).toFixed(1)}px)`;
  }
}
// k = 1: outdoor daylight and site scale; k = 0: the dark instrument hall. Everything in between is blended,
// so the dive needs no cut: the sky darkens, the fog closes in and the site dissolves around the instrument.
const cSky = new THREE.Color(SKY), cDark = new THREE.Color(DARK);
const mixExp = (a, b, k) => b * Math.pow(a / b, k);                 // geometric blend for quantities spanning decades
hallFloor.material.transparent = true;
function applyEnv(k) {
  scene.background.lerpColors(cDark, cSky, k); scene.fog.color.copy(scene.background);
  const d = camera.position.distanceTo(controls.target);              // never let the fog close in front of what the camera looks at
  scene.fog.near = Math.max(mixExp(900, 45, k), d * 1.35); scene.fog.far = Math.max(mixExp(4200, 120, k), d * 3.6);
  camera.near = mixExp(2, 0.05, k); camera.far = mixExp(7000, 400, k); camera.updateProjectionMatrix();
  renderer.toneMappingExposure = 1.1 + (0.72 - 1.1) * k; bloom.strength = 0.5 + (0.25 - 0.5) * k;
  hallFloor.visible = k < 0.999; hallFloor.material.opacity = 1 - k; hallFloor.material.depthWrite = k < 0.02;
}
let uiSite = false;
function setUi(siteOn) {
  uiSite = siteOn;
  controls.minDistance = siteOn ? 80 : 0.12; controls.maxDistance = siteOn ? 1500 : 90;
  controls.maxPolarAngle = siteOn ? PI * 0.46 : PI * 0.495;
  document.body.classList.toggle('site', siteOn);
}
function showSite() {
  stopTour(); if (beamOn) setBeam(false); if (exploded) { exploded = false; exAmt = 0; applyExplode(); $('btn-explode').classList.remove('on'); $('btn-explode').textContent = 'Explode'; }
  fly = null; dive = null; mode = 'site';
  site.group.visible = true; site.setReveal(0); site.setFade(1); applyEnv(1); setUi(true);
  camera.position.copy(SITE_POS); controls.target.copy(SITE_TGT);
  controls.enabled = true; controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
  $('landing').classList.remove('gone');
}
function showInstrument() {
  dive = null; mode = 'inst'; site.group.visible = false; applyEnv(0); setUi(false);
  camera.position.copy(HOME_POS); controls.target.copy(HOME_TGT);
  controls.enabled = true; controls.autoRotate = false;
}
function startDive() {
  if (mode !== 'site') return;
  mode = 'dive'; controls.enabled = false; controls.autoRotate = false;
  dive = { t: 0, p0: camera.position.clone(), t0: controls.target.clone() };
  controls.minDistance = 0.12; controls.maxDistance = 5000;        // OrbitControls clamps the distance even while disabled
  $('landing').classList.add('gone');
}
const dA = new THREE.Vector3(), dB = new THREE.Vector3(), sstep = THREE.MathUtils.smoothstep;
function updateDive(dt) {
  dive.t += dt;
  const u = Math.min(1, dive.t / DIVE_T), e = ease(u);
  dA.lerpVectors(dive.p0, DIVE_POS, e); dB.lerpVectors(DIVE_POS, HOME_POS, e); camera.position.lerpVectors(dA, dB, e);
  dA.lerpVectors(dive.t0, DIVE_TGT, e); dB.lerpVectors(DIVE_TGT, HOME_TGT, e); controls.target.lerpVectors(dA, dB, e);
  site.setReveal(sstep(u, 0.2, 0.4));                             // roof and walls of the target building go first
  applyEnv(1 - sstep(u, 0.36, 0.7));                              // daylight → hall
  site.setFade(1 - sstep(u, 0.5, 0.78));                          // then the other beamlines and the rest of the site
  if (uiSite && u > 0.8) { setUi(false); controls.maxDistance = 5000; }
  if (u >= 1) { site.group.visible = false; applyEnv(0); dive = null; mode = 'inst'; controls.enabled = true; controls.maxDistance = 90; }
}
$('btn-dive').onclick = startDive;
$('btn-skip').onclick = showInstrument;
$('btn-site').onclick = showSite;
if (location.hash === '#eqsans') showInstrument(); else showSite();

function frame() {
  step(Math.min(clock.getDelta(), 0.05));
  composer.render();
  requestAnimationFrame(frame);
}
applyXray();
drawDetector();
frame();
$('loader').classList.add('gone');

window.__eqsans = { startTour, advance: (sec) => { for (let t = 0; t < sec; t += 0.04) step(0.04); }, select, startDive, showSite, showInstrument, get mode() { return mode; }, setHidden, setHud, setTof, setParts, setExplode, setBeam, setXray, flyTo, camera, controls, THREE, get total() { return total; } };
