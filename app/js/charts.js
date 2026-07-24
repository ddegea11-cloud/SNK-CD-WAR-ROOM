/* =========================================================================
 * SNK-CD War Room — Chart primitives (SVG ล้วนๆ ไม่พึ่งไลบรารีภายนอก)
 * ให้ตรงกับ dataviz หลักการ: เลือกรูปแบบตามงาน (magnitude/proportion/trend),
 * สีตามหน้าที่ (สถานะ vs หมวดหมู่), มี legend/label เสมอ (ไม่ใช้สีเดี่ยวๆ)
 * ========================================================================= */
window.Charts = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- กราฟเส้น: แนวโน้มเบิกจ่ายสะสม (checkpoint เรียงลำดับ ไม่ใช่สเกลวันจริง)
     + เส้นอ้างอิงจังหวะที่ควรจะเป็น ณ วันนี้ (เส้นประแนวนอน)
     points: [{label, pct}]  benchmarkPct: number|null  benchmarkLabel: string
     opts: {width,height,ticks,compact} — ค่าเริ่มต้นคือขนาดย่อสำหรับการ์ดสรุปมุมบน */
  function paceLineChart(points, benchmarkPct, benchmarkLabel, opts) {
    opts = opts || {};
    var W = opts.width || 226, H = opts.height || 108;
    var padL = opts.padL != null ? opts.padL : 24, padR = opts.padR != null ? opts.padR : 8;
    var padT = opts.padT != null ? opts.padT : 12, padB = opts.padB != null ? opts.padB : 16;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var n = points.length;
    var maxY = 100;
    points.forEach(function (p) { if (p.pct !== null && p.pct > maxY) maxY = p.pct; });
    if (benchmarkPct !== null && benchmarkPct !== undefined && benchmarkPct > maxY) maxY = benchmarkPct;
    maxY = Math.ceil((maxY + 5) / 10) * 10;

    function xAt(i) { return padL + (n === 1 ? innerW / 2 : innerW * i / (n - 1)); }
    function yAt(v) { return padT + innerH - (v / maxY) * innerH; }

    var gridLines = '';
    var ticks = opts.ticks != null ? opts.ticks : 2;
    for (var t = 0; t <= ticks; t++) {
      var v = maxY * t / ticks;
      var y = yAt(v);
      gridLines += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" class="cx-grid" />' +
        '<text x="' + (padL - 5) + '" y="' + (y + 3).toFixed(1) + '" class="cx-axis-lbl" text-anchor="end">' + Math.round(v) + '%</text>';
    }

    var xLabels = points.map(function (p, i) {
      return '<text x="' + xAt(i).toFixed(1) + '" y="' + (H - 3) + '" class="cx-axis-lbl" text-anchor="middle">' + esc(p.label) + '</text>';
    }).join('');

    var benchmarkLine = '';
    if (benchmarkPct !== null && benchmarkPct !== undefined) {
      var by = yAt(benchmarkPct);
      benchmarkLine = '<line x1="' + padL + '" y1="' + by.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + by.toFixed(1) + '" class="cx-benchmark" />';
    }

    var linePath = points.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ',' + yAt(p.pct || 0).toFixed(1);
    }).join(' ');

    var dotR = opts.dotR || 3;
    var dots = points.map(function (p, i) {
      var x = xAt(i), y = yAt(p.pct || 0);
      var vLabel = p.pct === null || p.pct === undefined ? '-' : p.pct.toFixed(1) + '%';
      var showLabel = opts.labelAll !== false || i === n - 1;
      return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + dotR + '" class="cx-dot"><title>' + esc(p.label) + ': ' + vLabel + '</title></circle>' +
        (showLabel ? '<text x="' + x.toFixed(1) + '" y="' + (y - dotR - 5).toFixed(1) + '" class="cx-point-lbl" text-anchor="middle">' + vLabel + '</text>' : '');
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg pace-line" role="img" aria-label="กราฟแนวโน้มเบิกจ่ายสะสม เทียบเป้า ' +
      (benchmarkPct !== null && benchmarkPct !== undefined ? benchmarkPct.toFixed(1) + '%' : '') + '">' +
      gridLines + benchmarkLine +
      '<path d="' + linePath + '" class="cx-line" fill="none"/>' +
      dots + xLabels +
      '</svg>';
  }

  /* ---------- กราฟวงกลม (โดนัท): slices = [{label, value, colorVar}] ---------- */
  function donutChart(slices, opts) {
    opts = opts || {};
    var size = opts.size || 168;
    var stroke = opts.stroke || 28;
    var r = (size - stroke) / 2;
    var cx = size / 2, cy = size / 2;
    var circumference = 2 * Math.PI * r;
    var total = slices.reduce(function (s, x) { return s + (x.value || 0); }, 0);
    var offset = 0;
    var arcs = '';
    if (total <= 0) {
      arcs = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--hairline)" stroke-width="' + stroke + '" />';
    } else {
      slices.forEach(function (s) {
        var frac = (s.value || 0) / total;
        var len = frac * circumference;
        arcs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.colorVar + '" stroke-width="' + stroke +
          '" stroke-dasharray="' + len.toFixed(1) + ' ' + (circumference - len).toFixed(1) + '" stroke-dashoffset="' + (-offset).toFixed(1) +
          '" transform="rotate(-90 ' + cx + ' ' + cy + ')">' +
          '<title>' + esc(s.label) + ': ' + (frac * 100).toFixed(1) + '%</title></circle>';
        offset += len;
      });
    }
    var centerLabel = opts.centerLabel || '';
    var centerSub = opts.centerSub || '';
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" class="chart-svg donut" role="img" aria-label="' + esc(opts.ariaLabel || 'สัดส่วนงบประมาณ') + '">' +
      arcs +
      (centerLabel ? '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" class="cx-donut-center">' + esc(centerLabel) + '</text>' : '') +
      (centerSub ? '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" class="cx-donut-sub">' + esc(centerSub) + '</text>' : '') +
      '</svg>';
  }

  /* ---------- legend คู่กับโดนัท/หมวดหมู่ (ต้องมีเสมอเมื่อ ≥2 series — ไม่ใช้สีเดี่ยวๆ) ---------- */
  function legendHtml(slices, opts) {
    opts = opts || {};
    var total = slices.reduce(function (s, x) { return s + (x.value || 0); }, 0);
    return '<div class="chart-legend">' + slices.map(function (s) {
      var pct = total > 0 ? (s.value || 0) / total * 100 : 0;
      return '<div class="cl-item"><span class="cl-dot" style="background:' + s.colorVar + '"></span>' +
        '<span class="cl-label">' + esc(s.label) + '</span>' +
        '<span class="cl-value">' + (opts.valueFmt ? opts.valueFmt(s.value) : s.value) +
        ' <span class="cl-pct">(' + pct.toFixed(1) + '%)</span></span></div>';
    }).join('') + '</div>';
  }

  /* ---------- แท่งจัดอันดับแนวนอน (reuse .bar-track/.bar-fill เดิมของแดชบอร์ด)
     items: [{label, value, sublabel, colorVar}] ---------- */
  function rankedBars(items, opts) {
    opts = opts || {};
    var max = opts.max || Math.max.apply(null, items.map(function (i) { return i.value || 0; }).concat([1]));
    return '<div class="ranked-bars">' + items.map(function (it) {
      var pct = max > 0 ? Math.max(0, Math.min(100, (it.value || 0) / max * 100)) : 0;
      return '<div class="rb-row"><div class="rb-label">' + esc(it.label) + '</div>' +
        '<div class="bar-track rb-track"><div class="bar-fill rb-fill" style="width:' + pct + '%;background:' + (it.colorVar || 'var(--series-disbursed)') + '"></div></div>' +
        '<div class="rb-value">' + esc(it.sublabel != null ? it.sublabel : it.value) + '</div></div>';
    }).join('') + '</div>';
  }

  /* ---------- แผนที่จังหวัด (choropleth): ระบายสีแต่ละอำเภอตามสถานะ
     polygons: [{name, rings:[[[lon,lat],...]]}] (จาก app/data/sakon_nakhon_map.js — ขอบเขตจริงจาก
     OpenGISData-Thailand ไม่ใช่รูปวาดประมาณ) infoByName: { [ชื่ออำเภอ]: {colorVar, tooltip} } */
  /* ศูนย์กลางพื้นที่ (area-weighted centroid) ของรูปหลายเหลี่ยม — ใช้วางป้ายชื่ออำเภอให้อยู่กลางรูปจริง
     ไม่ใช่แค่กึ่งกลางกรอบสี่เหลี่ยม (ซึ่งอาจหลุดออกนอกรูปทรงเว้า) */
  function polygonCentroid(ring) {
    var area = 0, cx = 0, cy = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      var x0 = ring[i][0], y0 = ring[i][1], x1 = ring[i + 1][0], y1 = ring[i + 1][1];
      var a = x0 * y1 - x1 * y0;
      area += a;
      cx += (x0 + x1) * a;
      cy += (y0 + y1) * a;
    }
    area *= 0.5;
    if (Math.abs(area) < 1e-9) {
      var sx = 0, sy = 0;
      ring.forEach(function (p) { sx += p[0]; sy += p[1]; });
      return [sx / ring.length, sy / ring.length];
    }
    return [cx / (6 * area), cy / (6 * area)];
  }

  function provinceMapSVG(polygons, infoByName, opts) {
    opts = opts || {};
    var W = opts.width || 520;
    var pad = opts.pad != null ? opts.pad : 6;

    var minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    polygons.forEach(function (d) {
      d.rings.forEach(function (ring) {
        ring.forEach(function (pt) {
          if (pt[0] < minLon) minLon = pt[0];
          if (pt[0] > maxLon) maxLon = pt[0];
          if (pt[1] < minLat) minLat = pt[1];
          if (pt[1] > maxLat) maxLat = pt[1];
        });
      });
    });
    var latMid = (minLat + maxLat) / 2;
    var cosLat = Math.cos(latMid * Math.PI / 180);
    var spanX = (maxLon - minLon) * cosLat, spanY = (maxLat - minLat);
    var H = Math.round(W * (spanY / spanX));
    var innerW = W - pad * 2, innerH = H - pad * 2;

    function proj(pt) {
      var x = pad + (pt[0] - minLon) * cosLat / spanX * innerW;
      var y = pad + (maxLat - pt[1]) / spanY * innerH;
      return [x, y];
    }

    var paths = polygons.map(function (d) {
      var info = infoByName[d.name] || {};
      var dAttr = d.rings.map(function (ring) {
        return ring.map(function (pt, i) {
          var p = proj(pt);
          return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
        }).join(' ') + 'Z';
      }).join(' ');
      return '<path d="' + dAttr + '" fill="' + (info.colorVar || 'var(--st-gray)') +
        '" stroke="var(--surface)" stroke-width="1.4" class="map-district" data-d="' + esc(d.name) + '">' +
        '<title>' + esc(d.name) + (info.tooltip ? ': ' + esc(info.tooltip) : '') + '</title></path>';
    }).join('');

    var labels = polygons.map(function (d) {
      var c = proj(polygonCentroid(d.rings[0]));
      return '<text x="' + c[0].toFixed(1) + '" y="' + c[1].toFixed(1) + '" class="map-label">' + esc(d.name) + '</text>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg province-map" role="img" aria-label="แผนที่สถานะ 18 อำเภอ จังหวัดสกลนคร">' + paths + labels + '</svg>';
  }

  return {
    paceLineChart: paceLineChart,
    donutChart: donutChart,
    legendHtml: legendHtml,
    rankedBars: rankedBars,
    provinceMapSVG: provinceMapSVG
  };
})();
