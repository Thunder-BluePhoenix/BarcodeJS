// Symbol -> layout -> SVG string / PNG bytes / canvas. No DOM or native deps required.

const DEFAULTS = {
	height: 100, // bar height (linear)
	text: true, // show human-readable text (linear); a string overrides it
	font: 'monospace',
	fontSize: 20,
	textMargin: 2,
	color: '#000000',
	background: '#ffffff', // null/'' = transparent
};

// Shapes in pixels: { width, height, rects: [[x, y, w, h]], texts: [{ x, y, text, anchor, size }] }
export function layout(symbol, options = {}) {
	const o = { ...DEFAULTS, ...options };
	const rects = [], texts = [];
	const runs = (bits, x0, y, s, h) => {
		for (let i = 0; i < bits.length; i++) {
			if (bits[i] !== '1' && bits[i] !== 1) continue;
			let j = i;
			while (j + 1 < bits.length && (bits[j + 1] === '1' || bits[j + 1] === 1)) j++;
			rects.push([x0 + i * s, y, (j - i + 1) * s, h]);
			i = j;
		}
	};

	if (symbol.type === 'matrix') {
		const s = o.scale ?? 4, m = o.margin ?? symbol.quiet * s, w = symbol.width;
		for (let y = 0; y < symbol.height; y++) runs(symbol.modules.subarray(y * w, (y + 1) * w), m, m + y * s, s, s);
		return { width: w * s + 2 * m, height: symbol.height * s + 2 * m, rects, texts, o };
	}

	const s = o.scale ?? 2, m = o.margin ?? 10, h = o.height;
	const show = o.text !== false;
	const override = typeof o.text === 'string';
	const guarded = symbol.segments.some((g) => g.guard);
	// Keep EAN/UPC digits within the space between guard bars
	const fs = guarded ? Math.min(o.fontSize, s * 10) : o.fontSize;
	const textH = show ? fs + o.textMargin : 0;
	const guardH = h + (guarded && show && !override ? fs / 2 + o.textMargin : 0);
	let x = m;
	for (const seg of symbol.segments) {
		if (seg.textOnly && (!show || override)) continue;
		const w = seg.bits.length * s;
		if (seg.addon) {
			runs(seg.bits, x, m + textH, s, guardH - textH);
			if (show && !override) texts.push({ x: x + w / 2, y: m + fs, text: seg.text, anchor: 'middle', size: fs });
		} else {
			runs(seg.bits, x, m, s, seg.guard ? guardH : h);
			if (show && !override && seg.text) texts.push({ x: x + w / 2, y: m + h + o.textMargin + fs, text: seg.text, anchor: 'middle', size: fs });
		}
		x += w;
	}
	if (override) texts.push({ x: x / 2 + m / 2, y: m + h + o.textMargin + fs, text: o.text, anchor: 'middle', size: fs });
	return { width: x + m, height: m + Math.max(guardH, h + textH) + m, rects, texts, o };
}

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function toSVG(symbol, options) {
	const L = layout(symbol, options), o = L.o;
	const d = L.rects.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}z`).join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" shape-rendering="crispEdges">` +
		(o.background ? `<rect width="100%" height="100%" fill="${esc(o.background)}"/>` : '') +
		`<path fill="${esc(o.color)}" d="${d}"/>` +
		L.texts.map((t) => `<text x="${t.x}" y="${t.y}" font-family="${esc(o.font)}" font-size="${t.size}" text-anchor="${t.anchor}" fill="${esc(o.color)}">${esc(t.text)}</text>`).join('') +
		'</svg>';
}

export function toCanvas(canvas, symbol, options) {
	const L = layout(symbol, options), o = L.o;
	canvas.width = L.width;
	canvas.height = L.height;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, L.width, L.height);
	if (o.background) { ctx.fillStyle = o.background; ctx.fillRect(0, 0, L.width, L.height); }
	ctx.fillStyle = o.color;
	for (const [x, y, w, h] of L.rects) ctx.fillRect(x, y, w, h);
	ctx.textAlign = 'center';
	for (const t of L.texts) { ctx.font = `${t.size}px ${o.font}`; ctx.fillText(t.text, t.x, t.y); }
	return canvas;
}

// 5x7 bitmap font for PNG text (no font engine available). Lowercase renders as uppercase.
const GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-./+$%:*()? ';
const GLYPH_BITS = ('3a33ae62e 11842108e 3a211111f 7c441062e 8ca97c42 7e1e0862e 1910f462e 7c2222108 3a317462e 3a317844c ' +
	'3a31fc631 7a31f463e 3a308422e 72518c65c 7e10f421f 7e10f4210 3a30bc62f 4631fc631 38842108e 1c4210a4c 4654c5251 ' +
	'42108421f 4775ac631 4639ace31 3a318c62e 7a31f4210 3a318d64d 7a31f5251 3e107043e 7c8421084 46318c62e 46318c544 ' +
	'4631ad6aa 462a22a31 463151084 7c222221f f8000 18c 2222200 84f9080 11f4717c4 632222263 18c03180 9575480 88842082 ' +
	'208210888 3a2111004 0').split(' ').map((h) => parseInt(h, 16));

// Rasterize to a 1-byte-per-pixel bitmap (1 = foreground)
export function toBitmap(symbol, options) {
	const L = layout(symbol, options);
	const W = Math.ceil(L.width), H = Math.ceil(L.height), px = new Uint8Array(W * H);
	const fill = (x, y, w, h) => {
		for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
			for (let xx = Math.round(x); xx < Math.round(x + w); xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) px[yy * W + xx] = 1;
	};
	for (const r of L.rects) fill(...r);
	for (const t of L.texts) {
		const k = Math.max(1, Math.round(t.size / 9)), text = String(t.text).toUpperCase();
		const tw = text.length * 6 * k - k;
		let x = Math.round(t.x - (t.anchor === 'middle' ? tw / 2 : t.anchor === 'end' ? tw : 0));
		const y = Math.round(t.y - 7 * k);
		for (const c of text) {
			const g = GLYPH_BITS[GLYPHS.indexOf(c)] ?? GLYPH_BITS[GLYPHS.indexOf('?')];
			for (let r = 0; r < 7; r++)
				for (let col = 0; col < 5; col++) if ((g >>> (34 - r * 5 - col)) & 1) fill(x + col * k, y + r * k, k, k);
			x += 6 * k;
		}
	}
	return { width: W, height: H, data: px, o: L.o };
}

// ---------- PNG (1-bit palette, stored deflate: tiny code, sync, works everywhere) ----------
const CRC = Array.from({ length: 256 }, (_, n) => {
	for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
	return n >>> 0;
});
const crc32 = (bytes) => {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function parseColor(c) {
	const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(c).trim());
	if (!m) throw new Error(`PNG output needs hex colors (#rgb or #rrggbb), got ${JSON.stringify(c)}`);
	const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function toPNG(symbol, options) {
	const { width: W, height: H, data, o } = toBitmap(symbol, options);
	const rowLen = Math.ceil(W / 8) + 1;
	const raw = new Uint8Array(rowLen * H);
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) if (data[y * W + x]) raw[y * rowLen + 1 + (x >> 3)] |= 0x80 >> (x & 7);

	// zlib stream with stored (uncompressed) blocks
	const z = [0x78, 0x01];
	for (let i = 0; i < raw.length || i === 0; i += 65535) {
		const len = Math.min(65535, raw.length - i), last = i + 65535 >= raw.length ? 1 : 0;
		z.push(last, len & 255, len >> 8, ~len & 255, (~len >> 8) & 255);
		for (let k = i; k < i + len; k++) z.push(raw[k]);
	}
	let a = 1, b = 0;
	for (const x of raw) { a = (a + x) % 65521; b = (b + a) % 65521; }
	z.push(...u32(((b << 16) | a) >>> 0));

	const out = [137, 80, 78, 71, 13, 10, 26, 10];
	const chunk = (type, body) => {
		const t = [...type].map((c) => c.charCodeAt(0));
		const typed = t.concat(body);
		out.push(...u32(body.length));
		for (const x of typed) out.push(x);
		out.push(...u32(crc32(typed)));
	};
	chunk('IHDR', [...u32(W), ...u32(H), 1, 3, 0, 0, 0]);
	chunk('PLTE', [...(o.background ? parseColor(o.background) : [255, 255, 255]), ...parseColor(o.color)]);
	if (!o.background) chunk('tRNS', [0]);
	chunk('IDAT', z);
	chunk('IEND', []);
	return Uint8Array.from(out);
}
