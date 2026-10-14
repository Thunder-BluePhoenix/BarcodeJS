// Code 128 with optimal (shortest) code set selection, Latin-1 via FNC4, and GS1-128.
import { fail } from './linear.js';
import { gs1Parts } from './gs1.js';

const BARS = [
	212222, 222122, 222221, 121223, 121322, 131222, 122213, 122312, 132212, 221213, 221312, 231212, 112232, 122132,
	122231, 113222, 123122, 123221, 223211, 221132, 221231, 213212, 223112, 312131, 311222, 321122, 321221, 312212,
	322112, 322211, 212123, 212321, 232121, 111323, 131123, 131321, 112313, 132113, 132311, 211313, 231113, 231311,
	112133, 112331, 132131, 113123, 113321, 133121, 313121, 211331, 231131, 213113, 213311, 213131, 311123, 311321,
	331121, 312113, 312311, 332111, 314111, 221411, 431111, 111224, 111422, 121124, 121421, 141122, 141221, 112214,
	112412, 122114, 122411, 142112, 142211, 241211, 221114, 413111, 241112, 134111, 111242, 121142, 121241, 114212,
	124112, 124211, 411212, 421112, 421211, 212141, 214121, 412121, 111143, 111341, 131141, 114113, 114311, 411113,
	411311, 113141, 114131, 311141, 411131, 211412, 211214, 211232,
].map((w) => [...String(w)].map((n, i) => (i % 2 ? '0' : '1').repeat(+n)).join(''));
const STOP = '1100011101011';

const A = 0, B = 1, C = 2;
const FNC1 = -1;
const SHIFT = 98, FNC4 = { [A]: 101, [B]: 100 }, LATCH = { [A]: 101, [B]: 100, [C]: 99 };
const isDigit = (t) => t >= 48 && t <= 57;
const inSet = (t, s) => s === A ? (t & 127) < 96 : (t & 127) >= 32;
const valueIn = (t, s) => { const low = t & 127; return s === A && low < 32 ? low + 64 : low - 32; };

// Dynamic programming over (position, current set) -> fewest symbols.
function encodeTokens(tokens) {
	const n = tokens.length;
	const cost = Array.from({ length: n + 1 }, () => [0, 0, 0]);
	const how = Array.from({ length: n }, () => [null, null, null]);
	for (let i = n - 1; i >= 0; i--) {
		const t = tokens[i], stay = [Infinity, Infinity, Infinity], act = [null, null, null];
		const offer = (s, c, a) => { if (c < stay[s]) { stay[s] = c; act[s] = a; } };
		for (const s of [A, B]) {
			if (t === FNC1) offer(s, 1 + cost[i + 1][s], 'fnc1');
			else {
				const ext = t > 127 ? 1 : 0;
				if (inSet(t, s)) offer(s, 1 + ext + cost[i + 1][s], 'char');
				else offer(s, 2 + ext + cost[i + 1][s], 'shift');
			}
		}
		if (t === FNC1) offer(C, 1 + cost[i + 1][C], 'fnc1');
		else if (isDigit(t) && isDigit(tokens[i + 1])) offer(C, 1 + cost[i + 2][C], 'pair');
		for (const s of [A, B, C]) {
			cost[i][s] = stay[s]; how[i][s] = act[s];
			for (const s2 of [A, B, C])
				if (s2 !== s && 1 + stay[s2] < cost[i][s]) { cost[i][s] = 1 + stay[s2]; how[i][s] = s2; }
		}
	}
	let set = [B, A, C].reduce((best, s) => (cost[0][s] < cost[0][best] ? s : best), B);
	const vals = [103 + set];
	for (let i = 0; i < n;) {
		let a = how[i][set];
		if (typeof a === 'number') { vals.push(LATCH[a]); set = a; a = how[i][set]; }
		const t = tokens[i];
		if (a === 'fnc1') { vals.push(102); i++; }
		else if (a === 'pair') { vals.push((t - 48) * 10 + tokens[i + 1] - 48); i += 2; }
		else {
			if (t > 127) vals.push(FNC4[set]);
			if (a === 'shift') vals.push(SHIFT);
			vals.push(valueIn(t, a === 'shift' ? 1 - set : set)); i++;
		}
	}
	vals.push(vals.reduce((sum, v, k) => sum + v * (k || 1), 0) % 103);
	return vals.map((v) => BARS[v]).join('') + STOP;
}

export function code128(value) {
	const v = String(value);
	const tokens = [...v].map((c) => c.charCodeAt(0));
	if (!v.length || tokens.some((t) => t > 255)) fail('CODE128', value);
	return { type: 'linear', segments: [{ bits: encodeTokens(tokens), text: v.replace(/[\x00-\x1f\x7f]/g, '') }], text: v };
}

// Input in human-readable form: "(01)09501101530003(17)250101(10)ABC123"
export function gs1128(value) {
	const tokens = [FNC1];
	for (const p of gs1Parts(value, 'GS1-128')) tokens.push(...(p === null ? [FNC1] : [...p].map((c) => c.charCodeAt(0))));
	return { type: 'linear', segments: [{ bits: encodeTokens(tokens), text: String(value) }], text: String(value) };
}
