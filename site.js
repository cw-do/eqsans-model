// Schematic model of the Spallation Neutron Source site (Oak Ridge National Laboratory).
// Built from aerial photographs: building footprints, heights and distances are estimates, not survey data.
//
// Local frame of the returned group (metres, y up):
//   origin = the target (moderator), protons arrive travelling towards −Z,
//   +Z = upstream (ring, linac), −Z = the office building (CLO) and CNMS, +X = right of the proton direction.
// Beamline 6 (EQ-SANS) leaves the target on the +X side, 70° from the proton direction.

export const BL6_ANGLE = 70 * Math.PI / 180;

export function buildSite(THREE) {
  const PI = Math.PI, TAU = PI * 2;
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

  // ── where things are ──
  const RING = { x: 40, z: 180, r: 40 };
  const LIN0 = [470, 420], LIN1 = [150, 262];                     // linac: front end → end of the superconducting linac
  const segDist = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
  };
  // distance from the developed part of the site (used to keep hills and trees away from it)
  const siteDist = (x, z) => Math.min(Math.hypot(x, z + 70) - 300, segDist(x, z, LIN0, LIN1) - 75, Math.hypot(x - RING.x, z - RING.z) - 95,
    Math.hypot(x + 250, z + 20) - 150, Math.hypot(x - 215, z + 125) - 95);
  const HILLS = [[-650, 520, 75, 300], [760, -120, 65, 300], [330, -760, 85, 340], [-560, -640, 75, 320], [-980, -60, 95, 340], [-60, 980, 85, 380],
    [1000, 760, 75, 340], [900, -800, 70, 300], [-1100, 900, 80, 380], [240, 760, 40, 200], [-420, 330, 30, 160]];
  const height = (x, z) => {
    let h = 0;
    for (const [hx, hz, hh, s] of HILLS) h += hh * Math.exp(-((x - hx) ** 2 + (z - hz) ** 2) / (s * s));
    const d = siteDist(x, z);
    return h * THREE.MathUtils.smoothstep(d, 0, 220);
  };

  // ── ground, lawns, forest ──
  {
    const g = new THREE.PlaneGeometry(5200, 5200, 150, 150).rotateX(-PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = height(x, z), d = siteDist(x, z);
      p.setY(i, h - 0.08);
      c.setHex(d < 30 ? 0x7da35a : 0x3f6b3a).offsetHSL(0, 0, (rnd() - 0.5) * 0.03);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    add(new THREE.Mesh(g, std(0xffffff, { vertexColors: true, roughness: 1 })));

    // the grassed spoil mound east of the target building
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, TAU, 0, PI / 2), std(0x8aa35c, { roughness: 1 }));
    mound.scale.set(150, 24, 110); mound.position.set(-250, -0.5, -20); add(mound);
    const scar = new THREE.Mesh(new THREE.CircleGeometry(26, 24).rotateX(-PI / 2), std(0xcdbd98, { roughness: 1 }));
    scar.position.set(-262, 23.4, -30); scar.scale.set(1.5, 1, 1); add(scar);

    // forest
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
    metal: std(0xaeb4b9, { roughness: 0.5, metalness: 0.5 }), berm: std(0x7f9f58, { roughness: 1 }),
  };

  // ── target building: a tall central bay over the target and proton line, instrument halls on both sides ──
  const fade = [];                                                 // materials that dissolve when the camera dives in
  const fmat = (color, o) => { const m = std(color, { transparent: false, ...o }); fade.push(m); return m; };
  const TB = { hall: fmat(0xcfc9b8), bay: fmat(0xbdb7a6), roof: fmat(0xe6e3da), band: fmat(0x3a4c5e, { roughness: 0.3, metalness: 0.5 }), ext: fmat(0xb7bcc0, { roughness: 0.6, metalness: 0.3 }) };
  const tb = add(new THREE.Group());
  tb.add(box(92, 18, 132, TB.hall, 0, 9, 0), box(92.6, 0.6, 132.6, TB.roof, 0, 18.3, 0));
  tb.add(box(27, 27, 156, TB.bay, 0, 13.5, 6), box(27.6, 0.6, 156.6, TB.roof, 0, 27.3, 6), box(27.3, 2.2, 156.3, TB.band, 0, 22, 6));
  tb.add(box(30, 13, 42, TB.ext, 62, 6.5, -14), box(34, 15, 30, TB.ext, -63, 7.5, 22), box(22, 11, 26, TB.hall, -57, 5.5, -44),
    box(60, 7, 9, TB.ext, 78, 3.5, 48, 0.5), box(18, 9, 16, TB.ext, 108, 4.5, 34, 0.5), box(26, 12, 20, TB.hall, 20, 6, -76));
  add(box(92, 0.1, 132, std(0x4a4f56, { roughness: 0.9 }), 0, -0.04, 0));              // experiment-hall floor
  add(box(150, 0.06, 190, M.paving, 0, -0.07, 0));

  // the other beamlines, as plain blocks fanning out from the target
  {
    const cols = [0x6fa8dc, 0x93c47d, 0xf6b26b, 0x8e7cc3, 0xe06666, 0x76a5af, 0xffd966, 0xc27ba0];
    let k = 0;
    for (const side of [1, -1]) for (let i = 0; i < 9; i++) {
      const a = (32 + i * 14.5) * PI / 180;
      if (side === 1 && Math.abs(a - BL6_ANGLE) < 0.1) continue;   // beamline 6 is the real model
      const len = 14 + rnd() * 22, dx = side * Math.sin(a), dz = -Math.cos(a);
      const b = box(len, 2.6, 2.4, std(cols[k++ % cols.length], { roughness: 0.7 }), dx * (7 + len / 2), 1.3, dz * (7 + len / 2), Math.atan2(-dz, dx));
      add(b);
      if (rnd() < 0.6) add(box(5, 4, 5, std(0xdfe3e6, { roughness: 0.7 }), dx * (9 + len), 2, dz * (9 + len), Math.atan2(-dz, dx)));
    }
    const mono = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 5.2, 40), std(0x8d8f8a, { roughness: 0.8 }));
    mono.position.set(-7.2, 2.6, 2.6); add(mono);                  // rest of the target monolith, beside the slice the instrument model keeps
  }

  // ── central laboratory and office building (curved) and CNMS ──
  {
    const C = [60, -300], A0 = 58 * PI / 180, A1 = 122 * PI / 180;
    add(prism(sector(C[0], C[1], 140, 160, A0, A1), 20, M.wall));
    add(prism(sector(C[0], C[1], 139.4, 160.6, A0, A1), 0.6, M.roof, 20));
    for (let k = 0; k < 5; k++) add(prism(sector(C[0], C[1], 139.7, 160.3, A0 + 0.012, A1 - 0.012), 1.7, M.glass, 2.4 + k * 3.7));
    add(prism(sector(C[0], C[1], 146, 154, 80 * PI / 180, 100 * PI / 180), 3.5, M.wall2, 20.6));
    add(prism(sector(C[0], C[1], 132, 139, A0 + 0.04, A1 - 0.04), 0.5, M.paving, 0));            // terrace on the concave side
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(120, 48, A0 - 0.1, A1 - A0 + 0.2).rotateX(-PI / 2).rotateY(PI), M.lawn);
    lawn.geometry.rotateY(PI); lawn.position.set(C[0], 0.02, C[1]); lawn.scale.z = -1; lawn.material.side = THREE.DoubleSide; add(lawn);

    // CNMS: office block joined to the east end of the curve, then the low laboratory wing
    const cn = (w, h, d, x, z, mat = M.wall) => {
      add(box(w, h, d, mat, x, h / 2, z)); add(box(w + 0.6, 0.5, d + 0.6, M.roof, x, h + 0.25, z));
      for (let y = 2.4; y < h - 1.5; y += 3.7) add(box(w - 3, 1.7, d + 0.5, M.glass, x, y + 0.85, z));
    };
    cn(112, 17, 28, -76, -166); cn(36, 21, 30, -8, -170, M.wall2);
    cn(92, 9, 36, -178, -158, M.wall2);
    for (let i = 0; i < 7; i++) add(box(6, 2.5, 5, M.metal, -215 + i * 13, 10.3, -158 + (i % 2) * 8));   // roof plant
    // covered link up to the target building
    add(box(6, 4, 74, M.wall2, 16, 6, -103, 0.1), box(6.6, 0.4, 74.6, M.roof, 16, 8.2, -103, 0.1));
    for (let z = -135; z <= -72; z += 12) add(box(0.8, 4, 0.8, M.wall2, 16 - (z + 103) * 0.1, 2, z));
  }

  // ── parking, roads, cars ──
  {
    add(box(190, 0.1, 66, M.asphalt, -92, 0.0, -228), box(120, 0.1, 80, M.asphalt, 210, 0.0, -128, 0.25), box(60, 0.1, 40, M.asphalt, 70, 0.0, -90));
    const road = (x0, z0, x1, z1, w = 9) => add(box(Math.hypot(x1 - x0, z1 - z0), 0.1, w, M.asphalt, (x0 + x1) / 2, -0.02, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0)));
    road(-190, -195, 150, -195); road(150, -195, 290, -60); road(290, -60, 250, 120); road(250, 120, 110, 232); road(-190, -195, -330, -120);
    road(-330, -120, -400, 60); road(-400, 60, -250, 150); road(-250, 150, -60, 120); road(-60, 120, -60, 70); road(60, -90, 110, 0); road(110, 0, 250, 120, 7);
    road(290, -60, 520, -200); road(-330, -120, -600, -260);
    const N = 420, cars = new THREE.InstancedMesh(new THREE.BoxGeometry(4.4, 1.5, 1.9).translate(0, 0.75, 0), std(0xffffff, { roughness: 0.4, metalness: 0.3 }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), c = new THREE.Color();
    const paint = [0xd9d9d9, 0x2b2b2b, 0x8c1d1d, 0x1f3f6e, 0xf2f2f2, 0x6d6d6d, 0xb9b9b9];
    let n = 0;
    const lot = (cx, cz, rows, perRow, ry) => {
      for (let r = 0; r < rows; r++) for (let i = 0; i < perRow && n < N; i++) {
        if (rnd() < 0.22) continue;
        const lx = (i - perRow / 2) * 2.9, lz = (r - rows / 2) * 9 + (r % 2) * 3;
        v.set(cx + lx * Math.cos(ry) + lz * Math.sin(ry), 0.05, cz - lx * Math.sin(ry) + lz * Math.cos(ry));
        cars.setMatrixAt(n, m4.compose(v, q.setFromEuler(e.set(0, ry + PI / 2, 0)), s));
        cars.setColorAt(n, c.setHex(paint[Math.floor(rnd() * paint.length)])); n++;
      }
    };
    lot(-92, -228, 7, 58, 0); lot(210, -128, 8, 34, 0.25); lot(70, -90, 4, 16, 0);
    cars.count = n; add(cars);
  }

  // ── accelerator: front end → linac → accumulator ring → target ──
  const ldx = LIN1[0] - LIN0[0], ldz = LIN1[1] - LIN0[1], llen = Math.hypot(ldx, ldz), lry = Math.atan2(-ldz, ldx);
  {
    const mx = (LIN0[0] + LIN1[0]) / 2, mz = (LIN0[1] + LIN1[1]) / 2, nx = -ldz / llen, nz = ldx / llen;   // normal to the linac
    add(box(llen, 4, 16, M.berm, mx, 2, mz, lry));                                                   // linac tunnel under its earth berm
    add(box(llen - 20, 10, 18, M.wall2, mx + nx * 26, 5, mz + nz * 26, lry), box(llen - 19, 0.5, 18.6, M.roof, mx + nx * 26, 10.25, mz + nz * 26, lry));   // klystron gallery
    for (let i = 0; i < 9; i++) add(box(14, 6, 10, M.metal, LIN0[0] + ldx * (0.08 + i * 0.1) + nx * 44, 3, LIN0[1] + ldz * (0.08 + i * 0.1) + nz * 44, lry));
    add(box(46, 13, 34, M.wall, LIN0[0] - ldx / llen * 14 + nx * 10, 6.5, LIN0[1] - ldz / llen * 14 + nz * 10, lry));   // front-end building
    add(box(70, 11, 30, M.wall, mx - nx * 44, 5.5, mz - nz * 44, lry), box(40, 9, 24, M.wall2, mx - nx * 44 + ldx * 0.25, 4.5, mz - nz * 44 + ldz * 0.25, lry));   // cryogenics
    const ringBerm = new THREE.Mesh(new THREE.TorusGeometry(RING.r, 11, 12, 64).rotateX(PI / 2), M.berm);
    ringBerm.scale.y = 0.32; ringBerm.position.set(RING.x, 0.5, RING.z); add(ringBerm);
    add(box(30, 9, 20, M.wall2, RING.x + 4, 4.5, RING.z - 2), box(16, 7, 14, M.wall, RING.x - 62, 3.5, RING.z + 30));
    add(box(14, 3.4, 96, M.berm, 0, 1.7, 118));                                                      // ring-to-target line, under its berm
    // water tower
    const wt = add(new THREE.Group()); wt.position.set(-170, 0, 250);
    wt.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 38, 10).translate(0, 19, 0), M.wall), new THREE.Mesh(new THREE.SphereGeometry(8, 20, 14).translate(0, 42, 0).scale(1, 0.8, 1), M.wall));
  }

  // proton path, drawn above the tunnels so it can be followed from the air
  const pts = [];
  const Y = 9;
  for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(LIN0[0] + ldx * i / 12, Y, LIN0[1] + ldz * i / 12));
  pts.push(new THREE.Vector3(112, Y, 240), new THREE.Vector3(78, Y, 226));
  for (let a = 90; a <= 540; a += 15) pts.push(new THREE.Vector3(RING.x + RING.r * Math.cos(a * PI / 180), Y, RING.z + RING.r * Math.sin(a * PI / 180)));
  for (let z = 150; z >= 0; z -= 25) pts.push(new THREE.Vector3(0, z > 80 ? Y : Math.max(2, Y * z / 80), z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.75, 0.2), transparent: true, opacity: 0.85, fog: false });
  add(new THREE.Mesh(new THREE.TubeGeometry(curve, 500, 1.1, 6), beamMat));
  const bunchMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1), fog: false });
  const bunches = [];
  for (let i = 0; i < 9; i++) bunches.push(add(new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), bunchMat)));

  // beamline 6 marker on the roof of the instrument hall
  const b6 = new THREE.Vector3(Math.sin(BL6_ANGLE), 0, -Math.cos(BL6_ANGLE));
  const bl6Mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 3), transparent: true, fog: false });
  const bl6 = add(new THREE.Group());
  const strip = box(27, 0.5, 1.6, bl6Mat, b6.x * 27.5, 19.1, b6.z * 27.5, Math.atan2(-b6.z, b6.x));
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(5, 0.5, 8, 40).rotateX(PI / 2), bl6Mat); ringM.position.set(b6.x * 34, 19.2, b6.z * 34);
  bl6.add(strip, ringM);

  const labels = [
    { text: 'Target building', at: [-20, 32, 40] },
    { text: 'BL-6 · EQ-SANS', at: [b6.x * 34, 22, b6.z * 34], hot: true },
    { text: 'Central Laboratory & Office', at: [70, 26, -148] },
    { text: 'CNMS', at: [-110, 22, -165] },
    { text: 'Accumulator ring', at: [RING.x, 14, RING.z] },
    { text: 'Linac', at: [(LIN0[0] + LIN1[0]) / 2, 16, (LIN0[1] + LIN1[1]) / 2] },
    { text: 'Front end (ion source)', at: [LIN0[0], 18, LIN0[1]] },
  ];

  let t = 0;
  return {
    group, labels,
    // 0 = closed building, 1 = roof and walls dissolved so the instrument hall shows
    setReveal(k) {
      for (const m of fade) {
        const tr = k > 0.001;
        if (m.transparent !== tr) { m.transparent = tr; m.depthWrite = !tr; m.needsUpdate = true; }
        m.opacity = 1 - 0.94 * k;
      }
      tb.visible = k < 0.999;
      bl6Mat.opacity = 1 - k; bl6.visible = k < 0.98;
    },
    update(dt) {
      t += dt;
      bunches.forEach((b, i) => b.position.copy(curve.getPointAt((t * 0.09 + i / bunches.length) % 1)));
      const s = 1 + 0.25 * Math.sin(t * 3.5); ringM.scale.set(s, 1, s);
    },
  };
}
