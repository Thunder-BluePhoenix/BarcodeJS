// Renders verification cases to PGM images for check.py (zxing-cpp). Usage: node cases.mjs <outDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { encode, toBitmap } from '../../src/index.js';

const letters = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + (i * 11) % 26)).join('');
const digits = (n) => Array.from({ length: n }, (_, i) => String((i * 7) % 10)).join('');
const gs1 = (v) => v.replace(/\((\d+)\)/g, '$1'); // zxing-cpp text for GS1 without parentheses

// [format, value, options, acceptable decoded texts (default: [value])]
export const CASES = [
	['QR', 'héllo 世界 🎉'], ['QR', 'HELLO WORLD 12345678901234567890 https://x.y/AbC'],
	['QR', '(01)09501101530003(17)250101(10)AB-123%', { gs1: true }, ['(01)09501101530003(17)250101(10)AB-123%', '01095011015300031725010110AB-123%']],
	['MICROQR', '12345'], ['MICROQR', 'AB12'], ['MICROQR', 'hello'], ['MICROQR', '0123456789012345678901234567890123'],
	['MICROQR', 'HELLO 123', { ecLevel: 'M' }], ['MICROQR', 'Micro QR!', { ecLevel: 'Q' }],
	['DATAMATRIX', letters(1550)], ['DATAMATRIX', digits(3000)], ['DATAMATRIX', 'hi 世界'],
	['DATAMATRIX', 'HELLO WORLD THIS IS C40 1234'], ['DATAMATRIX', 'lowercase text mode here'],
	['DATAMATRIX', '\x01\x02\xff\xfe binary-ish \x80', {}, ['\x01\x02\xff\xfe binary-ish \x80', '<SOH><STX>ÿþ binary-ish <U+80>']], ['DATAMATRIX', 'Rect 1234', { shape: 'rectangle' }],
	['DATAMATRIX', letters(40), { shape: 'rectangle' }],
	['DATAMATRIX', '(01)09501101530003(17)250101(10)AB-123', { gs1: true }, ['(01)09501101530003(17)250101(10)AB-123', '01095011015300031725010110AB-123']],
	['UPCE', '654321', {}, ['0065100004327', '06543217']], ['UPCE', '01234565', {}, ['0012345000065', '01234565']],
	['CODABAR', 'A12:34/5.6+7A', {}, ['A12:34/5.6+7A']],
	['PDF417', 'Hello PDF417'], ['PDF417', digits(200)], ['PDF417', 'Mixed: abc ABC 123 !@# ' + digits(20) + ' end'],
	['PDF417', 'Ünïcödé 世界'], ['PDF417', letters(800), { columns: 10 }],
	['AZTEC', 'Hello Aztec'], ['AZTEC', 'A'], ['AZTEC', digits(200)], ['AZTEC', letters(1200)], ['AZTEC', 'Mixed: abc ABC 123 !@# \r\n~ é'],
	['AZTEC', 'héllo 世界'],
	['QR', 'https://example.com/styled', { moduleShape: 'dots', finderShape: 'rounded', finderColor: '#1a3c8f' }],
	['QR', 'https://example.com/rounded', { moduleShape: 'rounded', finderShape: 'rounded' }],
	['QR', 'https://example.com/with-a-logo-in-the-middle', { logo: 'data:image/png;base64,', logoSize: 0.25 }],
];

const out = process.argv[2], only = new RegExp(process.argv[3] || '.');
mkdirSync(out, { recursive: true });
const meta = CASES.filter(([f]) => only.test(f)).map(([format, value, opts = {}, expect = [value]], i) => {
	const { width, height, data } = toBitmap(encode(value, { format, ...opts }), { scale: 6, margin: 30, text: false, ...opts });
	const px = Buffer.alloc(width * height);
	data.forEach((p, k) => (px[k] = p ? 0 : 255));
	writeFileSync(`${out}/${i}.pgm`, Buffer.concat([Buffer.from(`P5 ${width} ${height} 255\n`), px]));
	return { i, format, value: value.slice(0, 40), expect };
});
writeFileSync(`${out}/meta.json`, JSON.stringify(meta));
