// Micro QR Code (ISO/IEC 18004), M1-M4.
import { rsEncode } from './rs.js';
import { MODES, segmentize, bitWriter } from './qr.js';

// [symbol number, data bits, data codewords, ecc codewords] per version and ECC level
const SPECS = {
	1: { _: [0, 20, 3, 2] },
	2: { L: [1, 40, 5, 5], M: [2, 32, 4, 6] },
	3: { L: [3, 84, 11, 6], M: [4, 68, 9, 8] },
	4: { L: [5, 128, 16, 8], M: [6, 112, 14, 10], Q: [7, 80, 10, 14] },
};
// character count bits [numeric, alphanumeric, byte] per version; 0 = mode not allowed
const CC = { 1: [3, 0, 0], 2: [4, 3, 0], 3: [5, 4, 4], 4: [6, 5, 5] };
const MASKS = [
	(x, y) => y % 2 === 0,
	(x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
	(x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
	(x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export function microqr(value, { ecLevel = 'L', version, mask } = {}) {
	const text = String(value);
	const chars = [...text];
	if (!chars.length) throw new Error('Micro QR value is empty');
	const want = String(ecLevel).toUpperCase();

	for (let ver = version || 1; ver <= 4; ver++) {
		const spec = ver === 1 ? SPECS[1]._ : SPECS[ver][want];
		if (!spec) { if (version) break; continue; }
		const [symNum, dataBits, nData, nEcc] = spec;
		const modes = [MODES.numeric, MODES.alphanumeric, MODES.byte].filter((m) => CC[ver][m.id]);
		if (!chars.every((c) => modes.some((m) => m.can(c)))) { if (version) break; continue; }
		const segs = segmentize(chars, modes, (m) => ver - 1 + CC[ver][m.id]);

		const { bits, push } = bitWriter();
		let fits = true;
		for (const s of segs) {
			const n = s.mode.count(s.chars), cc = CC[ver][s.mode.id];
			if (n >= 2 ** cc) fits = false;
			push(s.mode.id, ver - 1);
			push(n, cc);
			s.mode.put(s.chars, push);
		}
		if (!fits || bits.length > dataBits) { if (version) break; continue; }

		// Terminator, byte-align, pad codewords; M1/M3 end in a 4-bit codeword
		push(0, Math.min(ver * 2 + 1, dataBits - bits.length));
		push(0, Math.min((8 - (bits.length % 8)) % 8, dataBits - bits.length));
		for (let pad = 0xec; dataBits - bits.length >= 8; pad ^= 0xec ^ 0x11) push(pad, 8);
		push(0, dataBits - bits.length);
		const data = [];
		for (let i = 0; i < dataBits; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0) << Math.max(0, i + 8 - dataBits));
		const stream = bits.concat(...rsEncode(data, nEcc, 0x11d, 1).map((b) => [...b.toString(2).padStart(8, '0')].map(Number)));

		// Function patterns: one finder, separator, timing along top row and left column
		const size = ver * 2 + 9;
		const mod = new Uint8Array(size * size), fn = new Uint8Array(size * size);
		const set = (x, y, d) => { mod[y * size + x] = d ? 1 : 0; fn[y * size + x] = 1; };
		for (let y = 0; y < 8; y++)
			for (let x = 0; x < 8; x++) {
				const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
				set(x, y, d !== 2 && d < 4);
			}
		for (let i = 8; i < size; i++) { set(i, 0, i % 2 === 0); set(0, i, i % 2 === 0); }
		const formatCells = [];
		for (let i = 1; i <= 8; i++) formatCells.push([8, i]);
		for (let i = 7; i >= 1; i--) formatCells.push([i, 8]);
		for (const [x, y] of formatCells) set(x, y, 0);

		// Data in the QR zigzag order (no timing column to skip)
		let k = 0;
		for (let right = size - 1; right >= 1; right -= 2)
			for (let v = 0; v < size; v++)
				for (let j = 0; j < 2; j++) {
					const x = right - j, y = ((size - 1 - right) & 2) === 0 ? size - 1 - v : v; // first pair goes up
					if (!fn[y * size + x]) mod[y * size + x] = k < stream.length ? stream[k++] : 0;
				}

		// Mask with the most dark modules along the right and bottom edges
		let best = 0, bestScore = -1;
		for (let m = 0; m < 4; m++) {
			let s1 = 0, s2 = 0;
			for (let i = 1; i < size; i++) {
				s1 += mod[i * size + size - 1] ^ (!fn[i * size + size - 1] && MASKS[m](size - 1, i) ? 1 : 0);
				s2 += mod[(size - 1) * size + i] ^ (!fn[(size - 1) * size + i] && MASKS[m](i, size - 1) ? 1 : 0);
			}
			const score = Math.min(s1, s2) * 16 + Math.max(s1, s2);
			if (score > bestScore) { best = m; bestScore = score; }
		}
		if (mask !== undefined) best = mask;
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++) if (!fn[y * size + x] && MASKS[best](x, y)) mod[y * size + x] ^= 1;

		// Format information: symbol number + mask, BCH(15,5), XOR 0x4445; bit 0 first
		const d = (symNum << 2) | best;
		let r = d;
		for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
		const fmt = ((d << 10) | r) ^ 0x4445;
		formatCells.forEach(([x, y], i) => set(x, y, (fmt >>> i) & 1));

		return { type: 'matrix', width: size, height: size, modules: mod, quiet: 2, text, version: `M${ver}`, mask: best, finders: [[0, 0]] };
	}
	throw new Error(version ? `Micro QR data does not fit in M${version}-${want}` : 'Micro QR data too long');
}
