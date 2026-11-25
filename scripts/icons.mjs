// Procedural icon renderer: a bloodshot slit-pupil eye glaring out of the dark.
// No dependencies - writes PNG bytes with node:zlib. Used by build.mjs and patch-android.mjs.
import zlib from 'node:zlib';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
function hash(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

// returns premultiplied [r,g,b,a] in 0..1 for a point (u,v) in [-1,1]
function shade(u, v, transparentBg) {
  const s = 1 / 0.88;
  u *= s;
  v *= s;
  const W = 0.74;
  const ax = Math.abs(u);
  const hh = ax < W ? 0.34 * Math.pow(1 - (ax / W) * (ax / W), 0.85) : 0;
  const inside = ax < W && Math.abs(v) < hh;
  const d = ax < W ? Math.abs(v) - hh : Math.hypot(ax - W, v);
  const glow = Math.exp(-Math.max(0, d) * 5.2);

  // eye colour (un-premultiplied) and alpha
  let er = 0, eg = 0, eb = 0, ea = 0;
  if (inside) {
    const t = 1 - ax / W;
    er = 0.1 + 0.4 * t * t;
    eg = 0.012 + 0.04 * t;
    eb = 0.01;
    const r = Math.hypot(u, v);
    if (r < 0.26) {
      const k = r / 0.26;
      er = 1.0 - 0.35 * k * k;
      eg = 0.72 - 0.6 * k;
      eb = 0.1;
      if (k > 0.82) { er *= 0.55; eg *= 0.4; }
    }
    // slit pupil
    if ((u / 0.055) * (u / 0.055) + (v / 0.21) * (v / 0.21) < 1) { er = 0; eg = 0; eb = 0; }
    // blood veins from the corners
    const vein = Math.sin(v * 38 + ax * 11) * Math.sin(u * 23 - v * 9);
    if (r > 0.3 && vein > 0.82) { er = 0.7; eg = 0.03; eb = 0.02; }
    // rim light
    const rim = clamp01(1 - (hh - Math.abs(v)) / 0.03);
    er = er + rim * 0.9;
    eg = eg + rim * 0.35;
    ea = 1;
  } else if (d < 0.02) {
    er = 1; eg = 0.5; eb = 0.1; ea = 1 - d / 0.02;
  }
  const ga = glow * 0.55; // outer glow alpha
  let outA = ea + ga * (1 - ea);
  let outR = er * ea + 1.0 * ga * (1 - ea);
  let outG = eg * ea + 0.42 * ga * (1 - ea);
  let outB = eb * ea + 0.07 * ga * (1 - ea);
  if (transparentBg) return [outR, outG, outB, outA];

  const rad = Math.hypot(u, v);
  const n = 0.75 + 0.5 * hash(Math.floor(u * 70), Math.floor(v * 70));
  const bgv = (0.035 + 0.05 * Math.exp(-rad * 1.4)) * n;
  const br = bgv * 1.1, bg = bgv * 0.55, bb = bgv * 0.5;
  return [outR + br * (1 - outA), outG + bg * (1 - outA), outB + bb * (1 - outA), 1];
}

// mode: 'full' (opaque black background) | 'fg' (transparent background for adaptive icons)
// round: mask to a circle (legacy round launcher icons)
export function renderPNG(size, mode = 'full', round = false) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 2 - 1;
          const v = ((y + (sy + 0.5) / SS) / size) * 2 - 1;
          const p = shade(u, v, mode === 'fg');
          r += p[0]; g += p[1]; b += p[2]; a += p[3];
        }
      }
      const n = SS * SS;
      r /= n; g /= n; b /= n; a /= n;
      if (round) {
        const u = ((x + 0.5) / size) * 2 - 1, v = ((y + 0.5) / size) * 2 - 1;
        const m = clamp01((1 - Math.hypot(u, v)) * size * 0.5);
        r *= m; g *= m; b *= m; a *= m;
      }
      const i = (y * size + x) * 4;
      // un-premultiply for PNG
      const ia = a > 0.0001 ? 1 / a : 0;
      buf[i] = Math.round(clamp01(r * ia) * 255);
      buf[i + 1] = Math.round(clamp01(g * ia) * 255);
      buf[i + 2] = Math.round(clamp01(b * ia) * 255);
      buf[i + 3] = Math.round(clamp01(a) * 255);
    }
  }
  return encodePNG(size, size, buf);
}
