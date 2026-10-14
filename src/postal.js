// 4-state postal barcodes. Symbol: { type: 'fourstate', bars: 'FADT...' }
// F = full, A = ascender, D = descender, T = tracker.
import { fail } from './linear.js';
import { rsEncode } from './rs.js';

const fourstate = (bars, text) => ({ type: 'fourstate', bars, text });
// Two booleans (has ascender, has descender) -> state
const state = (up, down) => (up ? (down ? 'F' : 'A') : down ? 'D' : 'T');

// ---------- Royal Mail 4-State Customer Code (RM4SCC) ----------
const RM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RM_HALF = ['0011', '0101', '0110', '1001', '1010', '1100']; // value 1-6 -> which of 4 bars are set

export function royalmail(value) {
	const v = String(value).toUpperCase().replace(/\s/g, '');
	if (!/^[0-9A-Z]+$/.test(v)) fail('ROYALMAIL', value);
	let rows = 0, cols = 0;
	const char = (i) => {
		const top = RM_HALF[Math.floor(i / 6)], bottom = RM_HALF[i % 6];
		return [0, 1, 2, 3].map((k) => state(top[k] === '1', bottom[k] === '1')).join('');
	};
	let bars = 'A';
	for (const c of v) {
		const i = RM_CHARS.indexOf(c);
		rows += Math.floor(i / 6) + 1;
		cols += (i % 6) + 1;
		bars += char(i);
	}
	const r = rows % 6 || 6, k = cols % 6 || 6;
	return fourstate(bars + char((r - 1) * 6 + (k - 1)) + 'F', v);
}

// ---------- USPS Intelligent Mail barcode (IMb, USPS-B-3200) ----------
function nOf13(n, len) {
	const t = new Array(len);
	let lo = 0, hi = len - 1;
	for (let c = 0; c < 8192; c++) {
		let pop = 0;
		for (let x = c; x; x >>= 1) pop += x & 1;
		if (pop !== n) continue;
		let rev = 0;
		for (let i = 0; i < 13; i++) rev |= ((c >> i) & 1) << (12 - i);
		if (rev < c) continue;
		if (rev === c) t[hi--] = c;
		else { t[lo++] = c; t[lo++] = rev; }
	}
	return t;
}
let tables;

// 13-bit characters A-J for a 20-digit tracking code + 0/5/9/11-digit routing code
export function imbChars(tracking, routing) {
	tables ??= [nOf13(5, 1287), nOf13(2, 78)];
	let v = routing.length === 0 ? 0n : BigInt(routing) + [0n, 0n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 100001n, 0n, 1000100001n][routing.length];
	v = (v * 10n + BigInt(tracking[0])) * 5n + BigInt(tracking[1]);
	for (const d of tracking.slice(2)) v = v * 10n + BigInt(d);

	// CRC-11 over the 102-bit value as 13 bytes (top 2 bits of the first byte skipped)
	const bytes = Array.from({ length: 13 }, (_, i) => Number((v >> BigInt(8 * (12 - i))) & 255n));
	let fcs = 0x7ff;
	const feed = (data, from) => {
		for (let bit = from; bit < 8; bit++, data <<= 1) {
			fcs = (fcs ^ data) & 0x400 ? (fcs << 1) ^ 0xf35 : fcs << 1;
			fcs &= 0x7ff;
		}
	};
	feed(bytes[0] << 5, 2);
	for (let i = 1; i < 13; i++) feed(bytes[i] << 3, 0);

	const cw = new Array(10);
	cw[9] = Number(v % 636n); v /= 636n;
	for (let i = 8; i >= 1; i--) { cw[i] = Number(v % 1365n); v /= 1365n; }
	cw[0] = Number(v);
	cw[9] *= 2;
	if ((fcs >> 10) & 1) cw[0] += 659;
	return cw.map((c, i) => {
		const ch = c < 1287 ? tables[0][c] : tables[1][c - 1287];
		return (fcs >> i) & 1 ? ~ch & 0x1fff : ch;
	});
}

// Bar -> (character, bit) for descender and ascender, USPS-B-3200 Table 22; char code 48 + 13 * character + bit
const IMB_DESC = 'G±v¡1Oh`|¯]3>d£­PrIyj[~6KzoªZ7@U8f{¨qMb uB¦k<Sa';
const IMB_ASC = 'g0RX}E°¢AV2mQ®s_4=cn¬T5xF«lY¤?Je\\©wW9NDi:§C;Lp^H¥t';

// value: 20-digit tracking code followed by a 0, 5, 9 or 11-digit routing (ZIP) code; spaces and dashes ignored
export function imb(value) {
	const v = String(value).replace(/[\s-]/g, '');
	if (!/^\d{20}(\d{5}|\d{9}|\d{11})?$/.test(v) || v[1] > '4') fail('IMB', value);
	const chars = imbChars(v.slice(0, 20), v.slice(20));
	const bit = (code, k) => { const n = code.charCodeAt(k) - 48; return (chars[Math.floor(n / 13)] >> (n % 13)) & 1; };
	let bars = '';
	for (let k = 0; k < 65; k++) bars += state(bit(IMB_ASC, k), bit(IMB_DESC, k));
	return fourstate(bars, v);
}

// ---------- Australia Post 4-State Customer Barcode ----------
// Bar values 0-3 = F, A, D, T. N table for digits, C table for customer information characters.
const AUS_N = ['00', '01', '02', '10', '11', '12', '20', '21', '22', '30'];
const AUS_C_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 #';
const AUS_C = ('000 001 002 010 011 012 020 021 022 100 101 102 110 111 112 120 121 122 200 201 202 210 211 212 220 221 ' +
	'023 030 031 032 033 103 113 123 130 131 132 133 203 213 223 230 231 232 233 303 313 323 330 331 332 333 ' +
	'222 300 301 302 310 311 312 320 321 322 003 013').split(' ');
const AUS_LEN = { 11: 37, 45: 37, 87: 37, 92: 37, 59: 52, 62: 67 }; // format control code -> bars

// value: 2-digit FCC + 8-digit DPID + customer information (FCC 59: up to 5 chars, 62: up to 10)
export function auspost(value) {
	const v = String(value);
	const fcc = v.slice(0, 2), total = AUS_LEN[fcc];
	if (!total || !/^\d{10}/.test(v)) fail('AUSPOST', value);
	let data = [...v.slice(0, 10)].map((d) => AUS_N[d]).join('');
	for (const c of v.slice(10)) {
		const i = AUS_C_CHARS.indexOf(c);
		if (i < 0) fail('AUSPOST', value);
		data += AUS_C[i];
	}
	if (data.length > total - 16) fail('AUSPOST', value);
	data = data.padEnd(total - 16, '3');
	const symbols = data.match(/.../g).map((t) => parseInt(t, 4));
	const parity = rsEncode(symbols, 4, 0x43, 2, 6).map((p) => p.toString(4).padStart(3, '0')).join('');
	return fourstate(('13' + data + parity + '13').replace(/./g, (b) => 'FADT'[b]), v);
}
