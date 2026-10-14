// PDF417 (ISO/IEC 15438): text / byte / numeric compaction, GF(929) error correction, UTF-8 via ECI.
import { patterns } from './pdf417-table.js';
import { charsetBytes } from './charset.js';

const START = '11111111010101000', STOP = '111111101000101001';
const LATCH_TEXT = 900, LATCH_BYTE = 901, LATCH_BYTE6 = 924, LATCH_NUM = 902;

// Text compaction sub-modes
const MIXED = '0123456789&\r\t,:#-.$/+%*=^';
const PUNCT = ';<>@[\\]_`~!\r\t,:\n-.$/"|*()?{}\'';
const ALPHA = 0, LOWER = 1, MIX = 2, PUN = 3;
const isUpper = (c) => c === ' ' || (c >= 'A' && c <= 'Z');
const isLower = (c) => c === ' ' || (c >= 'a' && c <= 'z');
const isMixed = (c) => MIXED.includes(c) || c === ' ';
const isPunct = (c) => PUNCT.includes(c);
const isText = (b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126);

function textCompact(s) {
	const v = [];
	let mode = ALPHA;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (mode === ALPHA) {
			if (isUpper(c)) v.push(c === ' ' ? 26 : c.charCodeAt(0) - 65);
			else if (isLower(c)) { v.push(27); mode = LOWER; i--; }
			else if (isMixed(c)) { v.push(28); mode = MIX; i--; }
			else v.push(29, PUNCT.indexOf(c));
		} else if (mode === LOWER) {
			if (isLower(c)) v.push(c === ' ' ? 26 : c.charCodeAt(0) - 97);
			else if (isUpper(c)) v.push(27, c.charCodeAt(0) - 65);
			else if (isMixed(c)) { v.push(28); mode = MIX; i--; }
			else v.push(29, PUNCT.indexOf(c));
		} else if (mode === MIX) {
			if (isMixed(c)) v.push(c === ' ' ? 26 : MIXED.indexOf(c));
			else if (isUpper(c)) { v.push(28); mode = ALPHA; i--; }
			else if (isLower(c)) { v.push(27); mode = LOWER; i--; }
			else if (i + 1 < s.length && isPunct(s[i + 1])) { v.push(25); mode = PUN; i--; }
			else v.push(29, PUNCT.indexOf(c));
		} else if (isPunct(c)) v.push(PUNCT.indexOf(c));
		else { v.push(29); mode = ALPHA; i--; }
	}
	if (v.length % 2) v.push(29);
	const cw = [];
	for (let i = 0; i < v.length; i += 2) cw.push(v[i] * 30 + v[i + 1]);
	return cw;
}

function byteCompact(bytes) {
	const cw = [bytes.length % 6 === 0 ? LATCH_BYTE6 : LATCH_BYTE];
	let i = 0;
	for (; i + 6 <= bytes.length; i += 6) {
		let n = 0;
		for (let k = 0; k < 6; k++) n = n * 256 + bytes[i + k]; // < 2^48, exact in a double
		const g = [];
		for (let k = 0; k < 5; k++) { g.unshift(n % 900); n = Math.floor(n / 900); }
		cw.push(...g);
	}
	for (; i < bytes.length; i++) cw.push(bytes[i]);
	return cw;
}

function numericCompact(digits) {
	const cw = [LATCH_NUM];
	for (let i = 0; i < digits.length; i += 44) {
		let n = BigInt('1' + digits.slice(i, i + 44));
		const g = [];
		while (n > 0n) { g.unshift(Number(n % 900n)); n /= 900n; }
		cw.push(...g);
	}
	return cw;
}

// zxing-style mode selection: numeric for 13+ digits, text for 5+ text characters, bytes otherwise
function highLevel(bytes) {
	const cw = [];
	let mode = 'text';
	const str = (a, b) => String.fromCharCode(...bytes.slice(a, b));
	const digitRun = (p) => { let n = 0; while (p + n < bytes.length && bytes[p + n] >= 48 && bytes[p + n] <= 57) n++; return n; };
	for (let p = 0; p < bytes.length;) {
		const d = digitRun(p);
		if (d >= 13) { cw.push(...numericCompact(str(p, p + d))); mode = 'num'; p += d; continue; }
		let t = 0;
		while (p + t < bytes.length && isText(bytes[p + t]) && digitRun(p + t) < 13) t++;
		if (t >= 5 || (t > 0 && p + t === bytes.length)) {
			if (mode !== 'text') cw.push(LATCH_TEXT);
			cw.push(...textCompact(str(p, p + t))); mode = 'text'; p += t; continue;
		}
		let b = 0;
		while (p + b < bytes.length && !(isText(bytes[p + b]) && (digitRun(p + b) >= 13 || textRunAt(bytes, p + b) >= 5))) b++;
		b = Math.max(b, 1);
		cw.push(...byteCompact(bytes.slice(p, p + b))); mode = 'byte'; p += b;
	}
	return cw;
}
function textRunAt(bytes, p) { let n = 0; while (p + n < bytes.length && isText(bytes[p + n])) n++; return n; }

// Reed-Solomon over GF(929), generator roots 3^1..3^k
function ecc(data, k) {
	let g = [1];
	for (let i = 1, r = 3; i <= k; i++, r = (r * 3) % 929) {
		const next = new Array(g.length + 1).fill(0);
		g.forEach((c, j) => { next[j + 1] = (next[j + 1] + c) % 929; next[j] = (next[j] + c * (929 - r)) % 929; });
		g = next;
	}
	const e = new Array(k).fill(0);
	for (const d of data) {
		const t = (d + e[k - 1]) % 929;
		for (let j = k - 1; j > 0; j--) e[j] = (e[j - 1] + 929 - ((t * g[j]) % 929)) % 929;
		e[0] = (929 - ((t * g[0]) % 929)) % 929;
	}
	return e.map((x) => (x ? 929 - x : 0)).reverse();
}

export function pdf417(value, { ecLevel, columns, rowHeight = 3 } = {}) {
	const text = String(value);
	const { bytes, eci } = charsetBytes(text);
	if (!bytes.length) throw new Error('PDF417 value is empty');
	const data = [...(eci ? [927, eci] : []), ...highLevel(bytes)];

	const n = data.length + 1; // + length descriptor
	let ec = ecLevel ?? (n <= 40 ? 2 : n <= 160 ? 3 : n <= 320 ? 4 : n <= 863 ? 5 : 6);
	while (ec > 0 && n + 2 ** (ec + 1) > 928) ec--;
	const k = 2 ** (ec + 1);
	if (n + k > 928) throw new Error('PDF417 data too long');

	// Columns: as requested, else the layout closest to a 3:1 aspect ratio
	let best;
	for (let c = columns || 1; c <= (columns || 30); c++) {
		const r = Math.max(3, Math.ceil((n + k) / c));
		if (r > 90) continue;
		const score = Math.abs((17 * c + 69) / (r * rowHeight) - 3);
		if (!best || score < best.score) best = { c, r, score };
	}
	if (!best) throw new Error(`PDF417 data does not fit in ${columns} columns`);
	const { c: cols, r: rows } = best;

	const nData = rows * cols - k;
	const cws = [nData, ...data];
	while (cws.length < nData) cws.push(LATCH_TEXT); // pad
	cws.push(...ecc(cws, k));

	const table = patterns();
	const bar = (cluster, cw) => table[cluster * 929 + cw].toString(2);
	const width = 17 * cols + 69;
	const mod = new Uint8Array(width * rows * rowHeight);
	for (let r = 0; r < rows; r++) {
		const cl = r % 3, base = 30 * Math.floor(r / 3);
		const left = base + [Math.floor((rows - 1) / 3), ec * 3 + ((rows - 1) % 3), cols - 1][cl];
		const right = base + [cols - 1, Math.floor((rows - 1) / 3), ec * 3 + ((rows - 1) % 3)][cl];
		let row = START + bar(cl, left);
		for (let c = 0; c < cols; c++) row += bar(cl, cws[r * cols + c]);
		row += bar(cl, right) + STOP;
		for (let y = 0; y < rowHeight; y++)
			for (let x = 0; x < width; x++) mod[(r * rowHeight + y) * width + x] = row[x] === '1' ? 1 : 0;
	}
	return { type: 'matrix', width, height: rows * rowHeight, modules: mod, quiet: 2, text, columns: cols, rows, ecLevel: ec };
}
