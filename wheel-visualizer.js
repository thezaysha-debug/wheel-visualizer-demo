/*!
 * Wheel Visualizer embeddable widget v1.0
 * Drop-in "see these wheels on your car" preview for wheel & tire shops.
 * No backend, no dependencies. Shadow DOM isolated.
 *
 * Embed:
 *   <div data-wheel-visualizer data-catalog="https://yourshop.com/catalog.json"></div>
 *   <script src="https://.../wheel-visualizer.js" defer></script>
 *
 * Options (data-attributes or WheelVisualizer.mount(el, {...})):
 *   catalog      URL of a catalog JSON ({wheels:[...]}, an array, or a Shopify /products.json)
 *   shopName     Shop name shown in header / watermark
 *   logo         Logo image URL
 *   brandColor   Primary color (default #c8102e)
 *   theme        "dark" | "light"
 *   ctaUrl       "Get a quote" link (default: the wheel's product page)
 *   ctaLabel     Label for the quote button
 *   phone        Shop phone (adds a Call button)
 *   sampleCar    URL of a sample side-profile car photo
 *   sampleCredit Credit line (HTML) for the sample photo
 *   defaultTire  e.g. "245/45R18" (current tire size baseline)
 *   sampleTire   current tire size assumed for the sample photo
 *   headerBg     header background (e.g. #fff for logos made for light backgrounds)
 *   layout       "auto" | "wide" | "stacked"
 */
(function () {
  'use strict';
  if (window.WheelVisualizer && window.WheelVisualizer.__v) return;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function round5(v) { return Math.round(v / 5) * 5; }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function parseTire(s) {
    var t = String(s || '').toUpperCase().replace(/\s+/g, '');
    var m = t.match(/^(?:P|LT)?(\d{3})\/(\d{2})[A-Z]*(\d{2})/);
    if (!m) return null;
    return { w: +m[1], a: +m[2], d: +m[3] };
  }
  function tireOD(t) { return t.d * 25.4 + 2 * t.w * t.a / 100; }
  function mmToIn(mm) { return mm / 25.4; }
  function fmtTire(t) { return t.w + '/' + t.a + 'R' + t.d; }
  function resolveUrl(u, base) { try { return new URL(u, base || location.href).href; } catch (e) { return u; } }
  function loadImage(src, cors) {
    return new Promise(function (res, rej) {
      var im = new Image();
      if (cors) im.crossOrigin = 'anonymous';
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('Image failed: ' + src)); };
      im.src = src;
    });
  }
  function isSameOrigin(u) { try { return new URL(u, location.href).origin === location.origin; } catch (e) { return true; } }
  function natW(im) { return im.naturalWidth || im.width; }
  function natH(im) { return im.naturalHeight || im.height; }

  var FINISH_WORDS = ['Black', 'Silver', 'Chrome', 'Bronze', 'Gold', 'Graphite', 'Gunmetal', 'Red', 'White', 'Brushed', 'Polished', 'Matte', 'Gloss', 'Satin', 'Machined', 'Anthracite', 'Blue'];

  function normalizeCatalog(json, catalogUrl) {
    var shop = {}, list = [];
    if (Array.isArray(json)) list = json;
    else if (json && Array.isArray(json.wheels)) { list = json.wheels; shop = json.shop || {}; }
    else if (json && Array.isArray(json.products)) return { shop: {}, wheels: fromShopify(json.products, catalogUrl), source: 'shopify' };
    var wheels = list.map(function (w, i) {
      return {
        id: w.id || ('w' + i), brand: w.brand || '',
        model: w.model || w.name || w.title || 'Wheel',
        name: w.name || ((w.brand ? w.brand + ' ' : '') + (w.model || w.title || '')),
        finish: w.finish || '',
        url: w.url ? resolveUrl(w.url, catalogUrl) : '',
        face: resolveUrl(w.face || w.image, catalogUrl),
        thumb: resolveUrl(w.thumb || w.face || w.image, catalogUrl),
        needsAutoFace: !w.face && !!w.image,
        price: w.price == null ? null : w.price,
        diameters: (w.diameters_listed || w.diameters || []).map(Number).filter(Boolean),
        sizes: w.sizes_listed || w.sizes || [],
        lug: w.lug_count || null
      };
    }).filter(function (w) { return w.face; });
    return { shop: shop, wheels: wheels, source: 'json' };
  }
  function fromShopify(products, catalogUrl) {
    var origin = '';
    try { origin = new URL(catalogUrl, location.href).origin; } catch (e) {}
    var bad = /(center ?cap|lug|nut|spacer|hub ?ring|hub centric|hat|shirt|tee|hoodie|decal|sticker|tpms|valve|banner|gift|protection|insurance|coating|key|bolt|merch|apparel)/i;
    return products.filter(function (p) {
      var hay = (p.product_type || '') + ' ' + (p.tags || []).join(' ') + ' ' + p.title;
      return /wheel|rim/i.test(hay) && !bad.test((p.product_type || '') + ' ' + p.title) && p.images && p.images.length;
    }).map(function (p) {
      var prices = (p.variants || []).map(function (v) { return parseFloat(v.price); }).filter(function (x) { return x > 0 && x < 100000; });
      var diams = {};
      (p.variants || []).forEach(function (v) {
        var s = [v.title, v.option1, v.option2, v.option3].join(' ');
        var re = /(\d{2})(?:\.\d)?\s*(?:"|in)?\s*[xX\u00d7]\s*\d/g, m;
        while ((m = re.exec(s))) { var d = +m[1]; if (d >= 14 && d <= 30) diams[d] = 1; }
      });
      var finishOpt = (p.options || []).filter(function (o) { return /finish|color|colour/i.test(o.name); })[0];
      var img = p.images[0].src, sep = img.indexOf('?') >= 0 ? '&' : '?';
      return {
        id: 'shp-' + p.id, brand: p.vendor || '', model: p.title, name: p.title,
        finish: finishOpt ? finishOpt.values.join(' / ') : '',
        url: origin + '/products/' + p.handle,
        face: img + sep + 'width=700', thumb: img + sep + 'width=240', needsAutoFace: true,
        price: prices.length ? Math.min.apply(null, prices) : null,
        diameters: Object.keys(diams).map(Number).sort(function (a, b) { return a - b; }),
        sizes: [], lug: null
      };
    });
  }

  // Runtime face extraction for any product photo (white or transparent background).
  function extractFace(img) {
    var S = 600, c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d', { willReadFrequently: true });
    var sc = Math.min(S / natW(img), S / natH(img));
    var dw = natW(img) * sc, dh = natH(img) * sc;
    x.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh);
    var d;
    try { d = x.getImageData(0, 0, S, S); } catch (e) { return null; }
    var p = d.data, N = S * S;
    var x0 = (S - dw) / 2, y0 = (S - dh) / 2;
    var corners = [[x0 + 2, y0 + 2], [x0 + dw - 3, y0 + 2], [x0 + 2, y0 + dh - 3], [x0 + dw - 3, y0 + dh - 3]];
    var br = 0, bg = 0, bb = 0, ba = 0;
    corners.forEach(function (q) { var i = ((q[1] | 0) * S + (q[0] | 0)) * 4; br += p[i]; bg += p[i + 1]; bb += p[i + 2]; ba += p[i + 3]; });
    br /= 4; bg /= 4; bb /= 4; ba /= 4;
    var transparentBg = ba < 40, isBg = new Uint8Array(N);
    function bgLike(i) {
      if (p[i * 4 + 3] < 30) return true;
      if (transparentBg) return false;
      var dr = p[i * 4] - br, dg = p[i * 4 + 1] - bg, db = p[i * 4 + 2] - bb;
      return dr * dr + dg * dg + db * db < 34 * 34;
    }
    var stack = [];
    for (var i = 0; i < S; i++) stack.push(i, (S - 1) * S + i, i * S, i * S + S - 1);
    while (stack.length) {
      var k = stack.pop();
      if (k < 0 || k >= N || isBg[k] || !bgLike(k)) continue;
      isBg[k] = 1;
      var xx = k % S;
      stack.push(k - S, k + S);
      if (xx > 0) stack.push(k - 1);
      if (xx < S - 1) stack.push(k + 1);
    }
    var minx = S, maxx = 0, miny = S, maxy = 0;
    for (k = 0; k < N; k++) {
      if (isBg[k]) { p[k * 4 + 3] = 0; continue; }
      var X = k % S, Y = (k / S) | 0;
      if (X < minx) minx = X; if (X > maxx) maxx = X; if (Y < miny) miny = Y; if (Y > maxy) maxy = Y;
    }
    if (maxx - minx < 20 || maxy - miny < 20) return null;
    x.putImageData(d, 0, 0);
    var bw = maxx - minx + 1, bh = maxy - miny + 1, R = bh / 2, cy = miny + bh / 2;
    var angled = bw < bh * 0.97;
    var cx = angled ? minx + R * (bw / bh) : minx + bw / 2;
    var sx = angled ? bh / bw : 1;
    var o = document.createElement('canvas'); o.width = o.height = 512;
    var ox = o.getContext('2d');
    ox.save(); ox.beginPath(); ox.arc(256, 256, 255, 0, Math.PI * 2); ox.clip();
    ox.translate(256, 256); ox.scale(256 / R * sx, 256 / R); ox.drawImage(c, -cx, -cy);
    ox.restore();
    return o;
  }

  // ---------- wheel auto-detection (gradient-voting Hough circles, pure JS) ----------
  function detectWheels(img) {
    var sc = Math.min(1, Math.sqrt(120000 / (natW(img) * natH(img))), 720 / natW(img));
    var W = Math.max(32, Math.round(natW(img) * sc)), H = Math.max(32, Math.round(natH(img) * sc));
    sc = W / natW(img);
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, W, H);
    var d = x.getImageData(0, 0, W, H).data, N = W * H;
    var g = new Float32Array(N), t = new Float32Array(N);
    for (var i = 0; i < N; i++) g[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    var gray = g.slice();
    for (var pass = 0; pass < 2; pass++) {
      for (var y = 1; y < H - 1; y++) for (var xx = 1; xx < W - 1; xx++) {
        var k = y * W + xx, s = 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) s += g[k + dy * W + dx];
        t[k] = s / 9;
      }
      var tmp = g; g = t; t = tmp;
    }
    var gx = new Float32Array(N), gy = new Float32Array(N), mag = new Float32Array(N), mags = [];
    for (y = 1; y < H - 1; y++) for (xx = 1; xx < W - 1; xx++) {
      k = y * W + xx;
      var a = g[k - W - 1], b = g[k - W], cc = g[k - W + 1], dd = g[k - 1], ff = g[k + 1], gg = g[k + W - 1], hh = g[k + W], ii = g[k + W + 1];
      var sx = (cc + 2 * ff + ii) - (a + 2 * dd + gg), sy = (gg + 2 * hh + ii) - (a + 2 * b + cc);
      gx[k] = sx; gy[k] = sy; mag[k] = Math.sqrt(sx * sx + sy * sy);
      if ((k & 7) === 0) mags.push(mag[k]);
    }
    mags.sort(function (p, q) { return p - q; });
    var thr = Math.max(0.08, mags[Math.floor(mags.length * 0.86)] || 0.1);
    var rMin = Math.max(5, Math.round(Math.min(W, H) * 0.045)), rMax = Math.round(Math.min(H * 0.42, W * 0.17));
    if (rMax <= rMin + 2) rMax = rMin + 10;
    var radii = [];
    for (var r = rMin; r <= rMax; r += Math.max(1, (rMax - rMin) / 36)) radii.push(r);
    var NR = radii.length, acc = new Float32Array(N * NR), edges = [];
    for (k = 0; k < N; k++) if (mag[k] > thr) edges.push(k);
    if (edges.length > 60000) { var stp = Math.ceil(edges.length / 60000); edges = edges.filter(function (_, j) { return j % stp === 0; }); }
    for (var e = 0; e < edges.length; e++) {
      k = edges[e];
      var px = k % W, py = (k / W) | 0, m = mag[k], nx = gx[k] / m, ny = gy[k] / m;
      for (var ri = 0; ri < NR; ri++) {
        r = radii[ri];
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var cx = Math.round(px + sgn * nx * r), cy = Math.round(py + sgn * ny * r);
          if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
          acc[ri * N + cy * W + cx] += 1;
        }
      }
    }
    var cands = [];
    for (ri = 0; ri < NR; ri++) {
      r = radii[ri];
      var norm = 2 * Math.PI * r, base = ri * N;
      for (y = 2; y < H - 2; y++) for (xx = 2; xx < W - 2; xx++) {
        k = base + y * W + xx;
        var v = (acc[k] + 0.5 * (acc[k - 1] + acc[k + 1] + acc[k - W] + acc[k + W])) / (norm * 1.6);
        if (v > 0.2) cands.push({ x: xx, y: y, r: r, v: v });
      }
    }
    cands.sort(function (p, q) { return q.v - p.v; });
    var picked = [];
    for (i = 0; i < cands.length && picked.length < 60; i++) {
      var C = cands[i], ok = true;
      for (var j = 0; j < picked.length; j++) {
        var P = picked[j], mr = Math.max(P.r, C.r);
        // suppress near-duplicates only; keep concentric rim + tire circles
        if (Math.hypot(P.x - C.x, P.y - C.y) < mr * 0.35 && Math.abs(P.r - C.r) < mr * 0.18) { ok = false; break; }
      }
      if (ok) picked.push(C);
    }
    function ringLum(cx, cy, r0, r1) {
      var s = 0, n = 0;
      for (var a = 0; a < 48; a++) {
        var th = a / 48 * Math.PI * 2;
        for (var rr = r0; rr <= r1; rr += Math.max(1, (r1 - r0) / 3)) {
          var X = Math.round(cx + Math.cos(th) * rr), Y = Math.round(cy + Math.sin(th) * rr);
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          s += gray[Y * W + X]; n++;
        }
      }
      return n ? s / n : 0.5;
    }
    var meanL = 0, cnt = 0;
    for (i = 0; i < N; i += 7) { meanL += gray[i]; cnt++; }
    meanL /= cnt;
    picked.forEach(function (C) {
      var tire = ringLum(C.x, C.y, C.r * 1.06, C.r * 1.28);
      var inner = ringLum(C.x, C.y, C.r * 0.3, C.r * 0.85);
      C.dark = clamp(meanL - tire, -0.3, 0.6);
      C.contrast = clamp(inner - tire, -0.4, 0.8);
      C.score = C.v * (1 + 1.2 * Math.max(0, C.dark) + 0.8 * Math.max(0, C.contrast)) * (C.y > H * 0.35 ? 1 : 0.6);
    });
    var best = null;
    for (i = 0; i < picked.length; i++) for (j = i + 1; j < picked.length; j++) {
      var A = picked[i], B = picked[j], rr = Math.max(A.r, B.r);
      if (Math.abs(A.r - B.r) > rr * 0.22) continue;
      if (Math.abs(A.y - B.y) > rr * 0.35) continue;
      var sep = Math.abs(A.x - B.x);
      if (sep < rr * 2.6 || sep > rr * 13) continue;
      var sc2 = A.score + B.score;
      if (!best || sc2 > best.s) best = { s: sc2, a: A, b: B };
    }
    function outer(C) {
      // find the tire's outer edge: the first strong concentric edge 1.12x..1.8x the detected (rim) circle
      var ks = [], vs = [], maxV = 0;
      for (var kk = 1.12; kk <= 1.8; kk += 0.02) {
        var R = C.r * kk, hit = 0, tot = 0;
        for (var a2 = 0; a2 < 120; a2++) {
          var th = a2 / 120 * Math.PI * 2;
          if (Math.abs(Math.sin(th)) > 0.5) continue; // sides only: the top meets the wheel arch, the bottom meets the ground
          var X = Math.round(C.x + Math.cos(th) * R), Y = Math.round(C.y + Math.sin(th) * R);
          tot++;
          if (X < 1 || Y < 1 || X >= W - 1 || Y >= H - 1) continue;
          var kq = Y * W + X, mm = mag[kq];
          if (mm > thr * 0.7) { var dot = Math.abs((gx[kq] * Math.cos(th) + gy[kq] * Math.sin(th)) / mm); if (dot > 0.7) hit++; }
        }
        var vv = hit / Math.max(1, tot);
        ks.push(kk); vs.push(vv); if (vv > maxV) maxV = vv;
      }
      if (maxV < 0.15) return C.dark > 0.12 && C.contrast < 0.05 ? C.r : C.r * 1.36;
      // rising edge of the first strong peak (half max) = tire edge; ignores the wheel arch further out
      for (var q = 0; q < vs.length; q++) {
        if (vs[q] >= 0.5 * maxV) {
          if (q === 0) return C.r * ks[0];
          var f = (0.5 * maxV - vs[q - 1]) / Math.max(1e-6, vs[q] - vs[q - 1]);
          return C.r * (ks[q - 1] + f * (ks[q] - ks[q - 1]));
        }
      }
      return C.r * ks[vs.indexOf(maxV)];
    }
    if (best) {
      var pair = [best.a, best.b].sort(function (p, q) { return p.x - q.x; });
      var rs = pair.map(function (C) {
        var inner = picked.some(function (P) { var q = C.r / P.r; return P !== C && Math.hypot(P.x - C.x, P.y - C.y) < C.r * 0.25 && q > 1.15 && q < 1.8; });
        return inner ? C.r : outer(C);
      }), rAvg = (rs[0] + rs[1]) / 2;
      return {
        found: true, confidence: best.s, debug: { W: W, H: H, a: best.a, b: best.b },
        wheels: pair.map(function (C, idx) { return { cx: C.x / sc, cy: C.y / sc, r: (0.5 * rs[idx] + 0.5 * rAvg) / sc, sx: 1, rot: 0 }; })
      };
    }
    return { found: false, wheels: null, debug: { W: W, H: H, thr: thr, n: cands.length, picked: picked.slice(0, 15) } };
  }

  // ---------- styles ----------
  function css(o) {
    var c = o.brandColor, dark = o.theme !== 'light';
    var bg = dark ? '#0f0f10' : '#ffffff', panel = dark ? '#18181a' : '#f4f4f5', text = dark ? '#f2f2f2' : '#17171a',
      sub = dark ? '#a7a7ad' : '#5b5b63', line = dark ? '#2a2a2e' : '#dcdce0', chip = dark ? '#222225' : '#ffffff';
    return [
      ':host{all:initial;display:block;}',
      '*{box-sizing:border-box;}',
      '.wv{font-family:' + o.font + ';color:' + text + ';background:' + bg + ';border-radius:14px;overflow:hidden;border:1px solid ' + line + ';-webkit-font-smoothing:antialiased;line-height:1.35;font-size:14px;}',
      '.hd{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid ' + line + ';background:' + (o.headerBg || panel) + ';}',
      '.hd img{height:32px;max-width:60%;object-fit:contain;}',
      '.hd .t{font-family:' + o.headFont + ';text-transform:uppercase;letter-spacing:.06em;font-size:15px;font-weight:600;margin-left:auto;color:' + (o.headerBg ? '#333' : sub) + ';text-align:right}',
      '.hd .t b{color:' + c + ';}',
      '.body{display:grid;grid-template-columns:minmax(0,1fr);}',
      '.wv.wide .body{grid-template-columns:minmax(0,1.65fr) minmax(320px,1fr);}',
      '.wv.wide .side{border-left:1px solid ' + line + ';}',
      '.wv.wide .col{position:sticky;top:0;align-self:start;}',
      '.stagewrap{position:relative;background:#000;}',
      '.stage{position:relative;width:100%;touch-action:pan-y;user-select:none;-webkit-user-select:none;}',
      '.stage.adj{touch-action:none;}',
      'canvas{display:block;width:100%;height:auto;}',
      '.empty{padding:26px 18px;text-align:center;background:radial-gradient(ellipse at 50% 30%, #222 0%, #0b0b0c 70%);color:#eee;}',
      '.empty h3{font-family:' + o.headFont + ';text-transform:uppercase;letter-spacing:.05em;font-size:22px;margin:6px 0 4px;color:#fff}',
      '.empty p{margin:4px auto 14px;color:#bbb;max-width:460px}',
      '.guide{display:block;margin:6px auto 14px;width:min(360px,90%);}',
      '.btns{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}',
      'button,.btn{font:inherit;cursor:pointer;border-radius:10px;border:1px solid ' + line + ';background:' + chip + ';color:' + text + ';padding:10px 14px;font-weight:600;display:inline-flex;align-items:center;gap:6px;text-decoration:none;min-height:42px;justify-content:center}',
      '.empty button{background:#1d1d20;color:#fff;border-color:#333}',
      'button.pri,.btn.pri,.empty button.pri{background:' + c + ';border-color:' + c + ';color:#fff;}',
      'button:disabled{opacity:.45;cursor:not-allowed}',
      'button:focus-visible,.btn:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid ' + c + ';outline-offset:2px}',
      '.toolbar{display:flex;flex-wrap:wrap;gap:6px;padding:10px;border-top:1px solid ' + line + ';background:' + panel + ';align-items:center}',
      '.toolbar button{padding:8px 10px;min-height:38px;font-size:13px}',
      '.seg{display:inline-flex;border:1px solid ' + line + ';border-radius:10px;overflow:hidden}',
      '.seg button{border:0;border-radius:0;min-height:36px}',
      '.seg button.on{background:' + c + ';color:#fff}',
      '.adjrow{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:center;padding:6px 12px 10px;background:' + panel + ';font-size:12px;color:' + sub + '}',
      'input[type=range]{width:100%;accent-color:' + c + ';height:28px;margin:0}',
      '.side{padding:12px 14px 16px;display:flex;flex-direction:column;gap:14px;min-width:0}',
      '.sec h4{font-family:' + o.headFont + ';text-transform:uppercase;letter-spacing:.06em;font-size:13px;margin:0 0 8px;color:' + sub + ';display:flex;justify-content:space-between;align-items:baseline}',
      '.sec h4 span{text-transform:none;letter-spacing:0;font-family:' + o.font + ';font-weight:400;font-size:12px}',
      '.search{display:flex;gap:6px;margin-bottom:8px}',
      '.search input{flex:1 1 auto;min-width:0}',
      '.search select{flex:0 0 auto;width:auto}',
      'input.tin,.search input,select{font:inherit;color:' + text + ';background:' + chip + ';border:1px solid ' + line + ';border-radius:10px;padding:8px 10px;min-height:40px;width:100%}',
      '.tin{font:inherit;color:' + text + ';background:' + chip + ';border:1px solid ' + line + ';border-radius:10px;padding:8px 10px;min-height:40px}',
      '.chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin;margin-bottom:6px}',
      '.chip{flex:0 0 auto;padding:6px 10px;border-radius:999px;border:1px solid ' + line + ';background:' + chip + ';font-size:12px;cursor:pointer;min-height:34px;font-weight:600}',
      '.chip.on{background:' + c + ';border-color:' + c + ';color:#fff}',
      '.chip.listed{box-shadow:inset 0 -3px 0 ' + c + '}',
      '.chip.on.listed{box-shadow:none}',
      '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;max-height:340px;overflow:auto;padding:2px}',
      '.card{border:1px solid ' + line + ';border-radius:12px;background:' + chip + ';padding:6px;cursor:pointer;text-align:center;font-size:11px;line-height:1.2;color:' + text + ';display:flex;flex-direction:column;align-items:center;gap:3px;min-height:auto;font-weight:400}',
      '.card img{width:100%;aspect-ratio:1;object-fit:contain;background:radial-gradient(circle,#2a2a2e 0,#111 70%);border-radius:50%;}',
      '.card b{font-size:12px}',
      '.card .f{color:' + sub + '}',
      '.card.on{border-color:' + c + ';box-shadow:0 0 0 2px ' + c + ' inset}',
      '.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.row label{font-size:12px;color:' + sub + '}',
      '.tiregrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}',
      '.tiregrid label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:' + sub + '}',
      '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}',
      '.stat{background:' + chip + ';border:1px solid ' + line + ';border-radius:10px;padding:7px 8px}',
      '.stat small{display:block;color:' + sub + ';font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}',
      '.stat b{font-size:15px}',
      '.note{font-size:12px;color:' + sub + '}',
      '.warn{color:#f5a524}',
      '.sel{display:flex;gap:10px;align-items:center;background:' + chip + ';border:1px solid ' + line + ';border-radius:12px;padding:8px}',
      '.sel img{width:56px;height:56px;border-radius:50%;background:#111;flex:0 0 auto}',
      '.sel .n{font-weight:700}',
      '.sel .f{font-size:12px;color:' + sub + '}',
      '.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.actions .wide{grid-column:1/-1}',
      '.disc{font-size:11.5px;color:' + sub + ';padding:10px 14px;border-top:1px solid ' + line + ';background:' + panel + '}',
      '.disc b{color:' + text + '}',
      '.toast{position:absolute;left:50%;top:10px;transform:translateX(-50%);background:rgba(0,0,0,.82);color:#fff;padding:8px 12px;border-radius:10px;font-size:13px;pointer-events:none;opacity:0;transition:opacity .25s;max-width:92%;text-align:center;z-index:3}',
      '.toast.show{opacity:1}',
      '.busy{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45);color:#fff;font-weight:700;z-index:2}',
      '.busy.show{display:flex}',
      '.hidden{display:none !important}',
      '.cmp{display:flex;align-items:center;gap:8px;padding:0 12px 10px;background:' + panel + '}',
      '.credit{font-size:10.5px;color:' + sub + ';padding:4px 12px 8px;background:' + panel + '}',
      '.credit a{color:' + sub + '}'
    ].join('\n');
  }

  var GUIDE_SVG = '<svg class="guide" viewBox="0 0 360 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1" y="1" width="358" height="138" rx="12" fill="none" stroke="#555" stroke-dasharray="6 6"/><path d="M40 92 C 52 70, 90 62, 120 58 L 150 40 C 175 30, 230 30, 255 44 L 285 60 C 305 62, 322 70, 326 92 Z" fill="#2b2b2f" stroke="#888"/><circle cx="98" cy="96" r="20" fill="#111" stroke="#c8102e" stroke-width="3"/><circle cx="98" cy="96" r="11" fill="#666"/><circle cx="272" cy="96" r="20" fill="#111" stroke="#c8102e" stroke-width="3"/><circle cx="272" cy="96" r="11" fill="#666"/><line x1="20" y1="117" x2="340" y2="117" stroke="#555"/><text x="180" y="20" fill="#bbb" font-size="12" text-anchor="middle" font-family="Arial">Side profile · whole car in frame · camera at wheel height</text></svg>';

  // ---------- widget ----------
  function Widget(host, opts) {
    this.host = host;
    var ds = host.dataset || {};
    var o = this.o = {
      catalog: opts.catalog || ds.catalog || '',
      shopName: opts.shopName || ds.shopName || '',
      logo: opts.logo || ds.logo || '',
      brandColor: opts.brandColor || ds.brandColor || '#c8102e',
      theme: opts.theme || ds.theme || 'dark',
      ctaUrl: opts.ctaUrl || ds.ctaUrl || '',
      ctaLabel: opts.ctaLabel || ds.ctaLabel || 'Get a quote',
      phone: opts.phone || ds.phone || '',
      sampleCar: opts.sampleCar || ds.sampleCar || '',
      sampleCredit: opts.sampleCredit || ds.sampleCredit || '',
      sampleTire: opts.sampleTire || ds.sampleTire || '',
      defaultTire: opts.defaultTire || ds.defaultTire || '245/45R18',
      font: opts.font || ds.font || '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif',
      headFont: opts.headFont || ds.headFont || 'Oswald,"Arial Narrow",Arial,sans-serif',
      layout: opts.layout || ds.layout || 'auto',
      headerBg: opts.headerBg || ds.headerBg || ''
    };
    if (o.catalog) o.catalog = resolveUrl(o.catalog, location.href);
    if (o.sampleCar) o.sampleCar = resolveUrl(o.sampleCar, location.href);
    var base = parseTire(o.defaultTire) || { w: 245, a: 45, d: 18 };
    this.state = {
      photo: null, photoName: '', slots: [], sel: 0, adjust: true, handles: true,
      wheel: null, faceImg: null, faceTainted: false,
      base: base, rim: 20, tw: base.w, ta: 35, keepOD: true, spin: false, spinA: 0,
      compare: false, cmpX: 0.5, matchLight: true, finish: 'All', q: '', diaF: ''
    };
    this.catalog = { wheels: [], shop: {} };
    this.faceCache = {};
    this.autoAspect();
    this.build();
    this.loadCatalog();
  }

  Widget.prototype.build = function () {
    var self = this, o = this.o;
    var root = this.root = this.host.attachShadow ? this.host.attachShadow({ mode: 'open' }) : this.host;
    root.appendChild(el('style', { text: css(o) }));
    var wv = this.wv = el('div', { class: 'wv', part: 'container' });
    root.appendChild(wv);
    wv.appendChild(el('div', { class: 'hd' }, [
      o.logo ? el('img', { src: o.logo, alt: (o.shopName || 'Shop') + ' logo' }) : el('b', { text: o.shopName || 'Wheel Visualizer', style: 'font-family:' + o.headFont + ';font-size:18px;text-transform:uppercase;letter-spacing:.05em' }),
      el('div', { class: 't', html: 'See it on <b>your</b> car' })
    ]));
    var body = el('div', { class: 'body' });
    wv.appendChild(body);
    var col = el('div', { class: 'col', style: 'min-width:0' });
    body.appendChild(col);
    function fileInput(cap) {
      var a = { type: 'file', accept: 'image/*', class: 'hidden', onchange: function (e) { self.onFile(e.target.files && e.target.files[0]); e.target.value = ''; } };
      if (cap) a.capture = 'environment';
      return el('input', a);
    }
    this.fileIn = fileInput(false); this.camIn = fileInput(true);
    col.appendChild(this.fileIn); col.appendChild(this.camIn);
    this.empty = el('div', { class: 'empty' }, [
      el('h3', { text: 'Upload your car' }),
      el('p', { text: 'Best results: a straight side-profile photo with both wheels visible and the camera at about wheel height.' }),
      el('div', { html: GUIDE_SVG }),
      el('div', { class: 'btns' }, [
        el('button', { class: 'pri', type: 'button', 'data-act': 'upload', onclick: function () { self.fileIn.click(); } }, ['Upload photo']),
        el('button', { type: 'button', 'data-act': 'camera', onclick: function () { self.camIn.click(); } }, ['Take photo']),
        o.sampleCar ? el('button', { type: 'button', 'data-act': 'sample', onclick: function () { self.loadSample(); } }, ['Try a sample car']) : null
      ]),
      el('p', { style: 'margin-top:12px;font-size:11.5px;color:#999', text: 'Your photo stays on your device. Nothing is uploaded.' })
    ]);
    col.appendChild(this.empty);
    var sw = this.stagewrap = el('div', { class: 'stagewrap hidden' });
    this.stage = el('div', { class: 'stage adj' });
    this.canvas = el('canvas', { 'aria-label': 'Wheel preview', role: 'img' });
    this.stage.appendChild(this.canvas);
    this.toastEl = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    this.busyEl = el('div', { class: 'busy', text: 'Finding wheels…' });
    sw.appendChild(this.stage); sw.appendChild(this.toastEl); sw.appendChild(this.busyEl);
    col.appendChild(sw);
    this.segFR = el('div', { class: 'seg' }, [
      el('button', { type: 'button', class: 'on', 'data-act': 'front', onclick: function () { self.selectSlot(0); } }, ['Left wheel']),
      el('button', { type: 'button', 'data-act': 'rear', onclick: function () { self.selectSlot(1); } }, ['Right wheel'])
    ]);
    this.adjBtn = el('button', { type: 'button', 'data-act': 'adjust', onclick: function () { self.toggleAdjust(); } }, ['Done adjusting']);
    this.cmpBtn = el('button', { type: 'button', 'data-act': 'compare', onclick: function () { self.toggleCompare(); } }, ['Before / after']);
    this.spinBtn = el('button', { type: 'button', 'data-act': 'spin', onclick: function () { self.toggleSpin(); } }, ['Spin']);
    this.toolbar = el('div', { class: 'toolbar hidden' }, [
      el('button', { type: 'button', 'data-act': 'detect', onclick: function () { self.autoDetect(true); } }, ['Auto-detect']),
      this.segFR, this.adjBtn, this.cmpBtn, this.spinBtn,
      el('button', { type: 'button', 'data-act': 'newphoto', onclick: function () { self.fileIn.click(); } }, ['New photo'])
    ]);
    col.appendChild(this.toolbar);
    this.rngSize = el('input', { type: 'range', min: 10, max: 400, step: 0.5, 'aria-label': 'Wheel size', oninput: function () { self.setSlot('r', +this.value); } });
    this.rngSquash = el('input', { type: 'range', min: 0.55, max: 1.15, step: 0.01, 'aria-label': 'Perspective', oninput: function () { self.setSlot('sx', +this.value); } });
    this.rngRot = el('input', { type: 'range', min: -25, max: 25, step: 0.5, 'aria-label': 'Tilt', oninput: function () { self.setSlot('rot', +this.value); } });
    this.adjRow = el('div', { class: 'adjrow hidden' }, [
      el('span', { text: 'Size' }), this.rngSize,
      el('span', { text: 'Angle' }), this.rngSquash,
      el('span', { text: 'Tilt' }), this.rngRot,
      el('span', { class: 'note', style: 'grid-column:1/-1', text: 'Drag a circle to move it, drag its red dot to resize. Use Angle if the photo was taken from a slight angle.' })
    ]);
    col.appendChild(this.adjRow);
    this.rngCmp = el('input', { type: 'range', min: 0, max: 1, step: 0.005, value: 0.5, 'aria-label': 'Before/after position', oninput: function () { self.state.cmpX = +this.value; self.draw(); } });
    this.cmpRow = el('div', { class: 'cmp hidden' }, [el('span', { class: 'note', text: 'Before' }), this.rngCmp, el('span', { class: 'note', text: 'After' })]);
    col.appendChild(this.cmpRow);
    this.creditEl = el('div', { class: 'credit hidden' });
    col.appendChild(this.creditEl);

    var side = el('div', { class: 'side' });
    body.appendChild(side);
    this.selBox = el('div', { class: 'sel' }, [el('img', { alt: '' }), el('div', {}, [el('div', { class: 'n', text: 'Pick a wheel' }), el('div', { class: 'f', text: '' })])]);
    side.appendChild(el('div', { class: 'sec' }, [this.selBox]));
    this.qIn = el('input', { type: 'search', placeholder: 'Search wheels, brands, finishes', 'aria-label': 'Search wheels', oninput: function () { self.state.q = this.value; self.renderGrid(); } });
    this.finishChips = el('div', { class: 'chips', 'aria-label': 'Finish filter' });
    this.diaFilter = el('select', { 'aria-label': 'Size filter', onchange: function () { self.state.diaF = this.value; self.renderGrid(); } });
    this.grid = el('div', { class: 'grid', role: 'list' });
    this.countEl = el('span', { text: '' });
    side.appendChild(el('div', { class: 'sec' }, [
      el('h4', {}, ['Wheels', this.countEl]),
      el('div', { class: 'search' }, [this.qIn, this.diaFilter]),
      this.finishChips, this.grid
    ]));
    this.rimChips = el('div', { class: 'chips', 'aria-label': 'Wheel diameter' });
    this.listedNote = el('div', { class: 'note' });
    side.appendChild(el('div', { class: 'sec' }, [el('h4', {}, ['Wheel size', el('span', { text: 'diameter, inches' })]), this.rimChips, this.listedNote]));
    this.selW = el('select', { 'aria-label': 'Tire width', onchange: function () { self.state.tw = +this.value; self.onTireChange('w'); } });
    this.selA = el('select', { 'aria-label': 'Tire profile', onchange: function () { self.state.ta = +this.value; self.state.keepOD = false; self.onTireChange('a'); } });
    for (var w = 185; w <= 355; w += 10) this.selW.appendChild(el('option', { value: w, text: w }));
    for (var a = 20; a <= 75; a += 5) this.selA.appendChild(el('option', { value: a, text: a }));
    this.rimLbl = el('div', { class: 'tin', style: 'display:flex;align-items:center', text: 'R20' });
    this.keepChk = el('input', { type: 'checkbox', checked: true, onchange: function () { self.state.keepOD = this.checked; self.onTireChange('k'); } });
    this.baseIn = el('input', { class: 'tin', value: fmtTire(this.state.base), 'aria-label': 'Current tire size', style: 'max-width:130px', onchange: function () {
      var t = parseTire(this.value);
      if (t) { self.state.base = t; self.onTireChange('b'); } else { this.value = fmtTire(self.state.base); self.toast('Use a size like 245/45R18'); }
    } });
    this.stats = el('div', { class: 'stats' });
    side.appendChild(el('div', { class: 'sec' }, [
      el('h4', {}, ['Tire size']),
      el('div', { class: 'tiregrid' }, [el('label', {}, ['Width (mm)', this.selW]), el('label', {}, ['Profile (%)', this.selA]), el('label', {}, ['Rim', this.rimLbl])]),
      el('div', { class: 'row', style: 'margin-top:8px' }, [el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:12.5px' }, [this.keepChk, 'Keep overall tire height (auto profile)'])]),
      el('div', { class: 'row', style: 'margin-top:6px' }, [el('label', { text: 'Current tire size' }), this.baseIn]),
      this.stats
    ]));
    this.viewBtn = el('a', { class: 'btn', target: '_blank', rel: 'noopener', text: 'View this wheel' });
    this.quoteBtn = el('a', { class: 'btn pri', target: '_blank', rel: 'noopener', text: o.ctaLabel });
    this.dlBtn = el('button', { type: 'button', 'data-act': 'download', onclick: function () { self.download(); } }, ['Download image']);
    this.shareBtn = el('button', { type: 'button', 'data-act': 'share', onclick: function () { self.share(); } }, ['Share']);
    var acts = [this.quoteBtn, this.viewBtn, this.dlBtn, this.shareBtn];
    if (o.phone) acts.push(el('a', { class: 'btn wide', href: 'tel:' + o.phone.replace(/[^\d+]/g, ''), text: 'Call ' + o.phone }));
    side.appendChild(el('div', { class: 'sec' }, [el('h4', {}, ['Next step']), el('div', { class: 'actions' }, acts)]));
    wv.appendChild(el('div', { class: 'disc', html: '<b>Visual preview only, fitment not guaranteed — confirm with the shop.</b> Sizes, offsets, clearance and tire availability must be checked for your exact vehicle. Colors and proportions are approximate.' }));

    this.ro = window.ResizeObserver ? new ResizeObserver(function () { self.layout(); }) : null;
    if (this.ro) this.ro.observe(this.host); else window.addEventListener('resize', function () { self.layout(); });
    this.bindPointer();
    this.layout();
    this.renderSize();
  };

  Widget.prototype.layout = function () {
    var w = this.host.getBoundingClientRect().width;
    var wide = this.o.layout === 'wide' || (this.o.layout === 'auto' && w >= 900);
    this.wv.classList.toggle('wide', wide);
    this.fitCanvas();
  };
  Widget.prototype.fitCanvas = function () {
    var s = this.state; if (!s.photo) return;
    var cssW = this.stage.getBoundingClientRect().width || 600;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var iw = natW(s.photo), ih = natH(s.photo);
    var cw = Math.round(cssW * dpr), ch = Math.round(cssW * dpr * ih / iw);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    this.scale = cw / iw;
    this.draw();
  };
  Widget.prototype.toast = function (msg, ms) {
    var t = this.toastEl; t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  };

  // ---------- catalog ----------
  Widget.prototype.loadCatalog = function () {
    var self = this;
    if (!this.o.catalog) { this.grid.textContent = 'No catalog configured (data-catalog).'; return; }
    fetch(this.o.catalog, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        self.catalog = normalizeCatalog(j, self.o.catalog);
        if (!self.o.shopName && self.catalog.shop && self.catalog.shop.name) self.o.shopName = self.catalog.shop.name;
        self.renderFilters(); self.renderGrid();
        if (self.catalog.wheels.length) self.pickWheel(self.catalog.wheels[0]);
        self.host.dispatchEvent(new CustomEvent('wv:catalog', { detail: { count: self.catalog.wheels.length } }));
      })
      .catch(function (e) {
        self.grid.textContent = 'Could not load the wheel catalog (' + e.message + '). A catalog on another domain must allow CORS.';
      });
  };
  Widget.prototype.renderFilters = function () {
    var self = this, s = this.state, ws = this.catalog.wheels;
    var present = ['All'];
    FINISH_WORDS.forEach(function (f) { if (ws.some(function (w) { return (w.finish + ' ' + w.model).toLowerCase().indexOf(f.toLowerCase()) >= 0; })) present.push(f); });
    this.finishChips.innerHTML = '';
    present.forEach(function (f) {
      self.finishChips.appendChild(el('button', { type: 'button', class: 'chip' + (s.finish === f ? ' on' : ''), 'aria-pressed': s.finish === f, onclick: function () { s.finish = f; self.renderFilters(); self.renderGrid(); } }, [f]));
    });
    var ds = {};
    ws.forEach(function (w) { w.diameters.forEach(function (d) { ds[d] = 1; }); });
    var keys = Object.keys(ds).map(Number).sort(function (a, b) { return a - b; });
    this.diaFilter.innerHTML = '';
    this.diaFilter.appendChild(el('option', { value: '', text: 'Any size' }));
    keys.forEach(function (d) { self.diaFilter.appendChild(el('option', { value: d, text: d + '" listed', selected: String(s.diaF) === String(d) })); });
    this.diaFilter.classList.toggle('hidden', !keys.length);
  };
  Widget.prototype.filtered = function () {
    var s = this.state, q = (s.q || '').toLowerCase().trim();
    return this.catalog.wheels.filter(function (w) {
      var hay = (w.brand + ' ' + w.model + ' ' + w.finish).toLowerCase();
      if (q && q.split(/\s+/).some(function (t) { return hay.indexOf(t) < 0; })) return false;
      if (s.finish !== 'All' && hay.indexOf(s.finish.toLowerCase()) < 0) return false;
      if (s.diaF && w.diameters.indexOf(+s.diaF) < 0) return false;
      return true;
    });
  };
  Widget.prototype.renderGrid = function () {
    var self = this, list = this.filtered();
    this.grid.innerHTML = '';
    this.countEl.textContent = list.length + ' of ' + this.catalog.wheels.length;
    if (!list.length) { this.grid.appendChild(el('div', { class: 'note', text: 'No wheels match.' })); return; }
    list.forEach(function (w) {
      var on = self.state.wheel && self.state.wheel.id === w.id;
      self.grid.appendChild(el('button', { type: 'button', role: 'listitem', class: 'card' + (on ? ' on' : ''), title: w.name + ' - ' + w.finish, 'data-id': w.id, onclick: function () { self.pickWheel(w); } }, [
        el('img', { src: w.thumb, alt: w.name + ' ' + w.finish, loading: 'lazy' }),
        el('b', { text: w.model }), el('span', { class: 'f', text: w.finish })
      ]));
    });
  };
  Widget.prototype.pickWheel = function (w) {
    var self = this, s = this.state;
    s.wheel = w;
    var img = this.selBox.querySelector('img'); img.src = w.thumb; img.alt = w.name;
    this.selBox.querySelector('.n').textContent = w.name;
    var bits = [w.finish];
    if (w.price != null) bits.push('from $' + Number(w.price).toLocaleString());
    if (w.lug) bits.push(w.lug + '-lug');
    this.selBox.querySelector('.f').textContent = bits.filter(Boolean).join(' · ');
    this.viewBtn.href = w.url || '#'; this.viewBtn.classList.toggle('hidden', !w.url);
    if (w.diameters.length && w.diameters.indexOf(s.rim) < 0) {
      var pref = w.diameters.filter(function (d) { return d >= 18 && d <= 24; });
      s.rim = pref[0] || w.diameters[0];
      if (s.keepOD) this.autoAspect();
    }
    this.updateCta();
    this.renderGrid(); this.renderSize();
    this.getFace(w).then(function (f) {
      if (s.wheel !== w) return;
      s.faceImg = f.img; s.faceTainted = f.tainted; self.draw();
      self.host.dispatchEvent(new CustomEvent('wv:wheel', { detail: { id: w.id } }));
    }).catch(function () { self.toast('Could not load that wheel image.'); });
  };
  Widget.prototype.updateCta = function () {
    var w = this.state.wheel; if (!w) return;
    this.quoteBtn.href = this.o.ctaUrl ? this.ctaHref(w) : (w.url || '#');
  };
  Widget.prototype.ctaHref = function (w) {
    var u = this.o.ctaUrl, s = this.state;
    var msg = 'Quote request: ' + w.name + ' (' + w.finish + ') ' + s.rim + '" with ' + s.tw + '/' + s.ta + 'R' + s.rim + ' tires';
    if (/^mailto:/i.test(u)) return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'subject=' + encodeURIComponent('Wheel quote: ' + w.name) + '&body=' + encodeURIComponent(msg + '\n' + (w.url || ''));
    if (/^tel:/i.test(u)) return u;
    try {
      var x = new URL(u, location.href);
      x.searchParams.set('wheel', w.name + ' ' + w.finish); x.searchParams.set('size', s.rim + '"'); x.searchParams.set('tire', s.tw + '/' + s.ta + 'R' + s.rim);
      return x.href;
    } catch (e) { return u; }
  };
  Widget.prototype.getFace = function (w) {
    var self = this;
    if (this.faceCache[w.id]) return Promise.resolve(this.faceCache[w.id]);
    var same = isSameOrigin(w.face);
    return loadImage(w.face, !same)
      .catch(function () { return loadImage(w.face, false).then(function (im) { im._tainted = true; return im; }); })
      .then(function (im) {
        var out = { img: im, tainted: !!im._tainted };
        if (w.needsAutoFace) {
          var f = im._tainted ? null : extractFace(im);
          if (f) out.img = f; else out.tainted = true;
        }
        self.faceCache[w.id] = out;
        return out;
      });
  };

  // ---------- sizes ----------
  Widget.prototype.autoAspect = function () {
    var s = this.state, od = tireOD(s.base);
    s.ta = clamp(round5(((od - s.rim * 25.4) / 2) / s.tw * 100), 25, 75);
  };
  Widget.prototype.onTireChange = function (src) {
    if (this.state.keepOD && src !== 'a') this.autoAspect();
    this.renderSize(); this.draw(); this.updateCta();
  };
  Widget.prototype.renderSize = function () {
    var self = this, s = this.state, w = s.wheel;
    var listed = w ? w.diameters : [];
    var ds = [];
    for (var d = 16; d <= 26; d++) ds.push(d);
    listed.forEach(function (x) { if (ds.indexOf(x) < 0) ds.push(x); });
    ds.sort(function (a, b) { return a - b; });
    this.rimChips.innerHTML = '';
    ds.forEach(function (d) {
      var isL = listed.indexOf(d) >= 0;
      self.rimChips.appendChild(el('button', { type: 'button', class: 'chip' + (s.rim === d ? ' on' : '') + (isL ? ' listed' : ''), 'aria-pressed': s.rim === d, 'data-d': d, title: isL ? 'Listed by the shop for this wheel' : '', onclick: function () { s.rim = d; self.onTireChange('r'); } }, [d + '"']));
    });
    if (w) {
      if (listed.length) {
        var off = listed.indexOf(s.rim) < 0;
        this.listedNote.innerHTML = 'Sizes stated on the shop\'s page for this wheel: <b>' + listed.join('", ') + '"</b>' + (off ? ' — <span class="warn">' + s.rim + '" isn\'t listed, preview only.</span>' : '');
      } else this.listedNote.textContent = 'The shop\'s page doesn\'t list sizes for this wheel. Ask them which diameters are available.';
    }
    this.selW.value = s.tw; this.selA.value = s.ta; this.rimLbl.textContent = 'R' + s.rim; this.keepChk.checked = s.keepOD;
    var cur = { w: s.tw, a: s.ta, d: s.rim }, od = tireOD(cur), bod = tireOD(s.base), side = s.tw * s.ta / 100;
    var diff = (od - bod) / bod * 100;
    this.stats.innerHTML = '';
    [['Overall diameter', mmToIn(od).toFixed(1) + '"'], ['Sidewall', mmToIn(side).toFixed(2) + '" (' + Math.round(side) + 'mm)'], ['vs current', (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%']].forEach(function (p) {
      self.stats.appendChild(el('div', { class: 'stat' }, [el('small', { text: p[0] }), el('b', { text: p[1] })]));
    });
    var warn = Math.abs(diff) > 3 ? ' <span class="warn">That\'s more than a 3% change in tire height. Ask the shop about clearance and speedometer.</span>' : '';
    this.stats.appendChild(el('div', { class: 'note', style: 'grid-column:1/-1', html: 'Showing <b>' + fmtTire(cur) + '</b> on ' + s.rim + '" wheels. Current tire ' + fmtTire(s.base) + ' (' + mmToIn(bod).toFixed(1) + '").' + warn }));
  };

  // ---------- photo ----------
  function downscale(im) {
    var max = 2400, w = natW(im), h = natH(im);
    if (Math.max(w, h) <= max) return im;
    var k = max / Math.max(w, h), c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c;
  }
  Widget.prototype.onFile = function (f) {
    var self = this;
    if (!f) return;
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) { this.toast('Please choose a photo.'); return; }
    var url = URL.createObjectURL(f);
    loadImage(url).then(function (im) { self.setPhoto(downscale(im), f.name + ':' + Date.now(), null); })
      .catch(function () { self.toast('This browser can\'t open that photo format. Try a JPG or PNG.', 4000); });
  };
  Widget.prototype.loadSample = function () {
    var self = this;
    loadImage(this.o.sampleCar).then(function (im) {
      if (self.o.sampleTire) {
        var t = parseTire(self.o.sampleTire);
        if (t) { self.state.base = t; self.state.tw = t.w; self.baseIn.value = fmtTire(t); if (self.state.keepOD) self.autoAspect(); self.renderSize(); }
      }
      self.setPhoto(im, 'sample', self.o.sampleCredit);
    }).catch(function () { self.toast('Sample photo failed to load.'); });
  };
  Widget.prototype.setPhoto = function (im, name, credit) {
    var s = this.state;
    s.photo = im; s.photoName = name; s.compare = false; this._lumCache = {};
    this.cmpBtn.classList.remove('pri');
    this.empty.classList.add('hidden');
    [this.stagewrap, this.toolbar, this.adjRow].forEach(function (e) { e.classList.remove('hidden'); });
    this.cmpRow.classList.add('hidden');
    this.creditEl.classList.toggle('hidden', !credit);
    if (credit) this.creditEl.innerHTML = credit;
    this.rngSize.max = Math.round(Math.min(natW(im), natH(im)) * 0.5);
    this.fitCanvas();
    this.autoDetect(false);
  };
  Widget.prototype.autoDetect = function () {
    var self = this, s = this.state;
    this.busyEl.classList.add('show');
    setTimeout(function () {
      var res;
      try { res = detectWheels(s.photo); } catch (e) { res = { found: false }; }
      self.busyEl.classList.remove('show');
      if (res.found) {
        s.slots = res.wheels;
        self.toast('Found both wheels. Fine-tune with the handles if needed.');
      } else {
        var W = natW(s.photo), H = natH(s.photo), r = Math.min(W * 0.085, H * 0.2);
        s.slots = [{ cx: W * 0.22, cy: H * 0.72, r: r, sx: 1, rot: 0 }, { cx: W * 0.78, cy: H * 0.72, r: r, sx: 1, rot: 0 }];
        self.toast('Couldn\'t find the wheels automatically. Drag the circles onto your wheels.', 4200);
      }
      s.sel = 0; s.adjust = true; s.handles = true; self._lumCache = {};
      self.syncAdjust(); self.draw();
      self.host.dispatchEvent(new CustomEvent('wv:detected', { detail: { found: !!res.found, slots: s.slots } }));
    }, 30);
  };
  Widget.prototype.selectSlot = function (i) {
    this.state.sel = i;
    if (!this.state.adjust) this.toggleAdjust();
    this.syncAdjust(); this.draw();
  };
  Widget.prototype.syncAdjust = function () {
    var s = this.state, sl = s.slots[s.sel];
    this.stage.classList.toggle('adj', s.adjust);
    this.adjRow.classList.toggle('hidden', !s.adjust || !s.photo);
    this.adjBtn.textContent = s.adjust ? 'Done adjusting' : 'Adjust wheels';
    var bs = this.segFR.querySelectorAll('button');
    for (var k = 0; k < bs.length; k++) bs[k].classList.toggle('on', k === s.sel);
    if (!sl) return;
    this.rngSize.value = sl.r; this.rngSquash.value = sl.sx; this.rngRot.value = sl.rot;
  };
  Widget.prototype.setSlot = function (k, v) {
    var sl = this.state.slots[this.state.sel]; if (!sl) return;
    sl[k] = v; this._lumCache = {}; this.draw();
  };
  Widget.prototype.toggleAdjust = function () { var s = this.state; s.adjust = !s.adjust; s.handles = s.adjust; if (s.adjust && s.compare) this.toggleCompare(); this.syncAdjust(); this.draw(); };
  Widget.prototype.toggleCompare = function () {
    var s = this.state; s.compare = !s.compare;
    this.cmpBtn.classList.toggle('pri', s.compare);
    this.cmpRow.classList.toggle('hidden', !s.compare);
    if (s.compare && s.adjust) { s.adjust = false; s.handles = false; this.syncAdjust(); }
    this.draw();
  };
  Widget.prototype.toggleSpin = function () {
    var self = this, s = this.state; s.spin = !s.spin;
    this.spinBtn.classList.toggle('pri', s.spin);
    var last = performance.now();
    function tick(t) {
      if (!s.spin) return;
      s.spinA += (t - last) / 1000 * 4.2; last = t;
      self.draw(); self._raf = requestAnimationFrame(tick);
    }
    if (s.spin) this._raf = requestAnimationFrame(tick); else this.draw();
  };

  // ---------- pointer / touch ----------
  Widget.prototype.toImg = function (e) {
    var r = this.canvas.getBoundingClientRect(), k = natW(this.state.photo) / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k: k };
  };
  function handlePos(sl) {
    var a = sl.rot * Math.PI / 180, ang = -Math.PI / 4;
    var lx = Math.cos(ang) * sl.r * sl.sx, ly = Math.sin(ang) * sl.r;
    return { x: sl.cx + lx * Math.cos(a) - ly * Math.sin(a), y: sl.cy + lx * Math.sin(a) + ly * Math.cos(a) };
  }
  Widget.prototype.bindPointer = function () {
    var self = this, cv = this.canvas, drag = null;
    cv.addEventListener('pointerdown', function (e) {
      var s = self.state; if (!s.photo) return;
      var p = self.toImg(e);
      if (s.compare) {
        drag = { mode: 'cmp' }; s.cmpX = clamp(p.x / natW(s.photo), 0, 1); self.rngCmp.value = s.cmpX;
        try { cv.setPointerCapture(e.pointerId); } catch (er) {}
        self.draw(); return;
      }
      if (!s.adjust) return;
      var tol = 24 * p.k, i, sl;
      for (i = 0; i < s.slots.length && !drag; i++) {
        var h = handlePos(s.slots[i]);
        if (Math.hypot(p.x - h.x, p.y - h.y) < tol) drag = { mode: 'size', i: i };
      }
      for (i = 0; i < s.slots.length && !drag; i++) {
        sl = s.slots[i];
        var dx = (p.x - sl.cx) / (sl.r * sl.sx), dy = (p.y - sl.cy) / sl.r;
        if (dx * dx + dy * dy < 1.1) drag = { mode: 'move', i: i, ox: p.x - sl.cx, oy: p.y - sl.cy };
      }
      if (drag) {
        e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch (er) {}
        if (s.sel !== drag.i) s.sel = drag.i;
        self.syncAdjust(); self.draw();
      }
    });
    cv.addEventListener('pointermove', function (e) {
      var s = self.state; if (!drag || !s.photo) return;
      var p = self.toImg(e);
      if (drag.mode === 'cmp') { s.cmpX = clamp(p.x / natW(s.photo), 0, 1); self.rngCmp.value = s.cmpX; self.draw(); return; }
      var sl = s.slots[drag.i];
      if (drag.mode === 'move') { sl.cx = p.x - drag.ox; sl.cy = p.y - drag.oy; }
      else {
        var dx = p.x - sl.cx, dy = p.y - sl.cy, a = -sl.rot * Math.PI / 180;
        var lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
        sl.r = clamp(Math.hypot(lx / sl.sx, ly), 8, 5000);
      }
      self._lumCache = {};
      self.syncAdjust(); self.draw();
    });
    function end() { drag = null; }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  };

  // ---------- rendering ----------
  Widget.prototype.draw = function () {
    var s = this.state; if (!s.photo) return;
    var c = this.canvas, x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    x.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.render(x, { handles: s.handles && s.adjust && !s.compare, compare: s.compare, px: 1 / this.scale });
  };
  Widget.prototype.render = function (x, opt) {
    var self = this, s = this.state, im = s.photo, W = natW(im), H = natH(im), px = opt.px;
    x.drawImage(im, 0, 0, W, H);
    s.slots.forEach(function (sl, i) { self.drawWheel(x, sl, i); });
    if (opt.compare) {
      var cx = s.cmpX * W;
      x.save(); x.beginPath(); x.rect(0, 0, cx, H); x.clip(); x.drawImage(im, 0, 0, W, H); x.restore();
      x.save();
      x.fillStyle = '#fff'; x.fillRect(cx - 1.5 * px, 0, 3 * px, H);
      x.beginPath(); x.arc(cx, H / 2, 16 * px, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#111'; x.font = 'bold ' + (14 * px) + 'px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('\u2194', cx, H / 2);
      var fs = 12 * px; x.font = 'bold ' + fs + 'px Arial';
      x.fillStyle = 'rgba(0,0,0,.6)';
      x.fillRect(8 * px, 8 * px, fs * 5, fs * 1.9); x.fillRect(W - 8 * px - fs * 4.6, 8 * px, fs * 4.6, fs * 1.9);
      x.fillStyle = '#fff';
      x.fillText('BEFORE', 8 * px + fs * 2.5, 8 * px + fs * 0.95); x.fillText('AFTER', W - 8 * px - fs * 2.3, 8 * px + fs * 0.95);
      x.restore();
    }
    if (opt.handles) s.slots.forEach(function (sl, i) {
      x.save(); x.translate(sl.cx, sl.cy); x.rotate(sl.rot * Math.PI / 180); x.scale(sl.sx, 1);
      x.lineWidth = 2 * px / sl.sx; x.setLineDash([7 * px, 5 * px]);
      x.strokeStyle = i === s.sel ? self.o.brandColor : 'rgba(255,255,255,.9)';
      x.beginPath(); x.arc(0, 0, sl.r, 0, Math.PI * 2); x.stroke();
      x.restore();
      var hp = handlePos(sl);
      x.save();
      x.fillStyle = self.o.brandColor; x.strokeStyle = '#fff'; x.lineWidth = 2 * px;
      x.beginPath(); x.arc(hp.x, hp.y, 10 * px, 0, Math.PI * 2); x.fill(); x.stroke();
      x.font = 'bold ' + (11 * px) + 'px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      var lbl = i === 0 ? 'LEFT' : 'RIGHT', tw = x.measureText(lbl).width + 12 * px;
      x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(sl.cx - tw / 2, sl.cy - sl.r - 24 * px, tw, 18 * px);
      x.fillStyle = '#fff'; x.fillText(lbl, sl.cx, sl.cy - sl.r - 15 * px);
      x.restore();
    });
  };
  Widget.prototype.ambient = function (sl, i) {
    // average brightness of the photo around the wheel, so a shiny rim isn't brighter than its surroundings
    this._lumCache = this._lumCache || {};
    if (this._lumCache[i] != null) return this._lumCache[i];
    var s = this.state, c = this._lc || (this._lc = document.createElement('canvas'));
    c.width = c.height = 48;
    var x = c.getContext('2d', { willReadFrequently: true }), R = sl.r * 1.9;
    x.clearRect(0, 0, 48, 48);
    x.drawImage(s.photo, sl.cx - R, sl.cy - R, R * 2, R * 2, 0, 0, 48, 48);
    var d = x.getImageData(0, 0, 48, 48).data, sum = 0, n = 0;
    for (var y = 0; y < 48; y++) for (var xx = 0; xx < 48; xx++) {
      var rr = Math.hypot(xx - 24, y - 24) / 24;
      if (rr < 0.6 || rr > 1) continue;
      var k = (y * 48 + xx) * 4;
      if (d[k + 3] < 10) continue;
      sum += (0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) / 255; n++;
    }
    return (this._lumCache[i] = n ? sum / n : 0.5);
  };
  Widget.prototype.drawWheel = function (x, sl, idx) {
    var s = this.state;
    var bod = tireOD(s.base), cur = { w: s.tw, a: s.ta, d: s.rim }, od = tireOD(cur);
    var ppm = sl.r / (bod / 2);                 // image px per mm (from the car's current tire)
    var rT = od / 2 * ppm;                      // new tire outer radius
    var rRim = s.rim * 25.4 / 2 * ppm;          // bead-seat radius
    var rFace = Math.min(rRim + 13 * ppm, rT - 9 * ppm); // visible face incl. rim flange
    var shift = sl.r - rT;                      // keep the tire on the ground
    var a = sl.rot * Math.PI / 180;
    var lum = s.matchLight ? this.ambient(sl, idx) : 0.5;
    var bright = clamp(0.8 + 0.45 * (lum - 0.45), 0.66, 1.06);
    x.save();
    x.translate(sl.cx - Math.sin(a) * shift, sl.cy + Math.cos(a) * shift);
    x.rotate(a);
    // soft contact shadow on the ground
    x.save(); x.translate(0, rT * 0.98); x.scale(sl.sx * 1.1, 0.09);
    var g0 = x.createRadialGradient(0, 0, 0, 0, 0, rT);
    g0.addColorStop(0, 'rgba(0,0,0,.55)'); g0.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g0; x.beginPath(); x.arc(0, 0, rT, 0, Math.PI * 2); x.fill(); x.restore();
    x.scale(sl.sx, 1);
    // cover the original wheel + tire (reads as the wheel-well shadow if the new tire is smaller)
    if (rT < sl.r * 1.03) {
      var gc = x.createRadialGradient(0, -shift, sl.r * 0.2, 0, -shift, sl.r * 1.04);
      gc.addColorStop(0, '#0b0b0b'); gc.addColorStop(0.9, '#111'); gc.addColorStop(1, 'rgba(12,12,12,0)');
      x.fillStyle = gc; x.beginPath(); x.arc(0, -shift, sl.r * 1.04, 0, Math.PI * 2); x.fill();
    }
    // tire rubber
    var gt = x.createRadialGradient(0, 0, rFace * 0.95, 0, 0, rT);
    gt.addColorStop(0, '#1d1d1e'); gt.addColorStop(0.45, '#262627'); gt.addColorStop(0.82, '#19191a'); gt.addColorStop(0.97, '#0b0b0b'); gt.addColorStop(1, '#262626');
    x.fillStyle = gt; x.beginPath(); x.arc(0, 0, rT, 0, Math.PI * 2); x.fill();
    var gh = x.createLinearGradient(0, -rT, 0, rT);
    gh.addColorStop(0, 'rgba(255,255,255,.10)'); gh.addColorStop(0.5, 'rgba(255,255,255,.02)'); gh.addColorStop(1, 'rgba(0,0,0,.25)');
    x.fillStyle = gh; x.beginPath(); x.arc(0, 0, rT, 0, Math.PI * 2); x.arc(0, 0, rFace, 0, Math.PI * 2, true); x.fill();
    // subtle sidewall lettering (the tire size)
    var sideH = rT - rFace;
    if (sideH * (this.scale || 1) > 10) {
      var txt = s.tw + '/' + s.ta + 'R' + s.rim, fs = sideH * 0.3, rr = (rT + rFace) / 2;
      x.save(); x.rotate(s.spin ? s.spinA : 0);
      x.font = '700 ' + fs + 'px Arial'; x.fillStyle = 'rgba(255,255,255,.14)'; x.textAlign = 'center'; x.textBaseline = 'middle';
      [-Math.PI / 2, Math.PI / 2].forEach(function (center) {
        var step = (fs * 0.68) / rr, start = center - step * (txt.length - 1) / 2;
        for (var i = 0; i < txt.length; i++) {
          x.save(); x.rotate(start + i * step + Math.PI / 2); x.translate(0, -rr);
          if (center > 0) { x.rotate(Math.PI); }
          x.fillText(txt[i], 0, 0); x.restore();
        }
      });
      x.restore();
    }
    // barrel / brake area visible between spokes
    var gb = x.createRadialGradient(0, 0, 0, 0, 0, rFace);
    gb.addColorStop(0, '#3a3a3c'); gb.addColorStop(0.35, '#2a2a2c'); gb.addColorStop(0.62, '#161617'); gb.addColorStop(1, '#070707');
    x.fillStyle = gb; x.beginPath(); x.arc(0, 0, rFace * 0.99, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(120,120,125,.35)'; x.lineWidth = rFace * 0.22;
    x.beginPath(); x.arc(0, 0, rFace * 0.6, 0, Math.PI * 2); x.stroke();
    // the wheel face
    if (s.faceImg) {
      x.save();
      x.beginPath(); x.arc(0, 0, rFace, 0, Math.PI * 2); x.clip();
      x.rotate(s.spin ? s.spinA : 0);
      if ('filter' in x) x.filter = 'brightness(' + bright.toFixed(3) + ')';
      x.drawImage(s.faceImg, -rFace, -rFace, rFace * 2, rFace * 2);
      if ('filter' in x) x.filter = 'none';
      x.restore();
    }
    // depth: inner shadow at the lip, light from above
    var gi = x.createRadialGradient(0, 0, rFace * 0.86, 0, 0, rFace * 1.02);
    gi.addColorStop(0, 'rgba(0,0,0,0)'); gi.addColorStop(1, 'rgba(0,0,0,.35)');
    x.fillStyle = gi; x.beginPath(); x.arc(0, 0, rFace * 1.02, 0, Math.PI * 2); x.fill();
    var gl = x.createLinearGradient(0, -rT, 0, rT);
    gl.addColorStop(0, 'rgba(255,255,255,.06)'); gl.addColorStop(0.55, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(0,0,0,.22)');
    x.fillStyle = gl; x.beginPath(); x.arc(0, 0, rFace, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = Math.max(1, rT * 0.015);
    x.beginPath(); x.arc(0, 0, rT - x.lineWidth / 2, 0, Math.PI * 2); x.stroke();
    x.restore();
  };

  // ---------- export / share ----------
  Widget.prototype.exportCanvas = function () {
    var s = this.state, W = natW(s.photo), H = natH(s.photo);
    var bar = Math.max(40, Math.round(W * 0.035));
    var c = document.createElement('canvas'); c.width = W; c.height = H + bar;
    var x = c.getContext('2d'), keep = this.scale;
    this.scale = 1;
    this.render(x, { handles: false, compare: false, px: W / 900 });
    this.scale = keep;
    x.fillStyle = '#111'; x.fillRect(0, H, W, bar);
    x.fillStyle = '#fff'; x.font = 'bold ' + Math.round(bar * 0.36) + 'px Arial'; x.textBaseline = 'middle';
    var w = s.wheel;
    x.fillText((this.o.shopName ? this.o.shopName + '  ·  ' : '') + (w ? w.name + ' ' + w.finish + '  ·  ' : '') + s.rim + '"  ·  ' + s.tw + '/' + s.ta + 'R' + s.rim, bar * 0.4, H + bar * 0.36);
    x.fillStyle = '#aaa'; x.font = Math.round(bar * 0.25) + 'px Arial';
    x.fillText('Visual preview only, fitment not guaranteed — confirm with the shop.', bar * 0.4, H + bar * 0.76);
    return c;
  };
  Widget.prototype.download = function () {
    var self = this;
    if (!this.state.photo) { this.toast('Add a photo first.'); return; }
    var c = this.exportCanvas();
    try {
      c.toBlob(function (b) {
        if (!b) { self.toast('Download isn\'t available for this wheel image.'); return; }
        var a = document.createElement('a'); a.href = URL.createObjectURL(b);
        a.download = 'wheel-preview-' + ((self.state.wheel && self.state.wheel.id) || 'car') + '.jpg';
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        self.toast('Saved preview image.');
      }, 'image/jpeg', 0.9);
    } catch (e) { this.toast('This wheel image can\'t be exported because the image server blocks it.', 4000); }
  };
  Widget.prototype.share = function () {
    var self = this, s = this.state, w = s.wheel;
    var text = 'Check out ' + (w ? w.name + ' ' + w.finish : 'these wheels') + ' on my car' + (this.o.shopName ? ' (' + this.o.shopName + ')' : '');
    var url = (w && w.url) || location.href;
    function copy(u) {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(function () { self.toast('Link copied.'); }, function () { self.toast(u, 5000); });
      else self.toast(u, 5000);
    }
    if (!s.photo) { if (navigator.share) navigator.share({ title: text, url: url }).catch(function () {}); else copy(url); return; }
    try {
      this.exportCanvas().toBlob(function (b) {
        var file = b && window.File ? new File([b], 'wheel-preview.jpg', { type: 'image/jpeg' }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: text, text: text + ' ' + url }).catch(function () {});
        else if (navigator.share) navigator.share({ title: text, text: text, url: url }).catch(function () {});
        else copy(url);
      }, 'image/jpeg', 0.9);
    } catch (e) { copy(url); }
  };

  // ---------- public API ----------
  var instances = [];
  function mount(target, opts) {
    var node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) throw new Error('WheelVisualizer: mount target not found');
    if (node.__wv) return node.__wv;
    var w = new Widget(node, opts || {});
    node.__wv = w; instances.push(w);
    return w;
  }
  function autoMount() {
    var nodes = document.querySelectorAll('[data-wheel-visualizer], #wheel-visualizer');
    for (var i = 0; i < nodes.length; i++) if (!nodes[i].__wv) mount(nodes[i]);
  }
  window.WheelVisualizer = { __v: '1.0.0', mount: mount, instances: instances, detectWheels: detectWheels, tire: { parse: parseTire, overallDiameterMm: tireOD } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount); else autoMount();
})();
