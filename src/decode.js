// @ts-self-types="../decode.d.ts"
// Barcode reading from images: QR Code and 1D (EAN-13 / UPC-A, EAN-8, UPC-E, Code 128, Code 39, ITF).
// decode({ data, width, height }) -> [{ format, text, ... }]. data: RGBA (ImageData) or 8-bit grayscale.
import { rsDecode } from './rs.js';
import { ECC_PER_BLOCK, NUM_BLOCKS, MASKS, rawModules, alignPositions, ALNUM, CC_BITS } from './qr.js';
import { L, G, R, EAN13_PARITY, UPCE_PARITY, C39_CHARS, C39, ITF_PAIRS, mod10 } from './linear.js';
import { BARS } from './code128.js';

export function decode(image, { formats } = {}) {
	const { width: w, height: h } = image;
	const bits = binarize(luminance(image), w, h);
	const want = (f) => !formats || formats.some((x) => String(x).toUpperCase().replace(/[-_\s]/g, '') === f);
	const out = [];
	const add = (r) => { if (r && !out.some((o) => o.format === r.format && o.text === r.text)) out.push(r); };
	if (want('QR') || want('QRCODE')) for (const r of decodeQR(bits, w, h)) add(r);
	if (['EAN13', 'UPCA', 'UPC', 'EAN8', 'UPCE', 'CODE128', 'CODE39', 'ITF'].some(want)) for (const r of decode1D(bits, w, h, want)) add(r);
	return out;
}

// ---------- image -> bits (1 = dark) ----------
function luminance({ data, width, height }) {
	if (data.length === width * height) return data;
	const lum = new Uint8Array(width * height);
	for (let i = 0; i < lum.length; i++) {
		const a = data[4 * i + 3] / 255; // composite transparency on white
		lum[i] = Math.round(((data[4 * i] * 299 + data[4 * i + 1] * 587 + data[4 * i + 2] * 114) / 1000) * a + 255 * (1 - a));
	}
	return lum;
}

// Local thresholds from 8x8 block statistics, averaged over 5x5 blocks (as zxing's HybridBinarizer)
function binarize(lum, w, h) {
	const B = 8, bw = Math.ceil(w / B), bh = Math.ceil(h / B);
	const bp = new Float32Array(bw * bh);
	for (let by = 0; by < bh; by++)
		for (let bx = 0; bx < bw; bx++) {
			let sum = 0, n = 0, min = 255, max = 0;
			for (let y = by * B; y < Math.min(h, by * B + B); y++)
				for (let x = bx * B; x < Math.min(w, bx * B + B); x++) { const v = lum[y * w + x]; sum += v; n++; if (v < min) min = v; if (v > max) max = v; }
			let avg = sum / n;
			if (max - min <= 24) {
				avg = min / 2;
				if (by > 0 && bx > 0) {
					const nb = (bp[(by - 1) * bw + bx] + 2 * bp[by * bw + bx - 1] + bp[(by - 1) * bw + bx - 1]) / 4;
					if (min < nb) avg = nb;
				}
			}
			bp[by * bw + bx] = avg;
		}
	const bits = new Uint8Array(w * h);
	for (let by = 0; by < bh; by++)
		for (let bx = 0; bx < bw; bx++) {
			let sum = 0, n = 0;
			for (let dy = -2; dy <= 2; dy++)
				for (let dx = -2; dx <= 2; dx++) {
					const yy = Math.min(bh - 1, Math.max(0, by + dy)), xx = Math.min(bw - 1, Math.max(0, bx + dx));
					sum += bp[yy * bw + xx]; n++;
				}
			const t = sum / n;
			for (let y = by * B; y < Math.min(h, by * B + B); y++)
				for (let x = bx * B; x < Math.min(w, bx * B + B); x++) bits[y * w + x] = lum[y * w + x] <= t ? 1 : 0;
		}
	return bits;
}

// ---------- QR ----------
const ratioOK = (c, total, unit = [1, 1, 3, 1, 1]) => {
	const m = total / unit.reduce((a, b) => a + b, 0);
	return m >= 1 && c.every((v, i) => Math.abs(v - unit[i] * m) < unit[i] * m * 0.6);
};

// Runs along a direction through (x, y): dark centre segment, then alternating segments outwards per `unit`.
// Returns the centre's offset along the direction and the total length, or null if the ratios do not match.
function crossCheck(bits, w, h, x, y, dx, dy, unit = [1, 1, 3, 1, 1]) {
	const at = (k) => { const xx = Math.round(x + dx * k), yy = Math.round(y + dy * k); return xx < 0 || yy < 0 || xx >= w || yy >= h ? -1 : bits[yy * w + xx]; };
	if (at(0) !== 1) return null;
	const n = unit.length, mid = (n - 1) / 2, c = new Array(n).fill(0);
	let k = 0;
	for (let seg = mid, color = 1; ; color ^= 1) {
		while (at(k) === color) { c[seg]++; k--; }
		if (seg === 0) break;
		seg--;
		if (at(k) === -1) return null;
	}
	const first = k + 1;
	k = 1;
	for (let seg = mid, color = 1; ; color ^= 1) {
		while (at(k) === color) { c[seg]++; k++; }
		if (seg === n - 1) break;
		seg++;
		if (at(k) === -1) return null;
	}
	const total = c.reduce((a, b) => a + b, 0);
	if (c.some((v) => !v) || !ratioOK(c, total, unit)) return null;
	return { offset: first + c.slice(0, mid).reduce((a, b) => a + b, 0) + c[mid] / 2 - 0.5, total };
}

function findFinders(bits, w, h) {
	const found = [];
	const onPattern = (x, y, c) => {
		const cx = x - c[4] - c[3] - c[2] / 2 - 0.5;
		const vert = crossCheck(bits, w, h, cx, y, 0, 1);
		if (!vert) return false;
		const cy = y + vert.offset;
		const hor = crossCheck(bits, w, h, cx, cy, 1, 0);
		if (!hor) return false;
		const fx = cx + hor.offset, ms = (vert.total + hor.total) / 14;
		const near = found.find((f) => Math.hypot(f.x - fx, f.y - cy) < f.ms * 3 && Math.abs(f.ms - ms) < f.ms);
		if (near) {
			near.x = (near.x * near.n + fx) / (near.n + 1);
			near.y = (near.y * near.n + cy) / (near.n + 1);
			near.ms = (near.ms * near.n + ms) / (near.n + 1);
			near.n++;
		} else found.push({ x: fx, y: cy, ms, n: 1 });
		return true;
	};
	const step = Math.max(1, Math.floor(h / 400));
	for (let y = 0; y < h; y += step) {
		let c = [0, 0, 0, 0, 0], state = 0;
		for (let x = 0; x <= w; x++) {
			const dark = x < w && bits[y * w + x] === 1;
			if (dark) {
				if (state & 1) state++;
				c[state]++;
			} else if (state & 1) c[state]++;
			else if (state === 4) {
				if (c.every((v) => v) && ratioOK(c, c.reduce((a, b) => a + b, 0)) && onPattern(x, y, c)) { c = [0, 0, 0, 0, 0]; state = 0; }
				else { c = [c[2], c[3], c[4], 1, 0]; state = 3; }
			} else if (c[state]) { state++; c[state]++; }
		}
	}
	return found;
}

function* finderTriples(found) {
	// Real finders are confirmed on many scanlines; look-alikes in the data area on few
	const maxN = Math.max(0, ...found.map((f) => f.n));
	const cand = found.filter((f) => f.n >= Math.max(2, maxN * 0.3)).sort((a, b) => b.n - a.n).slice(0, 12);
	const triples = [];
	for (let i = 0; i < cand.length; i++)
		for (let j = i + 1; j < cand.length; j++)
			for (let k = j + 1; k < cand.length; k++) {
				const t = [cand[i], cand[j], cand[k]];
				const ms = t.map((f) => f.ms);
				if (Math.max(...ms) > 1.6 * Math.min(...ms)) continue;
				const d = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => Math.hypot(t[a].x - t[b].x, t[a].y - t[b].y));
				const [a, b, c] = d.slice().sort((x, y) => x - y);
				const score = Math.abs(a * a + b * b - c * c) / (c * c) + Math.abs(a - b) / b;
				if (score < 0.5) triples.push({ t, d, score });
			}
	triples.sort((x, y) => x.score - y.score);
	for (const { t, d } of triples) {
		// top-left finder is opposite the longest side
		const longest = d.indexOf(Math.max(...d));
		const tl = t[[2, 1, 0][longest]];
		let [p, q] = t.filter((f) => f !== tl);
		if ((p.x - tl.x) * (q.y - tl.y) - (p.y - tl.y) * (q.x - tl.x) < 0) [p, q] = [q, p];
		yield { tl, tr: p, bl: q };
	}
}

// Homography mapping 4 source points to 4 destination points ([x0, y0, ..., x3, y3]), by solving the 8x8 system
function quadToQuad(src, dst) {
	const A = [], v = [];
	for (let i = 0; i < 4; i++) {
		const [x, y, u, w] = [src[2 * i], src[2 * i + 1], dst[2 * i], dst[2 * i + 1]];
		A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); v.push(u);
		A.push([0, 0, 0, x, y, 1, -w * x, -w * y]); v.push(w);
	}
	for (let c = 0; c < 8; c++) { // Gaussian elimination with partial pivoting
		let p = c;
		for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
		[A[c], A[p]] = [A[p], A[c]]; [v[c], v[p]] = [v[p], v[c]];
		for (let r = 0; r < 8; r++) {
			if (r === c || !A[r][c]) continue;
			const f = A[r][c] / A[c][c];
			for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
			v[r] -= f * v[c];
		}
	}
	const m = v.map((x, i) => x / A[i][i]);
	return (x, y) => { const z = m[6] * x + m[7] * y + 1; return [(m[0] * x + m[1] * y + m[2]) / z, (m[3] * x + m[4] * y + m[5]) / z]; };
}

// Alignment pattern near (ex, ey): a 1-module dark centre inside a 1-module light ring (outer ring may touch data)
function findAlignment(bits, w, h, ex, ey, ms) {
	let best = null;
	const r = Math.ceil(ms * 4);
	for (let dy = -r; dy <= r; dy++)
		for (let dx = -r; dx <= r; dx++) {
			const x = Math.round(ex + dx), y = Math.round(ey + dy);
			if (x < 0 || y < 0 || x >= w || y >= h || !bits[y * w + x]) continue;
			const hor = crossCheck(bits, w, h, x, y, 1, 0, [1, 1, 1]);
			if (!hor || Math.abs(hor.total - 3 * ms) > 1.5 * ms) continue;
			const cx = x + hor.offset;
			const ver = crossCheck(bits, w, h, cx, y, 0, 1, [1, 1, 1]);
			if (!ver || Math.abs(ver.total - 3 * ms) > 1.5 * ms) continue;
			const cand = { x: cx, y: y + ver.offset };
			const dist = Math.hypot(cand.x - ex, cand.y - ey);
			if (!best || dist < best.dist) best = { ...cand, dist };
		}
	return best;
}

const FORMATS = Array.from({ length: 32 }, (_, d) => {
	let r = d;
	for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
	return ((d << 10) | r) ^ 0x5412;
});
const VERSIONS = Array.from({ length: 41 }, (_, v) => {
	if (v < 7) return -1;
	let r = v;
	for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
	return (v << 12) | r;
});
const popcount = (x) => { let n = 0; for (; x; x &= x - 1) n++; return n; };
const nearest = (codes, value, max) => {
	let best = -1, bd = max + 1;
	codes.forEach((c, i) => { if (c >= 0) { const d = popcount(c ^ value); if (d < bd) { bd = d; best = i; } } });
	return best;
};

function decodeQR(bits, w, h) {
	const results = [];
	const finders = findFinders(bits, w, h);
	for (const { tl, tr, bl } of finderTriples(finders)) {
		// Cross-checks run along image axes: undo the stretch from rotation
		const a = Math.atan2(tr.y - tl.y, tr.x - tl.x);
		const ms = ((tl.ms + tr.ms + bl.ms) / 3) * Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
		let dim = Math.round((Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(bl.x - tl.x, bl.y - tl.y)) / 2 / ms) + 7;
		dim += [1, 0, -1, -2][dim % 4];
		const sizes = [dim, dim + 4, dim - 4, dim + 8, dim - 8];
		for (let k = 0; k < sizes.length; k++) {
			const size = sizes[k];
			if (size < 21 || size > 177) continue;
			const r = sampleAndRead(bits, w, h, tl, tr, bl, size, ms);
			if (r?.retry && !sizes.includes(r.retry)) sizes.splice(k + 1, 0, r.retry); // version information says otherwise
			else if (r?.text !== undefined) { results.push(r); break; }
		}
		if (results.length) break; // ponytail: one QR per image; multi-symbol detection would mask found symbols and rescan
	}
	return results;
}

function sampleAndRead(bits, w, h, tl, tr, bl, size, ms) {
	const ver = (size - 17) / 4;
	const src = [3.5, 3.5, size - 3.5, 3.5, size - 3.5, size - 3.5, 3.5, size - 3.5];
	let dst = [tl.x, tl.y, tr.x, tr.y, tr.x + bl.x - tl.x, tr.y + bl.y - tl.y, bl.x, bl.y];
	if (ver >= 2) {
		const aff = quadToQuad(src, dst);
		const [ex, ey] = aff(size - 6.5, size - 6.5);
		const al = findAlignment(bits, w, h, ex, ey, ms);
		if (al) { src[4] = src[5] = size - 6.5; dst[4] = al.x; dst[5] = al.y; }
	}
	const map = quadToQuad(src, dst);
	const mod = new Uint8Array(size * size);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const [px, py] = map(x + 0.5, y + 0.5);
			const ix = Math.floor(px), iy = Math.floor(py);
			mod[y * size + x] = ix >= 0 && iy >= 0 && ix < w && iy < h ? bits[iy * w + ix] : 0;
		}
	try { return readQR(mod, size); } catch (e) { return e.retry ? { retry: e.retry } : null; }
}

function readQR(mod, size) {
	const at = (x, y) => mod[y * size + x];
	// Format information (two copies)
	let f1 = 0, f2 = 0;
	const c1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
	c1.forEach(([x, y], i) => (f1 |= at(x, y) << i));
	for (let i = 0; i < 8; i++) f2 |= at(size - 1 - i, 8) << i;
	for (let i = 8; i < 15; i++) f2 |= at(8, size - 15 + i) << i;
	let fi = nearest(FORMATS, f1, 3);
	if (fi < 0) fi = nearest(FORMATS, f2, 3);
	if (fi < 0) throw new Error('format');
	const ecl = [1, 0, 3, 2][fi >> 3], mask = fi & 7; // format bits L=1 M=0 Q=3 H=2 -> L M Q H index
	let ver = (size - 17) / 4;
	if (ver >= 7) {
		let v1 = 0, v2 = 0;
		for (let i = 0; i < 18; i++) {
			const a = size - 11 + (i % 3), b = Math.floor(i / 3);
			v1 |= at(a, b) << i; v2 |= at(b, a) << i;
		}
		let vi = nearest(VERSIONS, v1, 3);
		if (vi < 0) vi = nearest(VERSIONS, v2, 3);
		if (vi > 0 && vi !== ver) throw Object.assign(new Error('version'), { retry: 17 + 4 * vi }); // caller resamples
	}

	// Function-pattern mask (same layout as the encoder)
	const fn = new Uint8Array(size * size);
	const mark = (x, y) => { if (x >= 0 && y >= 0 && x < size && y < size) fn[y * size + x] = 1; };
	for (let i = 0; i < size; i++) { mark(6, i); mark(i, 6); }
	for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) mark(cx + dx, cy + dy);
	const al = alignPositions(ver, size);
	for (let i = 0; i < al.length; i++)
		for (let j = 0; j < al.length; j++) {
			if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
			for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(al[i] + dx, al[j] + dy);
		}
	for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
	for (let i = 0; i < 8; i++) { mark(size - 1 - i, 8); mark(8, size - 1 - i); }
	if (ver >= 7) for (let i = 0; i < 18; i++) { mark(size - 11 + (i % 3), Math.floor(i / 3)); mark(Math.floor(i / 3), size - 11 + (i % 3)); }

	// Codewords in zigzag order, unmasked
	const raw = Math.floor(rawModules(ver) / 8), cw = new Uint8Array(raw);
	let i = 0;
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5;
		for (let v = 0; v < size; v++)
			for (let j = 0; j < 2; j++) {
				const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
				if (fn[y * size + x] || i >= raw * 8) continue;
				const bit = at(x, y) ^ (MASKS[mask](x, y) ? 1 : 0);
				cw[i >> 3] |= bit << (7 - (i & 7));
				i++;
			}
	}

	// De-interleave, error-correct
	const nb = NUM_BLOCKS[ecl][ver], ecc = ECC_PER_BLOCK[ecl][ver];
	const shortLen = Math.floor(raw / nb), nShort = nb - (raw % nb);
	const blocks = Array.from({ length: nb }, (_, b) => ({ d: [], e: [], len: shortLen - ecc + (b < nShort ? 0 : 1) }));
	let p = 0;
	for (let k = 0; k <= shortLen - ecc; k++) for (const b of blocks) if (k < b.len) b.d.push(cw[p++]);
	for (let k = 0; k < ecc; k++) for (const b of blocks) b.e.push(cw[p++]);
	let corrected = 0;
	const data = [];
	for (const b of blocks) {
		const all = b.d.concat(b.e);
		corrected += rsDecode(all, ecc, 0x11d, 0);
		data.push(...all.slice(0, b.len));
	}
	const parsed = parseQR(data, ver);
	return { format: 'QR', ...parsed, version: ver, ecLevel: 'LMQH'[ecl], errorsCorrected: corrected };
}

function parseQR(data, ver) {
	let pos = 0;
	const read = (n) => { let v = 0; for (let k = 0; k < n; k++, pos++) v = (v << 1) | ((data[pos >> 3] >> (7 - (pos & 7))) & 1); return v; };
	const g = ver < 10 ? 0 : ver < 27 ? 1 : 2;
	let text = '', eci = null, gs1 = false;
	const bytesToText = (bytes) => {
		if (eci === 26 || eci === null) { try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch { if (eci === 26) throw new Error('utf8'); } }
		if (eci === 20) { try { return new TextDecoder('shift_jis').decode(new Uint8Array(bytes)); } catch {} }
		return String.fromCharCode(...bytes);
	};
	while (pos + 4 <= data.length * 8) {
		const mode = read(4);
		if (mode === 0) break;
		if (mode === 1) { // numeric
			let n = read(CC_BITS[0][g]);
			for (; n >= 3; n -= 3) text += String(read(10)).padStart(3, '0');
			if (n === 2) text += String(read(7)).padStart(2, '0');
			else if (n === 1) text += read(4);
		} else if (mode === 2) { // alphanumeric
			let n = read(CC_BITS[1][g]), s = '';
			for (; n >= 2; n -= 2) { const v = read(11); s += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45]; }
			if (n) s += ALNUM[read(6)];
			text += gs1 ? s.replace(/%%|%/g, (m) => (m === '%%' ? '%' : '\x1d')) : s;
		} else if (mode === 4) { // byte
			const n = read(CC_BITS[2][g]);
			text += bytesToText(Array.from({ length: n }, () => read(8)));
		} else if (mode === 7) { // ECI
			const b = read(8);
			eci = b < 128 ? b : b < 192 ? ((b & 63) << 8) | read(8) : ((b & 31) << 16) | read(16);
		} else if (mode === 8) { // kanji
			const n = read(ver < 10 ? 8 : ver < 27 ? 10 : 12), bytes = [];
			for (let k = 0; k < n; k++) {
				const v = read(13), a = Math.floor(v / 0xc0), c = (a << 8 | (v % 0xc0)) + (v < 0x1f00 ? 0x8140 : 0xc140);
				bytes.push(c >> 8, c & 255);
			}
			try { text += new TextDecoder('shift_jis').decode(new Uint8Array(bytes)); } catch { text += '?'.repeat(n); }
		} else if (mode === 5) gs1 = true;
		else if (mode === 9) read(8);
		else if (mode === 3) read(16);
		else throw new Error('mode');
	}
	return gs1 ? { text, gs1 } : { text };
}

// ---------- 1D ----------
const toWidths = (bitsStr) => { const out = []; let run = 1; for (let i = 1; i <= bitsStr.length; i++) bitsStr[i] === bitsStr[i - 1] ? run++ : (out.push(run), (run = 1)); return out; };
const EAN_DIGITS = { L: L.map(toWidths), G: G.map(toWidths), R: R.map(toWidths) };
const C128 = BARS.map(toWidths);
const C39W = C39.map((n) => toWidths(n.toString(2).replace(/0+$/, ''))); // '*' carries its trailing gap

// Best match of `runs` (pixel widths) to candidate patterns of `modules` total; returns [index, error]
function match(runs, patterns, modules) {
	const total = runs.reduce((a, b) => a + b, 0), unit = total / modules;
	let best = -1, err = Infinity;
	patterns.forEach((p, i) => {
		if (!p || p.length !== runs.length) return;
		let e = 0;
		for (let k = 0; k < p.length; k++) e += ((runs[k] / unit - p[k]) ** 2);
		if (e < err) { err = e; best = i; }
	});
	return [best, err];
}

function decode1D(bits, w, h, want) {
	const results = [];
	const lines = [];
	const nLines = 24;
	for (let k = 0; k < nLines; k++) {
		const y = Math.floor(h / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (h / (nLines + 2)));
		if (y >= 0 && y < h) lines.push(Array.from({ length: w }, (_, x) => bits[y * w + x]));
	}
	for (let k = 0; k < nLines; k++) {
		const x = Math.floor(w / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (w / (nLines + 2)));
		if (x >= 0 && x < w) lines.push(Array.from({ length: h }, (_, y) => bits[y * w + x]));
	}
	// A 1D result counts once it is read on two scanlines (stops random texture from producing codes)
	const seen = new Map();
	for (const line of lines)
		for (const row of [line, line.slice().reverse()]) {
			// runs, starting with a light run (possibly empty)
			const runs = [];
			let color = 0, n = 0;
			for (const b of row) { if (b === color) n++; else { runs.push(n); color = b; n = 1; } }
			runs.push(n);
			const lineHits = new Set();
			for (const dec of [ean, code128, code39, itf])
				for (const r of dec(runs, want)) {
					const key = r.format + '\u0000' + r.text;
					if (lineHits.has(key)) continue;
					lineHits.add(key);
					seen.set(key, (seen.get(key) || 0) + 1);
					if (seen.get(key) === 2 && !results.some((o) => o.format === r.format && o.text === r.text)) results.push(r);
				}
		}
	return results;
}

// runs[0] is light; bars sit at odd indices. A symbol must follow a quiet zone of >= q modules.
const quiet = (runs, i, unit, q) => i === 1 || runs[i - 1] >= q * unit * 0.7;

function* ean(runs, want) {
	for (let i = 1; i + 2 < runs.length; i += 2) {
		const guard = runs.slice(i, i + 3), unit = (guard[0] + guard[1] + guard[2]) / 3;
		if (guard.some((g) => Math.abs(g - unit) > unit * 0.6) || !quiet(runs, i, unit, 5)) continue;
		const digits = (start, count, sets) => {
			const out = [];
			for (let d = 0; d < count; d++) {
				const r = runs.slice(start + d * 4, start + d * 4 + 4);
				if (r.length < 4 || Math.abs(r.reduce((a, b) => a + b, 0) / 7 - unit) > unit * 0.35) return null; // 7 modules per digit
				let best = null;
				for (const s of sets) { const [v, e] = match(r, EAN_DIGITS[s], 7); if (v >= 0 && (!best || e < best.e)) best = { v, s, e }; }
				if (!best || best.e > 1.2) return null;
				out.push(best);
			}
			return out;
		};
		const guardAt = (k, n) => { const g = runs.slice(k, k + n); return g.length === n && g.every((x) => Math.abs(x - unit) < unit * 0.7); };
		const endsAt = (k) => k >= runs.length - 1 || runs[k] >= 5 * unit * 0.7; // quiet zone (or image edge) after the symbol
		// EAN-13 / UPC-A: guard, 6 L/G digits, middle guard, 6 R digits, guard
		if ((want('EAN13') || want('UPCA') || want('UPC')) && guardAt(i + 27, 5) && guardAt(i + 56, 3) && endsAt(i + 59)) {
			const left = digits(i + 3, 6, ['L', 'G']), right = left && digits(i + 32, 6, ['R']);
			if (right) {
				const first = EAN13_PARITY.indexOf(left.map((d) => d.s).join(''));
				const code = first + left.map((d) => d.v).join('') + right.map((d) => d.v).join('');
				if (first >= 0 && mod10(code.slice(0, 12)) === +code[12]) {
					if (first === 0 && (want('UPCA') || want('UPC'))) yield { format: 'UPC-A', text: code.slice(1) };
					else if (want('EAN13')) yield { format: 'EAN-13', text: code };
					continue;
				}
			}
		}
		if (want('EAN8') && guardAt(i + 19, 5) && guardAt(i + 40, 3) && endsAt(i + 43)) {
			const left = digits(i + 3, 4, ['L']), right = left && digits(i + 24, 4, ['R']);
			if (right) {
				const code = left.map((d) => d.v).join('') + right.map((d) => d.v).join('');
				if (mod10(code.slice(0, 7)) === +code[7]) { yield { format: 'EAN-8', text: code }; continue; }
			}
		}
		if (want('UPCE') && guardAt(i + 27, 6) && endsAt(i + 33)) {
			const ds = digits(i + 3, 6, ['L', 'G']);
			if (ds) {
				const pattern = ds.map((d) => (d.s === 'L' ? 'O' : 'E')).join('');
				for (const ns of [0, 1]) {
					const check = UPCE_PARITY.findIndex((p) => (ns ? p.replace(/[EO]/g, (c) => (c === 'E' ? 'O' : 'E')) : p) === pattern);
					if (check >= 0) { yield { format: 'UPC-E', text: ns + ds.map((d) => d.v).join('') + check }; break; }
				}
			}
		}
	}
}

function* code128(runs, want) {
	if (!want('CODE128')) return;
	for (let i = 1; i + 6 < runs.length; i += 2) {
		const [start, se] = match(runs.slice(i, i + 6), C128, 11);
		if (start < 103 || start > 105 || se > 1.5) continue;
		const unit = runs.slice(i, i + 6).reduce((a, b) => a + b, 0) / 11;
		if (!quiet(runs, i, unit, 5)) continue;
		const vals = [start];
		let k = i + 6, ok = false;
		while (k + 6 < runs.length) {
			const stop = runs.slice(k, k + 7);
			if (stop.length === 7 && match(stop, [[2, 3, 3, 1, 1, 1, 2]], 13)[1] < 1.5) { ok = true; break; }
			const [v, e] = match(runs.slice(k, k + 6), C128, 11);
			if (v < 0 || v > 102 || e > 1.5) break;
			vals.push(v);
			k += 6;
		}
		if (!ok || vals.length < 3) continue;
		const check = vals.pop();
		if (vals.reduce((s, v, j) => s + v * (j || 1), 0) % 103 !== check) continue;
		const text = c128Text(vals);
		if (text !== null) yield { format: 'CODE128', ...text };
	}
}

function c128Text(vals) {
	let set = vals[0] - 103, text = '', gs1 = false, fnc4 = false, shift = false;
	for (let j = 1; j < vals.length; j++) {
		const v = vals[j], cur = shift ? 1 - set : set;
		shift = false;
		if (v === 102) { if (j === 1) gs1 = true; else text += '\x1d'; continue; }
		if (cur === 2) { if (v < 100) text += String(v).padStart(2, '0'); else if (v === 100) set = 1; else if (v === 101) set = 0; continue; }
		if (v === 98) { shift = true; continue; }
		if (v === 99) { set = 2; continue; }
		if (v === (cur === 0 ? 101 : 100)) { fnc4 = true; continue; }
		if (v === 100 || v === 101) { set = v === 100 ? 1 : 0; continue; }
		if (v === 96 || v === 97) continue; // FNC3 / FNC2
		let c = cur === 0 ? (v < 64 ? v + 32 : v - 64) : v + 32;
		if (fnc4) { c += 128; fnc4 = false; }
		text += String.fromCharCode(c);
	}
	return gs1 ? { text, gs1 } : { text };
}

function* code39(runs, want) {
	if (!want('CODE39')) return;
	const charAt = (k) => {
		const r = runs.slice(k, k + 9);
		if (r.length < 9) return -1;
		const sorted = r.slice().sort((a, b) => b - a);
		if (sorted[2] < 1.5 * sorted[3]) return -1; // need exactly three wide elements
		const pattern = r.map((x) => (x >= (sorted[2] + sorted[3]) / 2 ? 3 : 1));
		return C39W.findIndex((p) => p.join() === pattern.join());
	};
	const STAR = C39_CHARS.indexOf('*');
	for (let i = 1; i + 9 < runs.length; i += 2) {
		if (charAt(i) !== STAR) continue;
		let k = i + 10, text = '';
		for (; ; k += 10) {
			const c = charAt(k);
			if (c < 0) { text = null; break; }
			if (c === STAR) break;
			text += C39_CHARS[c];
		}
		if (text) yield { format: 'CODE39', text };
	}
}

function* itf(runs, want) {
	if (!want('ITF')) return;
	for (let i = 1; i + 3 < runs.length; i += 2) {
		const st = runs.slice(i, i + 4), unit = st.reduce((a, b) => a + b, 0) / 4;
		if (st.some((x) => Math.abs(x - unit) > unit * 0.6) || !quiet(runs, i, unit, 10)) continue;
		let k = i + 4, text = '';
		for (; k + 10 <= runs.length; k += 10) {
			const r = runs.slice(k, k + 10);
			const wide = (xs) => { const s = xs.slice().sort((a, b) => b - a); return s[1] >= 1.6 * s[2] ? xs.map((x) => (x >= (s[1] + s[2]) / 2 ? '1' : '0')).join('') : null; };
			const a = wide(r.filter((_, j) => j % 2 === 0)), b = wide(r.filter((_, j) => j % 2 === 1));
			const da = ITF_PAIRS.indexOf(a), db = ITF_PAIRS.indexOf(b);
			if (da < 0 || db < 0) break;
			text += da + '' + db;
		}
		const stop = runs.slice(k, k + 3);
		if (text.length >= 6 && stop.length === 3 && stop[0] >= 1.6 * stop[1] && (text.length !== 14 || mod10(text.slice(0, 13)) === +text[13])) yield { format: 'ITF', text };
	}
}
