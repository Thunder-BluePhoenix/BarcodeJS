// Round-trip: render to pixels, decode with ZXing, compare text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ZX from '@zxing/library';
import { encode, toBitmap } from '../src/index.js';

const { MultiFormatReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource, DecodeHintType, BarcodeFormat, Code39Reader } = ZX;

function bitmap(value, opts) {
	const { width, height, data } = toBitmap(encode(value, opts), { ...opts, text: false });
	const lum = new Uint8ClampedArray(data.length);
	data.forEach((p, i) => (lum[i] = p ? 0 : 255));
	return new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, width, height)));
}
function decode(value, opts, zxFormat) {
	return new MultiFormatReader().decode(bitmap(value, opts), new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat[zxFormat]]], [DecodeHintType.TRY_HARDER, true],
		[DecodeHintType.ASSUME_GS1, opts.format === 'GS1-128']])).getText();
}
const asText = (format) => (v) => encode(v, { format }).text;
const rt = (format, zx, values, opts = {}, expect = (v) => v) => test(`${format} decodes`, () => {
	for (const v of values) assert.equal(decode(v, { format, ...opts }, zx), expect(v), `${format} ${JSON.stringify(v).slice(0, 60)}`);
});

const latin = 'Ünïcödé café ½ ©';
rt('CODE128', 'CODE_128', ['Hello World', '1234567890', 'ABC123456', 'a', 'Mixed\tCASE\x01 123456 x', 'Should\nshift', latin, '12345Hejsan123456\tA']);
rt('GS1-128', 'CODE_128', ['(01)09501101530003(17)250101(10)ABC123', '(10)LOT1(21)SER2', '(00)123456789012345675'],
	{}, (v) => ']C1' + v.replace(/\((\d+)\)/g, '$1').replace('LOT1', 'LOT1\x1d'));
rt('EAN13', 'EAN_13', ['5901234123457', '400638133393', '0012345678905'], {}, asText('EAN13'));
rt('EAN8', 'EAN_8', ['96385074', '5512345'], {}, asText('EAN8'));
rt('UPC', 'UPC_A', ['036000291452', '12345678999'], {}, asText('UPC'));
// UPC-E omitted: zxing-js UPCEReader drops the number system/check digit (upstream bug). Verified with zxing-cpp.
rt('ISBN', 'EAN_13', ['978-0-306-40615-7', '0-306-40615-2'], {}, () => '9780306406157');
rt('CODE39', 'CODE_39', ['ABC-123', 'HELLO WORLD $/+%']);
rt('CODE93', 'CODE_93', ['TEST93', 'ABC-123 $/+%']);
rt('CODE93FullASCII', 'CODE_93', ['Hello, world!', 'lower {case} @ 1']);
rt('ITF', 'ITF', ['12345678901231', '00123456789012']);
rt('ITF14', 'ITF', ['1234567890123'], {}, (v) => v + '1');
rt('CODABAR', 'CODABAR', ['A1234-5678A', 'B40156B'] /* ': / . +' verified with zxing-cpp; zxing-js rejects them */, {}, (v) => v);

test('CODE39 Full ASCII decodes', () => {
	for (const v of ['Hello, World!', 'lower@case.com']) assert.equal(new Code39Reader(false, true).decode(bitmap(v, { format: 'CODE39FullASCII' })).getText(), v);
});

test('QR decodes across modes, ECC levels and versions', () => {
	const long = Array.from({ length: 2000 }, (_, i) => String.fromCharCode(33 + (i * 7) % 90)).join('');
	const values = ['1', '0123456789012345', 'HELLO WORLD $%*+-./:', 'https://example.com/?q=barcode&x=1', 'héllo 世界 🎉', long.slice(0, 300), long];
	for (const ecLevel of ['L', 'M', 'Q', 'H'])
		for (const v of values) {
			if (v === long && 'QH'.includes(ecLevel)) continue; // exceeds v40 capacity at Q/H
			assert.equal(decode(v, { format: 'QR', ecLevel, scale: 2 }, 'QR_CODE'), v, `${ecLevel} len ${v.length} v${encode(v, { format: 'QR', ecLevel }).version}`);
		}
});

test('Data Matrix decodes across sizes (incl. multi-block)', () => {
	const sizes = new Set();
	for (const n of [1, 3, 6, 10, 20, 40, 80, 150, 200, 300, 500, 900, 1300]) {
		const v = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + (i * 11) % 26)).join('');
		sizes.add(encode(v, { format: 'DATAMATRIX' }).width);
		assert.equal(decode(v, { format: 'DATAMATRIX', shape: 'auto', scale: 3, margin: 24 }, 'DATA_MATRIX'), v, `auto len ${n}`);
		assert.equal(decode(v, { format: 'DATAMATRIX', scale: 3, margin: 24 }, 'DATA_MATRIX'), v, `len ${n}`);
	}
	// 144x144, Base256 and UTF-8 (ECI) are verified with zxing-cpp (test/zxing-cpp); zxing-js mis-decodes them.
	for (const v of ['12345678901234567890', 'UPPER CASE C40 TEXT', 'lower case text mode', 'Rect 1']) assert.equal(decode(v, { format: 'DATAMATRIX', scale: 3, margin: 24 }, 'DATA_MATRIX'), v);
	assert.ok(sizes.has(120) && sizes.has(52), [...sizes].join());
});

test('PDF417 decodes (text, numeric, byte compaction)', () => {
	for (const v of ['Hello PDF417', '12345678901234567890123456789', 'Mixed: abc ABC 123 !@# end', 'a'.repeat(300)])
		assert.equal(decode(v, { format: 'PDF417' }, 'PDF_417'), v);
});

test('Aztec decodes (compact and full-range)', () => {
	const sizes = new Set();
	for (const v of ['A', 'Hello Aztec', 'Mixed: abc ABC 123 !@#', '1234567890'.repeat(20), 'X'.repeat(600)]) {
		sizes.add(encode(v, { format: 'AZTEC' }).compact);
		assert.equal(decode(v, { format: 'AZTEC', scale: 3, margin: 20 }, 'AZTEC'), v);
	}
	assert.deepEqual([...sizes].sort(), [false, true]);
});

test('QR mixed-mode segmentation decodes and beats single-mode size', () => {
	const v = 'https://example.com/item/' + '1234567890'.repeat(6);
	assert.equal(decode(v, { format: 'QR' }, 'QR_CODE'), v);
	assert.ok(encode(v, { format: 'QR', ecLevel: 'L' }).version <= 4); // single byte mode needs v5
});
