// Text -> bytes plus the ECI to declare: none for ASCII, 3 (ISO-8859-1) for Latin-1, 26 (UTF-8) otherwise.
// An explicit ECI stops readers guessing (e.g. Latin-1 "½" read as Shift-JIS).
export function charsetBytes(text) {
	const cps = [...text].map((c) => c.codePointAt(0));
	if (cps.every((c) => c < 128)) return { bytes: cps, eci: null };
	if (cps.every((c) => c < 256)) return { bytes: cps, eci: 3 };
	return { bytes: [...new TextEncoder().encode(text)], eci: 26 };
}
