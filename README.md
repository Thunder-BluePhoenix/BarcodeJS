# BarcodeJS

Zero-dependency barcode **generator and reader** for Node, browsers, Deno and Bun.

- **Create:** QR, Micro QR, rMQR, Data Matrix (incl. DMRE), PDF417, Aztec, GS1 DataBar, postal 4-state codes, and every common 1D symbology.
- **Output:** SVG, PNG or canvas, with no native modules.
- **Read:** QR and the main retail 1D codes back from images.
- **Tooling:** a CLI, a `<bar-code>` web component, and React/Vue components.

```js
import { toSVG, toPNG } from '@thunder-bluephoenix/barcodejs';
import { decode } from '@thunder-bluephoenix/barcodejs/decode';

toSVG('Hello World');                                    // Code 128 by default
toPNG('https://example.com', { format: 'QR', scale: 8 }); // Uint8Array, pure JS
toSVG('5901234123457', { format: 'auto' });               // detected as EAN-13
decode(ctx.getImageData(0, 0, w, h));                     // [{ format: 'QR', text: '...' }]
```

```bash
npx @thunder-bluephoenix/barcodejs "https://example.com" -f qr -o qr.png
npx @thunder-bluephoenix/barcodejs --decode photo.png
```

## Why not JsBarcode?

BarcodeJS started from [JsBarcode](https://github.com/lindell/JsBarcode); every 1D encoder carried over is checked against JsBarcode's output in the test suite.

|                          | JsBarcode 3.12             | BarcodeJS                                   |
|--------------------------|----------------------------|---------------------------------------------|
| 2D codes                 | none                       | **QR, Micro QR, rMQR, Data Matrix + DMRE, PDF417, Aztec** |
| GS1                      | `ean128` flag only         | **GS1-128, GS1 DataBar (Omni / Limited / Expanded), GS1 QR, GS1 Data Matrix** |
| Postal                   | -                          | **USPS Intelligent Mail, Royal Mail 4-State, Australia Post** |
| Reading barcodes         | -                          | **QR (any angle, error correction), EAN/UPC, Code 128, Code 39, ITF** |
| PNG in Node              | needs native `canvas`      | **built in, pure JS, compressed**           |
| SVG in Node              | needs `xmldom`             | **plain string, no DOM, accessible `<title>`** |
| Encoding efficiency      | greedy                     | **optimal** Code 128, QR, Data Matrix and Aztec segmentation |
| QR styling               | -                          | dots / rounded modules, rounded or coloured finders, logo |
| Tooling                  | -                          | CLI, `format: 'auto'`, `<bar-code>`, `data-barcode`, React & Vue |
| Module format            | CommonJS + Babel 6 / gulp  | ESM + CommonJS build, types, tree-shakeable, JSR |
| Size, Code 128 only      | 6.5 KB gz                  | 3.7 KB gz                                   |
| Verification             | unit tests                 | golden tests vs JsBarcode and BWIPP, decoded by **ZXing and zxing-cpp**, seeded random inputs in CI |

## Install

```bash
npm install @thunder-bluephoenix/barcodejs     # Node, bundlers
deno add jsr:@thunder-bluephoenix/barcodejs    # Deno / JSR
```

Browser, no build step:

```html
<script src="https://unpkg.com/@thunder-bluephoenix/barcodejs/dist/barcode.min.js"></script>
<bar-code value="5901234123457" format="EAN13"></bar-code>
<bar-code value="https://example.com" format="QR" module-shape="dots" scale="4"></bar-code>
```

## Creating barcodes

| Function | Returns |
|---|---|
| `toSVG(value, options?)` | SVG markup string |
| `toPNG(value, options?)` | PNG bytes (`Uint8Array`) |
| `toDataURL(value, options?)` | `data:image/png;base64,…` (or SVG with `type: 'svg'`) |
| `toCanvas(canvas, value, options?)` | draws on a canvas (`HTMLCanvasElement`, `OffscreenCanvas`, node-canvas) |
| `render(target, value, options?)` | fills `<svg>`, `<canvas>`, `<img>` or any element; `target` can be a selector |
| `init(root?)` | renders every `[data-barcode]` element; other `data-*` attributes are options |
| `encode(value, options?)` | the symbol (bars, 4-state bars or module matrix) for custom renderers |
| `isValid(value, options?)` / `detectFormat(value)` | validation / the format `'auto'` would pick |

Every render function also accepts a symbol from `encode()` in place of `value`. Invalid input throws an `Error` naming the format and value.

### Formats

| | |
|---|---|
| **2D** | `QR`, `MICROQR`, `RMQR`, `DATAMATRIX`, `PDF417`, `AZTEC` |
| **Retail / GS1** | `EAN13`, `EAN8`, `EAN5`, `EAN2`, `UPC`, `UPCE`, `ISBN`, `ISSN`, `GS1-128`, `DATABAR`, `DATABAR-LIMITED`, `DATABAR-EXPANDED`, `ITF14` |
| **Industrial** | `CODE128`, `CODE39`, `CODE39FullASCII`, `CODE93`, `CODE93FullASCII`, `CODE11`, `ITF`, `CODABAR`, `MSI`, `MSI10`, `MSI11`, `MSI1010`, `MSI1110`, `PHARMACODE` |
| **Postal** | `IMB` (USPS Intelligent Mail), `ROYALMAIL` (RM4SCC), `AUSPOST` |

Check digits are added when missing and validated when present. Non-ASCII text in QR, Data Matrix, PDF417 and Aztec carries an ECI marker (ISO-8859-1 or UTF-8) so readers don't have to guess.

### Options

| Option | Default | |
|---|---|---|
| `format` | `'CODE128'` | case-insensitive; `'auto'` detects GS1, EAN/UPC, ITF-14, URLs and long/Unicode text (QR), else Code 128 |
| `scale` | `2` (1D) / `4` (2D) | pixels per module |
| `height` | `100` | bar height (1D); 4-state postal default `8 × scale` |
| `margin` | `10` (1D) / spec quiet zone (2D) | px |
| `text` | `true` | human-readable text; a string replaces it. Wide text widens the symbol |
| `font`, `fontSize`, `textMargin` | `'monospace'`, `20`, `2` | |
| `color`, `background` | `'#000000'`, `'#ffffff'` | `background: null` for transparent |
| `title` | the value | SVG `<title>` for screen readers; `false` omits it |
| `ecLevel` | QR `'M'` (`'H'` with a logo), Micro QR `'L'`, rMQR `'M'`, PDF417 auto | |
| `version` | smallest that fits | QR 1-40, Micro QR 1-4, rMQR `'R13x59'` etc. |
| `gs1` | `false` | QR / Data Matrix: value is `"(01)…(10)…"` |
| `shape`, `dmre`, `size` | `'square'`, `false`, - | Data Matrix: `'rectangle'` / `'auto'`; include DMRE sizes; force `'8x80'` etc. |
| `columns`, `rowHeight` | auto, `3` | PDF417 |
| `ecPercent` | `33` | Aztec |
| `addon` | - | EAN-13/UPC 2- or 5-digit supplement |
| `checksum` | - | CODE39 `true` (mod 43); MSI `'mod10'`, `'mod11'`, `'mod1010'`, `'mod1110'` |
| `moduleShape` | `'square'` | 2D: `'dots'` or `'rounded'` |
| `finderShape`, `finderColor` | - | QR / Micro QR finder patterns |
| `logo`, `logoSize` | -, `0.2` | QR centre logo: URL (SVG) or loaded image (canvas); max 0.3 |

### QR styling

```js
toSVG('https://example.com', {
  format: 'QR', scale: 8,
  moduleShape: 'dots', finderShape: 'rounded', finderColor: '#1a3c8f',
  logo: 'https://example.com/logo.svg', logoSize: 0.22, // ECC level H is chosen automatically
});
```

## Reading barcodes

```js
import { decode } from '@thunder-bluephoenix/barcodejs/decode';

decode(imageData);                        // ImageData, or { data, width, height } with RGBA or 8-bit gray
decode(imageData, { formats: ['QR'] });   // restrict the search
// -> [{ format: 'QR', text: 'https://…', version: 3, ecLevel: 'M', errorsCorrected: 0 }]
```

Finds one QR code at any rotation (perspective-corrected via the alignment pattern, Reed–Solomon error correction, numeric/alphanumeric/byte/kanji/ECI/GS1 data) and EAN-13, UPC-A, EAN-8, UPC-E, Code 128 (including GS1-128), Code 39 and ITF in any 90° orientation. 1D results must be confirmed on two scan lines, which keeps random texture from producing false reads.

## CLI

```bash
barcodejs <value> [options]          # value "-" reads stdin
barcodejs 5901234123457 -f auto -o ean.svg
barcodejs "(01)09501101530003(10)AB1" -f datamatrix --gs1 -o label.png
echo "hello" | barcodejs - -f qr -t png > qr.png
barcodejs --decode photo.png [--json]
```

`barcodejs --help` lists every option.

## Web component, React and Vue

```html
<bar-code value="hello" format="QR" ec-level="H" finder-shape="rounded"></bar-code>
```

The element re-renders when attributes change and fires an `error` event (with `aria-invalid`) for invalid input. Import `@thunder-bluephoenix/barcodejs/element` in bundled apps; the `<script>` bundle registers it automatically.

```jsx
import { Barcode } from '@thunder-bluephoenix/barcodejs/react';
<Barcode value="5901234123457" format="EAN13" scale={3} />
```

```vue
<script setup>import { Barcode } from '@thunder-bluephoenix/barcodejs/vue';</script>
<template><Barcode value="https://example.com" format="QR" :scale="6" /></template>
```

Both render an accessible `<span role="img">` with inline SVG and support server-side rendering. React and Vue are optional peer dependencies.

## Tree-shaking

```js
import { qr } from '@thunder-bluephoenix/barcodejs/qr';
import { toSVG } from '@thunder-bluephoenix/barcodejs/render';

toSVG(qr('hello', { ecLevel: 'H' }), { scale: 6 }); // 5.6 KB gzipped
```

Subpaths under `@thunder-bluephoenix/barcodejs/`: `qr`, `microqr`, `rmqr`, `datamatrix`, `pdf417`, `aztec`, `code128` (`code128`, `gs1128`), `databar`, `postal`, `linear` (all other 1D), `render`, `decode`, `element`, `react`, `vue`.

## Known limits

- **Reader:** one QR code per image; no Data Matrix, Aztec, PDF417, Micro QR, DataBar or postal reading yet; 1D codes must be roughly horizontal or vertical.
- **Data Matrix size:** encoding is optimal across ASCII, C40, Text, X12, EDIFACT and Base256, except for ISO end-of-data shortcuts that depend on the final symbol size. In about 2% of inputs that makes it one size step larger than ZXing's minimal encoder.
- **Aztec:** no Aztec Runes.
- **PDF417:** no Macro PDF417; no compact or Micro PDF417.
- **PNG text:** uses a built-in 5×7 bitmap font (digits, uppercase, common symbols). Use SVG or canvas for custom fonts.

## Development

```bash
npm install
npm test                 # JsBarcode + BWIPP reference tests, ZXing round trips, reader, API, CLI, React/Vue
npm run size             # gzip budgets for typical imports
pip install -r test/zxing-cpp/requirements.txt
FUZZ=60 npm run test:zxing-cpp   # second decoder, fixed cases + seeded random values per format
```

Open `example/index.html` through a local server after `npm run build` to try every format.

### Releasing

```bash
npm version minor && git push --follow-tags
```

The release workflow checks that the tag matches `package.json`, then:

1. Runs the tests and size budgets.
2. Publishes to npm with provenance, and to JSR.
3. Creates a GitHub release with the browser bundles attached.

It needs an `NPM_TOKEN` repository secret, and the `@thunder-bluephoenix` scope on npm and jsr.io.

## License

MIT. Includes work derived from JsBarcode, © 2016 Johan Lindell. Table data:

- **PDF417 bar patterns:** via [pdf417-py](https://github.com/ihabunek/pdf417-py) (MIT).
- **DataBar Limited check patterns and rMQR metrics:** cross-checked against [BWIPP](https://github.com/bwipp/postscriptbarcode) via bwip-js (MIT).

See [LICENSE](LICENSE).
