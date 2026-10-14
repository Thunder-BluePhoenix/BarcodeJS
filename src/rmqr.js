// Rectangular Micro QR Code (rMQR, ISO/IEC 23941): R7x43 - R17x139, ECC levels M and H.
import { rsEncode } from './rs.js';
import { MODES, segmentize, bitWriter } from './qr.js';

// [rows, cols, align a1, align a2, data modules, ecc M, ecc H, blocks M (small, large), blocks H (small, large),
//  count bits numeric, alphanumeric, byte] - metrics as tabulated in BWIPP
const VERSIONS = [
	[7, 43, 22, 99, 104, 7, 10, 1, 0, 1, 0, 4, 3, 3],
	[7, 59, 20, 40, 171, 9, 14, 1, 0, 1, 0, 5, 5, 4],
	[7, 77, 26, 52, 261, 12, 22, 1, 0, 1, 0, 6, 5, 5],
	[7, 99, 24, 50, 358, 16, 30, 1, 0, 1, 0, 7, 6, 5],
	[7, 139, 28, 56, 545, 24, 44, 1, 0, 2, 0, 7, 6, 6],
	[9, 43, 22, 99, 170, 9, 14, 1, 0, 1, 0, 5, 5, 4],
	[9, 59, 20, 40, 267, 12, 22, 1, 0, 1, 0, 6, 5, 5],
	[9, 77, 26, 52, 393, 18, 32, 1, 0, 1, 1, 7, 6, 5],
	[9, 99, 24, 50, 532, 24, 44, 1, 0, 2, 0, 7, 6, 6],
	[9, 139, 28, 56, 797, 36, 66, 1, 1, 3, 0, 8, 7, 6],
	[11, 27, 98, 99, 122, 8, 10, 1, 0, 1, 0, 4, 4, 3],
	[11, 43, 22, 99, 249, 12, 20, 1, 0, 1, 0, 6, 5, 5],
	[11, 59, 20, 40, 376, 16, 32, 1, 0, 1, 1, 7, 6, 5],
	[11, 77, 26, 52, 538, 24, 44, 1, 0, 1, 1, 7, 6, 6],
	[11, 99, 24, 50, 719, 32, 60, 1, 1, 1, 1, 8, 7, 6],
	[11, 139, 28, 56, 1062, 48, 90, 2, 0, 3, 0, 8, 7, 7],
	[13, 27, 98, 99, 172, 9, 14, 1, 0, 1, 0, 5, 5, 4],
	[13, 43, 22, 99, 329, 14, 28, 1, 0, 1, 0, 6, 6, 5],
	[13, 59, 20, 40, 486, 22, 40, 1, 0, 2, 0, 7, 6, 6],
	[13, 77, 26, 52, 684, 32, 56, 1, 1, 1, 1, 7, 7, 6],
	[13, 99, 24, 50, 907, 40, 78, 1, 1, 1, 2, 8, 7, 7],
	[13, 139, 28, 56, 1328, 60, 112, 2, 1, 2, 2, 8, 8, 7],
	[15, 43, 22, 99, 409, 18, 36, 1, 0, 1, 1, 7, 6, 6],
	[15, 59, 20, 40, 596, 26, 48, 1, 0, 2, 0, 7, 7, 6],
	[15, 77, 26, 52, 830, 36, 72, 1, 1, 2, 1, 8, 7, 7],
	[15, 99, 24, 50, 1095, 48, 88, 2, 0, 4, 0, 8, 7, 7],
	[15, 139, 28, 56, 1594, 72, 130, 2, 1, 1, 4, 9, 8, 7],
	[17, 43, 22, 99, 489, 22, 40, 1, 0, 1, 1, 7, 6, 6],
	[17, 59, 20, 40, 706, 32, 60, 2, 0, 2, 0, 8, 7, 6],
	[17, 77, 26, 52, 976, 44, 84, 2, 0, 1, 2, 8, 7, 7],
	[17, 99, 24, 50, 1283, 60, 104, 2, 1, 4, 0, 8, 8, 7],
	[17, 139, 28, 56, 1860, 80, 156, 4, 0, 2, 4, 9, 8, 8]
];
const MODE_IND = [1, 2, 3]; // numeric, alphanumeric, byte

// ECC level M is raised to H when the data still fits the same version (as BWIPP does)
export function rmqr(value, { ecLevel = 'M', version, boost = true } = {}) {
	const text = String(value);
	const chars = [...text];
	if (!chars.length) throw new Error('rMQR value is empty');
	let H = String(ecLevel).toUpperCase() === 'H';
	if (!/^[MH]$/i.test(String(ecLevel))) throw new Error(`Invalid rMQR ecLevel: ${ecLevel} (M or H)`);
	const order = VERSIONS.map((v, i) => i)
		.filter((i) => !version || `r${VERSIONS[i][0]}x${VERSIONS[i][1]}` === String(version).toLowerCase())
		.sort((a, b) => VERSIONS[a][0] * VERSIONS[a][1] - VERSIONS[b][0] * VERSIONS[b][1]);
	if (!order.length) throw new Error(`Unknown rMQR version: ${version}`);

	for (const vi of order) {
		const [R, C, a1, a2, dataModules, eccM, eccH, bm1, bm2, bh1, bh2, ...cc] = VERSIONS[vi];
		const total = Math.floor(dataModules / 8), ecc = H ? eccH : eccM, nData = total - ecc;
		const modes = [MODES.numeric, MODES.alphanumeric, MODES.byte];
		const segs = segmentize(chars, modes, (m) => 3 + cc[m.id]);
		const { bits, push } = bitWriter();
		let ok = true;
		for (const s of segs) {
			const n = s.mode.count(s.chars);
			if (n >= 2 ** cc[s.mode.id]) ok = false;
			push(MODE_IND[s.mode.id], 3);
			push(n, cc[s.mode.id]);
			s.mode.put(s.chars, push);
		}
		if (!ok || bits.length > nData * 8) continue;
		if (!H && boost && bits.length <= (total - eccH) * 8) return rmqr(value, { ecLevel: 'H', version: `R${R}x${C}` });
		push(0, Math.min(3, nData * 8 - bits.length));
		push(0, (8 - (bits.length % 8)) % 8);
		for (let pad = 0xec; bits.length < nData * 8; pad ^= 0xec ^ 0x11) push(pad, 8);
		const data = [];
		for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

		// Blocks: `small` blocks of floor(total / n) codewords, then blocks one longer
		const nb = H ? bh1 + bh2 : bm1 + bm2, eccPer = ecc / nb, shortLen = Math.floor(total / nb), nShort = nb - (total % nb);
		const blocks = [];
		for (let i = 0, k = 0; i < nb; i++) {
			const len = shortLen - eccPer + (i < nShort ? 0 : 1);
			const d = data.slice(k, (k += len));
			blocks.push({ d, e: rsEncode(d, eccPer, 0x11d, 1) });
		}
		const cws = [];
		for (let i = 0; i <= shortLen - eccPer; i++) for (const b of blocks) if (i < b.d.length) cws.push(b.d[i]);
		for (let i = 0; i < eccPer; i++) for (const b of blocks) cws.push(b.e[i]);

		// Function patterns
		const mod = new Uint8Array(R * C), fn = new Uint8Array(R * C);
		const set = (x, y, d) => { if (x >= 0 && x < C && y >= 0 && y < R) { mod[y * C + x] = d ? 1 : 0; fn[y * C + x] = 1; } };
		for (let x = 0; x < C; x++) { set(x, 0, x % 2 === 0); set(x, R - 1, x % 2 === 0); } // top / bottom timing
		for (let y = 0; y < R; y++) { set(0, y, y % 2 === 0); set(C - 1, y, y % 2 === 0); } // left / right timing
		const aligns = [];
		if (a1 < 98) for (let x = a1 - 1, step = a2 < 98 ? a2 - a1 : 0; x < C - 8; x += step || C) aligns.push(x);
		for (const ax of aligns) {
			for (let y = 0; y < R; y++) set(ax, y, y % 2 === 0); // vertical timing
			for (const cy of [1, R - 2]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(ax + dx, cy + dy, dx || dy);
		}
		set(C - 2, 0, 1); set(C - 1, 1, 1); set(C - 2, 1, 0); // corner finder, top right
		set(1, R - 1, 1); set(0, R - 2, 1); set(1, R - 2, 0); // corner finder, bottom left (the finder separator wins on R9)
		for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { // finder + separator
			const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
			set(x, y, d !== 2 && d < 4);
		}
		for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { // sub-finder
			const d = Math.max(Math.abs(x - 2), Math.abs(y - 2));
			set(C - 5 + x, R - 5 + y, d !== 1);
		}
		const left = [], right = [];
		for (let i = 0; i < 18; i++) {
			left.push(i < 15 ? [8 + Math.floor(i / 5), 1 + (i % 5)] : [11, 1 + i - 15]);
			right.push(i < 15 ? [C - 8 + Math.floor(i / 5), R - 6 + (i % 5)] : [C - 5 + i - 15, R - 6]);
		}
		for (const [x, y] of [...left, ...right]) set(x, y, 0);

		// Data: two-column zigzag from the right, first pair upward
		let k = 0;
		const stream = cws.flatMap((c) => [...c.toString(2).padStart(8, '0')].map(Number));
		for (let right = C - 2, pair = 0; right >= 1; right -= 2, pair++) // right edge is timing: pairs start at C-2
			for (let v = 0; v < R; v++)
				for (let j = 0; j < 2; j++) {
					const x = right - j, y = pair % 2 === 0 ? R - 1 - v : v;
					if (!fn[y * C + x]) mod[y * C + x] = (k < stream.length ? stream[k++] : 0) ^ ((Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0 ? 1 : 0);
				}

		// Format: ECC level bit + version index, BCH(18,6), masked differently per side
		const d6 = ((H ? 1 : 0) << 5) | vi;
		let rem = d6;
		for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
		const f = (d6 << 12) | rem;
		left.forEach(([x, y], i) => set(x, y, ((f ^ 0x1fab2) >>> i) & 1));
		right.forEach(([x, y], i) => set(x, y, ((f ^ 0x20a7b) >>> i) & 1));

		return { type: 'matrix', width: C, height: R, modules: mod, quiet: 2, text, version: `R${R}x${C}` };
	}
	throw new Error(version ? `rMQR data does not fit in ${version}` : 'rMQR data too long');
}
