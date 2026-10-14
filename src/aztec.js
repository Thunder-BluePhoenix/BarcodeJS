// Aztec Code (ISO/IEC 24778): compact (1-4 layers) and full-range (4-32 layers), UTF-8 via ECI.
import { rsEncode } from './rs.js';

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
const latchCost = (a, b) => (a === b ? 0 : LATCH[a][b].reduce((s, [, n]) => s + n, 0));

function highLevel(bytes, eci) {
	const bits = [];
	const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
	let mode = U;
	const latch = (to) => { for (const [v, n] of LATCH[mode][to]) push(v, n); mode = to; };
	if (eci) { push(0, 5); push(0, 5); push(2, 3); push(4, 4); push(8, 4); } // P/S FLG(2) "26"
	for (let i = 0; i < bytes.length;) {
		const b = bytes[i];
		if (code(mode, b) >= 0) { push(code(mode, b), WIDTH[mode]); i++; continue; }
		const modes = [U, L, M, P, D].filter((m) => code(m, b) >= 0);
		if (!modes.length) {
			// Binary shift for a run of bytes no mode can hold
			if (mode === D || mode === P) latch(U);
			let n = 0;
			while (i + n < bytes.length && n < 31 && [U, L, M, P, D].every((m) => code(m, bytes[i + n]) < 0)) n++;
			push(31, 5); push(n, 5);
			for (let k = 0; k < n; k++) push(bytes[i + k], 8);
			i += n;
			continue;
		}
		const next = bytes[i + 1];
		const target = modes.find((m) => next !== undefined && code(m, next) >= 0) ?? modes.sort((a, b2) => latchCost(mode, a) - latchCost(mode, b2))[0];
		const nextFits = next !== undefined && code(target, next) >= 0;
		if (!nextFits && target === P && mode !== P) { push(0, WIDTH[mode]); push(code(P, b), 5); }
		else if (!nextFits && target === U && (mode === L || mode === D)) { push(mode === L ? 28 : 15, WIDTH[mode]); push(code(U, b), 5); }
		else { latch(target); push(code(target, b), WIDTH[target]); }
		i++;
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
	const latin1 = [...text].every((c) => c.codePointAt(0) < 256);
	const bytes = latin1 ? [...text].map((c) => c.charCodeAt(0)) : [...new TextEncoder().encode(text)];
	const bits = highLevel(bytes, !latin1);

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
