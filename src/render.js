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

// Shapes in pixels: { width, height, rects: [[x, y, w, h]], shapes: [{ x, y, w, h, r, color, hole }],
// texts: [{ x, y, text, anchor, size }], image: { href, x, y, w, h } }
export function layout(symbol, options = {}) {
	const o = { ...DEFAULTS, ...options };
	const rects = [], texts = [], shapes = [];
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
		const s = o.scale ?? 4, m = o.margin ?? symbol.quiet * s, w = symbol.width, h = symbol.height;
		const shape = o.moduleShape ?? 'square';
		const rounded = o.finderShape === 'rounded';
		const finders = rounded || o.finderColor ? symbol.finders ?? [] : [];
		const inFinder = (x, y) => finders.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
		// Logo: clear a centered square of modules (QR picks ECC level H by default when a logo is set)
		let hole = null, image;
		if (o.logo) {
			let n = Math.round(w * Math.min(o.logoSize ?? 0.2, 0.3));
			n += (w - n) % 2;
			hole = [(w - n) / 2, (h - n) / 2, n];
			const pad = s / 2;
			image = { href: typeof o.logo === 'string' ? o.logo : o.logo.src, img: o.logo, x: m + hole[0] * s + pad, y: m + hole[1] * s + pad, w: n * s - 2 * pad, h: n * s - 2 * pad };
		}
		const inHole = (x, y) => hole && x >= hole[0] && x < hole[0] + hole[2] && y >= hole[1] && y < hole[1] + hole[2];
		for (let y = 0; y < h; y++) {
			const row = symbol.modules.slice(y * w, (y + 1) * w);
			for (let x = 0; x < w; x++) if (inFinder(x, y) || inHole(x, y)) row[x] = 0;
			if (shape === 'square') runs(row, m, m + y * s, s, s);
			else for (let x = 0; x < w; x++) if (row[x]) shapes.push(shape === 'dots'
				? { x: m + (x + 0.05) * s, y: m + (y + 0.05) * s, w: 0.9 * s, h: 0.9 * s, r: 0.45 * s }
				: { x: m + x * s, y: m + y * s, w: s, h: s, r: 0.3 * s });
		}
		for (const [fx, fy] of finders) {
			const X = m + fx * s, Y = m + fy * s, color = o.finderColor ?? o.color;
			shapes.push({ x: X, y: Y, w: 7 * s, h: 7 * s, r: rounded ? 2 * s : 0, color, hole: { x: X + s, y: Y + s, w: 5 * s, h: 5 * s, r: rounded ? 1.5 * s : 0 } });
			shapes.push({ x: X + 2 * s, y: Y + 2 * s, w: 3 * s, h: 3 * s, r: rounded ? s : 0, color });
		}
		return { width: w * s + 2 * m, height: h * s + 2 * m, rects, shapes, texts, image, o };
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
	return { width: x + m, height: m + Math.max(guardH, h + textH) + m, rects, shapes, texts, o };
}

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n2 = (n) => +n.toFixed(2);
const rrPath = ({ x, y, w, h, r }) => {
	[x, y, w, h, r] = [x, y, w, h, Math.min(r, w / 2, h / 2)].map(n2);
	if (!r) return `M${x} ${y}h${w}v${h}h${-w}z`;
	const a = (dx, dy) => `a${r} ${r} 0 0 1 ${dx} ${dy}`;
	return `M${n2(x + r)} ${y}h${n2(w - 2 * r)}${a(r, r)}v${n2(h - 2 * r)}${a(-r, r)}h${n2(2 * r - w)}${a(-r, -r)}v${n2(2 * r - h)}${a(r, -r)}z`;
};

export function toSVG(symbol, options) {
	const L = layout(symbol, options), o = L.o;
	const d = L.rects.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}z`).join('');
	const byColor = {};
	for (const sh of L.shapes) (byColor[sh.color ?? o.color] ??= []).push(rrPath(sh) + (sh.hole ? rrPath(sh.hole) : ''));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}"${L.shapes.length ? '' : ' shape-rendering="crispEdges"'}>` +
		(o.background ? `<rect width="100%" height="100%" fill="${esc(o.background)}"/>` : '') +
		(d ? `<path fill="${esc(o.color)}" d="${d}"/>` : '') +
		Object.entries(byColor).map(([c, ds]) => `<path fill="${esc(c)}" fill-rule="evenodd" d="${ds.join('')}"/>`).join('') +
		(L.image ? `<image href="${esc(L.image.href)}" x="${L.image.x}" y="${L.image.y}" width="${L.image.w}" height="${L.image.h}" preserveAspectRatio="xMidYMid meet"/>` : '') +
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
	const rr = ({ x, y, w, h, r }) => {
		r = Math.min(r, w / 2, h / 2);
		ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
	};
	for (const sh of L.shapes) {
		ctx.fillStyle = sh.color ?? o.color;
		ctx.beginPath(); rr(sh); if (sh.hole) rr(sh.hole); ctx.fill('evenodd');
	}
	// Logo must be an already-loaded image (HTMLImageElement, ImageBitmap, ...) since drawing is synchronous
	if (L.image && typeof L.image.img === 'object') ctx.drawImage(L.image.img, L.image.x, L.image.y, L.image.w, L.image.h);
	ctx.fillStyle = o.color;
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

// Rasterize to a 1-byte-per-pixel bitmap (0 = background, 1 = color, 2 = finderColor). Logos are not rasterized.
export function toBitmap(symbol, options) {
	const L = layout(symbol, options);
	const W = Math.ceil(L.width), H = Math.ceil(L.height), px = new Uint8Array(W * H);
	const fill = (x, y, w, h) => {
		for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
			for (let xx = Math.round(x); xx < Math.round(x + w); xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) px[yy * W + xx] = 1;
	};
	for (const r of L.rects) fill(...r);
	const inside = ({ x, y, w, h, r }, px_, py) => {
		const dx = Math.max(x + r - px_, 0, px_ - (x + w - r)), dy = Math.max(y + r - py, 0, py - (y + h - r));
		return px_ >= x && px_ <= x + w && py >= y && py <= y + h && dx * dx + dy * dy <= r * r + 1e-9;
	};
	for (const sh of L.shapes) {
		const v = sh.color && sh.color !== L.o.color ? 2 : 1;
		for (let yy = Math.max(0, Math.floor(sh.y)); yy < Math.min(H, Math.ceil(sh.y + sh.h)); yy++)
			for (let xx = Math.max(0, Math.floor(sh.x)); xx < Math.min(W, Math.ceil(sh.x + sh.w)); xx++)
				if (inside(sh, xx + 0.5, yy + 0.5) && !(sh.hole && inside(sh.hole, xx + 0.5, yy + 0.5))) px[yy * W + xx] = v;
	}
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

// ---------- PNG (1- or 2-bit palette, small sync deflate, works everywhere) ----------

// Fixed-Huffman deflate with LZ77 matches at distance 1 (runs) and one row up (repeated rows).
// ponytail: no hash-chain search or dynamic Huffman; barcode rasters are almost all runs and repeated rows.
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
export function deflate(raw, rowLen) {
	const out = [];
	let buf = 0, cnt = 0;
	const put = (v, n) => { buf |= v << cnt; cnt += n; while (cnt >= 8) { out.push(buf & 255); buf >>>= 8; cnt -= 8; } };
	const huff = (c, n) => { let r = 0; for (let i = 0; i < n; i++) r |= ((c >> i) & 1) << (n - 1 - i); put(r, n); };
	const lit = (x) => (x < 144 ? huff(0x30 + x, 8) : x < 256 ? huff(0x190 + x - 144, 9) : x < 280 ? huff(x - 256, 7) : huff(0xc0 + x - 280, 8));
	put(1, 1); put(1, 2); // final block, fixed Huffman
	for (let i = 0; i < raw.length;) {
		let len = 0, dist = 0;
		for (const d of [rowLen, 1]) {
			if (d > i || d > 32768) continue;
			let n = 0;
			while (n < 258 && i + n < raw.length && raw[i + n] === raw[i + n - d]) n++;
			if (n > len) { len = n; dist = d; }
		}
		if (len >= 3) {
			let c = 0;
			while (c < 28 && LEN_BASE[c + 1] <= len) c++;
			lit(257 + c); put(len - LEN_BASE[c], LEN_EXTRA[c]);
			let dc = 0;
			while (dc < 29 && DIST_BASE[dc + 1] <= dist) dc++;
			huff(dc, 5); put(dist - DIST_BASE[dc], DIST_EXTRA[dc]);
			i += len;
		} else lit(raw[i++]);
	}
	lit(256);
	if (cnt) out.push(buf & 255);
	return out;
}
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
	const bd = data.includes(2) ? 2 : 1, per = 8 / bd;
	const rowLen = Math.ceil(W / per) + 1;
	const raw = new Uint8Array(rowLen * H);
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) if (data[y * W + x]) raw[y * rowLen + 1 + Math.floor(x / per)] |= data[y * W + x] << (8 - bd - (x % per) * bd);

	const z = [0x78, 0x01].concat(deflate(raw, rowLen));
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
	chunk('IHDR', [...u32(W), ...u32(H), bd, 3, 0, 0, 0]);
	chunk('PLTE', [...(o.background ? parseColor(o.background) : [255, 255, 255]), ...parseColor(o.color), ...(bd === 2 ? parseColor(o.finderColor) : [])]);
	if (!o.background) chunk('tRNS', [0]);
	chunk('IDAT', z);
	chunk('IEND', []);
	return Uint8Array.from(out);
}
