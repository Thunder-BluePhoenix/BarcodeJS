// decode(): round trips through rendered images with rotation, zoom, noise and damage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { encode, toBitmap } from '../src/index.js';
import { decode } from '../src/decode.js';

let seed = 3;
const rnd = () => ((seed = (seed + 0x6d2b79f5) | 0), (((seed ^ (seed >>> 15)) * (1 | seed)) >>> 0) / 2 ** 32);

// 1-bit bitmap -> grayscale image, rotated (degrees) and zoomed with bilinear sampling, plus noise
function image({ width, height, data }, { angle = 0, zoom = 1, noise = 0 } = {}) {
	const rad = (angle * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
	const W = Math.ceil((Math.abs(width * cos) + Math.abs(height * sin)) * zoom) + 20, H = Math.ceil((Math.abs(width * sin) + Math.abs(height * cos)) * zoom) + 20;
	const out = new Uint8Array(W * H);
	const src = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 255 : data[y * width + x] ? 0 : 255);
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			const dx = (x - W / 2) / zoom, dy = (y - H / 2) / zoom;
			const sx = dx * cos + dy * sin + width / 2, sy = -dx * sin + dy * cos + height / 2;
			const fx = Math.floor(sx), fy = Math.floor(sy), ax = sx - fx, ay = sy - fy;
			const v = src(fx, fy) * (1 - ax) * (1 - ay) + src(fx + 1, fy) * ax * (1 - ay) + src(fx, fy + 1) * (1 - ax) * ay + src(fx + 1, fy + 1) * ax * ay;
			out[y * W + x] = Math.max(0, Math.min(255, Math.round(v + (rnd() - 0.5) * noise)));
		}
	return { data: out, width: W, height: H };
}
const read = (sym, render, view) => decode(image(toBitmap(sym, { text: false, ...render }), view));

test('QR: versions, ECC levels, rotation, zoom, noise', () => {
	const cases = [['hello', 'M'], ['HELLO WORLD 123', 'Q'], ['https://example.com/item/' + '1234567890'.repeat(6), 'L'], ['héllo 世界 🎉', 'H'],
		['x'.repeat(300), 'L'], ['y'.repeat(600), 'M'], ['z'.repeat(1200), 'L']];
	for (const [v, ecLevel] of cases)
		for (const view of [{}, { angle: 90 }, { angle: 180 }, { angle: 17, noise: 40 }, { angle: -31, zoom: 1.3 }]) {
			const sym = encode(v, { format: 'QR', ecLevel });
			const r = read(sym, { scale: 4 }, view);
			assert.equal(r[0]?.text, v, `v${sym.version} ${ecLevel} ${JSON.stringify(view)}`);
		}
});

test('QR from an independent encoder (bwip-js)', () => {
	const bwip = createRequire(import.meta.url)('bwip-js');
	for (const v of ['bwip-js QR', 'https://github.com/metafloor/bwip-js', 'A'.repeat(150), '0123456789'.repeat(20)]) {
		const raw = bwip.raw('qrcode', v, {})[0];
		const bitmap = { width: (raw.pixx + 8) * 4, height: (raw.pixy + 8) * 4 };
		bitmap.data = new Uint8Array(bitmap.width * bitmap.height).map((_, i) => {
			const x = Math.floor((i % bitmap.width) / 4) - 4, y = Math.floor(i / bitmap.width / 4) - 4;
			return x >= 0 && y >= 0 && x < raw.pixx && y < raw.pixy ? raw.pixs[y * raw.pixx + x] : 0;
		});
		assert.equal(decode(image(bitmap, { angle: 8 }))[0]?.text, v);
	}
});

test('QR error correction repairs damaged modules', () => {
	const sym = encode('Error correction keeps this readable', { format: 'QR', ecLevel: 'H' });
	const n = sym.width, damaged = { ...sym, modules: sym.modules.slice() };
	for (let k = 0; k < 15; k++) { // flip modules in the data area (well within ECC level H)
		const x = 10 + Math.floor(rnd() * (n - 12)), y = 10 + Math.floor(rnd() * (n - 12));
		damaged.modules[y * n + x] ^= 1;
	}
	const r = read(damaged, { scale: 4 });
	assert.equal(r[0]?.text, sym.text);
	assert.ok(r[0].errorsCorrected > 0);
});

test('1D formats in four orientations', () => {
	const cases = [['EAN13', '5901234123457', 'EAN-13'], ['UPC', '036000291452', 'UPC-A'], ['EAN8', '96385074', 'EAN-8'], ['UPCE', '01234565', 'UPC-E'],
		['CODE128', 'Hello World 123', 'CODE128'], ['CODE128', 'Ünïcödé', 'CODE128'], ['CODE39', 'ABC-123 $/+%', 'CODE39'], ['ITF', '12345678901231', 'ITF']];
	for (const [format, v, out] of cases)
		for (const view of [{}, { angle: 90 }, { angle: 180 }, { angle: 270, noise: 40 }, { zoom: 1.37 }]) {
			const r = read(encode(v, { format }), { scale: 3, height: 60 }, view);
			assert.deepEqual([r[0]?.format, r[0]?.text], [out, encode(v, { format }).text], `${format} ${JSON.stringify(view)}`);
		}
	const gs1 = read(encode('(01)09501101530003(10)AB1', { format: 'GS1-128' }), { scale: 3 })[0];
	assert.deepEqual([gs1.text, gs1.gs1], ['010950110153000310AB1', true]);
});

test('no false positives on noise or blank images', () => {
	for (let k = 0; k < 5; k++) {
		const w = 300, h = 200, data = new Uint8Array(w * h).map(() => (rnd() < 0.5 ? 0 : 255));
		assert.deepEqual(decode({ data, width: w, height: h }), []);
	}
	assert.deepEqual(decode({ data: new Uint8Array(100 * 100).fill(255), width: 100, height: 100 }), []);
	const rgba = new Uint8ClampedArray(50 * 50 * 4).fill(255);
	assert.deepEqual(decode({ data: rgba, width: 50, height: 50 }), []);
});
