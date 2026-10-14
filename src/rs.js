// Reed-Solomon error correction over GF(256), shared by QR (poly 0x11D, roots from a^0)
// and Data Matrix (poly 0x12D, roots from a^1).

export function gfMul(x, y, poly) {
	let z = 0;
	for (let i = 7; i >= 0; i--) {
		z = (z << 1) ^ ((z >>> 7) * poly);
		z ^= ((y >>> i) & 1) * x;
	}
	return z;
}

function generator(degree, poly, firstRoot) {
	const g = new Array(degree).fill(0);
	g[degree - 1] = 1;
	let root = firstRoot;
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < degree; j++) {
			g[j] = gfMul(g[j], root, poly);
			if (j + 1 < degree) g[j] ^= g[j + 1];
		}
		root = gfMul(root, 2, poly);
	}
	return g;
}

// Returns the `degree` error-correction codewords for `data`.
export function rsEncode(data, degree, poly, firstRoot) {
	const g = generator(degree, poly, firstRoot);
	const r = new Array(degree).fill(0);
	for (const b of data) {
		const f = b ^ r.shift();
		r.push(0);
		for (let i = 0; i < degree; i++) r[i] ^= gfMul(g[i], f, poly);
	}
	return r;
}
