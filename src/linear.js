// 1D (linear) symbologies. Each encoder returns
// { type: 'linear', segments: [{ bits, text?, guard?, textOnly?, addon? }], text }.

export const fail = (format, value) => {
	throw new Error(`Invalid ${format} value: ${JSON.stringify(value)}`);
};
const linear = (bits, text) => ({ type: 'linear', segments: [{ bits, text }], text });
const isDigits = (v, n) => new RegExp(`^\\d{${n}}$`).test(v);

// widths ('n'/'w' per element, bars first) -> modules, wide = 3
const nw = (p) => [...p].map((c, i) => (i % 2 ? '0' : '1').repeat(c === 'w' ? 3 : 1)).join('');

// ---------- EAN / UPC ----------
export const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
export const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
export const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const SETS = { L, G, R, O: L, E: G };
export const EAN13_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const EAN2_PARITY = ['LL', 'LG', 'GL', 'GG'];
const EAN5_PARITY = ['GGLLL', 'GLGLL', 'GLLGL', 'GLLLG', 'LGGLL', 'LLGGL', 'LLLGG', 'LGLGL', 'LGLLG', 'LLGLG'];
export const UPCE_PARITY = ['EEEOOO', 'EEOEOO', 'EEOOEO', 'EEOOOE', 'EOEEOO', 'EOOEEO', 'EOOOEE', 'EOEOEO', 'EOEOOE', 'EOOEOE'];
const UPCE_EXPAND = ['XX00000XXX', 'XX10000XXX', 'XX20000XXX', 'XXX00000XX', 'XXXX00000X',
	'XXXXX00005', 'XXXXX00006', 'XXXXX00007', 'XXXXX00008', 'XXXXX00009'];

const digits = (s, parity, sep = '') => [...s].map((d, i) => SETS[parity[i]][d]).join(sep);

// GS1 mod-10: weight 3 on the rightmost digit, alternating 3/1 leftwards
export const mod10 = (s) => {
	let sum = 0;
	for (let i = 0; i < s.length; i++) sum += +s[s.length - 1 - i] * (i % 2 ? 1 : 3);
	return (10 - (sum % 10)) % 10;
};

// Accepts the number with or without its check digit
const withCheck = (format, value, len) => {
	const v = String(value);
	if (isDigits(v, len - 1)) return v + mod10(v);
	if (isDigits(v, len) && mod10(v.slice(0, -1)) === +v[len - 1]) return v;
	fail(format, value);
};

const ean2Bits = (v) => '1011' + digits(v, EAN2_PARITY[+v % 4], '01');
const ean5Bits = (v) => {
	const sum = [...v].reduce((a, d, i) => a + d * (i % 2 ? 9 : 3), 0);
	return '1011' + digits(v, EAN5_PARITY[sum % 10], '01');
};

const withAddon = (segments, addon) => {
	if (addon === undefined || addon === '') return segments;
	const a = String(addon);
	if (!isDigits(a, 2) && !isDigits(a, 5)) fail('EAN add-on', addon);
	return [...segments, { bits: '0'.repeat(9) }, { bits: a.length === 2 ? ean2Bits(a) : ean5Bits(a), text: a, addon: true }];
};

export function ean13(value, { addon } = {}) {
	const v = withCheck('EAN13', value, 13);
	return { type: 'linear', text: v, segments: withAddon([
		{ bits: '0'.repeat(9), text: v[0], textOnly: true },
		{ bits: '101', guard: true },
		{ bits: digits(v.slice(1, 7), EAN13_PARITY[v[0]]), text: v.slice(1, 7) },
		{ bits: '01010', guard: true },
		{ bits: digits(v.slice(7), 'RRRRRR'), text: v.slice(7) },
		{ bits: '101', guard: true },
	], addon) };
}

export function ean8(value) {
	const v = withCheck('EAN8', value, 8);
	return { type: 'linear', text: v, segments: [
		{ bits: '101', guard: true },
		{ bits: digits(v.slice(0, 4), 'LLLL'), text: v.slice(0, 4) },
		{ bits: '01010', guard: true },
		{ bits: digits(v.slice(4), 'RRRR'), text: v.slice(4) },
		{ bits: '101', guard: true },
	] };
}

export function ean5(value) {
	const v = String(value);
	if (!isDigits(v, 5)) fail('EAN5', value);
	return linear(ean5Bits(v), v);
}

export function ean2(value) {
	const v = String(value);
	if (!isDigits(v, 2)) fail('EAN2', value);
	return linear(ean2Bits(v), v);
}

export function upca(value, { addon } = {}) {
	const v = withCheck('UPC', value, 12);
	return { type: 'linear', text: v, segments: withAddon([
		{ bits: '0'.repeat(9), text: v[0], textOnly: true },
		{ bits: '101' + L[v[0]], guard: true },
		{ bits: digits(v.slice(1, 6), 'LLLLL'), text: v.slice(1, 6) },
		{ bits: '01010', guard: true },
		{ bits: digits(v.slice(6, 11), 'RRRRR'), text: v.slice(6, 11) },
		{ bits: R[v[11]] + '101', guard: true },
		{ bits: '0'.repeat(9), text: v[11], textOnly: true },
	], addon) };
}

// UPC-E: 6 digits (number system 0) or 8 digits (number system 0/1 + 6 + check)
export function upce(value, { addon } = {}) {
	const v = String(value);
	let ns, mid;
	if (isDigits(v, 6)) { ns = '0'; mid = v; }
	else if (/^[01]\d{7}$/.test(v)) { ns = v[0]; mid = v.slice(1, 7); }
	else fail('UPCE', value);
	let k = 0;
	const upcA = ns + [...UPCE_EXPAND[mid[5]]].map((c) => (c === 'X' ? mid[k++] : c)).join('');
	const check = mod10(upcA);
	if (v.length === 8 && +v[7] !== check) fail('UPCE', value);
	const parity = ns === '0' ? UPCE_PARITY[check] : UPCE_PARITY[check].replace(/[EO]/g, (c) => (c === 'E' ? 'O' : 'E'));
	return { type: 'linear', text: ns + mid + check, segments: withAddon([
		{ bits: '0'.repeat(9), text: ns, textOnly: true },
		{ bits: '101', guard: true },
		{ bits: digits(mid, parity), text: mid },
		{ bits: '010101', guard: true },
		{ bits: '0'.repeat(9), text: String(check), textOnly: true },
	], addon) };
}

// ISBN-10/13 -> EAN-13 (Bookland)
export function isbn(value, opts) {
	const v = String(value).replace(/[\s-]/g, '').toUpperCase();
	if (/^\d{9}[\dX]$/.test(v)) {
		const sum = [...v].reduce((a, c, i) => a + (c === 'X' ? 10 : +c) * (10 - i), 0);
		if (sum % 11) fail('ISBN', value);
		return { ...ean13('978' + v.slice(0, 9), opts), text: v };
	}
	if (/^97[89]\d{10}$/.test(v)) return ean13(v, opts);
	fail('ISBN', value);
}

// ISSN -> EAN-13 with prefix 977
export function issn(value, opts) {
	const v = String(value).replace(/[\s-]/g, '').toUpperCase();
	if (!/^\d{7}[\dX]$/.test(v)) fail('ISSN', value);
	const sum = [...v].reduce((a, c, i) => a + (c === 'X' ? 10 : +c) * (8 - i), 0);
	if (sum % 11) fail('ISSN', value);
	return ean13('977' + v.slice(0, 7) + '00', opts);
}

// ---------- Code 39 / Code 93 ----------
export const C39_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';
export const C39 = [20957, 29783, 23639, 30485, 20951, 29813, 23669, 20855, 29789, 23645, 29975, 23831, 30533, 22295,
	30149, 24005, 21623, 29981, 23837, 22301, 30023, 23879, 30545, 22343, 30161, 24017, 21959, 30065, 23921, 22385,
	29015, 18263, 29141, 17879, 29045, 18293, 17783, 29021, 18269, 17477, 17489, 17681, 20753, 35770];
const c39 = (c) => C39[C39_CHARS.indexOf(c)].toString(2);

// Full ASCII escapes shared by Code 39 and Code 93 ('$' '%' '/' '+' shift characters)
const FULL_ASCII = (() => {
	const m = {};
	for (let i = 1; i <= 26; i++) m[String.fromCharCode(i)] = '$' + String.fromCharCode(64 + i);
	'ABCDE'.split('').forEach((c, i) => (m[String.fromCharCode(27 + i)] = '%' + c));
	'!"#$%&\'()*+,'.split('').forEach((c, i) => (m[c] = '/' + String.fromCharCode(65 + i)));
	m['/'] = '/O'; m[':'] = '/Z';
	';<=>?'.split('').forEach((c, i) => (m[c] = '%' + String.fromCharCode(70 + i)));
	'[\\]^_'.split('').forEach((c, i) => (m[c] = '%' + String.fromCharCode(75 + i)));
	'{|}~\x7f'.split('').forEach((c, i) => (m[c] = '%' + String.fromCharCode(80 + i)));
	for (let i = 0; i < 26; i++) m[String.fromCharCode(97 + i)] = '+' + String.fromCharCode(65 + i);
	Object.assign(m, { '\0': '%U', '@': '%V', '`': '%W', '-': '-', '.': '.', ' ': ' ' });
	return m;
})();

export function code39(value, { checksum = false, fullASCII = false } = {}) {
	let v = String(value);
	if (fullASCII) {
		if (!/^[\x00-\x7f]+$/.test(v)) fail('CODE39', value);
		v = [...v].map((c) => (/[0-9A-Z]/.test(c) ? c : FULL_ASCII[c])).join('');
	} else {
		v = v.toUpperCase();
		if (!/^[0-9A-Z\-. $/+%]+$/.test(v)) fail('CODE39', value);
	}
	if (checksum) v += C39_CHARS[[...v].reduce((a, c) => a + C39_CHARS.indexOf(c), 0) % 43];
	return linear(c39('*') + [...v].map((c) => c39(c) + '0').join('') + c39('*'), String(value));
}

const C93_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%'; // + 4 shift symbols at 43-46
const C93 = ['100010100', '101001000', '101000100', '101000010', '100101000', '100100100', '100100010', '101010000',
	'100010010', '100001010', '110101000', '110100100', '110100010', '110010100', '110010010', '110001010',
	'101101000', '101100100', '101100010', '100110100', '100011010', '101011000', '101001100', '101000110',
	'100101100', '100010110', '110110100', '110110010', '110101100', '110100110', '110010110', '110011010',
	'101101100', '101100110', '100110110', '100111010', '100101110', '111010100', '111010010', '111001010',
	'101101110', '101110110', '110101110', '100100110', '111011010', '111010110', '100110010', '101011110'];
const C93_SHIFT = { $: 43, '%': 44, '/': 45, '+': 46 };

export function code93(value, { fullASCII = false } = {}) {
	const v = String(value);
	if (!(fullASCII ? /^[\x00-\x7f]+$/ : /^[0-9A-Z\-. $/+%]+$/).test(v)) fail('CODE93', value);
	const vals = [];
	for (const c of v) {
		const native = C93_CHARS.indexOf(c);
		if (native >= 0) vals.push(native);
		else { const [s, ch] = FULL_ASCII[c]; vals.push(C93_SHIFT[s], C93_CHARS.indexOf(ch)); }
	}
	const check = (max) => vals.slice().reverse().reduce((a, x, i) => a + x * ((i % max) + 1), 0) % 47;
	vals.push(check(20));
	vals.push(check(15));
	return linear(C93[47] + vals.map((x) => C93[x]).join('') + C93[47] + '1', v);
}

// ---------- Code 11 ----------
const C11 = ['nnnnw', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'wnnnn', 'nnwnn'].map(nw);
const C11_START = nw('nnwwn');

// C check digit always; K check digit added for 10+ data characters (common practice)
export function code11(value) {
	const v = String(value);
	if (!/^[\d-]+$/.test(v)) fail('CODE11', value);
	const val = (c) => (c === '-' ? 10 : +c);
	const ch = (n) => (n === 10 ? '-' : String(n));
	const check = (s, max) => ch([...s].reverse().reduce((a, c, i) => a + val(c) * ((i % max) + 1), 0) % 11);
	let full = v + check(v, 10);
	if (v.length >= 10) full += check(full, 9);
	return linear(C11_START + '0' + [...full].map((c) => C11[val(c)] + '0').join('') + C11_START, v);
}

// ---------- ITF ----------
export const ITF_PAIRS = ['00110', '10001', '01001', '11000', '00101', '10100', '01100', '00011', '10010', '01010'];

export function itf(value) {
	const v = String(value);
	if (!/^(\d{2})+$/.test(v)) fail('ITF', value);
	let bits = '1010';
	for (let i = 0; i < v.length; i += 2) {
		const a = ITF_PAIRS[v[i]], b = ITF_PAIRS[v[i + 1]];
		for (let k = 0; k < 5; k++) bits += (a[k] === '1' ? '111' : '1') + (b[k] === '1' ? '000' : '0');
	}
	return linear(bits + '11101', v);
}

export const itf14 = (value) => itf(withCheck('ITF14', value, 14));

// ---------- MSI ----------
const msiMod10 = (s) => {
	let sum = 0;
	for (let i = 0; i < s.length; i++) {
		const n = +s[i];
		sum += (i + s.length) % 2 === 0 ? n : ((n * 2) % 10) + Math.floor((n * 2) / 10);
	}
	return (10 - (sum % 10)) % 10;
};
const msiMod11 = (s) => {
	let sum = 0;
	for (let i = 0; i < s.length; i++) sum += (2 + (i % 6)) * +s[s.length - 1 - i];
	return (11 - (sum % 11)) % 11;
};

// checksum: '' | 'mod10' | 'mod11' | 'mod1010' | 'mod1110'
export function msi(value, { checksum = '' } = {}) {
	let v = String(value);
	if (!/^\d+$/.test(v)) fail('MSI', value);
	for (const m of checksum.replace('mod', '').match(/1[01]/g) || []) v += m === '10' ? msiMod10(v) : msiMod11(v);
	return linear('110' + [...v].map((d) => (+d).toString(2).padStart(4, '0').replace(/./g, (b) => (b === '0' ? '100' : '110'))).join('') + '1001', v);
}

// ---------- Codabar ----------
// Wide:narrow 3:1 (spec asks 2.25-3; JsBarcode used 2:1, which strict readers reject)
const CODABAR_CHARS = '0123456789-$:/.+ABCD';
const CODABAR = ['nnnnnww', 'nnnnwwn', 'nnnwnnw', 'wwnnnnn', 'nnwnnwn', 'wnnnnwn', 'nwnnnnw', 'nwnnwnn', 'nwwnnnn', 'wnnwnnn',
	'nnnwwnn', 'nnwwnnn', 'wnnnwnw', 'wnwnnnw', 'wnwnwnn', 'nnwnwnw', 'nnwwnwn', 'nwnwnnw', 'nnnwnww', 'nnnwwwn'].map(nw);

export function codabar(value) {
	let v = String(value).toUpperCase();
	if (/^[0-9\-$:./+]+$/.test(v)) v = 'A' + v + 'A';
	if (!/^[A-D][0-9\-$:./+]+[A-D]$/.test(v)) fail('CODABAR', value);
	return linear([...v].map((c) => CODABAR[CODABAR_CHARS.indexOf(c)]).join('0'), v.slice(1, -1));
}

// ---------- Pharmacode ----------
export function pharmacode(value) {
	let z = Number(value);
	if (!Number.isInteger(z) || z < 3 || z > 131070) fail('PHARMACODE', value);
	let bits = '';
	while (z) {
		if (z % 2) { bits = '100' + bits; z = (z - 1) / 2; }
		else { bits = '11100' + bits; z = (z - 2) / 2; }
	}
	return linear(bits.slice(0, -2), String(value));
}
