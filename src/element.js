// <bar-code value="5901234123457" format="EAN13" scale="3"></bar-code>
// Every attribute except `value` is an option (kebab-case -> camelCase); re-renders when attributes change.
import { toSVG } from './index.js';

const OPTIONS = ['format', 'scale', 'height', 'margin', 'text', 'font', 'font-size', 'text-margin', 'color', 'background', 'title',
	'ec-level', 'version', 'gs1', 'shape', 'dmre', 'size', 'columns', 'row-height', 'ec-percent', 'addon', 'checksum', 'full-ascii',
	'module-shape', 'finder-shape', 'finder-color', 'logo', 'logo-size'];
const parse = (v) => (v === '' || v === 'true' ? true : v === 'false' ? false : v !== null && !isNaN(v) ? Number(v) : v);
const camel = (k) => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;
export class BarCodeElement extends Base {
	static get observedAttributes() { return ['value', ...OPTIONS]; }
	connectedCallback() { this.render(); }
	attributeChangedCallback() { if (this.isConnected) this.render(); }
	render() {
		const options = {};
		for (const k of OPTIONS) if (this.hasAttribute(k)) options[camel(k)] = parse(this.getAttribute(k));
		try {
			this.innerHTML = toSVG(this.getAttribute('value') ?? '', options);
			this.removeAttribute('aria-invalid');
		} catch (error) {
			this.innerHTML = '';
			this.setAttribute('aria-invalid', 'true');
			this.dispatchEvent(new CustomEvent('error', { detail: error }));
		}
	}
}
if (typeof customElements !== 'undefined' && !customElements.get('bar-code')) customElements.define('bar-code', BarCodeElement);
