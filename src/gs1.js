// GS1 element strings in human-readable form: "(01)09501101530003(17)250101(10)ABC123".

// Application Identifiers whose total length (AI + data) is predefined: no FNC1 separator needed after them.
const PREDEFINED = { '00': 20, '01': 16, '02': 16, '03': 16, '04': 18, '11': 8, '12': 8, '13': 8, '14': 8, '15': 8,
	'16': 8, '17': 8, '18': 8, '19': 8, '20': 4, '31': 10, '32': 10, '33': 10, '34': 10, '35': 10, '36': 10, '41': 16 };

// Returns the element string as an array of strings and the FNC1 marker (null) where a separator is required.
export function gs1Parts(value, format) {
	const v = String(value);
	const fields = [...v.matchAll(/\((\d{2,4})\)([^()]+)/g)];
	if (!/^[\x20-\x7e]+$/.test(v) || !fields.length || fields.map((m) => m[0]).join('') !== v)
		throw new Error(`Invalid ${format} value: ${JSON.stringify(value)}`);
	const parts = [];
	fields.forEach(([, ai, data], k) => {
		const fixed = PREDEFINED[ai.slice(0, 2)];
		if (fixed && ai.length + data.length !== fixed) throw new Error(`Invalid ${format} value: ${JSON.stringify(value)} (AI ${ai} needs ${fixed - ai.length} characters)`);
		parts.push(ai + data);
		if (!fixed && k < fields.length - 1) parts.push(null);
	});
	return parts;
}
