export interface DecodeResult {
	format: 'QR' | 'EAN-13' | 'UPC-A' | 'EAN-8' | 'UPC-E' | 'CODE128' | 'CODE39' | 'ITF';
	text: string;
	/** GS1 data (FNC1): text uses ASCII 29 (GS) between variable-length fields. */
	gs1?: boolean;
	/** QR only */
	version?: number;
	ecLevel?: 'L' | 'M' | 'Q' | 'H';
	errorsCorrected?: number;
}

/**
 * Read barcodes from an image: RGBA (`ImageData`, canvas `getImageData()`) or 8-bit grayscale.
 * Finds one QR code and 1D barcodes in any 90-degree orientation (QR at any angle).
 */
export function decode(
	image: { data: ArrayLike<number>; width: number; height: number },
	options?: { formats?: Array<'QR' | 'EAN13' | 'UPCA' | 'EAN8' | 'UPCE' | 'CODE128' | 'CODE39' | 'ITF'> },
): DecodeResult[];
