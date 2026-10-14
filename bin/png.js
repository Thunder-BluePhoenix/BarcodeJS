// Minimal PNG reader for the CLI: any colour type / bit depth, non-interlaced -> 8-bit grayscale.
import { inflateSync } from 'node:zlib';

export function readPNG(buf) {
	if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG file');
	let pos = 8, w, h, depth, type, interlace, palette, trns;
	const idat = [];
	while (pos < buf.length) {
		const len = buf.readUInt32BE(pos), name = buf.toString('latin1', pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
		if (name === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
		else if (name === 'PLTE') palette = body;
		else if (name === 'tRNS') trns = body;
		else if (name === 'IDAT') idat.push(body);
		pos += 12 + len;
	}
	if (interlace) throw new Error('interlaced PNGs are not supported');
	const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
	const bpp = Math.max(1, (channels * depth) >> 3), stride = Math.ceil((w * channels * depth) / 8);
	const raw = inflateSync(Buffer.concat(idat)), img = Buffer.alloc(stride * h);
	for (let y = 0; y < h; y++) {
		const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = img.subarray(y * stride, (y + 1) * stride);
		const prev = y ? img.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
		for (let i = 0; i < stride; i++) {
			const a = i >= bpp ? out[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
			const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
			out[i] = (line[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
		}
	}
	const sample = (y, i) => {
		if (depth === 16) return img[y * stride + 2 * i];
		if (depth === 8) return img[y * stride + i];
		const bit = i * depth, v = (img[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
		return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
	};
	const data = new Uint8Array(w * h);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			let r, g, b, a = 255;
			if (type === 3) { const k = sample(y, x); [r, g, b] = palette.subarray(3 * k, 3 * k + 3); if (trns && k < trns.length) a = trns[k]; }
			else if (type === 0 || type === 4) { r = g = b = sample(y, x * channels); if (type === 4) a = sample(y, x * 2 + 1); }
			else { r = sample(y, x * channels); g = sample(y, x * channels + 1); b = sample(y, x * channels + 2); if (type === 6) a = sample(y, x * 4 + 3); }
			data[y * w + x] = Math.round(((r * 299 + g * 587 + b * 114) / 1000) * (a / 255) + 255 * (1 - a / 255));
		}
	return { data, width: w, height: h };
}
