import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encode, isValid, toSVG, toPNG, toDataURL, toBitmap, formats } from '../src/index.js';

test('SVG output is escaped and sized', () => {
	const svg = toSVG('<a&"b>', { format: 'CODE128', font: 'x"y' });
	assert.match(svg, /^<svg [^>]*width="\d+" height="\d+"/);
	assert.ok(svg.includes('&#60;a&#38;&#34;b&#62;') && svg.includes('x&#34;y') && !svg.includes('<a&'));
	assert.ok(!toSVG('123', { text: false }).includes('<text'));
	assert.ok(toSVG('hi', { format: 'QR', background: null }).includes('<path') && !toSVG('hi', { format: 'QR', background: null }).includes('<rect'));
});

test('PNG is valid and matches the bitmap', () => {
	for (const [v, o] of [['hello', { format: 'QR' }], ['5901234123457', { format: 'EAN13', addon: '12' }], ['x', { background: null, color: '#f00' }]]) {
		const png = toPNG(v, o), { width, height, data } = toBitmap(encode(v, o), o);
		assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
		const idat = Buffer.from(png).indexOf('IDAT'), len = Buffer.from(png).readUInt32BE(idat - 4);
		const raw = inflateSync(Buffer.from(png.slice(idat + 4, idat + 4 + len))); // also checks adler32
		const row = Math.ceil(width / 8) + 1;
		assert.equal(raw.length, row * height);
		for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
			assert.equal((raw[y * row + 1 + (x >> 3)] >> (7 - (x & 7))) & 1, data[y * width + x]);
	}
	assert.match(toDataURL('hi', { format: 'QR' }), /^data:image\/png;base64,iVBOR/);
	assert.match(toDataURL('hi', { type: 'svg' }), /^data:image\/svg\+xml/);
	assert.throws(() => toPNG('x', { color: 'red' }), /hex colors/);
});

test('invalid input throws a clear error', () => {
	assert.throws(() => encode('12345', { format: 'EAN13' }), /Invalid EAN13 value: "12345"/);
	assert.throws(() => encode('5901234123450', { format: 'EAN13' }), /Invalid EAN13/); // bad check digit
	assert.throws(() => encode('x', { format: 'NOPE' }), /Unknown barcode format/);
	assert.throws(() => encode('(01)123', { format: 'GS1-128' }), /GS1-128/); // wrong fixed length
	assert.throws(() => encode('x'.repeat(3000), { format: 'QR', ecLevel: 'H' }), /too long/);
	assert.equal(isValid('978-0-306-40615-7', { format: 'ISBN' }), true);
	assert.equal(isValid('0-306-40615-3', { format: 'ISBN' }), false);
	assert.ok(Object.keys(formats).length >= 29);
});

test('new 1D formats', () => {
	assert.equal(encode('0317-8471', { format: 'ISSN' }).text, '9770317847001');
	// C check digit of 123-45 is 5 ('wnwnn'), then the stop pattern ('nnwwn')
	assert.ok(encode('123-45', { format: 'CODE11' }).segments[0].bits.endsWith('111011101' + '0' + '101110001'));
	assert.equal(encode('(01)09501101530003', { format: 'GS1-128' }).text, '(01)09501101530003');
});
