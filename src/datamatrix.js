// Data Matrix ECC 200 (ISO/IEC 16022): square 10x10-144x144 and rectangular 8x18-16x48,
// ASCII / C40 / Text / Base256 encodation, GS1 (FNC1), UTF-8 via ECI.
import { rsEncode } from './rs.js';
import { gs1Parts } from './gs1.js';

// [rows, cols, data codewords, ecc codewords, region rows, region cols, interleaved blocks]
const SQUARE = [
	[10, 3, 5, 8, 1], [12, 5, 7, 10, 1], [14, 8, 10, 12, 1], [16, 12, 12, 14, 1], [18, 18, 14, 16, 1],
	[20, 22, 18, 18, 1], [22, 30, 20, 20, 1], [24, 36, 24, 22, 1], [26, 44, 28, 24, 1], [32, 62, 36, 14, 1],
	[36, 86, 42, 16, 1], [40, 114, 48, 18, 1], [44, 144, 56, 20, 1], [48, 174, 68, 22, 1], [52, 204, 84, 24, 2],
	[64, 280, 112, 14, 2], [72, 368, 144, 16, 4], [80, 456, 192, 18, 4], [88, 576, 224, 20, 4], [96, 696, 272, 22, 4],
	[104, 816, 336, 24, 6], [120, 1050, 408, 18, 6], [132, 1304, 496, 20, 8], [144, 1558, 620, 22, 10],
].map(([n, d, e, r, b]) => [n, n, d, e, r, r, b]);
const RECT = [[8, 18, 5, 7, 6, 16, 1], [8, 32, 10, 11, 6, 14, 1], [12, 26, 16, 14, 10, 24, 1],
	[12, 36, 22, 18, 10, 16, 1], [16, 36, 32, 24, 14, 16, 1], [16, 48, 49, 28, 14, 22, 1]];

const FNC1 = 232, LATCH_C40 = 230, LATCH_TEXT = 239, LATCH_B256 = 231, UNLATCH = 254;

function ascii(bytes) {
	const cw = [];
	for (let i = 0; i < bytes.length; i++) {
		const a = bytes[i], b = bytes[i + 1];
		if (a === null) cw.push(FNC1);
		else if (a >= 48 && a <= 57 && b >= 48 && b <= 57) { cw.push(130 + (a - 48) * 10 + (b - 48)); i++; }
		else if (a < 128) cw.push(a + 1);
		else cw.push(235, a - 127);
	}
	return cw;
}

// C40 (uppercase-oriented) and Text (lowercase-oriented) values for one byte
function c40Values(b, text) {
	if (b > 127) return [1, 30, ...c40Values(b - 128, text)];
	if (b === 32) return [3];
	if (b >= 48 && b <= 57) return [b - 44];
	if (!text && b >= 65 && b <= 90) return [b - 51];
	if (text && b >= 97 && b <= 122) return [b - 83];
	if (b < 32) return [0, b];
	if (b <= 47) return [1, b - 33];
	if (b <= 64) return [1, b - 43];
	if (b <= 90) return [2, b - 64]; // Text: uppercase via shift 3
	if (b <= 95) return [1, b - 69];
	return [2, b - 96]; // C40: ` a-z { | } ~ DEL; Text: ` { | } ~ DEL
}

// C40/Text for the longest prefix that packs into whole triplets, then ASCII for the rest
function c40(bytes, text) {
	const vals = [];
	let best = 0, bestVals = 0;
	bytes.forEach((b, i) => {
		vals.push(...c40Values(b, text));
		if (vals.length % 3 === 0) { best = i + 1; bestVals = vals.length; }
	});
	if (!best) return null;
	vals.length = bestVals;
	const cw = [text ? LATCH_TEXT : LATCH_C40];
	for (let i = 0; i < vals.length; i += 3) {
		const v = 1600 * vals[i] + 40 * vals[i + 1] + vals[i + 2] + 1;
		cw.push(v >> 8, v & 255);
	}
	cw.push(UNLATCH);
	return cw.concat(ascii(bytes.slice(best)));
}

function base256(bytes, offset) {
	const n = bytes.length;
	if (n > 1555) return null;
	const body = [...(n <= 249 ? [n] : [Math.floor(n / 250) + 249, n % 250]), ...bytes];
	return [LATCH_B256, ...body.map((b, i) => { const t = b + ((149 * (offset + 2 + i)) % 255) + 1; return t <= 255 ? t : t - 256; })];
}

// Shortest of the single-mode candidates. ponytail: no per-segment mode switching (ISO Annex P look-ahead).
function encodeData(text, gs1) {
	if (gs1) return [FNC1, ...ascii(gs1Parts(text, 'GS1 DataMatrix').flatMap((p) => (p === null ? [null] : [...p].map((c) => c.charCodeAt(0)))))];
	const latin1 = [...text].every((c) => c.codePointAt(0) < 256);
	const bytes = latin1 ? [...text].map((c) => c.charCodeAt(0)) : [...new TextEncoder().encode(text)];
	const eci = latin1 ? [] : [241, 27]; // ECI 000026 = UTF-8
	const cands = [ascii(bytes), c40(bytes, false), c40(bytes, true), base256(bytes, eci.length)].filter(Boolean);
	return eci.concat(cands.reduce((a, b) => (b.length < a.length ? b : a)));
}

// Module placement from ISO/IEC 16022 Annex F. Returns 10*codeword+bit (bit 1 = MSB), or 1 for a fixed dark module.
function placement(nrow, ncol) {
	const arr = new Int32Array(nrow * ncol);
	const module = (row, col, chr, bit) => {
		if (row < 0) { row += nrow; col += 4 - ((nrow + 4) % 8); }
		if (col < 0) { col += ncol; row += 4 - ((ncol + 4) % 8); }
		arr[row * ncol + col] = 10 * chr + bit;
	};
	const utah = (r, c, ch) => {
		module(r - 2, c - 2, ch, 1); module(r - 2, c - 1, ch, 2); module(r - 1, c - 2, ch, 3); module(r - 1, c - 1, ch, 4);
		module(r - 1, c, ch, 5); module(r, c - 2, ch, 6); module(r, c - 1, ch, 7); module(r, c, ch, 8);
	};
	const corner = (ch, pts) => pts.forEach(([r, c], i) => module(r, c, ch, i + 1));
	let ch = 1, row = 4, col = 0;
	do {
		if (row === nrow && col === 0)
			corner(ch++, [[nrow - 1, 0], [nrow - 1, 1], [nrow - 1, 2], [0, ncol - 2], [0, ncol - 1], [1, ncol - 1], [2, ncol - 1], [3, ncol - 1]]);
		if (row === nrow - 2 && col === 0 && ncol % 4)
			corner(ch++, [[nrow - 3, 0], [nrow - 2, 0], [nrow - 1, 0], [0, ncol - 4], [0, ncol - 3], [0, ncol - 2], [0, ncol - 1], [1, ncol - 1]]);
		if (row === nrow - 2 && col === 0 && ncol % 8 === 4)
			corner(ch++, [[nrow - 3, 0], [nrow - 2, 0], [nrow - 1, 0], [0, ncol - 2], [0, ncol - 1], [1, ncol - 1], [2, ncol - 1], [3, ncol - 1]]);
		if (row === nrow + 4 && col === 2 && !(ncol % 8))
			corner(ch++, [[nrow - 1, 0], [nrow - 1, ncol - 1], [0, ncol - 3], [0, ncol - 2], [0, ncol - 1], [1, ncol - 3], [1, ncol - 2], [1, ncol - 1]]);
		do {
			if (row < nrow && col >= 0 && !arr[row * ncol + col]) utah(row, col, ch++);
			row -= 2; col += 2;
		} while (row >= 0 && col < ncol);
		row += 1; col += 3;
		do {
			if (row >= 0 && col < ncol && !arr[row * ncol + col]) utah(row, col, ch++);
			row += 2; col -= 2;
		} while (row < nrow && col >= 0);
		row += 3; col += 1;
	} while (row < nrow || col < ncol);
	if (!arr[nrow * ncol - 1]) arr[nrow * ncol - 1] = arr[nrow * ncol - ncol - 2] = 1;
	return arr;
}

export function datamatrix(value, { shape = 'square', gs1 = false } = {}) {
	const text = String(value);
	const data = encodeData(text, gs1);
	const sizes = shape === 'rectangle' ? RECT : shape === 'auto' ? [...SQUARE, ...RECT].sort((a, b) => a[0] * a[1] - b[0] * b[1]) : SQUARE;
	// A trailing C40/Text unlatch may be dropped when the data exactly fills the symbol
	const fits = (s) => s[2] >= data.length || (data[data.length - 1] === UNLATCH && s[2] === data.length - 1);
	const spec = sizes.find(fits);
	if (!spec) throw new Error('Data Matrix data too long');
	const [h, w, nData, nEcc, rh, rw, nBlocks] = spec;
	if (nData < data.length) data.pop();

	// Pad: first 129, then 253-state randomized 129
	for (let pos = data.length + 1, first = pos; pos <= nData; pos++) {
		let p = 129 + ((149 * pos) % 253) + 1;
		if (p > 254) p -= 254;
		data.push(pos === first ? 129 : p);
	}

	// Interleaved Reed-Solomon blocks
	const cw = data.slice();
	const eccPerBlock = nEcc / nBlocks;
	for (let b = 0; b < nBlocks; b++) {
		const ecc = rsEncode(data.filter((_, i) => i % nBlocks === b), eccPerBlock, 0x12d, 2);
		ecc.forEach((e, i) => (cw[nData + i * nBlocks + b] = e));
	}

	const nrow = (h / (rh + 2)) * rh, ncol = (w / (rw + 2)) * rw;
	const place = placement(nrow, ncol);
	const mod = new Uint8Array(w * h);
	for (let r = 0; r < h; r++)
		for (let c = 0; c < w; c++) {
			const rr = r % (rh + 2), cc = c % (rw + 2);
			let dark;
			if (rr === rh + 1 || cc === 0) dark = 1; // solid L: bottom row, left column
			else if (rr === 0) dark = cc % 2 === 0; // dotted top
			else if (cc === rw + 1) dark = rr % 2 === 1; // dotted right
			else {
				const v = place[(Math.floor(r / (rh + 2)) * rh + rr - 1) * ncol + Math.floor(c / (rw + 2)) * rw + cc - 1];
				dark = v === 1 || (v >= 10 && (cw[Math.floor(v / 10) - 1] >> (8 - (v % 10))) & 1);
			}
			mod[r * w + c] = dark ? 1 : 0;
		}
	return { type: 'matrix', width: w, height: h, modules: mod, quiet: 1, text };
}
