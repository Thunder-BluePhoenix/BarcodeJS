// Reed-Solomon error correction over GF(2^m).
// QR: GF(256)/0x11D, roots from a^0. Data Matrix: GF(256)/0x12D, roots from a^1.
// Aztec: GF(16)/0x13, GF(64)/0x43, GF(256)/0x12D, GF(1024)/0x409, GF(4096)/0x1069, roots from a^1.

export function gfMul(x, y, poly, bits = 8) {
	let z = 0;
	for (let i = bits - 1; i >= 0; i--) {
		z = (z << 1) ^ ((z >>> (bits - 1)) & 1) * poly;
		z ^= ((y >>> i) & 1) * x;
	}
	return z;
}

function generator(degree, poly, firstRoot, bits) {
	const g = new Array(degree).fill(0);
	g[degree - 1] = 1;
	let root = firstRoot;
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < degree; j++) {
			g[j] = gfMul(g[j], root, poly, bits);
			if (j + 1 < degree) g[j] ^= g[j + 1];
		}
		root = gfMul(root, 2, poly, bits);
	}
	return g;
}

// Returns the `degree` error-correction words for `data`.
export function rsEncode(data, degree, poly, firstRoot, bits = 8) {
	const g = generator(degree, poly, firstRoot, bits);
	const r = new Array(degree).fill(0);
	for (const b of data) {
		const f = b ^ r.shift();
		r.push(0);
		for (let i = 0; i < degree; i++) r[i] ^= gfMul(g[i], f, poly, bits);
	}
	return r;
}

// ---------- Decoding (GF(256)) ----------
// Corrects `data` (codewords followed by `nsym` check words) in place; returns the number of corrected
// errors or throws. fcr = exponent of the first generator root (QR 0, Data Matrix / Aztec-8 1).
const tables = {};
function gf(poly) {
	if (tables[poly]) return tables[poly];
	const exp = new Uint8Array(512), log = new Uint8Array(256);
	for (let i = 0, x = 1; i < 255; i++) { exp[i] = x; log[x] = i; x = gfMul(x, 2, poly); }
	for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
	return (tables[poly] = { exp, log });
}

export function rsDecode(data, nsym, poly = 0x11d, fcr = 0) {
	const { exp, log } = gf(poly);
	const mul = (a, b) => (a && b ? exp[log[a] + log[b]] : 0);
	const div = (a, b) => (a ? exp[(log[a] + 255 - log[b]) % 255] : 0);
	const n = data.length;
	const evalAt = (p, x) => p.reduce((acc, c) => mul(acc, x) ^ c, 0); // p[0] = highest degree
	const S = Array.from({ length: nsym }, (_, j) => evalAt(data, exp[(j + fcr) % 255]));
	if (S.every((s) => !s)) return 0;

	// Berlekamp-Massey: error locator C (ascending powers, C[0] = 1)
	let C = [1], B = [1], L = 0, m = 1, b = 1;
	for (let k = 0; k < nsym; k++) {
		let d = S[k];
		for (let i = 1; i <= L; i++) d ^= mul(C[i] || 0, S[k - i]);
		if (!d) { m++; continue; }
		const coef = div(d, b), T = C.slice();
		const need = B.length + m;
		while (C.length < need) C.push(0);
		B.forEach((v, i) => (C[i + m] ^= mul(coef, v)));
		if (2 * L <= k) { L = k + 1 - L; B = T; b = d; m = 1; } else m++;
	}
	if (2 * L > nsym) throw new Error('Too many errors');

	// Chien search over positions (power p <-> index n-1-p), Forney for values
	const lam = (x) => C.reduce((acc, c, i) => acc ^ mul(c, exp[(log[x] * i) % 255] ?? 0), 0);
	const omega = []; // S(x) * C(x) mod x^nsym
	for (let i = 0; i < nsym; i++) { let v = 0; for (let j = 0; j <= i; j++) v ^= mul(S[j], C[i - j] || 0); omega.push(v); }
	const ascEval = (p, x) => { let acc = 0, xp = 1; for (const c of p) { acc ^= mul(c, xp); xp = mul(xp, x); } return acc; };
	let found = 0;
	for (let p = 0; p < n; p++) {
		const xinv = exp[(255 - p) % 255];
		if (lam(xinv)) continue;
		const X = exp[p];
		let dl = 0, xp = 1; // formal derivative: odd terms
		for (let i = 1; i < C.length; i += 2) { dl ^= mul(C[i], xp); xp = mul(xp, mul(xinv, xinv)); }
		const e = mul(div(ascEval(omega, xinv), dl), exp[(log[X] * (1 - fcr) + 255 * 4) % 255]);
		data[n - 1 - p] ^= e;
		found++;
	}
	if (found !== L) throw new Error('Uncorrectable');
	return found;
}
