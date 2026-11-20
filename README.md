# Wheel Visualizer: concept demo

**Unofficial concept demo. It is not affiliated with, endorsed by, or operated by California Wheels (caliwheels.com).** Wheel names and product images come from the shop's public website and are used only to show the idea. All trademarks belong to their owners.

The page shows an embeddable wheel visualizer. A shopper uploads a side photo of their car, picks a wheel, changes the wheel and tire size, and sees a preview.

- `index.html`: the demo page (marked `noindex`)
- `wheel-visualizer.js`: the self-contained widget (Shadow DOM, no dependencies)
- `catalog.json`: the demo wheel catalog (images are inlined as data URIs)
- `assets/media.js`: the inlined logo and sample car photo

Embed:

```html
<div data-wheel-visualizer data-catalog="https://YOUR-SHOP.com/catalog.json" data-shop-name="Your Shop"></div>
<script src="https://thezaysha-debug.github.io/wheel-visualizer-demo/wheel-visualizer.js" defer></script>
```

Sample car photo: "1998-2002 Chevrolet Camaro SS" by LouieRBLX, CC BY-SA 4.0, via Wikimedia Commons.
