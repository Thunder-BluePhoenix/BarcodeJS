# BarcodeJS

Zero-dependency barcode generator for Node and browsers. 1D and 2D codes, rendered to SVG, PNG or canvas without any native modules.

```js
import { toSVG, toPNG } from 'barcodejs';

const svg = toSVG('Hello World');                                   // Code 128 by default
const qr  = toPNG('https://example.com', { format: 'QR', scale: 8 }); // Uint8Array, pure JS
```

## Why not JsBarcode?

BarcodeJS started from [JsBarcode](https://github.com/lindell/JsBarcode) and every 1D encoder carried over is checked against JsBarcode's output in the test suite. On top of that:

|                          | JsBarcode 3.12             | BarcodeJS                                   |
|--------------------------|----------------------------|---------------------------------------------|
| 2D codes                 | none                       | **QR (v1-40, L/M/Q/H), Data Matrix (10-144)** |
| PNG in Node              | needs native `canvas`      | **built in, pure JS, sync**                 |
| SVG in Node              | needs `xmldom`             | **plain string, no DOM**                    |
| Code 128                 | greedy set switching       | **optimal (shortest) encoding** + Latin-1 via FNC4 |
| GS1-128                  | `ean128` flag, no AI handling | **`(01)…(10)…` input, FNC1 only where required, AI length checks** |
| EAN/UPC add-ons          | manual chaining            | `addon: '12'` / `'12345'`                    |
| Extra formats            | -                          | ISBN, ISSN, Code 11, Code 39 Full ASCII     |
| Codabar                  | 2:1 wide ratio (out of spec) | 3:1 per spec                              |
| Module format            | CommonJS + Babel 6 / gulp  | ESM, types included, tree-shakeable         |
| Browser bundle (all formats) | 66 KB min / 11.4 KB gz | 25 KB min / 10.7 KB gz, including QR + Data Matrix |
| Verification             | unit tests                 | round-trip decoded with ZXing               |

## Install

```bash
npm install barcodejs
```

Or in a browser without a build step:

```html
<script src="https://unpkg.com/barcodejs/dist/barcode.min.js"></script>
<script>BarcodeJS.render('#code', '5901234123457', { format: 'EAN13' });</script>
```

## API

| Function | Returns |
|---|---|
| `toSVG(value, options?)` | SVG markup string |
| `toPNG(value, options?)` | PNG bytes (`Uint8Array`) |
| `toDataURL(value, options?)` | `data:image/png;base64,…` (or SVG with `type: 'svg'`) |
| `toCanvas(canvas, value, options?)` | draws on a canvas (`HTMLCanvasElement`, `OffscreenCanvas`, node-canvas) |
| `render(target, value, options?)` | fills `<svg>`, `<canvas>`, `<img>` or any element; `target` can be a selector |
| `encode(value, options?)` | the symbol (bars or module matrix), for custom renderers |
| `isValid(value, options?)` | `true` if the value can be encoded |

Every render function also accepts a symbol from `encode()` in place of `value`.

### Options

| Option | Default | |
|---|---|---|
| `format` | `'CODE128'` | see formats below, case-insensitive |
| `scale` | `2` (1D) / `4` (2D) | pixels per module |
| `height` | `100` | bar height (1D) |
| `margin` | `10` (1D) / spec quiet zone (2D) | px |
| `text` | `true` | show human-readable text; a string replaces it |
| `font`, `fontSize`, `textMargin` | `'monospace'`, `20`, `2` | |
| `color`, `background` | `'#000000'`, `'#ffffff'` | `background: null` for transparent |
| `ecLevel` | `'M'` | QR error correction `L`/`M`/`Q`/`H` |
| `addon` | - | EAN-13/UPC 2- or 5-digit supplement |
| `checksum` | - | CODE39 `true` (mod 43); MSI `'mod10'`, `'mod11'`, `'mod1010'`, `'mod1110'` |

### Formats

`QR`, `DATAMATRIX`, `CODE128`, `GS1-128`, `EAN13`, `EAN8`, `EAN5`, `EAN2`, `UPC`, `UPCE`, `ISBN`, `ISSN`,
`CODE39`, `CODE39FullASCII`, `CODE93`, `CODE93FullASCII`, `CODE11`, `ITF`, `ITF14`,
`MSI`, `MSI10`, `MSI11`, `MSI1010`, `MSI1110`, `CODABAR`, `PHARMACODE`.

Check digits are added when missing and validated when present (EAN, UPC, ITF-14, ISBN, ISSN).

### Tree-shaking

To ship only what you use, import encoders and renderers directly:

```js
import { qr } from 'barcodejs/qr';
import { toSVG } from 'barcodejs/render';

toSVG(qr('hello', { ecLevel: 'H' }), { scale: 6 });
```

Subpaths: `barcodejs/qr`, `barcodejs/datamatrix`, `barcodejs/code128` (`code128`, `gs1128`), `barcodejs/linear` (all other 1D), `barcodejs/render`.

## Known limits

- QR uses a single encoding mode per symbol (no mixed-mode segmentation); Data Matrix uses ASCII encodation only (no C40/Text/Base256), so some inputs produce a slightly larger symbol than optimal.
- Data Matrix is square-only (no rectangular sizes).
- PNG text uses a built-in 5×7 bitmap font (digits, uppercase, common symbols). Use SVG or canvas for custom fonts.

## Development

```bash
npm install
npm test        # golden tests vs JsBarcode + ZXing round-trip decoding
npm run build   # dist/barcode.min.js (IIFE, global BarcodeJS) + dist/barcode.esm.min.js
```

Open `example/index.html` through a local server after building to try every format.

## License

MIT. Includes work derived from JsBarcode, © 2016 Johan Lindell. See [LICENSE](LICENSE).
