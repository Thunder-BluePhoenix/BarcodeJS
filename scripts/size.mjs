// Fails when a typical import grows past its gzip budget (keeps README size claims true).
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';

const BUDGETS = {
	'Code 128 only': ["import { code128 } from './src/code128.js'", 'code128', 4000],
	'EAN-13 only': ["import { ean13 } from './src/linear.js'", 'ean13', 3500],
	'QR only': ["import { qr } from './src/qr.js'", 'qr', 6500],
	'Data Matrix only': ["import { datamatrix } from './src/datamatrix.js'", 'datamatrix', 6000], // + DMRE, X12/EDIFACT, optimal DP
	'Decoder': ["import { decode } from './src/decode.js'", 'decode', 12000],
	Everything: ["import * as all from './src/index.js'", 'all', 34000], // + rMQR, DataBar, postal
};

let failed = false;
for (const [name, [imp, sym, budget]] of Object.entries(BUDGETS)) {
	const contents = `${imp}; import { toSVG } from './src/render.js'; globalThis.x = [${sym}, toSVG];`;
	const { outputFiles } = await build({ stdin: { contents, resolveDir: process.cwd() }, bundle: true, minify: true, format: 'esm', write: false });
	const gz = gzipSync(outputFiles[0].contents).length;
	const ok = gz <= budget;
	failed ||= !ok;
	console.log(`${ok ? 'ok  ' : 'OVER'} ${name.padEnd(18)} ${(gz / 1024).toFixed(1)} KB gz (budget ${(budget / 1024).toFixed(1)} KB)`);
}
process.exit(failed ? 1 : 0);
