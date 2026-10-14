import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { encode, isValid, toSVG, toPNG, toDataURL, toBitmap, formats, detectFormat, init } from '../src/index.js';

test('SVG output is escaped and sized', () => {
	const svg = toSVG('<a&"b>', { format: 'CODE128', font: 'x"y' });
	assert.match(svg, /^<svg [^>]*width="\d+" height="\d+"[^>]*role="img"[^>]*><title>&#60;a&#38;&#34;b&#62;<\/title>/);
	assert.ok(!toSVG('x', { title: false }).includes('<title>') && toSVG('x', { title: 'Order 7' }).includes('<title>Order 7</title>'));
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

test('format: auto', () => {
	const cases = { '5901234123457': 'EAN13', '036000291452': 'UPC', '96385074': 'EAN8', '(01)09501101530003': 'GS1-128',
		'https://example.com': 'QR', 'héllo 世界': 'QR', ['x'.repeat(41)]: 'QR', 'ABC-123': 'CODE128', '1234567890123': 'CODE128' };
	for (const [v, f] of Object.entries(cases)) assert.equal(detectFormat(v), f, v);
	assert.equal(encode('https://example.com', { format: 'auto' }).type, 'matrix');
});

test('init() renders data-barcode elements', () => {
	const el = { tagName: 'DIV', innerHTML: '', dataset: { barcode: '5901234123457', format: 'EAN13', scale: '3', text: 'false' } };
	init({ querySelectorAll: () => [el] });
	assert.equal(el.innerHTML, toSVG('5901234123457', { format: 'EAN13', scale: 3, text: false }));
});

test('CLI', () => {
	const run = (...a) => spawnSync(process.execPath, ['bin/barcodejs.js', ...a], { encoding: 'buffer' });
	assert.match(run('hello', '-f', 'qr').stdout.toString(), /^<svg /);
	assert.deepEqual([...run('hello', '-t', 'png').stdout.subarray(0, 4)], [137, 80, 78, 71]);
	const bad = run('123', '-f', 'EAN13');
	assert.equal(bad.status, 1);
	assert.match(bad.stderr.toString(), /Invalid EAN13/);
});

test('React and Vue components render SVG', async () => {
	const [React, { renderToString }, { Barcode }] = await Promise.all([import('react'), import('react-dom/server'), import('../src/react.js')]);
	assert.ok(renderToString(React.createElement(Barcode, { value: 'hi', format: 'QR' })).includes(toSVG('hi', { format: 'QR' })));
	const [Vue, VS, { Barcode: VB }] = await Promise.all([import('vue'), import('@vue/server-renderer'), import('../src/vue.js')]);
	const html = await VS.renderToString(Vue.createSSRApp({ render: () => Vue.h(VB, { value: 'hi', format: 'QR' }) }));
	assert.ok(html.includes(toSVG('hi', { format: 'QR' })) && !html.includes('style='));
});

test('QR styling', () => {
	const svg = toSVG('hi', { format: 'QR', moduleShape: 'dots', finderShape: 'rounded', finderColor: '#ff0000', logo: 'logo.png' });
	assert.ok(svg.includes('fill-rule="evenodd"') && svg.includes('fill="#ff0000"') && svg.includes('<image href="logo.png"'));
	assert.equal(encode('hi', { format: 'QR', logo: 'x' }).version, encode('hi', { format: 'QR', ecLevel: 'H' }).version); // logo -> ECC H
	const o = { format: 'QR', finderColor: '#ff0000' }, png = Buffer.from(toPNG('hi', o));
	assert.equal(png[24], 2); // bit depth 2: three palette colors
	const { width, height, data } = toBitmap(encode('hi', o), o);
	const raw = inflateSync(png.subarray(png.indexOf('IDAT') + 4, png.indexOf('IDAT') + 4 + png.readUInt32BE(png.indexOf('IDAT') - 4)));
	const row = Math.ceil(width / 4) + 1;
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
		assert.equal((raw[y * row + 1 + (x >> 2)] >> (6 - (x & 3) * 2)) & 3, data[y * width + x]);
});

test('Data Matrix shapes and Micro QR versions', () => {
	const r = encode('Rect 1234', { format: 'DATAMATRIX', shape: 'rectangle' });
	assert.ok(r.width > r.height);
	assert.deepEqual(['1', 'AB12', 'hello', 'HELLO WORLD 12345'].map((v) => encode(v, { format: 'MICROQR' }).version), ['M1', 'M2', 'M3', 'M4']);
	assert.throws(() => encode('x'.repeat(40), { format: 'MICROQR' }), /too long/);
});

test('CommonJS build', async () => {
	const { createRequire } = await import('node:module');
	const cjs = createRequire(import.meta.url)('../dist/index.cjs');
	assert.equal(cjs.toSVG('hi', { format: 'QR' }), toSVG('hi', { format: 'QR' }));
});

test('<bar-code> element', async () => {
	const events = [];
	globalThis.HTMLElement = class {
		attrs = {}; isConnected = true; innerHTML = '';
		getAttribute(k) { return this.attrs[k] ?? null; } hasAttribute(k) { return k in this.attrs; }
		setAttribute(k, v) { this.attrs[k] = String(v); } removeAttribute(k) { delete this.attrs[k]; }
		dispatchEvent(e) { events.push(e); }
	};
	globalThis.CustomEvent ??= class extends Event { constructor(t, o) { super(t); this.detail = o?.detail; } }; // Node 18
	const defined = {};
	globalThis.customElements = { get: (n) => defined[n], define: (n, c) => (defined[n] = c) };
	const { BarCodeElement } = await import('../src/element.js?test');
	assert.equal(defined['bar-code'], BarCodeElement);
	const el = new BarCodeElement();
	Object.assign(el.attrs, { value: '5901234123457', format: 'EAN13', scale: '3', text: 'false' });
	el.connectedCallback();
	assert.equal(el.innerHTML, toSVG('5901234123457', { format: 'EAN13', scale: 3, text: false }));
	el.attrs.value = '123';
	el.attributeChangedCallback();
	assert.equal(el.innerHTML, '');
	assert.equal(el.attrs['aria-invalid'], 'true');
	assert.equal(events.length, 1);
	delete globalThis.HTMLElement; delete globalThis.customElements;
});

test('CLI --decode reads PNGs (ours and bwip-js RGBA)', async () => {
	const { mkdtempSync, writeFileSync } = await import('node:fs');
	const dir = mkdtempSync((await import('node:os')).tmpdir() + '/bjs-');
	const bwip = (await import('node:module')).createRequire(import.meta.url)('bwip-js');
	writeFileSync(dir + '/a.png', toPNG('decode me', { format: 'QR', finderColor: '#1a3c8f' }));
	writeFileSync(dir + '/b.png', await bwip.toBuffer({ bcid: 'ean13', text: '5901234123457', scale: 3, includetext: true }));
	const run = (f) => spawnSync(process.execPath, ['bin/barcodejs.js', '--decode', f], { encoding: 'utf8' });
	assert.equal(run(dir + '/a.png').stdout.trim(), 'decode me');
	assert.equal(run(dir + '/b.png').stdout.trim(), '5901234123457');
	writeFileSync(dir + '/c.png', toPNG('x', { format: 'QR', text: false, background: '#ffffff', color: '#ffffff' }));
	assert.equal(run(dir + '/c.png').status, 1);
});
