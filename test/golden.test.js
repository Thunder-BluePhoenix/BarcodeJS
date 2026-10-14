// Every 1D encoder ported from JsBarcode must produce identical modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encode } from '../src/index.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/jsbarcode-golden.json', import.meta.url)));
const bits = (s) => s.segments.filter((g) => !g.textOnly && !g.addon).map((g) => g.bits).join('');

for (const [name, cases] of Object.entries(golden)) {
	// CODE128: ours picks optimal code sets (checked below). codabar: we use the spec's 3:1 wide ratio.
	if (name === 'CODE128' || name === 'codabar') continue;
	test(`${name} matches JsBarcode`, () => {
		for (const [value, expected] of cases) {
			const sym = name === 'CODE39_mod43' ? encode(value, { format: 'CODE39', checksum: true }) : encode(value, { format: name });
			assert.equal(bits(sym), expected, `${name} ${JSON.stringify(value)}`);
		}
	});
}

test('CODE128 is never longer than JsBarcode', () => {
	for (const [value, theirs] of golden.CODE128) {
		const ours = bits(encode(value, { format: 'CODE128' }));
		assert.ok(ours.length <= theirs.length, `${JSON.stringify(value)}: ${ours.length} > ${theirs.length}`);
	}
});
