import * as L from './linear.js';
import { code128, gs1128 } from './code128.js';
import { qr } from './qr.js';
import { microqr } from './microqr.js';
import { pdf417 } from './pdf417.js';
import { aztec } from './aztec.js';
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
	QR: qr, QRCODE: qr, MICROQR: microqr, DATAMATRIX: datamatrix, PDF417: pdf417, AZTEC: aztec,
};

// format: 'auto' picks a format from the value's shape
export function detectFormat(value) {
	const v = String(value);
	const ok = (format) => isValid(v, { format });
	if (/^\(\d{2,4}\)/.test(v) && ok('GS1-128')) return 'GS1-128';
	if (/^\d{13}$/.test(v) && ok('EAN13')) return 'EAN13';
	if (/^\d{12}$/.test(v) && ok('UPC')) return 'UPC';
	if (/^\d{8}$/.test(v) && ok('EAN8')) return 'EAN8';
	if (/^\d{14}$/.test(v) && ok('ITF14')) return 'ITF14';
	if (v.length > 40 || /^[a-z][a-z\d+.-]*:/i.test(v) || /[^\x00-\xff]/.test(v)) return 'QR';
	return 'CODE128';
}

export function encode(value, options = {}) {
	const format = String(options.format ?? 'CODE128').toLowerCase() === 'auto' ? detectFormat(value) : options.format ?? 'CODE128';
	const name = String(format).toUpperCase().replace(/[-_\s]/g, '');
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

// Render every element with a data-barcode attribute; other data-* attributes become options
// (<svg data-barcode="12345" data-format="EAN8" data-scale="3">).
const attr = (v) => (v === 'true' ? true : v === 'false' ? false : v !== '' && !isNaN(v) ? Number(v) : v);
export function init(root = document) {
	for (const el of root.querySelectorAll('[data-barcode]')) {
		const options = {};
		for (const [k, v] of Object.entries(el.dataset)) if (k !== 'barcode') options[k] = attr(v);
		render(el, el.dataset.barcode, options);
	}
}

export { layout, toBitmap } from './render.js';
