// Module-for-module comparison with BWIPP (via bwip-js) for formats zxing cannot read (postal)
// or where exact output matters (DataBar, DMRE, rMQR). Seeded random inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { encode } from '../src/index.js';
import { mod10 } from '../src/linear.js';

const bwip = createRequire(import.meta.url)('bwip-js');
let seed = 7;
const rnd = () => ((seed = (seed + 0x6d2b79f5) | 0), (((seed ^ (seed >>> 15)) * (1 | seed)) >>> 0) / 2 ** 32);
const digits = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
const from = (set, n) => Array.from({ length: n }, () => set[Math.floor(rnd() * set.length)]).join('');
const widths = (bits) => { const w = []; let run = 1; for (let i = 1; i <= bits.length; i++) bits[i] === bits[i - 1] ? run++ : (w.push(run), (run = 1)); return w.join(','); };
const states = (raw) => { const max = Math.max(...raw.bhs); return raw.bhs.map((h, i) => (h > 0.9 * max ? 'F' : h < 0.4 * max ? 'T' : raw.bbs[i] > 0 ? 'A' : 'D')).join(''); };

test('GS1 DataBar Omnidirectional / Limited / Expanded', () => {
	for (let i = 0; i < 200; i++) {
		const v = digits(13), l = (rnd() < 0.5 ? '0' : '1') + digits(12);
		assert.equal(widths(encode(v, { format: 'DATABAR' }).segments[0].bits), bwip.raw('databaromni', `(01)${v}${mod10(v)}`, {})[0].sbs.slice(1).join(','), v);
		assert.equal(widths(encode(l, { format: 'DATABAR-LIMITED' }).segments[0].bits), bwip.raw('databarlimited', `(01)${l}${mod10(l)}`, {})[0].sbs.slice(1).join(',').replace(/,0$/, ''), l);
	}
	for (const v of ['(01)09501101530003', '(01)09501101530003(10)A', '(01)09501101530003(10)ABC123(21)XYZ'])
		assert.equal(widths(encode(v, { format: 'DATABAR-EXPANDED' }).segments[0].bits), bwip.raw('databarexpanded', v, {})[0].sbs.slice(1).join(','), v);
});

test('Royal Mail, USPS IMb, Australia Post', () => {
	const A = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 #';
	for (let i = 0; i < 150; i++) {
		const rm = from(A, 1 + Math.floor(rnd() * 12));
		assert.equal(encode(rm, { format: 'ROYALMAIL' }).bars, states(bwip.raw('royalmail', rm, {})[0]), rm);
		const imb = digits(1) + Math.floor(rnd() * 5) + digits(18) + digits([0, 5, 9, 11][i % 4]);
		assert.equal(encode(imb, { format: 'IMB' }).bars, states(bwip.raw('onecode', imb, {})[0]), imb);
		const [fcc, n] = [['11', 0], ['59', 5], ['62', 10], ['45', 0]][i % 4], aus = fcc + digits(8) + from(C, Math.floor(rnd() * (n + 1)));
		assert.equal(encode(aus, { format: 'AUSPOST' }).bars, states(bwip.raw('auspost', aus, {})[0]), aus);
	}
});

const sameMatrix = (sym, raw, label) => {
	assert.equal(`${sym.width}x${sym.height}`, `${raw.pixx}x${raw.pixy}`, label);
	assert.ok(raw.pixs.every((p, i) => !!p === !!sym.modules[i]), label);
};

test('Data Matrix DMRE sizes', () => {
	const sizes = { '8x48': 18, '8x64': 24, '8x80': 32, '8x96': 38, '8x120': 49, '8x144': 63, '12x64': 43, '12x88': 64, '16x64': 62,
		'20x36': 44, '20x44': 56, '20x64': 84, '22x48': 72, '24x48': 80, '24x64': 108, '26x40': 70, '26x48': 90, '26x64': 118 };
	for (const [size, cap] of Object.entries(sizes)) {
		const v = digits(2 * cap);
		sameMatrix(encode(v, { format: 'DATAMATRIX', size }), bwip.raw('datamatrix', v, { version: size, dmre: true })[0], size);
	}
});

test('rMQR, all 32 versions', () => {
	const V = [[7, 43], [7, 59], [7, 77], [7, 99], [7, 139], [9, 43], [9, 59], [9, 77], [9, 99], [9, 139], [11, 27], [11, 43], [11, 59], [11, 77],
		[11, 99], [11, 139], [13, 27], [13, 43], [13, 59], [13, 77], [13, 99], [13, 139], [15, 43], [15, 59], [15, 77], [15, 99], [15, 139],
		[17, 43], [17, 59], [17, 77], [17, 99], [17, 139]];
	for (const [r, c] of V)
		for (const ecLevel of ['M', 'H'])
			// single-mode inputs: mixed input has several equally short segmentations
			for (const v of ['A', from('ABCXYZ ', 5), from('abcxyz', 3 + r), digits(c / 3)]) {
				const version = `R${r}x${c}`;
				let raw;
				try { raw = bwip.raw('rectangularmicroqrcode', v, { version, eclevel: ecLevel })[0]; } catch { continue; } // over capacity
				sameMatrix(encode(v, { format: 'RMQR', version, ecLevel }), raw, `${version} ${ecLevel} ${v}`);
			}
});
