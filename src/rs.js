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
