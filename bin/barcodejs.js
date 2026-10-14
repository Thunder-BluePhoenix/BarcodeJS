#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFileSync, readFileSync } from 'node:fs';
import { toSVG, toPNG, formats } from '../src/index.js';

const HELP = `Usage: barcodejs <value> [options]      (value "-" reads stdin)

  -f, --format <name>     ${Object.keys(formats).join(', ')}, or auto (default: CODE128)
  -o, --output <file>     .svg or .png (default: SVG to stdout)
  -t, --type <svg|png>    output type when writing to stdout
  -s, --scale <n>         pixels per module
      --height <n>        bar height (1D)
      --margin <n>        quiet zone in px
  -e, --ec-level <L|M|Q|H>  QR / Micro QR error correction
      --text <string>     replace the human-readable text
      --no-text           hide the human-readable text
      --color <hex>       bars/modules (default #000000)
      --background <hex>  background (default #ffffff)
      --transparent       no background
      --addon <digits>    EAN/UPC 2- or 5-digit add-on
      --gs1               GS1 input for QR / Data Matrix, e.g. "(01)09501101530003(10)AB1"
      --shape <square|rectangle|auto>   Data Matrix shape
      --columns <n>       PDF417 data columns
      --module-shape <square|dots|rounded>, --finder-shape <square|rounded>, --finder-color <hex>
  -h, --help`;

const num = ['scale', 'height', 'margin', 'columns', 'version', 'font-size'];
const str = ['format', 'output', 'type', 'ec-level', 'text', 'color', 'background', 'addon', 'shape', 'module-shape', 'finder-shape', 'finder-color', 'font', ...num];
let args;
try {
	args = parseArgs({
		allowPositionals: true,
		options: {
			...Object.fromEntries(str.map((k) => [k, { type: 'string' }])),
			format: { type: 'string', short: 'f' }, output: { type: 'string', short: 'o' }, type: { type: 'string', short: 't' },
			scale: { type: 'string', short: 's' }, 'ec-level': { type: 'string', short: 'e' },
			'no-text': { type: 'boolean' }, transparent: { type: 'boolean' }, gs1: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
		},
	});
} catch (e) {
	console.error(e.message + '\n\n' + HELP);
	process.exit(2);
}
const { values: a, positionals } = args;
if (a.help || positionals.length !== 1) {
	console.log(HELP);
	process.exit(a.help ? 0 : 2);
}

const camel = (k) => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const options = {};
for (const [k, v] of Object.entries(a)) {
	if (['output', 'type', 'no-text', 'transparent', 'help'].includes(k)) continue;
	options[camel(k)] = num.includes(k) ? Number(v) : v;
}
if (a['no-text']) options.text = false;
if (a.transparent) options.background = null;

try {
	const value = positionals[0] === '-' ? readFileSync(0, 'utf8').replace(/\r?\n$/, '') : positionals[0];
	const type = a.type ?? (a.output?.toLowerCase().endsWith('.png') ? 'png' : 'svg');
	const out = type === 'png' ? toPNG(value, options) : toSVG(value, options);
	if (a.output) writeFileSync(a.output, out);
	else process.stdout.write(out);
} catch (e) {
	console.error(`barcodejs: ${e.message}`);
	process.exit(1);
}
