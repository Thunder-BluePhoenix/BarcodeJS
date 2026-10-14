// QR Code model 2 (ISO/IEC 18004), versions 1-40, ECC levels L/M/Q/H.
import { rsEncode } from './rs.js';

// Index 0 unused. Rows: L, M, Q, H.
const ECC_PER_BLOCK = [
	[-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
	[-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
	[-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
	[-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_BLOCKS = [
	[-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
	[-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
	[-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
	[-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];
const ECL = { L: 0, M: 1, Q: 2, H: 3 };
const FORMAT_BITS = [1, 0, 3, 2];
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// mode indicator + character count bit lengths for versions 1-9, 10-26, 27-40
const MODES = {
	numeric: { bits: 1, count: [10, 12, 14] },
	alphanumeric: { bits: 2, count: [9, 11, 13] },
	byte: { bits: 4, count: [8, 16, 16] },
};

const rawModules = (ver) => {
	let r = (16 * ver + 128) * ver + 64;
	if (ver >= 2) {
		const n = Math.floor(ver / 7) + 2;
		r -= (25 * n - 10) * n - 55;
		if (ver >= 7) r -= 36;
	}
	return r;
};
const dataCodewords = (ver, ecl) =>
	Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];

function alignPositions(ver, size) {
	if (ver === 1) return [];
	const n = Math.floor(ver / 7) + 2;
	const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
	const res = [6];
	for (let pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
	return res;
}

// ponytail: one mode for the whole string; mixed-mode segmentation saves ~10-20% on mixed input.
function segment(text) {
	if (/^\d*$/.test(text)) return { mode: 'numeric', count: text.length, put(push) {
		for (let i = 0; i < text.length; i += 3) {
			const chunk = text.slice(i, i + 3);
			push(+chunk, chunk.length * 3 + 1);
		}
	} };
	if ([...text].every((c) => ALNUM.includes(c))) return { mode: 'alphanumeric', count: text.length, put(push) {
		for (let i = 0; i + 1 < text.length; i += 2) push(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
		if (text.length % 2) push(ALNUM.indexOf(text[text.length - 1]), 6);
	} };
	const bytes = new TextEncoder().encode(text);
	return { mode: 'byte', count: bytes.length, put(push) { for (const b of bytes) push(b, 8); } };
}

export function qr(value, { ecLevel = 'M', version } = {}) {
	const text = String(value);
	const ecl = ECL[String(ecLevel).toUpperCase()];
	if (ecl === undefined) throw new Error(`Invalid QR ecLevel: ${ecLevel}`);
	const seg = segment(text);
	const mode = MODES[seg.mode];

	// Pick the smallest version that fits
	let ver = version || 1, bitLen;
	for (; ; ver++) {
		if (ver > 40) throw new Error('QR data too long');
		const cc = mode.count[ver < 10 ? 0 : ver < 27 ? 1 : 2];
		bitLen = 4 + cc;
		seg.put((_, n) => (bitLen += n));
		if (seg.count < 2 ** cc && bitLen <= dataCodewords(ver, ecl) * 8) break;
		if (version) throw new Error(`QR data does not fit in version ${version}`);
	}

	// Data bits
	const bits = [];
	const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
	push(mode.bits, 4);
	push(seg.count, mode.count[ver < 10 ? 0 : ver < 27 ? 1 : 2]);
	seg.put(push);
	const cap = dataCodewords(ver, ecl) * 8;
	push(0, Math.min(4, cap - bits.length));
	push(0, (8 - (bits.length % 8)) % 8);
	for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) push(pad, 8);
	const data = [];
	for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

	// Split into blocks, add ECC, interleave
	const numBlocks = NUM_BLOCKS[ecl][ver], blockEcc = ECC_PER_BLOCK[ecl][ver];
	const raw = Math.floor(rawModules(ver) / 8);
	const numShort = numBlocks - (raw % numBlocks), shortLen = Math.floor(raw / numBlocks);
	const blocks = [];
	for (let i = 0, k = 0; i < numBlocks; i++) {
		const len = shortLen - blockEcc + (i < numShort ? 0 : 1);
		const dat = data.slice(k, (k += len));
		const ecc = rsEncode(dat, blockEcc, 0x11d, 1);
		if (i < numShort) dat.push(0);
		blocks.push(dat.concat(ecc));
	}
	const codewords = [];
	for (let i = 0; i < blocks[0].length; i++)
		for (let j = 0; j < numBlocks; j++)
			if (i !== shortLen - blockEcc || j >= numShort) codewords.push(blocks[j][i]);

	// Function patterns
	const size = ver * 4 + 17;
	const mod = new Uint8Array(size * size), fn = new Uint8Array(size * size);
	const set = (x, y, dark) => { mod[y * size + x] = dark ? 1 : 0; fn[y * size + x] = 1; };
	for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
	for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])
		for (let dy = -4; dy <= 4; dy++)
			for (let dx = -4; dx <= 4; dx++) {
				const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
				if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
			}
	const al = alignPositions(ver, size);
	for (let i = 0; i < al.length; i++)
		for (let j = 0; j < al.length; j++) {
			if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
			for (let dy = -2; dy <= 2; dy++)
				for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
		}
	const drawFormat = (mask) => {
		const d = (FORMAT_BITS[ecl] << 3) | mask;
		let r = d;
		for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
		const b = ((d << 10) | r) ^ 0x5412;
		const bit = (i) => (b >>> i) & 1;
		for (let i = 0; i <= 5; i++) set(8, i, bit(i));
		set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
		for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
		for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
		for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
		set(8, size - 8, 1);
	};
	drawFormat(0); // reserve
	if (ver >= 7) {
		let r = ver;
		for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
		const b = (ver << 12) | r;
		for (let i = 0; i < 18; i++) {
			const a = size - 11 + (i % 3), c = Math.floor(i / 3), dark = (b >>> i) & 1;
			set(a, c, dark); set(c, a, dark);
		}
	}

	// Codewords in zigzag order
	let i = 0;
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5;
		for (let v = 0; v < size; v++)
			for (let j = 0; j < 2; j++) {
				const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
				if (!fn[y * size + x] && i < codewords.length * 8) {
					mod[y * size + x] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
					i++;
				}
			}
	}

	// Pick the mask with the lowest penalty
	const MASKS = [
		(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
		(x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
		(x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
	];
	const applyMask = (m) => {
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++) if (!fn[y * size + x] && MASKS[m](x, y)) mod[y * size + x] ^= 1;
	};
	let best = 0, bestScore = Infinity;
	for (let m = 0; m < 8; m++) {
		applyMask(m); drawFormat(m);
		const s = penalty(mod, size);
		if (s < bestScore) { best = m; bestScore = s; }
		applyMask(m);
	}
	applyMask(best); drawFormat(best);

	return { type: 'matrix', width: size, height: size, modules: mod, quiet: 4, text, version: ver };
}

function penalty(mod, size) {
	let score = 0, dark = 0;
	const at = (x, y) => mod[y * size + x];
	for (let pass = 0; pass < 2; pass++) {
		const get = pass ? (a, b) => at(b, a) : at;
		for (let a = 0; a < size; a++) {
			let run = 1, line = '';
			for (let b = 0; b < size; b++) {
				const c = get(b, a);
				line += c;
				if (b > 0 && c === get(b - 1, a)) { if (++run === 5) score += 3; else if (run > 5) score++; } else run = 1;
			}
			// Finder-like 1:1:3:1:1 with 4 light modules on either side
			for (const re of [/(?=10111010000)/g, /(?=00001011101)/g]) score += 40 * (line.match(re) || []).length;
		}
	}
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			dark += at(x, y);
			if (x < size - 1 && y < size - 1) {
				const c = at(x, y);
				if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
			}
		}
	const total = size * size;
	return score + Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
}
