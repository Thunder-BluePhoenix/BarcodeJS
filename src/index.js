import * as L from './linear.js';
import { code128, gs1128 } from './code128.js';
import { qr } from './qr.js';
import { datamatrix } from './datamatrix.js';
import * as R from './render.js';

const fixed = (fn, extra) => (v, o) => fn(v, { ...o, ...extra });

// Format name (case-insensitive, '-'/'_' ignored) -> encoder(value, options) -> symbol
export const formats = {
	CODE128: code128, GS1128: gs1128, EAN128: gs1128,
	EAN13: L.ean13, EAN8: L.ean8, EAN5: L.ean5, EAN2: L.ean2, UPC: L.upca, UPCA: L.upca, UPCE: L.upce,
	ISBN: L.isbn, ISSN: L.issn,
	CODE39: L.code39, CODE39FULLASCII: fixed(L.code39, { fullASCII: true }),
	CODE93: L.code93, CODE93FULLASCII: fixed(L.code93, { fullASCII: true }),
	CODE11: L.code11, ITF: L.itf, ITF14: L.itf14,
	MSI: L.msi, MSI10: fixed(L.msi, { checksum: 'mod10' }), MSI11: fixed(L.msi, { checksum: 'mod11' }),
	MSI1010: fixed(L.msi, { checksum: 'mod1010' }), MSI1110: fixed(L.msi, { checksum: 'mod1110' }),
	CODABAR: L.codabar, PHARMACODE: L.pharmacode,
	QR: qr, QRCODE: qr, DATAMATRIX: datamatrix,
};

export function encode(value, options = {}) {
	const name = String(options.format ?? 'CODE128').toUpperCase().replace(/[-_\s]/g, '');
	const fn = formats[name];
	if (!fn) throw new Error(`Unknown barcode format: ${options.format}`);
	return fn(value, options);
}

export function isValid(value, options) {
	try { encode(value, options); return true; } catch { return false; }
}

const sym = (value, options) => (value && typeof value === 'object' && value.type ? value : encode(value, options));

export const toSVG = (value, options) => R.toSVG(sym(value, options), options);
export const toPNG = (value, options) => R.toPNG(sym(value, options), options);
export const toCanvas = (canvas, value, options) => R.toCanvas(canvas, sym(value, options), options);

export function toDataURL(value, options = {}) {
	if (options.type === 'svg') return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSVG(value, options));
	const png = toPNG(value, options);
	let s = '';
	for (let i = 0; i < png.length; i += 0x8000) s += String.fromCharCode(...png.subarray(i, i + 0x8000));
	return 'data:image/png;base64,' + btoa(s);
}

// Browser helper: render into <svg>, <canvas>, <img>, or any element (gets an inline SVG).
// `target` may be an element, a NodeList/array, or a CSS selector.
export function render(target, value, options = {}) {
	const els = typeof target === 'string' ? document.querySelectorAll(target) : target.length !== undefined ? target : [target];
	for (const el of els) {
		const tag = el.tagName.toLowerCase();
		if (tag === 'canvas') toCanvas(el, value, options);
		else if (tag === 'img') el.src = toDataURL(value, { type: 'svg', ...options });
		else if (tag === 'svg') {
			const tmp = document.createElement('div');
			tmp.innerHTML = toSVG(value, options);
			const svg = tmp.firstChild;
			for (const a of ['width', 'height', 'viewBox', 'shape-rendering']) el.setAttribute(a, svg.getAttribute(a));
			el.innerHTML = svg.innerHTML;
		} else el.innerHTML = toSVG(value, options);
	}
}

export { layout, toBitmap } from './render.js';
