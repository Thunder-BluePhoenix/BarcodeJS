// Aztec Code (ISO/IEC 24778): compact (1-4 layers) and full-range (4-32 layers), UTF-8 via ECI.
import { rsEncode } from './rs.js';
import { charsetBytes } from './charset.js';

const U = 0, L = 1, D = 2, M = 3, P = 4;
const WIDTH = [5, 5, 4, 5, 5];
const MIXED_CHARS = ' \x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x1b\x1c\x1d\x1e\x1f@\\^_`|~\x7f';
const PUNCT_CHARS = '\0\r\0\0\0\0!"#$%&\'()*+,-./:;<=>?[]{}'; // 0 = FLG(n), 2-5 = two-char pairs (unused)
function code(mode, b) {
	const c = String.fromCharCode(b);
	if (b === 32 && mode !== P) return 1;
	if (mode === U && b >= 65 && b <= 90) return b - 63;
	if (mode === L && b >= 97 && b <= 122) return b - 95;
	if (mode === D) return b >= 48 && b <= 57 ? b - 46 : b === 44 ? 12 : b === 46 ? 13 : -1;
	if (mode === M) { const i = MIXED_CHARS.indexOf(c); return i >= 0 && b !== 32 ? i + 1 : -1; }
	if (mode === P) return b ? PUNCT_CHARS.indexOf(c) : -1;
	return -1;
}
// Latch sequences [value, bits]
const LATCH = [
	[null, [[28, 5]], [[30, 5]], [[29, 5]], [[29, 5], [30, 5]]],
	[[[30, 5], [14, 4]], null, [[30, 5]], [[29, 5]], [[29, 5], [30, 5]]],
	[[[14, 4]], [[14, 4], [28, 5]], null, [[14, 4], [29, 5]], [[14, 4], [29, 5], [30, 5]]],
	[[[29, 5]], [[28, 5]], [[29, 5], [30, 5]], null, [[30, 5]]],
	[[[31, 5]], [[31, 5], [28, 5]], [[31, 5], [30, 5]], [[31, 5], [29, 5]], null],
];

const PAIRS = { '\r\n': 2, '. ': 3, ', ': 4, ': ': 5 }; // two-character punctuation codes
const MODES_ALL = [U, L, D, M, P];

// Fewest bits by dynamic programming over (position, latched mode): latches, P/S and U/S shifts,
// punctuation pairs and binary shift runs (short form up to 31 bytes, long form beyond).
function highLevel(bytes, eci) {
	const n = bytes.length;
	const cost = Array.from({ length: n + 1 }, () => new Array(5).fill(Infinity));
	const back = Array.from({ length: n + 1 }, () => new Array(5));
	const seqBits = (seq) => seq.reduce((a, [, w]) => a + w, 0);
	const head = [];
	if (eci) { // P/S FLG(n) + n ECI digits, from upper mode at the start
		head.push([0, 5], [0, 5], [String(eci).length, 3]);
		for (const d of String(eci)) head.push([+d + 2, 4]);
	}
	cost[0][U] = 0;
	for (let i = 0; i < n; i++)
		for (const m of MODES_ALL) {
			const c = cost[i][m];
			if (c === Infinity) continue;
			const go = (j, t, seq, bin) => {
				const v = c + seqBits(seq) + (bin ? 8 * bin : 0);
				if (v < cost[j][t]) { cost[j][t] = v; back[j][t] = { i, m, seq, bin }; }
			};
			const b = bytes[i];
			for (const t of MODES_ALL) if (code(t, b) >= 0) go(i + 1, t, [...(t === m ? [] : LATCH[m][t]), [code(t, b), WIDTH[t]]]);
			const pair = PAIRS[String.fromCharCode(b, bytes[i + 1] ?? 0)];
			if (pair) {
				go(i + 2, P, [...(m === P ? [] : LATCH[m][P]), [pair, 5]]);
				if (m !== P) go(i + 2, m, [[0, WIDTH[m]], [pair, 5]]);
			}
			if (m !== P && code(P, b) >= 0) go(i + 1, m, [[0, WIDTH[m]], [code(P, b), 5]]);
			if ((m === L || m === D) && code(U, b) >= 0) go(i + 1, m, [[m === L ? 28 : 15, WIDTH[m]], [code(U, b), 5]]);
			// Binary shift (from D or P: latch to upper first)
			const from = m === D || m === P ? U : m, pre = from === m ? [] : LATCH[m][U];
			for (let k = 1; k <= Math.min(31, n - i); k++) go(i + k, from, [...pre, [31, 5], [k, 5]], k);
			for (let k = 32; k <= Math.min(2078, n - i); k++) go(i + k, from, [...pre, [31, 5], [0, 5], [k - 31, 11]], k);
		}
	let m = MODES_ALL.reduce((a, t) => (cost[n][t] < cost[n][a] ? t : a), U);
	const steps = [];
	for (let j = n; j > 0;) { const st = back[j][m]; steps.unshift({ ...st, j }); j = st.i; m = st.m; }
	const bits = [];
	const push = (v, w) => { for (let k = w - 1; k >= 0; k--) bits.push((v >>> k) & 1); };
	for (const [v, w] of head) push(v, w);
	for (const { i, seq, bin } of steps) {
		for (const [v, w] of seq) push(v, w);
		if (bin) for (let k = 0; k < bin; k++) push(bytes[i + k], 8);
	}
	return bits;
}

const WORD_SIZE = [4, 6, 6, 8, 8, 8, 8, 8, 8, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12];
const GF = { 4: 0x13, 6: 0x43, 8: 0x12d, 10: 0x409, 12: 0x1069 };
const totalBitsInLayer = (layers, compact) => ((compact ? 88 : 112) + 16 * layers) * layers;

function stuff(bits, w) {
	const out = [], mask = (1 << w) - 2;
	for (let i = 0; i < bits.length; i += w) {
		let word = 0;
		for (let j = 0; j < w; j++) if (i + j >= bits.length || bits[i + j]) word |= 1 << (w - 1 - j);
		if ((word & mask) === mask) { out.push(word & mask); i--; }
		else if ((word & mask) === 0) { out.push(word | 1); i--; }
		else out.push(word);
	}
	return out;
}

// Words + RS check words -> bit array of `totalBits` (left-padded)
function checkWords(words, totalBits, w) {
	const total = Math.floor(totalBits / w);
	const all = words.concat(rsEncode(words, total - words.length, GF[w], 2, w));
	const bits = new Array(totalBits % w).fill(0);
	for (const x of all) for (let i = w - 1; i >= 0; i--) bits.push((x >>> i) & 1);
	return bits;
}

export function aztec(value, { ecPercent = 33 } = {}) {
	const text = String(value);
	const { bytes, eci } = charsetBytes(text);
	const bits = highLevel(bytes, eci);

	const eccBits = Math.floor((bits.length * ecPercent) / 100) + 11;
	let compact, layers, w, words;
	for (let i = 0; ; i++) {
		if (i > 32) throw new Error('Aztec data too long');
		compact = i <= 3;
		layers = compact ? i + 1 : i;
		const total = totalBitsInLayer(layers, compact);
		if (bits.length + eccBits > total) continue;
		w = WORD_SIZE[layers];
		words = stuff(bits, w);
		if (compact && words.length > 64) continue;
		if (words.length * w + eccBits <= total - (total % w)) break;
	}
	const msg = checkWords(words, totalBitsInLayer(layers, compact), w);
	const modeWords = [];
	const mv = compact ? ((layers - 1) << 6) | (words.length - 1) : ((layers - 1) << 11) | (words.length - 1);
	for (let k = compact ? 1 : 3; k >= 0; k--) modeWords.push((mv >>> (k * 4)) & 15);
	const modeMsg = checkWords(modeWords, compact ? 28 : 40, 4);

	const base = (compact ? 11 : 14) + layers * 4;
	const map = [];
	let size;
	if (compact) { size = base; for (let i = 0; i < base; i++) map[i] = i; }
	else {
		size = base + 1 + 2 * Math.floor((Math.floor(base / 2) - 1) / 15);
		const oc = Math.floor(base / 2), c = Math.floor(size / 2);
		for (let i = 0; i < oc; i++) {
			const off = i + Math.floor(i / 15);
			map[oc - i - 1] = c - off - 1;
			map[oc + i] = c + off + 1;
		}
	}
	const mod = new Uint8Array(size * size);
	const set = (x, y) => (mod[y * size + x] = 1);

	for (let i = 0, rowOff = 0; i < layers; i++) {
		const rowSize = (layers - i) * 4 + (compact ? 9 : 12);
		for (let j = 0; j < rowSize; j++) {
			const col = j * 2;
			for (let k = 0; k < 2; k++) {
				if (msg[rowOff + col + k]) set(map[i * 2 + k], map[i * 2 + j]);
				if (msg[rowOff + rowSize * 2 + col + k]) set(map[i * 2 + j], map[base - 1 - i * 2 - k]);
				if (msg[rowOff + rowSize * 4 + col + k]) set(map[base - 1 - i * 2 - k], map[base - 1 - i * 2 - j]);
				if (msg[rowOff + rowSize * 6 + col + k]) set(map[base - 1 - i * 2 - j], map[i * 2 + k]);
			}
		}
		rowOff += rowSize * 8;
	}

	const c = Math.floor(size / 2);
	// Mode message around the bullseye
	if (compact) {
		for (let i = 0; i < 7; i++) {
			const o = c - 3 + i;
			if (modeMsg[i]) set(o, c - 5);
			if (modeMsg[i + 7]) set(c + 5, o);
			if (modeMsg[20 - i]) set(o, c + 5);
			if (modeMsg[27 - i]) set(c - 5, o);
		}
	} else {
		for (let i = 0; i < 10; i++) {
			const o = c - 5 + i + Math.floor(i / 5);
			if (modeMsg[i]) set(o, c - 7);
			if (modeMsg[i + 10]) set(c + 7, o);
			if (modeMsg[29 - i]) set(o, c + 7);
			if (modeMsg[39 - i]) set(c - 7, o);
		}
	}
	// Bullseye finder + orientation marks
	const eye = compact ? 5 : 7;
	for (let i = 0; i < eye; i += 2)
		for (let j = c - i; j <= c + i; j++) { set(j, c - i); set(j, c + i); set(c - i, j); set(c + i, j); }
	set(c - eye, c - eye); set(c - eye + 1, c - eye); set(c - eye, c - eye + 1);
	set(c + eye, c - eye); set(c + eye, c - eye + 1); set(c + eye, c + eye - 1);
	// Reference grid (full-range only)
	if (!compact)
		for (let i = 0, j = 0; i < Math.floor(base / 2) - 1; i += 15, j += 16)
			for (let k = c & 1; k < size; k += 2) { set(c - j, k); set(c + j, k); set(k, c - j); set(k, c + j); }

	return { type: 'matrix', width: size, height: size, modules: mod, quiet: 2, text, layers, compact };
}
