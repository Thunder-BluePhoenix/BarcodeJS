import type { Options } from './index.js';

export interface BarcodeProps extends Options {
	value: string | number;
	className?: string;
	style?: Record<string, string | number>;
}
/** React component (barcodejs/react) */
export declare function Barcode(props: BarcodeProps): any;
