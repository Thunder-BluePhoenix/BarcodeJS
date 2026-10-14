export type Format =
	| 'CODE128' | 'GS1-128' | 'EAN128'
	| 'EAN13' | 'EAN8' | 'EAN5' | 'EAN2' | 'UPC' | 'UPCA' | 'UPCE' | 'ISBN' | 'ISSN'
	| 'CODE39' | 'CODE39FullASCII' | 'CODE93' | 'CODE93FullASCII' | 'CODE11'
	| 'ITF' | 'ITF14' | 'MSI' | 'MSI10' | 'MSI11' | 'MSI1010' | 'MSI1110'
	| 'CODABAR' | 'PHARMACODE' | 'QR' | 'QRCODE' | 'MICROQR' | 'RMQR' | 'DATAMATRIX' | 'PDF417' | 'AZTEC'
	| 'DATABAR' | 'DATABAR-LIMITED' | 'DATABAR-EXPANDED' | 'ROYALMAIL' | 'IMB' | 'AUSPOST'
	| 'auto' | (string & {});

export interface EncodeOptions {
	/** Barcode format, case-insensitive. 'auto' picks one from the value. Default: 'CODE128'. */
	format?: Format;
	/** EAN-13 / UPC-A / UPC-E / ISBN / ISSN: 2- or 5-digit add-on. */
	addon?: string;
	/** CODE39: append mod-43 check character. MSI: 'mod10' | 'mod11' | 'mod1010' | 'mod1110'. */
	checksum?: boolean | string;
	/** CODE39 / CODE93: encode full 7-bit ASCII. */
	fullASCII?: boolean;
	/** QR / Micro QR error correction level (default 'M' for QR, 'H' with a logo; 'L' for Micro QR). PDF417: 0-8. */
	ecLevel?: 'L' | 'M' | 'Q' | 'H' | number;
	/** QR: force a version (1-40). Micro QR: 1-4 (M1-M4). rMQR: e.g. 'R13x59'. */
	version?: number | string;
	/** rMQR: raise ECC level M to H when the data still fits (default true). */
	boost?: boolean;
	/** QR / Data Matrix: value is a GS1 element string "(01)...(10)..." (encoded with FNC1). */
	gs1?: boolean;
	/** Data Matrix symbol shape. Default: 'square'. */
	shape?: 'square' | 'rectangle' | 'auto';
	/** Data Matrix: include DMRE rectangular sizes (ISO/IEC 21471). */
	dmre?: boolean;
	/** Data Matrix: force a size, e.g. '24x24' or '8x80' (rows x columns). */
	size?: string;
	/** PDF417 data columns (1-30). Default: chosen for a ~3:1 aspect ratio. */
	columns?: number;
	/** PDF417 row height in modules. Default: 3. */
	rowHeight?: number;
	/** Aztec minimum error correction percentage. Default: 33. */
	ecPercent?: number;
}

export interface RenderOptions {
	/** Pixels per module. Default: 2 (linear), 4 (2D). */
	scale?: number;
	/** Bar height in px (linear; 4-state postal default 8 x scale). Default: 100. */
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
	/** SVG <title> for screen readers. Default: the encoded value; false omits it. */
	title?: string | false;
	/** 2D module shape (SVG, canvas, PNG). Default: 'square'. */
	moduleShape?: 'square' | 'dots' | 'rounded';
	/** QR / Micro QR finder pattern shape. */
	finderShape?: 'square' | 'rounded';
	/** QR / Micro QR finder pattern color (PNG: hex). */
	finderColor?: string;
	/** Centered logo: URL/data URI (SVG) or a loaded image object (canvas). Not drawn in PNG; the area is cleared. */
	logo?: string | { src?: string };
	/** Logo size as a fraction of the symbol width, max 0.3. Default: 0.2. */
	logoSize?: number;
}

export type Options = EncodeOptions & RenderOptions;

export interface Segment { bits: string; text?: string; guard?: boolean; textOnly?: boolean; addon?: boolean; }
export interface LinearSymbol { type: 'linear'; segments: Segment[]; text: string; }
export interface MatrixSymbol { type: 'matrix'; width: number; height: number; modules: Uint8Array; quiet: number; text: string; version?: number | string; finders?: [number, number][]; }
/** 4-state postal symbol: F = full, A = ascender, D = descender, T = tracker */
export interface FourStateSymbol { type: 'fourstate'; bars: string; text: string; }
export type BarcodeSymbol = LinearSymbol | MatrixSymbol | FourStateSymbol;

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
export function detectFormat(value: string | number): Format;
/** Render every [data-barcode] element; other data-* attributes become options. */
export function init(root?: ParentNode): void;
export function toSVG(value: Input, options?: Options): string;
export function toPNG(value: Input, options?: Options): Uint8Array;
export function toDataURL(value: Input, options?: Options & { type?: 'png' | 'svg' }): string;
export function toCanvas<C extends { width: number; height: number; getContext(type: '2d'): any }>(canvas: C, value: Input, options?: Options): C;
export function render(target: string | Element | ArrayLike<Element>, value: Input, options?: Options): void;
export function layout(symbol: BarcodeSymbol, options?: RenderOptions): Layout;
export function toBitmap(symbol: BarcodeSymbol, options?: RenderOptions): { width: number; height: number; data: Uint8Array };
