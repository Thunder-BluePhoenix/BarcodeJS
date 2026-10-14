// GS1 DataBar (ISO/IEC 24724): Omnidirectional and Limited.
import { fail, mod10 } from './linear.js';
import { gs1Parts } from './gs1.js';

const combins = (n, r) => {
	let a = 1;
	for (let i = 0; i < Math.min(r, n - r); i++) a = (a * (n - i)) / (i + 1);
	return n < r || r < 0 ? 0 : Math.round(a);
};

// Value -> element widths for an (n modules, `elements` elements) character, ISO/IEC 24724 Annex
function widths(val, n, elements, maxWidth, noNarrow) {
	const w = [];
	let narrowMask = 0;
	for (let bar = 0; bar < elements - 1; bar++) {
		let elm = 1, sub;
		for (narrowMask |= 1 << bar; ; elm++, narrowMask &= ~(1 << bar)) {
			sub = combins(n - elm - 1, elements - bar - 2);
			if (!noNarrow && !narrowMask && n - elm - (elements - bar - 1) >= elements - bar - 1)
				sub -= combins(n - elm - (elements - bar), elements - bar - 2);
			if (elements - bar - 1 > 1) {
				let less = 0;
				for (let mx = n - elm - (elements - bar - 2); mx > maxWidth; mx--) less += combins(n - elm - mx - 1, elements - bar - 3);
				sub -= less * (elements - 1 - bar);
			} else if (n - elm > maxWidth) sub--;
			val -= sub;
			if (val < 0) break;
		}
		val += sub;
		n -= elm;
		w.push(elm);
	}
	w.push(n);
	return w;
}

const toBits = (ws) => ws.map((x, i) => (i % 2 ? '1' : '0').repeat(x)).join(''); // starts with a space

// 13-digit item number, with or without check digit / "(01)" prefix
function gtin(value, format) {
	const v = String(value).replace(/^\(01\)/, '');
	if (/^\d{13}$/.test(v)) return v;
	if (/^\d{14}$/.test(v) && mod10(v.slice(0, 13)) === +v[13]) return v.slice(0, 13);
	fail(format, value);
}
const human = (v) => `(01)${v}${mod10(v)}`;

// ---------- Omnidirectional ----------
// [g_sum, t, odd modules, even modules, widest odd, widest even] for outside (chars 0, 2) and inside (1, 3) groups
const OUTSIDE = [[0, 1, 12, 4, 8, 1], [161, 10, 10, 6, 6, 3], [961, 34, 8, 8, 4, 5], [2015, 70, 6, 10, 3, 6], [2715, 126, 4, 12, 1, 8]];
const INSIDE = [[0, 4, 5, 10, 2, 7], [336, 20, 7, 8, 4, 5], [1036, 48, 9, 6, 6, 3], [1516, 81, 11, 4, 8, 1]];
const WEIGHTS = Array.from({ length: 32 }, (_, k) => Number(3n ** BigInt(k) % 79n)); // element weights 3^k mod 79
const FINDERS = [[3, 8, 2, 1, 1], [3, 5, 5, 1, 1], [3, 3, 7, 1, 1], [3, 1, 9, 1, 1], [2, 7, 4, 1, 1], [2, 5, 6, 1, 1], [2, 3, 8, 1, 1], [1, 5, 7, 1, 1], [1, 3, 9, 1, 1]];

export function databar(value) {
	const v = gtin(value, 'DATABAR');
	const n = BigInt(v);
	const left = Number(n / 4537077n), right = Number(n % 4537077n);
	const chars = [Math.floor(left / 1597), left % 1597, Math.floor(right / 1597), right % 1597];
	const el = chars.map((c, i) => {
		const outside = i % 2 === 0;
		const [g, t, mo, me, wo, we] = (outside ? OUTSIDE : INSIDE).findLast(([gs]) => c >= gs);
		const vOdd = outside ? Math.floor((c - g) / t) : (c - g) % t;
		const vEven = outside ? (c - g) % t : Math.floor((c - g) / t);
		const odd = widths(vOdd, mo, 4, wo, outside), even = widths(vEven, me, 4, we, !outside);
		return odd.flatMap((o, k) => [o, even[k]]); // 8 elements, odd first
	});
	let check = 0;
	for (let i = 0; i < 8; i++) for (let c = 0; c < 4; c++) check += WEIGHTS[i + 8 * c] * el[c][i];
	check %= 79;
	if (check >= 8) check++;
	if (check >= 72) check++;
	const ws = [1, 1, ...el[0], ...FINDERS[Math.floor(check / 9)], ...el[1].slice().reverse(), ...el[3],
		...FINDERS[check % 9].slice().reverse(), ...el[2].slice().reverse(), 1, 1];
	return { type: 'linear', segments: [{ bits: toBits(ws), text: human(v) }], text: human(v) };
}

// ---------- Limited ----------
// [g_sum, t_even, odd modules, even modules, widest odd, widest even]
const LIMITED = [[0, 28, 17, 9, 6, 3], [183064, 728, 13, 13, 5, 4], [820064, 6454, 9, 17, 3, 6], [1000776, 203, 15, 11, 5, 4],
	[1491021, 2408, 11, 15, 4, 5], [1979845, 1, 19, 7, 8, 1], [1996939, 16632, 7, 19, 1, 8]];
const LTD_WEIGHTS = Array.from({ length: 28 }, (_, k) => Number(3n ** BigInt(k) % 89n));
const ltdChar = (v) => {
	const [g, t, mo, me, wo, we] = LIMITED.findLast(([gs]) => v >= gs);
	const odd = widths(Math.floor((v - g) / t), mo, 7, wo, true), even = widths((v - g) % t, me, 7, we, false);
	return odd.flatMap((o, k) => [o, even[k]]);
};
function ltdParts(value) {
	const v = gtin(value, 'DATABAR-LIMITED');
	if (v[0] > '1') fail('DATABAR-LIMITED', value); // item numbers must start with 0 or 1
	const n = BigInt(v);
	const left = ltdChar(Number(n / 2013571n)), right = ltdChar(Number(n % 2013571n));
	const check = [...left, ...right].reduce((a, w, i) => a + w * LTD_WEIGHTS[i], 0) % 89;
	return { v, left, right, check };
}

// Check character patterns for checksums 0-88: 14 elements of 18 modules each
// (ISO/IEC 24724 Table 7; data cross-checked against BWIPP via bwip-js).
const LTD_CHECK =
	'1111111111331111111111123211111111111331111111111211321111111112123111111111131131111111121111321111111211123111' +
	'1111121211311111111311113111111211111132111112111112311111121112113111111212111131111113111111311112111111113211' +
	'1211111112311112111112113111121112111131111212111111311113111111113111111111112123111111111122221111111111232111' +
	'1111111221221111111112222111111111132121111111121121221111111211222111111112122121111111131121211111121111212211' +
	'1112111122211111121112212111111212112121111113111121211112111111212211121111112221111211111221211112111211212111' +
	'1212111121211113111111212111111111113113111111111132121111111112311211111211113112111211111131121111111121112311' +
	'1111112112221111111121132111111111221122111112112111221111121121122111111211221121111112122111211111131121112111' +
	'1211112111221112111121122111121211211121111111211111231111112111122211111121111321111111211211221111112112122111' +
	'1111221111221112112111112211121121111221111211211211211112112211112111121221111121111311211111211111211111112311' +
	'1121111112221111211111132111112111121122111121111212211111211113112111112112111122111121121112211111221111112211' +
	'2111111112221121111111132111211111121122112111111212211121111113112111211112111221112111121211211121121111122111' +
	'21111111221211';

export function databarLimited(value) {
	const { v, left, right, check } = ltdParts(value);
	const checkEl = [...LTD_CHECK.slice(check * 14, check * 14 + 14)].map(Number);
	const ws = [1, 1, ...left, ...checkEl, ...right, 1, 1, 5];
	return { type: 'linear', segments: [{ bits: toBits(ws), text: human(v) }], text: human(v) };
}

// ---------- Expanded ----------
// [g_sum, t_even, odd modules, even modules, widest odd, widest even] for 12-bit data characters
const EXPANDED = [[0, 4, 12, 5, 7, 2], [348, 20, 10, 7, 5, 4], [1388, 52, 8, 9, 4, 5], [2948, 104, 6, 11, 3, 6], [3988, 204, 4, 13, 1, 8]];
const EXP_WEIGHTS = Array.from({ length: 184 }, (_, k) => Number(3n ** BigInt(k) % 211n));
// Finder patterns A-F; finder value f: odd = pattern (f-1)/2, even = the same reversed
const EXP_FINDERS = [[1, 8, 4, 1, 1], [3, 6, 4, 1, 1], [3, 4, 6, 1, 1], [3, 2, 8, 1, 1], [2, 6, 5, 1, 1], [2, 2, 9, 1, 1]];
const FINDER_SEQ = [null, null, [1, 2], [1, 4, 3], [1, 6, 3, 8], [1, 10, 3, 8, 5], [1, 10, 3, 8, 7, 12], [1, 10, 3, 8, 9, 12, 11],
	[1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 10, 9], [1, 2, 3, 4, 5, 6, 7, 10, 11, 12], [1, 2, 3, 4, 5, 8, 7, 10, 9, 12, 11]];
const expChar = (v) => {
	const [g, t, mo, me, wo, we] = EXPANDED.findLast(([gs]) => v >= gs);
	const odd = widths(Math.floor((v - g) / t), mo, 4, wo, false), even = widths((v - g) % t, me, 4, we, true);
	return odd.flatMap((o, k) => [o, even[k]]);
};

// General-purpose compaction (numeric / alphanumeric / ISO 646). ponytail: greedy mode choice, always valid.
const ALNUM_SPECIAL = '*,-./';
const ISO_SPECIAL = '!"%&\'()*+,-./:;<=>?_ ';
function generalPurpose(chars, push) {
	const isDig = (c) => c === null || (c >= '0' && c <= '9');
	const isAlnum = (c) => c !== undefined && (c === null || /[0-9A-Z]/.test(c) || ALNUM_SPECIAL.includes(c));
	let mode = 'num';
	for (let i = 0; i < chars.length;) {
		const c = chars[i];
		const numAhead = (n) => chars.slice(i, i + n).length === n && chars.slice(i, i + n).every(isDig) && !(chars[i] === null && chars[i + 1] === null);
		if (mode === 'num') {
			if (isDig(c) && isDig(chars[i + 1]) && i + 1 < chars.length) {
				const d = (x) => (x === null ? 10 : +x);
				push(11 * d(c) + d(chars[i + 1]) + 8, 7); i += 2; continue;
			}
			push(0, 4); mode = 'alnum'; // latch numeric -> alphanumeric
		}
		if (mode !== 'num' && numAhead(4) && chars.slice(i).length >= 4) { push(0, 3); mode = 'num'; continue; }
		if (mode === 'alnum' && !isAlnum(c)) { push(4, 5); mode = 'iso'; } // latch to ISO 646
		if (mode === 'iso' && isAlnum(c) && chars.slice(i, i + 10).every(isAlnum)) { push(4, 5); mode = 'alnum'; }
		if (c === null) { push(15, 5); mode = 'num'; i++; continue; } // FNC1 returns to numeric
		if (c >= '0' && c <= '9') push(+c + 5, 5);
		else if (mode === 'alnum') push(c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 33 : 58 + ALNUM_SPECIAL.indexOf(c), 6);
		else if (c >= 'A' && c <= 'Z') push(c.charCodeAt(0) - 1, 7);
		else if (c >= 'a' && c <= 'z') push(c.charCodeAt(0) - 7, 7);
		else if (ISO_SPECIAL.includes(c)) push(232 + ISO_SPECIAL.indexOf(c), 8);
		else fail('DATABAR-EXPANDED', chars.join(''));
		i++;
	}
	return mode;
}

export function databarExpanded(value) {
	const text = String(value);
	const parts = gs1Parts(text, 'DATABAR-EXPANDED');
	const bits = [];
	const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
	let rest = parts, vlf;
	push(0, 1); // linkage flag: no composite component
	if (/^01\d{14}$/.test(parts[0])) {
		// Method 1: (01) GTIN compressed, check digit dropped
		const g = parts[0].slice(2);
		if (mod10(g.slice(0, 13)) !== +g[13]) fail('DATABAR-EXPANDED', value);
		push(1, 1); vlf = bits.length; push(0, 2);
		push(+g[0], 4);
		for (let i = 1; i < 13; i += 3) push(+g.slice(i, i + 3), 10);
		rest = parts.slice(1);
		if (rest[0] === null) rest = rest.slice(1);
	} else { push(0, 2); vlf = bits.length; push(0, 2); } // method 00: general purpose
	const mode = generalPurpose(rest.flatMap((p) => (p === null ? [null] : [...p])), push);

	// Pad to whole 12-bit symbol characters (at least 3 data characters)
	const need = Math.max(36, Math.ceil(bits.length / 12) * 12);
	const pad = (mode === 'num' ? '0000' : '') + '00100'.repeat(40);
	for (let i = 0; bits.length < need; i++) bits.push(+pad[i]);
	const dataChars = bits.length / 12;
	if (dataChars > 21) fail('DATABAR-EXPANDED', value);
	bits[vlf] = (dataChars + 1) % 2;
	bits[vlf + 1] = dataChars + 1 > 14 ? 1 : 0;

	const values = [];
	for (let i = 0; i < bits.length; i += 12) values.push(bits.slice(i, i + 12).reduce((a, b) => (a << 1) | b, 0));
	const seq = FINDER_SEQ[Math.ceil((dataChars + 1) / 2)];
	const chars = values.map(expChar);
	let sum = 0;
	chars.forEach((w, i) => {
		const p = Math.floor((i + 1) / 2), row = 2 * seq[p] - 3 + ((i + 1) % 2);
		w.forEach((x, j) => (sum += x * EXP_WEIGHTS[row * 8 + j]));
	});
	chars.unshift(expChar(211 * (dataChars - 3) + (sum % 211)));

	const ws = [1, 1];
	seq.forEach((f, p) => {
		const fp = EXP_FINDERS[(f - 1) >> 1];
		ws.push(...chars[2 * p], ...(f % 2 ? fp : fp.slice().reverse()));
		if (chars[2 * p + 1]) ws.push(...chars[2 * p + 1].slice().reverse());
	});
	ws.push(1, 1);
	return { type: 'linear', segments: [{ bits: toBits(ws), text }], text };
}
