// Renders verification cases to PGM images for check.py (zxing-cpp). Usage: node cases.mjs <outDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { encode, toBitmap } from '../../src/index.js';

const letters = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + (i * 11) % 26)).join('');
const digits = (n) => Array.from({ length: n }, (_, i) => String((i * 7) % 10)).join('');
const gs1 = (v) => [v, v.replace(/\((\d+)\)/g, '$1'), v.replace(/\((\d+)\)/g, '\x1d$1').slice(1)]; // zxing-cpp GS1 text forms

// [format, value, options, acceptable decoded texts (default: [value])]
export const CASES = [
	['QR', 'héllo 世界 🎉'], ['QR', 'HELLO WORLD 12345678901234567890 https://x.y/AbC'],
	['QR', '(01)09501101530003(17)250101(10)AB-123%', { gs1: true }, ['(01)09501101530003(17)250101(10)AB-123%', '01095011015300031725010110AB-123%']],
	['MICROQR', '12345'], ['MICROQR', 'AB12'], ['MICROQR', 'hello'], ['MICROQR', '0123456789012345678901234567890123'],
	['MICROQR', 'HELLO 123', { ecLevel: 'M' }], ['MICROQR', 'Micro QR!', { ecLevel: 'Q' }],
	['DATAMATRIX', letters(1550)], ['DATAMATRIX', digits(3000)], ['DATAMATRIX', 'hi 世界'],
	['DATAMATRIX', 'HELLO WORLD THIS IS C40 1234'], ['DATAMATRIX', 'lowercase text mode here'],
	['DATAMATRIX', '\x01\x02\xff\xfe binary-ish \x80', {}, ['\x01\x02\xff\xfe binary-ish \x80', '<SOH><STX>ÿþ binary-ish <U+80>']], ['DATAMATRIX', 'Rect 1234', { shape: 'rectangle' }],
	['DATAMATRIX', letters(40), { shape: 'rectangle' }], ['DATAMATRIX', digits(200), { size: '26x64' }],
	['DATAMATRIX', 'DMRE 8x144 Data Matrix', { size: '8x144' }], ['DATAMATRIX', letters(60), { shape: 'rectangle', dmre: true }],
	['DATAMATRIX', '(01)09501101530003(17)250101(10)AB-123', { gs1: true }, ['(01)09501101530003(17)250101(10)AB-123', '01095011015300031725010110AB-123']],
	['UPCE', '654321', {}, ['0065100004327', '06543217']], ['UPCE', '01234565', {}, ['0012345000065', '01234565']],
	['CODABAR', 'A12:34/5.6+7A', {}, ['A12:34/5.6+7A']],
	['PDF417', 'Hello PDF417'], ['PDF417', digits(200)], ['PDF417', 'Mixed: abc ABC 123 !@# ' + digits(20) + ' end'],
	['PDF417', 'Ünïcödé 世界'], ['PDF417', letters(800), { columns: 10 }],
	['AZTEC', 'Hello Aztec'], ['AZTEC', 'A'], ['AZTEC', digits(200)], ['AZTEC', letters(1200)], ['AZTEC', 'Mixed: abc ABC 123 !@# \r\n~ é'],
	['AZTEC', 'héllo 世界'],
	['RMQR', 'A', { version: 'R13x43', ecLevel: 'H' }], ['RMQR', 'HELLO 123'], ['RMQR', 'https://example.com/rmqr'],
	['RMQR', '12345678901234567890', { version: 'R7x139' }], ['RMQR', 'héllo wörld', { ecLevel: 'H' }],
	['DATABAR', '0950110153000', {}, ['0109501101530003', '(01)09501101530003']],
	['DATABAR-LIMITED', '1950110153000', {}, ['0119501101530000', '(01)19501101530000']],
	['DATABAR-EXPANDED', '(01)09501101530003(10)abc-12.x/y(21)12345678901234', {}, gs1('(01)09501101530003(10)abc-12.x/y(21)12345678901234')],
	['DATABAR-EXPANDED', '(01)19501101530000(17)251231(10)LOT 7!?(21)1', {}, gs1('(01)19501101530000(17)251231(10)LOT 7!?(21)1')],
	['DATABAR-EXPANDED', '(10)ABC(21)xyz', {}, gs1('(10)ABC(21)xyz')],
	['QR', 'https://example.com/styled', { moduleShape: 'dots', finderShape: 'rounded', finderColor: '#1a3c8f' }],
	['QR', 'https://example.com/rounded', { moduleShape: 'rounded', finderShape: 'rounded' }],
	['QR', 'https://example.com/with-a-logo-in-the-middle', { logo: 'data:image/png;base64,', logoSize: 0.25 }],
];

// Seeded random cases per format (FUZZ=n per format, SEED=n): catches edge cases fixed cases miss.
let seed = +(process.env.SEED ?? 1);
const rnd = () => ((seed = (seed + 0x6d2b79f5) | 0), (((seed ^ (seed >>> 15)) * (1 | seed)) >>> 0) / 2 ** 32);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (xs) => xs[int(0, xs.length - 1)];
const str = (alphabet, a, b) => Array.from({ length: int(a, b) }, () => pick([...alphabet])).join('');
const DIG = '0123456789', ALNUM = DIG + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const LATIN = ASCII + 'àéîõüßÆØ©½';
const WIDE = LATIN + '世界日本語한국어Ωπ🎉';
const mixed = (a, b) => Array.from({ length: int(1, 4) }, () => str(pick([DIG, ALNUM, ASCII, WIDE]), a, b)).join('');
const text = (f) => (v) => [encode(v, { format: f }).text];
const FUZZERS = {
	QR: () => [mixed(1, 80), { ecLevel: pick('LMQH') }],
	RMQR: () => [mixed(1, 25), { ecLevel: pick('MH') }],
	MICROQR: () => [pick([str(DIG, 1, 20), str(ALNUM, 1, 12), str('abcxyz', 1, 6)]), {}],
	DATAMATRIX: () => {
		const shape = pick(['square', 'rectangle', 'auto']), n = shape === 'square' ? 200 : 25; // rectangles hold <= 49 codewords
		return [pick([str(ASCII, 1, n), str(DIG, 1, n * 1.5), str('ABCDEFGHIJ 0123', 1, n), str('abc xyz 12', 1, n), str('ABC/DEF-123.456:;<=>?@[]^_', 1, n), str('AB12\r*> ', 1, n), str(LATIN, 1, n / 4), mixed(1, n / 7)]), { shape }];
	},
	PDF417: () => [mixed(1, 120), { columns: pick([undefined, int(1, 12)]) }],
	AZTEC: () => [mixed(1, 120), {}],
	CODE128: () => [str(LATIN, 1, 30), {}],
	'GS1-128': () => [`(01)${str(DIG, 14, 14)}(10)${str(ALNUM.replace(/[ $%*+:]/g, ''), 1, 12)}(21)${str(DIG, 1, 8)}`, {}],
	EAN13: () => [str(DIG, 12, 12), {}, text('EAN13')],
	EAN8: () => [str(DIG, 7, 7), {}, text('EAN8')],
	UPC: () => [str(DIG, 11, 11), {}, (v) => { const t = encode(v, { format: 'UPC' }).text; return [t, '0' + t]; }],
	// $ / + % before a letter reads as a Full ASCII escape in zxing-cpp; those characters are in the fixed cases
	CODE39: () => [str(DIG + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-. ', 1, 25), {}],
	CODE93FullASCII: () => [str(ASCII, 1, 25), {}],
	ITF: () => [str(DIG, 3, 15).replace(/^(.)((..)*)$/, '$2').padStart(6, '0'), {}],
	DATABAR: () => [str(DIG, 13, 13), {}, (v) => { const t = encode(v, { format: 'DATABAR' }).text; return [t, t.slice(1, 3) + t.slice(4)]; }],
	'DATABAR-LIMITED': () => [pick('01') + str(DIG, 12, 12), {}, (v) => { const t = encode(v, { format: 'DATABAR-LIMITED' }).text; return [t, t.slice(1, 3) + t.slice(4)]; }],
	'DATABAR-EXPANDED': () => [pick(['', '(01)09501101530003']) + `(10)${str(ALNUM.replace(/[$%:]/g, '') + 'abcxyz!?', 1, 15)}(21)${str(DIG + 'AZ', 1, 12)}`, {}, (v) => gs1(v)],
	CODABAR: () => [pick('ABCD') + str(DIG + '-$:/.+', 3, 20) + pick('ABCD'), {}], // readers reject very short Codabar
};
for (const [format, gen] of Object.entries(FUZZERS))
	for (let i = 0; i < +(process.env.FUZZ ?? 0); i++) {
		const [value, opts, expect] = gen();
		const gs1 = (v) => [v, v.replace(/\((\d+)\)/g, '$1'), ']C1' + v.replace(/\((\d+)\)/g, '$1')];
		CASES.push([format, value, opts, expect ? expect(value) : format === 'GS1-128' ? gs1(value) : [value]]);
	}

const out = process.argv[2], only = new RegExp(process.argv[3] || '.');
mkdirSync(out, { recursive: true });
let skipped = 0;
const meta = CASES.filter(([f]) => only.test(f)).flatMap(([format, value, opts = {}, expect = [value]], i) => {
	let sym;
	try { sym = encode(value, { format, ...opts }); }
	catch (e) { if (/too long|does not fit/.test(e.message)) { skipped++; return []; } throw e; } // random value over capacity
	const { width, height, data } = toBitmap(sym, { scale: 6, margin: 30, text: false, ...opts });
	const px = Buffer.alloc(width * height);
	data.forEach((p, k) => (px[k] = p ? 0 : 255));
	writeFileSync(`${out}/${i}.pgm`, Buffer.concat([Buffer.from(`P5 ${width} ${height} 255\n`), px]));
	return [{ i, format, value: value.slice(0, 40), expect, opts }];
});
writeFileSync(`${out}/meta.json`, JSON.stringify(meta));
console.log(`SEED=${process.env.SEED ?? 1} FUZZ=${process.env.FUZZ ?? 0}` + (skipped ? `, ${skipped} random cases over capacity skipped` : ''));
