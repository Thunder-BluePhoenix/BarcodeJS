export type Format =
	| 'CODE128' | 'GS1-128' | 'EAN128'
	| 'EAN13' | 'EAN8' | 'EAN5' | 'EAN2' | 'UPC' | 'UPCA' | 'UPCE' | 'ISBN' | 'ISSN'
	| 'CODE39' | 'CODE39FullASCII' | 'CODE93' | 'CODE93FullASCII' | 'CODE11'
	| 'ITF' | 'ITF14' | 'MSI' | 'MSI10' | 'MSI11' | 'MSI1010' | 'MSI1110'
	| 'CODABAR' | 'PHARMACODE' | 'QR' | 'QRCODE' | 'DATAMATRIX'
	| (string & {});

export interface EncodeOptions {
	/** Barcode format, case-insensitive. Default: 'CODE128'. */
	format?: Format;
	/** EAN-13 / UPC-A / UPC-E / ISBN / ISSN: 2- or 5-digit add-on. */
	addon?: string;
	/** CODE39: append mod-43 check character. MSI: 'mod10' | 'mod11' | 'mod1010' | 'mod1110'. */
	checksum?: boolean | string;
	/** CODE39 / CODE93: encode full 7-bit ASCII. */
	fullASCII?: boolean;
	/** QR error correction level. Default: 'M'. */
	ecLevel?: 'L' | 'M' | 'Q' | 'H';
	/** QR: force a version (1-40) instead of the smallest that fits. */
	version?: number;
}

export interface RenderOptions {
	/** Pixels per module. Default: 2 (linear), 4 (2D). */
	scale?: number;
	/** Bar height in px (linear). Default: 100. */
	height?: number;
	/** Quiet zone in px. Default: 10 (linear), spec quiet zone x scale (2D). */
	margin?: number;
	/** Show human-readable text (linear). A string replaces it. Default: true. */
	text?: boolean | string;
	font?: string;
	fontSize?: number;
	textMargin?: number;
	/** Bar/module color. PNG output requires hex (#rgb / #rrggbb). Default: '#000000'. */
	color?: string;
	/** Background color; null or '' for transparent. Default: '#ffffff'. */
	background?: string | null;
}

export type Options = EncodeOptions & RenderOptions;

export interface Segment { bits: string; text?: string; guard?: boolean; textOnly?: boolean; addon?: boolean; }
export interface LinearSymbol { type: 'linear'; segments: Segment[]; text: string; }
export interface MatrixSymbol { type: 'matrix'; width: number; height: number; modules: Uint8Array; quiet: number; text: string; version?: number; }
export type BarcodeSymbol = LinearSymbol | MatrixSymbol;

export interface Layout {
	width: number;
	height: number;
	rects: [x: number, y: number, w: number, h: number][];
	texts: { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end'; size: number }[];
}

type Input = string | number | BarcodeSymbol;

export const formats: Record<string, (value: string, options?: EncodeOptions) => BarcodeSymbol>;
export function encode(value: string | number, options?: EncodeOptions): BarcodeSymbol;
export function isValid(value: string | number, options?: EncodeOptions): boolean;
export function toSVG(value: Input, options?: Options): string;
export function toPNG(value: Input, options?: Options): Uint8Array;
export function toDataURL(value: Input, options?: Options & { type?: 'png' | 'svg' }): string;
export function toCanvas<C extends { width: number; height: number; getContext(type: '2d'): any }>(canvas: C, value: Input, options?: Options): C;
export function render(target: string | Element | ArrayLike<Element>, value: Input, options?: Options): void;
export function layout(symbol: BarcodeSymbol, options?: RenderOptions): Layout;
export function toBitmap(symbol: BarcodeSymbol, options?: RenderOptions): { width: number; height: number; data: Uint8Array };
