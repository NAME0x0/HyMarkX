/*
 * Vendored from @designcodeio/threeui (MIT, © Meng To) — lib-dist/shaders/data-pixel-arc.
 *
 * Copied rather than imported because the package does not expose this path through its
 * exports map, and the React component that does would drag React back onto a page that just
 * removed it. The renderer itself is framework-free canvas 2D: createDataPixelArcRenderer takes
 * a canvas and an options getter, which is all this site needs.
 *
 * Unmodified. Do not edit here — re-copy from the package to update.
 */
const E = {
  mode: "dark",
  speed: 1,
  pixelSize: 8,
  arcCenter: 0.4,
  arcDrop: 0.9,
  thickness: 0.35,
  brightness: 1,
  hue: 0,
  saturation: 1
};
function T(o) {
  return o === "light" || o === 1 || o === "1" ? "light" : "dark";
}
function Y(o, k) {
  const n = o.getContext("2d", { alpha: !1 });
  if (!n) return null;
  let s = 1, a = 1, M = 0, i = null;
  return { resize: (t, c) => {
    s = Math.max(1, t), a = Math.max(1, c);
    const r = Math.min(window.devicePixelRatio || 1, 2);
    o.width = Math.round(s * r), o.height = Math.round(a * r), n.setTransform(r, 0, 0, r, 0, 0), i = n.createLinearGradient(0, 0, 0, a), i.addColorStop(0, "#f8faf6"), i.addColorStop(0.58, "#f3f6f1"), i.addColorStop(1, "#edf1ec");
  }, render: () => {
    const t = k(), c = T(t.mode) === "light";
    n.fillStyle = c && i ? i : "#030308", n.fillRect(0, 0, s, a);
    const r = Math.ceil(s / t.pixelSize), C = Math.ceil(a / t.pixelSize), A = a * t.arcCenter, D = a * t.arcDrop, R = a * t.thickness;
    for (let p = 0; p < r; p += 1)
      for (let d = 0; d < C; d += 1) {
        const z = p * t.pixelSize, f = d * t.pixelSize, x = z / s * 2 - 1, y = A + Math.pow(Math.abs(x), 1.8) * D;
        let e = Math.max(0, 1 - Math.abs(f - y) / R);
        if (e <= 0.01) continue;
        const L = Math.sin(x * 4 - M * 1.5) * 0.1, v = Math.cos(f * 0.01 + M) * 0.1;
        if (e = Math.max(0, Math.min(1, e + L + v)), e *= Math.max(0, 1 - Math.pow(Math.abs(x), 2.5)), e <= 0.02) continue;
        const h = Math.pow(e, 3), P = Math.pow(e, 1.5);
        let g, m, u;
        if (c) {
          const S = Math.pow(e, 0.78), w = Math.max(0.45, Math.min(1.35, t.brightness)), l = [238, 242, 237], b = [
            192 - 172 * S - 10 * h,
            204 - 88 * S + 18 * h,
            193 - 132 * S + 4 * h
          ];
          g = Math.max(0, Math.min(255, Math.round(l[0] + (b[0] - l[0]) * w))), m = Math.max(0, Math.min(255, Math.round(l[1] + (b[1] - l[1]) * w))), u = Math.max(0, Math.min(255, Math.round(l[2] + (b[2] - l[2]) * w)));
        } else
          g = Math.floor((30 * e + 100 * h) * t.brightness), m = Math.floor((220 * P + 40 * h) * t.brightness), u = Math.floor((80 * e + 50 * h) * t.brightness);
        n.fillStyle = `rgb(${g}, ${m}, ${u})`, n.globalAlpha = c ? Math.min(1, 0.22 + Math.pow(e, 0.68) * 0.78) : e, n.fillRect(z, f, t.pixelSize - 1, t.pixelSize - 1);
      }
    n.globalAlpha = 1, M += 0.02 * t.speed;
  } };
}
export {
  E as DATA_PIXEL_ARC_DEFAULTS,
  Y as createDataPixelArcRenderer
};
