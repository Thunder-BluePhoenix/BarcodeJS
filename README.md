# BarcodeJS

Zero-dependency barcode generator for Node and browsers: QR, Micro QR, Data Matrix, PDF417, Aztec and every common 1D symbology, rendered to SVG, PNG or canvas with no native modules. Includes a CLI and React/Vue components.

```js
import { toSVG, toPNG } from 'barcodejs';

toSVG('Hello World');                                    // Code 128 by default
toPNG('https://example.com', { format: 'QR', scale: 8 }); // Uint8Array, pure JS
toSVG('5901234123457', { format: 'auto' });               // detected as EAN-13
```

```bash
npx barcodejs "https://example.com" -f qr -o qr.png
```

## Why not JsBarcode?

BarcodeJS started from [JsBarcode](https://github.com/lindell/JsBarcode); every 1D encoder carried over is checked against JsBarcode's output in the test suite.

|                          | JsBarcode 3.12             | BarcodeJS                                   |
|--------------------------|----------------------------|---------------------------------------------|
| 2D codes                 | none                       | **QR, Micro QR, Data Matrix, PDF417, Aztec** |
| GS1                      | `ean128` flag only         | **GS1-128, GS1 QR, GS1 Data Matrix** with AI length checks |
| PNG in Node              | needs native `canvas`      | **built in, pure JS, sync, compressed**     |
| SVG in Node              | needs `xmldom`             | **plain string, no DOM**                    |
| Code 128                 | greedy set switching       | **optimal (shortest) encoding** + Latin-1 via FNC4 |
| QR encoding              | -                          | **optimal mixed numeric/alphanumeric/byte segments** |
| QR styling               | -                          | dots / rounded modules, rounded or colored finders, logo |
| Extra 1D formats         | -                          | ISBN, ISSN, Code 11, Code 39 Full ASCII, EAN/UPC add-ons |
| Codabar                  | 2:1 wide ratio (out of spec) | 3:1 per spec                              |
| Tooling                  | -                          | CLI, `format: 'auto'`, `data-barcode` attributes, React & Vue |
| Module format            | CommonJS + Babel 6 / gulp  | ESM, types included, tree-shakeable         |
| Size, Code 128 only      | 6.5 KB gz                  | 3.5 KB gz (`barcodejs/code128` + `barcodejs/render`) |
| Size, everything         | 11.4 KB gz (1D only)       | 24 KB gz (all 1D and 2D formats)            |
| Verification             | unit tests                 | golden tests vs JsBarcode + decoded by **ZXing and zxing-cpp** |

## Install

```bash
npm install barcodejs
```

Browser, no build step:

```html
<script src="https://unpkg.com/barcodejs/dist/barcode.min.js"></script>
<svg data-barcode="5901234123457" data-format="EAN13"></svg>
<script>BarcodeJS.init();</script>
```

## API

| Function | Returns |
|---|---|
| `toSVG(value, options?)` | SVG markup string |
| `toPNG(value, options?)` | PNG bytes (`Uint8Array`) |
| `toDataURL(value, options?)` | `data:image/png;base64,…` (or SVG with `type: 'svg'`) |
| `toCanvas(canvas, value, options?)` | draws on a canvas (`HTMLCanvasElement`, `OffscreenCanvas`, node-canvas) |
| `render(target, value, options?)` | fills `<svg>`, `<canvas>`, `<img>` or any element; `target` can be a selector |
| `init(root?)` | renders every `[data-barcode]` element; other `data-*` attributes are options (`data-ec-level="H"`) |
| `encode(value, options?)` | the symbol (bars or module matrix), for custom renderers |
| `isValid(value, options?)` | `true` if the value can be encoded |
| `detectFormat(value)` | the format `format: 'auto'` would pick |

Every render function also accepts a symbol from `encode()` in place of `value`.

### Options

| Option | Default | |
|---|---|---|
| `format` | `'CODE128'` | see below, case-insensitive; `'auto'` detects GS1, EAN/UPC, ITF-14, URLs/long/Unicode text (QR), else Code 128 |
| `scale` | `2` (1D) / `4` (2D) | pixels per module |
| `height` | `100` | bar height (1D) |
| `margin` | `10` (1D) / spec quiet zone (2D) | px |
| `text` | `true` | show human-readable text; a string replaces it |
| `font`, `fontSize`, `textMargin` | `'monospace'`, `20`, `2` | |
| `color`, `background` | `'#000000'`, `'#ffffff'` | `background: null` for transparent |
| `ecLevel` | QR `'M'` (`'H'` with a logo), Micro QR `'L'`, PDF417 auto | QR `L/M/Q/H`, PDF417 `0`-`8` |
| `version` | smallest that fits | QR 1-40, Micro QR 1-4 |
| `gs1` | `false` | QR / Data Matrix: value is `"(01)…(10)…"` |
| `shape` | `'square'` | Data Matrix: `'rectangle'` or `'auto'` (smallest) |
| `columns`, `rowHeight` | auto, `3` | PDF417 |
| `ecPercent` | `33` | Aztec |
| `addon` | - | EAN-13/UPC 2- or 5-digit supplement |
| `checksum` | - | CODE39 `true` (mod 43); MSI `'mod10'`, `'mod11'`, `'mod1010'`, `'mod1110'` |
| `moduleShape` | `'square'` | 2D: `'dots'` or `'rounded'` |
| `finderShape`, `finderColor` | - | QR / Micro QR finder patterns |
| `logo`, `logoSize` | -, `0.2` | QR centre logo: URL (SVG) or loaded image (canvas); max size 0.3 |

### Formats

**2D:** `QR`, `MICROQR`, `DATAMATRIX`, `PDF417`, `AZTEC`

**1D:** `CODE128`, `GS1-128`, `EAN13`, `EAN8`, `EAN5`, `EAN2`, `UPC`, `UPCE`, `ISBN`, `ISSN`, `CODE39`, `CODE39FullASCII`, `CODE93`, `CODE93FullASCII`, `CODE11`, `ITF`, `ITF14`, `MSI`, `MSI10`, `MSI11`, `MSI1010`, `MSI1110`, `CODABAR`, `PHARMACODE`

Check digits are added when missing and validated when present (EAN, UPC, ITF-14, ISBN, ISSN). Non-Latin-1 text in QR, Data Matrix, PDF417 and Aztec is UTF-8 (with an ECI marker where the symbology has one).

### QR styling

```js
toSVG('https://example.com', {
  format: 'QR', scale: 8,
  moduleShape: 'dots', finderShape: 'rounded', finderColor: '#1a3c8f',
  logo: 'https://example.com/logo.svg', logoSize: 0.22, // ECC level H is chosen automatically
});
```

PNG output supports module and finder styling; logos are drawn by SVG and canvas only (PNG leaves the cleared area blank).

## CLI

```bash
barcodejs <value> [options]          # value "-" reads stdin
barcodejs 5901234123457 -f auto -o ean.svg
barcodejs "(01)09501101530003(10)AB1" -f datamatrix --gs1 -o label.png
echo "hello" | barcodejs - -f qr -t png > qr.png
```

`barcodejs --help` lists every option.

## React and Vue

```jsx
import { Barcode } from 'barcodejs/react';
<Barcode value="5901234123457" format="EAN13" scale={3} />
```

```vue
<script setup>import { Barcode } from 'barcodejs/vue';</script>
<template><Barcode value="https://example.com" format="QR" :scale="6" /></template>
```

Both render an accessible `<span role="img">` with inline SVG and work with server-side rendering. React and Vue are optional peer dependencies.

## Tree-shaking

Import encoders and renderers directly to ship only what you use:

```js
import { qr } from 'barcodejs/qr';
import { toSVG } from 'barcodejs/render';

toSVG(qr('hello', { ecLevel: 'H' }), { scale: 6 });
```

Subpaths: `barcodejs/qr`, `barcodejs/microqr`, `barcodejs/datamatrix`, `barcodejs/pdf417`, `barcodejs/aztec`, `barcodejs/code128` (`code128`, `gs1128`), `barcodejs/linear` (all other 1D), `barcodejs/render`.

## Known limits

- Data Matrix picks the best single encodation (ASCII, C40, Text or Base256) for the whole message rather than switching mid-message, and has no DMRE (extended rectangular) sizes.
- Aztec uses a greedy mode-switching encoder (always valid, occasionally a few bits longer than optimal) and no Aztec Runes.
- PDF417 has no Macro PDF417 or compact/truncated variant; Micro PDF417 is not supported.
- PNG text uses a built-in 5×7 bitmap font (digits, uppercase, common symbols). Use SVG or canvas for custom fonts.

## Development

```bash
npm install
npm test                 # golden tests vs JsBarcode, ZXing round-trips, API, CLI, React/Vue
npm run build            # dist/barcode.min.js (IIFE, global BarcodeJS) + dist/barcode.esm.min.js
pip install -r test/zxing-cpp/requirements.txt
npm run test:zxing-cpp   # second decoder: Micro QR, Aztec, PDF417, GS1, styled QR, ...
```

Open `example/index.html` through a local server after building to try every format.

## License

MIT. Includes work derived from JsBarcode, © 2016 Johan Lindell. PDF417 pattern table data via [pdf417-py](https://github.com/ihabunek/pdf417-py) (MIT). See [LICENSE](LICENSE).
