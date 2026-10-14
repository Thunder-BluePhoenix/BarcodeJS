// React component: <Barcode value="..." format="QR" scale={6} />. Any toSVG option is a prop.
import { createElement, useMemo } from 'react';
import { toSVG } from './index.js';

export function Barcode({ value, className, style, ...options }) {
	const key = JSON.stringify(options);
	const svg = useMemo(() => toSVG(value, options), [value, key]); // eslint-disable-line react-hooks/exhaustive-deps
	return createElement('span', { className, style, role: 'img', 'aria-label': String(value), dangerouslySetInnerHTML: { __html: svg } });
}
