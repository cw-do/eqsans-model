// Schematic model of the Spallation Neutron Source site (Oak Ridge National Laboratory).
// Built from aerial photographs (2026 imagery): footprints are traced off two images, heights are estimates.
//
// Local frame of the returned group (metres, y up):
//   origin = the target (moderator), protons arrive travelling towards −Z,
//   +Z = upstream (ring, linac), −Z = the bridge, the office building (CLO) and CNMS,
//   +X = right of the proton direction, −X = the Second Target Station construction site.
// Beamline 6 (EQ-SANS) leaves the target on the +X side, drawn at 90° to the proton direction.
//
// Footprints are given in pixels of the two aerial images and mapped into this frame:
//   F — close-up of the target building, CLO, CNMS and the STS pad, 0.3048 m/px (100 ft scale bar = 100 px).
//       Target building roof: x 937–1237, y 100–304 px; the target is put at (1090, 199) px.
//   W — the whole site, 0.70 m/px, rotated 120°. Fitted to F on seven common points (residual ≤ 13 m).

export const BL6_ANGLE = 90 * Math.PI / 180;

export function buildSite(THREE) {
  const PI = Math.PI, TAU = PI * 2, D = PI / 180;
  const group = new THREE.Group();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
  const add = (...ms) => { group.add(...ms); return ms[0]; };
  const box = (w, h, d, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; return m; };
  // extrude a footprint given as [x, z] points up to height h
  const prism = (pts, h, mat, y = 0) => {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }).rotateX(-PI / 2), mat);
    m.position.y = y; return m;
  };
  const sector = (cx, cz, r0, r1, a0, a1, n = 40) => {
    const p = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + r1 * Math.cos(a), cz + r1 * Math.sin(a)]); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; p.push([cx + r0 * Math.cos(a), cz + r0 * Math.sin(a)]); }
    return p;
  };
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // ── image frames: (x + iz) = c·(px + i·py) + d ──
  const frame = (cr, ci, dx, dz) => ({ s: Math.hypot(cr, ci), arg: Math.atan2(ci, cr), P: (px, py) => [cr * px - ci * py + dx, ci * px + cr * py + dz] });
  const S = 0.3048;
  const F = frame(0, S, 199 * S, -1090 * S);
  const W = frame(-0.34979, -0.60576, 34.52, 704.94);
  // G — 2026 close-up of CNMS and the office building, 100 ft = 85 px; fitted to three target-building corners (residual ≤ 2 m)
  const G = frame(-0.169373, -0.329760, -132.456, 173.266);
  const labelAt = {};
  // image-space helpers: sizes in pixels, angles in degrees measured in the image (y down)
  const ry = (Fr, phi) => -(Fr.arg + phi * D);
  const ibox = (Fr, px, py, wp, dp, h, mat, phi = 0, y0 = 0) => { const [x, z] = Fr.P(px, py); return box(wp * Fr.s, h, dp * Fr.s, mat, x, y0 + h / 2, z, ry(Fr, phi)); };
  const irect = (Fr, x0, y0, x1, y1, h, mat, yb = 0) => ibox(Fr, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, h, mat, 0, yb);
  const ibar = (Fr, [x0, y0], [x1, y1], wp, h, mat, yb = 0) => ibox(Fr, (x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0), wp, h, mat, Math.atan2(y1 - y0, x1 - x0) / D, yb);
  const ipts = (Fr, pts) => pts.map(([px, py]) => Fr.P(px, py));
  const iprism = (Fr, pts, h, mat, yb = 0) => prism(ipts(Fr, pts), h, mat, yb);
  const flat = (Fr, pts, mat, y) => iprism(Fr, pts, 0.06, mat, y);   // ground patches; y orders the layers

  // ── where things are ──
  // linac: the tunnel runs under the berm just north of the klystron gallery (the long building in the photo)
  const G0 = W.P(60, 830), G1 = W.P(610, 570);
  const gdx = G1[0] - G0[0], gdz = G1[1] - G0[1], glen = Math.hypot(gdx, gdz), gnx = -gdz / glen, gnz = gdx / glen;   // gn = south of the linac
  const LIN0 = [G0[0] - gnx * 24, G0[1] - gnz * 24], LIN1 = [G1[0] - gnx * 24, G1[1] - gnz * 24];
  const segDist = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
  };
  // developed parts of the site, as circles in the whole-site image [px, py, radius px]; keeps hills and trees off them
  const DEV = [[900, 470, 110], [985, 255, 150], [1170, 430, 140], [1080, 690, 120], [1300, 330, 110], [1530, 300, 90], [1250, 110, 110],
    [1450, 110, 130], [1600, 130, 90], [620, 320, 95], [700, 650, 110], [880, 610, 80], [1230, 600, 90]].map(([px, py, r]) => [...W.P(px, py), r * W.s]);
  const siteDist = (x, z) => {
    let d = segDist(x, z, G0, G1) - 55;
    for (const [cx, cz, r] of DEV) d = Math.min(d, Math.hypot(x - cx, z - cz) - r);
    return d;
  };
  const HILLS = [[-650, 520, 75, 300], [760, -120, 65, 300], [330, -760, 85, 340], [-560, -640, 75, 320], [-980, -60, 95, 340], [-60, 980, 85, 380],
    [1000, 760, 75, 340], [900, -800, 70, 300], [-1100, 900, 80, 380], [240, 760, 40, 200], [-420, 330, 30, 160]];
  const height = (x, z) => {
    let h = 0;
    for (const [hx, hz, hh, s] of HILLS) h += hh * Math.exp(-((x - hx) ** 2 + (z - hz) ** 2) / (s * s));
    return h * THREE.MathUtils.smoothstep(siteDist(x, z), 0, 220);
  };

  // ── ground and forest ──
  {
    const g = new THREE.PlaneGeometry(5200, 5200, 150, 150).rotateX(-PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), d = siteDist(x, z);
      p.setY(i, height(x, z) - 0.08);
      c.setHex(d < 30 ? 0x7da35a : 0x3f6b3a).offsetHSL(0, 0, (rnd() - 0.5) * 0.03);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const ground = add(new THREE.Mesh(g, std(0xffffff, { vertexColors: true, roughness: 1 })));
    ground.userData.keep = true;                                   // stays opaque: the hall floor fades in over it

    const N = 9000, trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0), std(0xffffff, { roughness: 1 }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    let n = 0;
    while (n < N) {
      const r = 180 + 1900 * Math.sqrt(rnd()), a = rnd() * TAU, x = r * Math.cos(a), z = r * Math.sin(a);
      if (siteDist(x, z) < 12 + rnd() * 30) continue;
      const w = 6 + rnd() * 5;
      s.set(w, 14 + rnd() * 12, w); v.set(x, height(x, z) - 0.5, z);
      trees.setMatrixAt(n, m4.compose(v, q, s));
      trees.setColorAt(n, c.setHSL(0.30 + rnd() * 0.06, 0.42 + rnd() * 0.15, 0.17 + rnd() * 0.1));
      n++;
    }
    add(trees);
  }

  const M = {
    wall: std(0xd9d6cc), wall2: std(0xc4c0b4), roof: std(0xe9e7e0), glass: std(0x2f4a66, { roughness: 0.25, metalness: 0.6 }),
    asphalt: std(0x5a5d61, { roughness: 1 }), paving: std(0xb9b7b0, { roughness: 1 }), lawn: std(0x8fb866, { roughness: 1 }),
    metal: std(0xaeb4b9, { roughness: 0.5, metalness: 0.5 }), berm: std(0x7f9f58, { roughness: 1 }), gravel: std(0xa9a49a, { roughness: 1 }),
    dirt: std(0xc8683a, { roughness: 1 }), dirt2: std(0xa9532c, { roughness: 1 }), dirt3: std(0xdc9a62, { roughness: 1 }),
    yellow: std(0xe3a72f, { roughness: 0.6 }), redroof: std(0x9b3b2c),
  };
  // an office or laboratory block along local X, with window bands on its long faces
  const bands = (m, L, Wd, h, mat = M.glass) => {
    const out = [];
    for (let y = 2.4; y < h - 1.5; y += 3.7) { const b = box(L - 3, 1.6, Wd + 0.4, mat, m.position.x, y + 0.8, m.position.z, m.rotation.y); out.push(b); }
    return out;
  };
  const bldg = (Fr, p0, p1, wp, h, mat = M.wall, glass = true, yb = 0) => {
    const m = add(ibar(Fr, p0, p1, wp, h, mat, yb));
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * Fr.s, Wd = wp * Fr.s;
    add(box(L + 0.6, 0.5, Wd + 0.6, M.roof, m.position.x, yb + h + 0.25, m.position.z, m.rotation.y));
    if (glass) add(...bands(m, L, Wd, h));
    return m;
  };
  const blk = (Fr, x0, y0, x1, y1, h, mat = M.wall2) => {      // plain block, axis-aligned in the image
    const m = add(irect(Fr, x0, y0, x1, y1, h, mat));
    add(box(m.geometry.parameters.width + 0.5, 0.4, m.geometry.parameters.depth + 0.5, M.roof, m.position.x, h + 0.2, m.position.z, m.rotation.y));
    return m;
  };

  // ── target building: three long bays along the proton line, the middle (over the target) the tallest ──
  const fade = [];                                                 // materials that dissolve when the camera dives in
  const fmat = (color, o) => { const m = std(color, { transparent: false, ...o }); fade.push(m); return m; };
  const TB = { hall: fmat(0xcfc9b8), bay: fmat(0xbdb7a6), roof: fmat(0x8a7f86), band: fmat(0x3a4c5e, { roughness: 0.3, metalness: 0.5 }), ext: fmat(0xc9c6bd) };
  const tb = add(new THREE.Group());
  {
    const strip = (x0, x1, z0, z1, h, mat) => {
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      tb.add(box(w, h, d, mat, cx, h / 2, cz), box(w + 0.6, 0.6, d + 0.6, TB.roof, cx, h + 0.3, cz));
    };
    // from the close-up: +X bay y 100–164 px, middle 166–232, −X bay 234–304; the middle one is longer at both ends
    strip(10.7, 30.2, -46.6, 44.8, 20, TB.hall);
    strip(-10.4, 10.4, -53.0, 48.2, 24, TB.bay);
    strip(-32.0, -10.7, -46.6, 44.8, 17, TB.hall);
    tb.add(box(0.4, 2, 90, TB.band, -32.1, 13.5, -0.9), box(0.4, 2, 90, TB.band, 30.3, 16, -0.9));   // clerestory windows
    // annexes on the −X side: the hipped-roof block the bridge leaves from, and two plant rooms
    tb.add(iprism(F, [[955, 307], [1075, 307], [1075, 335], [1012, 400], [952, 372]], 13, TB.ext));
    tb.add(iprism(F, [[958, 310], [1072, 310], [1072, 333], [1012, 395], [956, 370]], 1.2, TB.roof, 13));
    tb.add(irect(F, 1084, 305, 1137, 368, 12, TB.ext), irect(F, 1144, 305, 1191, 361, 11, TB.ext), irect(F, 901, 166, 917, 232, 8, TB.ext));
    // +X side: the two blocks between the target building and the laboratory building south of it
    tb.add(irect(F, 1044, 21, 1116, 93, 10, TB.ext), irect(F, 1123, 68, 1173, 96, 6, TB.ext));
  }
  add(box(62.2, 0.1, 101.2, std(0x4a4f56, { roughness: 0.9 }), -0.9, -0.04, -2.4));               // experiment-hall floor
  add(flat(F, [[870, 60], [1310, 60], [1310, 440], [870, 440]], M.paving, -0.07));
  for (let i = 0; i < 6; i++) add(ibox(F, 1222 + i * 12, 330 + (i % 2) * 14, 8, 8, 2.5, M.metal));    // tanks and skids by the plant rooms

  // the other beamlines, as plain blocks fanning out from the target
  {
    const cols = [0x6fa8dc, 0x93c47d, 0xf6b26b, 0x8e7cc3, 0xe06666, 0x76a5af, 0xffd966, 0xc27ba0];
    let k = 0;
    for (const side of [1, -1]) for (let i = 0; i < 9; i++) {
      const a = (32 + i * 14.5) * PI / 180;
      if (side === 1 && Math.abs(a - BL6_ANGLE) < 0.1) continue;   // beamline 6 is the real model
      const len = 8 + rnd() * 12, dx = side * Math.sin(a), dz = -Math.cos(a);
      add(box(len, 2.6, 2.4, std(cols[k++ % cols.length], { roughness: 0.7 }), dx * (7 + len / 2), 1.3, dz * (7 + len / 2), Math.atan2(-dz, dx)));
      if (rnd() < 0.6) add(box(5, 4, 5, std(0xdfe3e6, { roughness: 0.7 }), dx * (9 + len), 2, dz * (9 + len), Math.atan2(-dz, dx)));
    }
    const mono = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 5.2, 40), std(0x8d8f8a, { roughness: 0.8 }));
    mono.position.set(-7.2, 2.6, 2.6); add(mono);                  // rest of the target monolith, beside the slice the instrument model keeps
  }

  // ── the bridge from the target building to the office building ──
  {
    add(ibar(F, [948, 331], [640, 331], 16, 3.2, M.wall2, 6.6), ibar(F, [948, 331], [640, 331], 17, 0.4, M.roof, 9.8));
    add(ibar(F, [946, 331], [642, 331], 17, 1.3, M.glass, 7.6));
    for (let px = 690; px <= 920; px += 46) add(ibox(F, px, 331, 3, 6, 6.6, M.wall2));
  }

  // ── CLO, the block behind it and CNMS, traced in H, the sharpest 2026 close-up (0.19 m/px, fitted through G) ──
  // Kept deliberately simple: two arc buildings, the CLO wing facing the lawn and the long building along Argonne
  // Drive (the wing the bridge comes into, then CNMS), with a flat block filling the space between them.
  {
    const H = frame(-0.191117, -0.006236, 96.524, -61.149);
    // drop collinear points first: earcut turns them into zero-area cap triangles whose zero normals become NaN in the
    // shader, and bloom spreads that NaN into a black rectangle over the screen
    const simplify = (pts) => pts.filter((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length], c = pts[(i + 1) % pts.length];
      return Math.abs((p[0] - a[0]) * (c[1] - a[1]) - (p[1] - a[1]) * (c[0] - a[0])) > 0.5;
    });
    const hp = (pts, h, mat, y = 0) => add(prism(ipts(H, simplify(pts)), h, mat, y));
    const grow = (pts, k) => {
      const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cy = pts.reduce((t, p) => t + p[1], 0) / pts.length;
      return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
    };
    const block = (pts, h, mat = M.wall, glass = true) => {
      hp(pts, h, mat); hp(grow(pts, 1.012), 0.5, M.roof, h);
      if (glass) for (let y = 2.6; y < h - 1.5; y += 3.8) hp(grow(pts, 1.008), 1.6, M.glass, y);
    };
    // two arc-shaped buildings with the flat block between them, each arc a circle fitted to the H outline:
    // CLO (centre out on the lawn, fit within 4 px) and the long building along Argonne Drive, CNMS at its
    // north-east end (centre on the far side of the road, fit within 11 px ≈ 2 m)
    const arcWing = (C, r0, r1, a0, a1, h, mat = M.wall, glass = true) => {
      const sec = (q0, q1, b0, b1) => sector(C[0], C[1], q0, q1, b0 * D, b1 * D, Math.ceil(Math.abs(b1 - b0)) * 2);
      hp(sec(r0, r1, a0, a1), h, mat); hp(sec(r0 - 2, r1 + 2, a0, a1), 0.5, M.roof, h);
      if (glass) for (let y = 2.6; y < h - 1.5; y += 3.8) hp(sec(r0 - 3, r1 + 3, a0 + 0.2, a1 - 0.2), 1.6, M.glass, y);
    };
    const CLOc = [915, 1671.6], NORc = [832.2, -1057.3];
    arcWing(CLOc, 1045, 1100, -119, -75, 22);                         // CLO
    arcWing(CLOc, 1022, 1045, -117, -77, 4, M.wall2, false);          // terrace on the lawn side
    hp(sector(CLOc[0], CLOc[1], 1055, 1090, -100 * D, -92 * D, 16), 3.2, M.wall2, 22.5);   // penthouse
    arcWing(NORc, 1428, 1505, 54, 104.5, 17);                        // the bridge wing and CNMS, one building
    for (let a = 56; a < 70; a += 2.4) { const t = a * D, r = 1452 + ((a / 2.4) % 2) * 26; add(ibox(H, NORc[0] + r * Math.cos(t), NORc[1] + r * Math.sin(t), 22, 16, 3, M.metal, a - 90, 17)); }   // CNMS air handlers
    // the flat block between the two arcs, overlapping both so no ground shows between them
    block([[668, 410], [1062, 410], [1066, 584], [870, 574], [672, 600]], 18, M.wall2);
    add(flat(F, [[440, 190], [520, 190], [520, 300], [440, 300]], M.paving, -0.03));
    labelAt.CLO = H.P(800, 610); labelAt.CNMS = H.P(1440, 300);
  }
  // the rest of the whole-site photo: laboratory south of the target building, Shull Wollan Center, utilities, linac support buildings
  {
    add(ibox(W, 880, 567, 110, 45, 10, M.wall, -3), ibox(W, 876, 560, 55, 24, 15, M.wall, -3), ibox(W, 880, 567, 111, 46, 0.4, M.roof, -3, 10));
    add(ibox(W, 755, 495, 30, 30, 10, M.wall2, -20), ibox(W, 800, 483, 62, 18, 7, M.wall2, -18));
    add(ibox(W, 1412, 312, 72, 38, 10, M.wall, -15), ibox(W, 1395, 320, 30, 30, 13, M.wall2, -15));
    add(ibox(W, 738, 405, 40, 26, 8, M.wall2, 40), ibox(W, 678, 455, 30, 60, 6, M.wall2, 70), ibox(W, 560, 330, 40, 28, 7, M.wall2, 30), ibox(W, 705, 295, 18, 18, 5, M.wall2));
    add(ibox(W, 680, 610, 70, 55, 10, M.wall2, -25));                                         // central utilities
    add(ibox(W, 715, 670, 90, 45, 7, M.metal, -25));                                          // cooling towers
    for (let i = 0; i < 4; i++) { const [x, z] = W.P(680 + i * 22, 686 - i * 10); const f = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 1.2, 20), M.wall); f.position.set(x, 7.6, z); add(f); }
    add(flat(W, [[560, 700], [690, 690], [700, 810], [575, 815]], M.gravel, -0.03), ibox(W, 607, 717, 65, 32, 6, M.redroof, -20));
    for (let i = 0; i < 10; i++) add(ibox(W, 600 + (i % 5) * 20, 755 + Math.floor(i / 5) * 25, 8, 6, 4, M.metal, -20));   // substation
    add(ibox(W, 598, 657, 105, 80, 12, M.roof, -25), ibox(W, 485, 705, 140, 60, 9, M.wall2, -25));   // cryogenics and linac support buildings
  }

  // ── Second Target Station: construction site, 2026 ──
  {
    add(flat(W, [[850, 165], [905, 128], [1010, 126], [1075, 158], [1118, 250], [1122, 375], [1040, 386], [935, 350], [852, 322]], M.dirt, -0.02));
    add(flat(W, [[1085, 0], [1636, 0], [1636, 215], [1440, 225], [1330, 150], [1215, 110], [1130, 140], [1085, 90]], M.dirt, -0.02));
    add(flat(W, [[1300, 0], [1450, 0], [1440, 110], [1310, 100]], M.gravel, 0.0));
    add(flat(F, [[945, 490], [1385, 490], [1385, 880], [955, 880]], M.dirt2, 0.0));              // the excavated footprint
    add(flat(F, [[955, 465], [1215, 465], [1215, 505], [955, 505]], M.dirt3, 0.02), flat(F, [[930, 840], [1020, 840], [1020, 930], [930, 930]], M.dirt3, 0.02));
    add(ibar(F, [952, 500], [962, 750], 12, 0.2, std(0x6e3a22, { roughness: 1 }), 0.01), ibar(F, [1380, 495], [1385, 870], 10, 0.2, std(0x6e3a22, { roughness: 1 }), 0.01));
    const digger = (Fr, px, py, phi) => {
      const g = new THREE.Group(), [x, z] = Fr.P(px, py);
      g.add(box(3.2, 1.2, 4.6, M.dark || std(0x333333), 0, 0.6, 0), box(3, 1.8, 3.4, M.yellow, 0, 2.1, 0), box(1.2, 1, 7, M.yellow, 0, 3.8, -4.2));
      const arm = box(0.8, 0.8, 4.5, M.yellow, 0, 2.2, -8); arm.rotation.x = 0.9; g.add(arm);
      g.position.set(x, 0, z); g.rotation.y = ry(Fr, phi); add(g);
    };
    digger(F, 1000, 525, 20); digger(F, 1170, 525, 140); digger(F, 1070, 690, 70); digger(W, 950, 205, 10); digger(W, 895, 175, 200); digger(W, 985, 285, 120);
    const truck = (Fr, px, py, phi) => { add(ibox(Fr, px, py, 9 / Fr.s, 3 / Fr.s, 3, M.yellow, phi), ibox(Fr, px + 0.1, py, 2.5 / Fr.s, 3 / Fr.s, 3.4, M.wall, phi)); };
    for (let i = 0; i < 4; i++) truck(W, 1012 + i * 12, 138 + i * 5, 20);
    for (let i = 0; i < 5; i++) truck(F, 1125 + i * 26, 960 - i * 10, -15);
    const [rx, rz] = F.P(1225, 775);                                                         // drilling rig
    add(box(4, 2, 6, M.yellow, rx, 1, rz), box(0.9, 26, 0.9, M.metal, rx, 14, rz - 2.5));
  }

  // ── lawns, parking, roads, cars ──
  {
    add(flat(W, [[1190, 465], [1260, 445], [1300, 520], [1290, 640], [1250, 730], [1190, 720], [1160, 640], [1170, 540]], M.lawn, 0.02));
    add(flat(F, [[745, 180], [870, 180], [870, 240], [745, 240]], M.lawn, 0.02), flat(F, [[745, 340], [800, 340], [800, 450], [745, 450]], M.lawn, 0.02));
    const LOTS = [
      [F, [[725, 250], [870, 250], [870, 560], [725, 560]], 90],
      [W, [[990, 600], [1110, 600], [1150, 700], [1150, 760], [1010, 760], [975, 680]], -62],
      [W, [[1215, 240], [1350, 250], [1365, 330], [1300, 410], [1220, 420]], -80],
      [W, [[1270, 380], [1370, 380], [1360, 470], [1270, 470]], 0],
      [W, [[1450, 265], [1636, 280], [1636, 330], [1450, 320]], 5],
      [W, [[1080, 770], [1290, 760], [1300, 800], [1090, 810]], -3],
      [W, [[760, 492], [828, 500], [840, 560], [770, 570]], -65],
      [W, [[715, 600], [800, 590], [840, 650], [760, 662]], -30],
    ];
    const N = 900, cars = new THREE.InstancedMesh(new THREE.BoxGeometry(4.4, 1.5, 1.9).translate(0, 0.75, 0), std(0xffffff, { roughness: 0.4, metalness: 0.3 }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), c = new THREE.Color();
    const paint = [0xd9d9d9, 0x2b2b2b, 0x8c1d1d, 0x1f3f6e, 0xf2f2f2, 0x6d6d6d, 0xb9b9b9];
    const inside = (pts, x, z) => { let k = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) k = !k; } return k; };
    let n = 0;
    for (const [Fr, poly, phi] of LOTS) {
      const pts = ipts(Fr, poly); add(prism(pts, 0.06, M.asphalt, -0.01));
      const psi = Fr.arg + phi * D, ux = Math.cos(psi), uz = Math.sin(psi), nx = -uz, nz = ux;
      const along = pts.map(([x, z]) => x * ux + z * uz), across = pts.map(([x, z]) => x * nx + z * nz);
      const a0 = Math.min(...along), a1 = Math.max(...along), b0 = Math.min(...across), b1 = Math.max(...across);
      for (let b = b0 + 4; b < b1 - 2; b += 17) for (const db of [0, 5.4]) for (let a = a0 + 2; a < a1 - 2 && n < N; a += 2.8) {
        const x = a * ux + (b + db) * nx, z = a * uz + (b + db) * nz;
        if (!inside(pts, x, z) || rnd() < 0.25) continue;
        v.set(x, 0.05, z);
        cars.setMatrixAt(n, m4.compose(v, q.setFromEuler(e.set(0, -(psi + PI / 2), 0)), s));
        cars.setColorAt(n, c.setHex(paint[Math.floor(rnd() * paint.length)])); n++;
      }
    }
    cars.count = n; add(cars);

    const road = (Fr, pl, w = 9) => {
      const pts = ipts(Fr, pl);
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
        add(box(Math.hypot(x1 - x0, z1 - z0), 0.1, w, M.asphalt, (x0 + x1) / 2, 0.0, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0)));
      }
      for (const [x, z] of pts) { const j = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.1, 16), M.asphalt); j.position.set(x, 0.0, z); add(j); }
    };
    // Argonne Drive loops round the target building and the STS site
    road(W, [[920, 640], [850, 630], [780, 600], [735, 560], [715, 500], [707, 420], [705, 330], [735, 265], [790, 180], [860, 125], [950, 100], [1040, 108],
      [1090, 135], [1125, 190], [1138, 260], [1137, 350], [1125, 430], [1100, 480], [1060, 530], [1000, 580], [920, 640]]);
    road(W, [[920, 640], [980, 690], [1010, 760], [1080, 790], [1200, 790], [1300, 740], [1380, 650], [1430, 560], [1500, 490], [1636, 440]]);
    road(W, [[735, 560], [640, 580], [500, 650], [330, 740], [200, 800], [40, 880]]);                    // Los Alamos Drive
    road(W, [[760, 600], [700, 640], [560, 700], [470, 760]], 7);                                         // Jefferson Drive
    road(W, [[735, 265], [690, 245], [600, 245], [545, 280], [500, 340], [440, 430], [380, 520], [330, 580], [300, 640], [250, 700]], 7);
    road(W, [[1137, 430], [1210, 430], [1290, 420], [1370, 350], [1450, 335], [1560, 345], [1636, 380]], 8);   // Nano Center Drive
    road(W, [[1150, 230], [1215, 235], [1330, 235], [1370, 300]], 7);
    road(F, [[870, 420], [1300, 410], [1420, 330]], 7);                                                    // service road behind the target building
  }

  // ── accelerator: front end → linac → accumulator ring → target ──
  const ldx = LIN1[0] - LIN0[0], ldz = LIN1[1] - LIN0[1], llen = Math.hypot(ldx, ldz), lry = Math.atan2(-ldz, ldx);
  // Ring and transport lines, laid out after the SNS fly-through animation: a rounded-square ring (four 27.5 m straights
  // and four 90° arcs, 248 m round) with its sides square to the linac; the HEBT turns 90° into the injection straight;
  // the RTBT leaves the end of the opposite straight and bends about 35° onto the target axis (x = 0).
  // Ring-local coordinates (a, b): a along the linac, b 90° to its right.
  const e1 = [ldx / llen, ldz / llen], e2 = [-e1[1], e1[0]];
  const RS = 27.5, RR = 22, RH = RS / 2 + RR, s2 = RS / 2;   // straight length, arc radius, half-width
  const KB = 27, ZB = 188, TBEND = 12.5;                          // RTBT bend point (0, ZB), KB past the middle of the extraction straight
  const RC = [-KB * e2[0] - RH * e1[0], ZB - KB * e2[1] - RH * e1[1]];
  const RP = (a, b) => [RC[0] + a * e1[0] + b * e2[0], RC[1] + a * e1[1] + b * e2[1]];
  const LP = ([a, b]) => RP(a, b);
  const loc = ([x, z]) => [(x - RC[0]) * e1[0] + (z - RC[1]) * e1[1], (x - RC[0]) * e2[0] + (z - RC[1]) * e2[1]];
  const bez = (A, Q, B, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * A[0] + 2 * t * u * Q[0] + t * t * B[0], u * u * A[1] + 2 * t * u * Q[1] + t * t * B[1]]; });
  const line = (A, B, step) => { const n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / step)); return Array.from({ length: n + 1 }, (_, i) => [A[0] + (B[0] - A[0]) * i / n, A[1] + (B[1] - A[1]) * i / n]); };
  // one lap in ring coordinates, from the bottom of the injection straight with the beam moving towards −b
  const lap = [];
  {
    const seg = (a0, b0, a1, b1) => lap.push(...line([a0, b0], [a1, b1], 4).slice(0, -1));
    const arc = (ca, cb, t0) => { for (let i = 0; i < 8; i++) { const t = (t0 + 90 * i / 8) * D; lap.push([ca + RR * Math.cos(t), cb + RR * Math.sin(t)]); } };
    seg(-RH, s2, -RH, -s2); arc(-s2, -s2, 180); seg(-s2, -RH, s2, -RH); arc(s2, -s2, 270);
    seg(RH, -s2, RH, s2); arc(s2, s2, 0); seg(s2, RH, -s2, RH); arc(-s2, s2, 90);
  }
  const iExt = lap.findIndex(([a, b]) => a > RH - 0.01 && b > s2 - 0.01);   // end of the extraction straight
  const [aL, bL] = loc(LIN1), TH = Math.min(35, -RH - aL - 1);
  const hebtXZ = [LIN1, ...bez(RP(-RH - TH, bL), RP(-RH, bL), RP(-RH, bL - TH), 14), ...line(RP(-RH, bL - TH), RP(-RH, s2), 6).slice(1)];
  const rtbtXZ = [RP(RH, s2), ...bez(RP(RH, KB - TBEND), [0, ZB], [0, ZB - TBEND], 10), ...line([0, ZB - TBEND], [0, 0], 20).slice(1)];
  const V = (y) => ([x, z]) => new THREE.Vector3(x, y, z);
  const dedupe = (a) => a.filter((p, i) => i === 0 || p.distanceTo(a[i - 1]) > 0.5);
  const ringPath = new THREE.CatmullRomCurve3(lap.map(LP).map(V(0)), true);
  const hebtPath = new THREE.CatmullRomCurve3(dedupe(hebtXZ.map(V(0))), false, 'centripetal');
  const rtbtPath = new THREE.CatmullRomCurve3(dedupe(rtbtXZ.filter(([, z]) => z > 40).map(V(0))), false, 'centripetal');
  {
    const mx = (LIN0[0] + LIN1[0]) / 2, mz = (LIN0[1] + LIN1[1]) / 2;
    add(box(llen, 4, 16, M.berm, mx, 2, mz, lry));                                                   // linac tunnel under its earth berm
    add(box(llen - 20, 10, 18, M.wall2, mx + gnx * 24, 5, mz + gnz * 24, lry), box(llen - 19, 0.5, 18.6, M.roof, mx + gnx * 24, 10.25, mz + gnz * 24, lry));   // klystron gallery
    add(box(46, 13, 34, M.wall, LIN0[0] - ldx / llen * 14 + gnx * 10, 6.5, LIN0[1] - ldz / llen * 14 + gnz * 10, lry));   // front-end building
    add(new THREE.Mesh(new THREE.TubeGeometry(ringPath, 120, 10, 6, true).scale(1, 0.32, 1).translate(0, 0.5, 0), M.berm));   // ring tunnel berm
    add(box(40, 8, 40, M.wall2, RC[0], 4, RC[1], lry), box(41, 0.5, 41, M.roof, RC[0], 8.25, RC[1], lry));   // ring service building, inside the ring
    { const [x, z] = RP(-RH - 27, -RH + 6); add(box(15, 6, 15, M.wall, x, 3, z, lry)); }
    add(new THREE.Mesh(new THREE.TubeGeometry(hebtPath, 60, 8, 6).scale(1, 0.32, 1).translate(0, 0.5, 0), M.berm));      // HEBT berm
    add(new THREE.Mesh(new THREE.TubeGeometry(rtbtPath, 60, 7, 6).scale(1, 0.32, 1).translate(0, 0.5, 0), M.berm));      // RTBT berm
    add(box(44, 3.4, 10, M.berm, -22, 1.7, ZB - 34), box(10, 6, 24, M.wall, -46, 3, ZB - 34));        // extraction-dump spur and its building
    const wt = add(new THREE.Group()), [wx, wz] = W.P(510, 468); wt.position.set(wx, 0, wz);   // water tower
    for (const [lx, lz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) wt.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 38, 6).translate(lx, 19, lz), M.wall));
    wt.add(new THREE.Mesh(new THREE.SphereGeometry(8, 20, 14).translate(0, 42, 0).scale(1, 0.8, 1), M.wall));
  }

  // proton path, drawn just above the tunnel berms so it can be followed from the air. The real beam stays at one
  // elevation from the ion source to the target, so every point sits at the same height (a Catmull-Rom curve through
  // points of equal y never leaves that plane).
  const pts = [];
  const Y = 6;
  for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(LIN0[0] + ldx * i / 12, Y, LIN0[1] + ldz * i / 12));
  // HEBT, one full lap and the turn down the extraction straight, then the RTBT to the target
  for (const p of [...hebtXZ, ...lap.map(LP), ...lap.slice(0, iExt + 1).map(LP), ...rtbtXZ]) pts.push(V(Y)(p));
  const curve = new THREE.CatmullRomCurve3(dedupe(pts), false, 'centripetal');
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.75, 0.2), transparent: true, opacity: 0.85, fog: false });
  add(new THREE.Mesh(new THREE.TubeGeometry(curve, 500, 1.1, 6), beamMat));
  const bunchMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1), fog: false });
  const bunches = [];
  for (let i = 0; i < 9; i++) bunches.push(add(new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), bunchMat)));

  // beamline 6 marker on the roof of the instrument hall
  const b6 = new THREE.Vector3(Math.sin(BL6_ANGLE), 0, -Math.cos(BL6_ANGLE));
  const bl6Mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 3), transparent: true, fog: false });
  const bl6 = add(new THREE.Group());
  const strip = box(17, 0.5, 1.6, bl6Mat, b6.x * 21, 20.9, b6.z * 21, Math.atan2(-b6.z, b6.x));
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(4, 0.5, 8, 40).rotateX(PI / 2), bl6Mat); ringM.position.set(b6.x * 25, 21, b6.z * 25);
  bl6.add(strip, ringM);

  const at = (Fr, px, py, y) => { const [x, z] = Fr.P(px, py); return [x, y, z]; };
  const labels = [
    { text: 'Target building', at: [-20, 30, 20] },
    { text: 'BL-6 · EQ-SANS', at: [b6.x * 25, 24, b6.z * 25], hot: true },
    { text: 'Central Laboratory & Office', at: [labelAt.CLO[0], 28, labelAt.CLO[1]] },
    { text: 'CNMS', at: [labelAt.CNMS[0], 30, labelAt.CNMS[1]] },
    { text: 'Second Target Station (under construction)', at: at(F, 1165, 685, 12) },
    { text: 'Accumulator ring', at: [RC[0], 14, RC[1]] },
    { text: 'Linac', at: [(LIN0[0] + LIN1[0]) / 2, 16, (LIN0[1] + LIN1[1]) / 2] },
    { text: 'Front end (ion source)', at: [LIN0[0], 18, LIN0[1]] },
  ];

  // every material of the site, so the whole model can dissolve around the instrument
  const all = new Map();
  group.traverse((o) => { if (o.material && !o.userData.keep && !all.has(o.material)) all.set(o.material, { base: o.material.opacity, glassy: o.material.transparent }); });
  let t = 0, reveal = 0, fadeK = 1;
  const apply = () => {
    for (const [m, { base, glassy }] of all) {
      const op = base * fadeK * (fade.includes(m) ? 1 - 0.94 * reveal : 1) * (m === bl6Mat ? 1 - reveal : 1);
      const tr = glassy || op < 0.999;
      if (m.transparent !== tr) { m.transparent = tr; m.depthWrite = !tr; m.needsUpdate = true; }
      m.opacity = op;
    }
    tb.visible = reveal < 0.999; bl6.visible = reveal < 0.98;
  };
  return {
    group, labels,
    // 0 = closed building, 1 = roof and walls dissolved so the instrument hall shows
    setReveal(k) { reveal = k; apply(); },
    // 1 = site fully drawn, 0 = dissolved
    setFade(k) { fadeK = k; apply(); },
    update(dt) {
      t += dt;
      bunches.forEach((b, i) => b.position.copy(curve.getPointAt((t * 0.09 + i / bunches.length) % 1)));
      const s = 1 + 0.25 * Math.sin(t * 3.5); ringM.scale.set(s, 1, s);
    },
  };
}
