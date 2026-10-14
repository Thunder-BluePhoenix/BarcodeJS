// Data Matrix ECC 200 (ISO/IEC 16022), square symbols 10x10 to 144x144, ASCII encodation.
import { rsEncode } from './rs.js';

// [symbol size, data codewords, ecc codewords, data region size, interleaved blocks]
const SIZES = [
	[10, 3, 5, 8, 1], [12, 5, 7, 10, 1], [14, 8, 10, 12, 1], [16, 12, 12, 14, 1], [18, 18, 14, 16, 1],
	[20, 22, 18, 18, 1], [22, 30, 20, 20, 1], [24, 36, 24, 22, 1], [26, 44, 28, 24, 1], [32, 62, 36, 14, 1],
	[36, 86, 42, 16, 1], [40, 114, 48, 18, 1], [44, 144, 56, 20, 1], [48, 174, 68, 22, 1], [52, 204, 84, 24, 2],
	[64, 280, 112, 14, 2], [72, 368, 144, 16, 4], [80, 456, 192, 18, 4], [88, 576, 224, 20, 4], [96, 696, 272, 22, 4],
	[104, 816, 336, 24, 6], [120, 1050, 408, 18, 6], [132, 1304, 496, 20, 8], [144, 1558, 620, 22, 10],
];

// ponytail: ASCII encodation only (digit pairs packed); C40/Text/Base256 modes would shrink some inputs.
function encodeAscii(text) {
	const latin1 = [...text].every((c) => c.codePointAt(0) < 256);
	const bytes = latin1 ? [...text].map((c) => c.charCodeAt(0)) : [...new TextEncoder().encode(text)];
	const cw = latin1 ? [] : [241, 27]; // ECI 000026 = UTF-8
	for (let i = 0; i < bytes.length; i++) {
		const a = bytes[i], b = bytes[i + 1];
		if (a >= 48 && a <= 57 && b >= 48 && b <= 57) { cw.push(130 + (a - 48) * 10 + (b - 48)); i++; }
		else if (a < 128) cw.push(a + 1);
		else cw.push(235, a - 127);
	}
	return cw;
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

export function datamatrix(value) {
	const text = String(value);
	const data = encodeAscii(text);
	const spec = SIZES.find((s) => s[1] >= data.length);
	if (!spec) throw new Error('Data Matrix data too long');
	const [size, nData, nEcc, region, nBlocks] = spec;

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

	const per = size / (region + 2); // regions per side
	const n = per * region;
	const place = placement(n, n);
	const mod = new Uint8Array(size * size);
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			const rr = r % (region + 2), cc = c % (region + 2);
			let dark;
			if (rr === region + 1 || cc === 0) dark = 1; // solid L: bottom row, left column
			else if (rr === 0) dark = cc % 2 === 0; // dotted top
			else if (cc === region + 1) dark = rr % 2 === 1; // dotted right
			else {
				const v = place[(Math.floor(r / (region + 2)) * region + rr - 1) * n + Math.floor(c / (region + 2)) * region + cc - 1];
				dark = v === 1 || (v >= 10 && (cw[Math.floor(v / 10) - 1] >> (8 - (v % 10))) & 1);
			}
			mod[r * size + c] = dark ? 1 : 0;
		}
	return { type: 'matrix', width: size, height: size, modules: mod, quiet: 1, text };
}
