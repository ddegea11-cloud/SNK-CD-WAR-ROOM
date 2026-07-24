/* =========================================================================
 * SNK-CD War Room — UI Layer (hash router + renderers)
 * หน้าจอ: ภาพรวม / รายอำเภอ / รายโครงการ / มิติคุณภาพ / แจ้งเตือนล่วงหน้า
 * ========================================================================= */
(function () {
  'use strict';
  var E = window.ETL;

  /* ---------- state ---------- */
  var state = {
    model: null,
    provider: null,
    loadedAt: null,
    config: loadConfig()
  };
  window.AppState = state; // ให้ export.js ใช้

  function loadConfig() {
    try {
      var raw = localStorage.getItem('snkcd_config');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* localStorage อาจถูกปิดใน file:// บางเครื่อง */ }
    return { paceThreshold: 10, weights: { pace: 50, compliance: 30, data: 20 }, fiscalYear: 2569 };
  }
  function saveConfig() {
    try { localStorage.setItem('snkcd_config', JSON.stringify(state.config)); } catch (e) {}
  }
  function loadNotes() {
    try { return JSON.parse(localStorage.getItem('snkcd_notes') || '{}'); } catch (e) { return {}; }
  }
  function saveNote(district, text) {
    var notes = loadNotes();
    if (text) notes[district] = text; else delete notes[district];
    try { localStorage.setItem('snkcd_notes', JSON.stringify(notes)); } catch (e) {}
  }

  /* ---------- helpers ---------- */
  function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function chip(status, extraLabel) {
    var m = E.STATUS_META[status] || E.STATUS_META.gray;
    return '<span class="chip ' + status + '"><span class="ic">' + m.icon + '</span>' + esc(extraLabel || m.label) + '</span>';
  }
  function fmtB(n) { return E.fmtBaht(n); }
  function thDate(d) {
    return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
  }

  /* ---------- โหลดข้อมูล ---------- */
  function refresh(force) {
    state.provider = window.DataProviders.pick();
    return state.provider.load({ force: !!force }).then(function (seed) {
      state.model = E.buildModel(seed, state.config, new Date());
      state.loadedAt = new Date();
      renderStamp();
      route();
    });
  }

  function renderStamp() {
    var el = document.getElementById('dataStamp');
    var src = state.provider ? state.provider.sourceLabel : '';
    el.innerHTML =
      '<span>📄 แหล่งข้อมูล: ' + esc(src) + '</span>' +
      '<span>🕐 อัปเดตล่าสุด: ' + esc(thDate(state.loadedAt)) + '</span>' +
      '<button class="refresh-btn" id="btnRefresh">↻ รีเฟรชตอนนี้</button>';
    document.getElementById('btnRefresh').onclick = function () { refresh(true); };
  }

  /* ---------- router ---------- */
  var NAV = [
    { hash: '#overview',    label: '🏠 ภาพรวมจังหวัด' },
    { hash: '#districts',   label: '📍 รายอำเภอ' },
    { hash: '#projects',    label: '📋 รายโครงการ' },
    { hash: '#workgroups',  label: '🗂️ กลุ่มงาน' },
    { hash: '#quality',     label: '⭐ มิติคุณภาพ' },
    { hash: '#warning',     label: '🔔 แจ้งเตือนล่วงหน้า' },
    { hash: '#regulations', label: '📚 ระเบียบ/แนวทาง/คู่มือ' },
    { hash: '#askai',       label: '🤖 ถาม AI' },
    { hash: '#settings',    label: '⚙️ ตั้งค่า' }
  ];

  function route() {
    if (!state.model) return;
    var hash = location.hash || '#overview';
    var base = hash.split('/')[0];
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.hash === base);
    });
    var page = document.getElementById('page');
    page.innerHTML = '';
    if (base === '#districts' && hash.indexOf('/') > 0) {
      renderDistrictDetail(page, decodeURIComponent(hash.split('/')[1]));
    } else if (base === '#districts') renderDistricts(page);
    else if (base === '#projects') renderProjects(page);
    else if (base === '#workgroups') renderWorkGroups(page);
    else if (base === '#quality') renderQuality(page);
    else if (base === '#warning') renderWarning(page);
    else if (base === '#regulations') renderRegulations(page);
    else if (base === '#askai') renderAskAI(page);
    else if (base === '#settings') renderSettings(page);
    else renderOverview(page);
    window.scrollTo(0, 0);
  }

  /* ======================================================================
   * 7.1 ภาพรวมจังหวัด
   * ==================================================================== */
  function renderOverview(page) {
    var m = state.model;
    var p = m.agg.province;
    var counts = { green: 0, yellow: 0, red: 0, gray: 0, check: 0 };
    m.districts.forEach(function (d) { counts[d.needsCheck ? 'check' : d.status]++; });

    var diff = p.pct !== null ? +(p.pct - m.fiscal.expectedPacePct).toFixed(1) : null;
    var headline;
    if (p.pct === null) headline = 'ยังไม่มีข้อมูลการเบิกจ่ายในปีงบประมาณนี้';
    else if (diff >= 0) headline = 'ขณะนี้จังหวัดเบิกจ่ายสะสมร้อยละ ' + p.pct.toFixed(1) +
      ' <b>เร็วกว่าจังหวะเวลาที่ควรจะเป็นร้อยละ ' + Math.abs(diff).toFixed(1) + '</b> ถือว่าเป็นไปตามแผน';
    else headline = 'ขณะนี้จังหวัดเบิกจ่ายสะสมร้อยละ ' + p.pct.toFixed(1) +
      ' <b>ช้ากว่าจังหวะเวลาที่ควรจะเป็นร้อยละ ' + Math.abs(diff).toFixed(1) + '</b> ควรเร่งรัดในไตรมาสนี้';

    var provinceStatus = p.pct !== null ? E.paceStatus(p.pct, m.fiscal.expectedPacePct, m.config.paceThreshold) : 'gray';
    var heroPctTile = '<div class="stat-tile hero-pct">' +
      '<div class="label">เบิกจ่ายสะสม (YTD) — ร้อยละ</div>' +
      '<div class="hero-value-row"><div class="value">' + (p.pct !== null ? p.pct.toFixed(1) + '%' : '—') + '</div>' +
      chip(provinceStatus) + '</div>' +
      '<div class="sub">' + fmtB(p.disbursed) + ' บาท</div></div>';

    var tiles =
      tile('งบประมาณรวมทั้งหมด', fmtB(p.allocated) + ' บาท', 'ทุกหมวดงบที่ข้อมูลใช้ได้') +
      heroPctTile +
      tile('สถานะ 18 อำเภอ', statusSummaryHtml(counts), '') +
      tile('เหลือเวลาปีงบ ' + m.config.fiscalYear, m.fiscal.daysRemaining + ' วัน',
        'จังหวะที่ควรจะเป็น: เบิกแล้ว ' + m.fiscal.expectedPacePct + '%');

    // กริด 18 อำเภอ — ถ้ามีข้อมูลผิดปกติ (เช่น เบิกเกิน 100%) สถานะหลักคือ "ควรตรวจสอบ"
    // ไม่ใช่เขียว เพราะตัวเลขยังเชื่อไม่ได้จนกว่าจะแก้ที่ต้นทาง
    var grid = m.districts.map(function (d) {
      var stKey = d.needsCheck ? 'check' : d.status;
      var meta = E.STATUS_META[stKey];
      return '<button class="district-tile ' + stKey + '" data-d="' + esc(d.district) + '">' +
        '<span class="name">' + esc(d.district) + '</span>' +
        '<span class="pct">' + (d.agg && d.agg.pct !== null ? d.agg.pct.toFixed(1) + '%' : '—') + '</span>' +
        '<span class="status-line"><b>' + meta.icon + '</b> ' + meta.label + '</span>' +
        '</button>';
    }).join('');

    // แผนที่จังหวัด — ขอบเขตอำเภอจริงจาก OpenGISData-Thailand (chingchai) ระบายสีตามสถานะเดียวกับกริด
    var mapInfo = {};
    m.districts.forEach(function (d) {
      var stKey = d.needsCheck ? 'check' : d.status;
      var pctTxt = d.agg && d.agg.pct !== null ? d.agg.pct.toFixed(1) + '%' : 'รอข้อมูล';
      mapInfo[d.district] = { colorVar: STATUS_BAR_COLOR[stKey], tooltip: pctTxt + ' — ' + E.STATUS_META[stKey].label };
    });
    var provinceMap = (window.SEED_DISTRICT_MAP && window.SEED_DISTRICT_MAP.length)
      ? Charts.provinceMapSVG(window.SEED_DISTRICT_MAP, mapInfo) : '';
    var mapLegend = '<div class="map-legend">' + ['green', 'yellow', 'red', 'check', 'gray'].map(function (k) {
      return '<span class="ml-item"><span class="ml-dot" style="background:' + STATUS_BAR_COLOR[k] + '"></span>' + esc(E.STATUS_META[k].label) + '</span>';
    }).join('') + '</div>';

    // กราฟแท่งรายหมวดงบ
    var maxAlloc = 0;
    E.CATEGORIES.forEach(function (c) {
      var a = m.agg.byCat[c]; if (a && a.allocated > maxAlloc) maxAlloc = a.allocated;
    });
    var bars = E.CATEGORIES.map(function (c) {
      var a = m.agg.byCat[c];
      var provTag = E.PROVINCE_ONLY_CATEGORIES.indexOf(c) >= 0 ? ' <span class="tag">ระดับจังหวัด</span>' : '';
      if (!a) {
        var isBroken = m.refBrokenCategories.indexOf(c) >= 0;
        return '<div class="bar-row"><div class="bar-label"><span>' + esc(c) + provTag + '</span>' +
          (isBroken ? chip('check', 'ข้อมูลเสียหาย (#REF!) รอแก้ไขที่ต้นทาง') : '<span class="hint">ไม่มีข้อมูล</span>') +
          '</div></div>';
      }
      return '<div class="bar-row"><div class="bar-label"><span><b>' + esc(c) + '</b>' + provTag + '</span>' +
        '<span>' + fmtB(a.disbursed) + ' / ' + fmtB(a.allocated) + ' บาท (' + (a.pct !== null ? a.pct.toFixed(1) : '-') + '%)</span></div>' +
        '<div class="bar-pair">' +
        '<div class="bar-track"><div class="bar-fill alloc" style="width:' + (a.allocated / maxAlloc * 100) + '%"></div></div>' +
        '<div class="bar-track"><div class="bar-fill disb" style="width:' + (a.disbursed / maxAlloc * 100) + '%"></div></div>' +
        '</div></div>';
    }).join('');

    // จุดที่ควรติดตามเร่งด่วน (แสดง 5 อันดับแรก แบบสุภาพ)
    var urgent = state.model.warnings.filter(function (w) { return w.status === 'red'; })
      .concat(state.model.warnings.filter(function (w) { return w.status === 'yellow'; })).slice(0, 5);
    var urgentHtml = urgent.length
      ? urgent.map(warnItemHtml).join('')
      : '<div class="empty-note">🎉 ยังไม่มีจุดที่ต้องติดตามเร่งด่วนในขณะนี้</div>';

    page.appendChild(h(
      '<div class="stat-grid">' + tiles + '</div>' +
      '<div class="headline-sentence">' + headline + '</div>' +
      '<div class="card"><h2>🗺️ สถานะ 18 อำเภอ <span class="hint">(กดที่อำเภอบนแผนที่เพื่อดูรายละเอียด)</span></h2>' +
      (provinceMap
        ? provinceMap + mapLegend
        : '<div class="district-grid">' + grid + '</div>') + '</div>' +
      '<div class="card"><h2>เปรียบเทียบตามประเภทงบ</h2>' +
      '<div class="legend"><span class="key"><span class="swatch" style="background:var(--series-allocated)"></span>จัดสรร</span>' +
      '<span class="key"><span class="swatch" style="background:var(--series-disbursed)"></span>เบิกจ่ายแล้ว</span></div>' +
      '<div class="bar-chart">' + bars + '</div>' +
      '<p class="hint">หมายเหตุ: โครงการ "โคก หนอง นา" และ "จปฐ." เป็นโครงการย่อยในงบยุทธศาสตร์ — ยอดถูกนับรวมไว้แล้ว ไม่นับซ้ำเป็นหมวดที่ 4</p></div>' +
      '<div class="card"><h2>จุดที่ควรติดตาม/สนับสนุนเพิ่ม</h2>' + urgentHtml +
      '<p class="hint">ดูรายการทั้งหมดที่เมนู "แจ้งเตือนล่วงหน้า"</p></div>'
    ));

    page.querySelectorAll('.district-tile, .map-district').forEach(function (b) {
      b.onclick = function () { location.hash = '#districts/' + encodeURIComponent(b.dataset.d); };
    });
  }

  function tile(label, value, sub) {
    return '<div class="stat-tile"><div class="label">' + esc(label) + '</div>' +
      '<div class="value">' + value + '</div>' +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  /* แถวสรุปสถานะ 18 อำเภอ — จุด (สี) + ตัวเลข + ป้ายความเร่งด่วน อยู่ติดกันเสมอ
     (ไม่ใช้อีโมจิวงกลม เพราะขนาด/แนวเส้นฐานไม่นิ่งข้ามฟอนต์/แพลตฟอร์ม) */
  function statusSummaryHtml(counts) {
    var items = [
      { key: 'green',  n: counts.green,  label: 'ตามแผน' },
      { key: 'yellow', n: counts.yellow, label: 'ต้องเร่ง' },
      { key: 'red',    n: counts.red,    label: 'เร่งด่วน' }
    ];
    if (counts.check) items.push({ key: 'check', n: counts.check, label: 'ควรตรวจสอบ' });
    if (counts.gray)  items.push({ key: 'gray',  n: counts.gray,  label: 'รอข้อมูล' });
    return '<div class="status-summary">' + items.map(function (it) {
      return '<div class="ss-item ' + it.key + '">' +
        '<span class="ss-top"><span class="ss-dot"></span><span class="ss-num">' + it.n + '</span></span>' +
        '<span class="ss-label">' + esc(it.label) + '</span></div>';
    }).join('') + '</div>';
  }

  function warnItemHtml(w) {
    return '<div class="warn-item ' + w.status + '"><div class="w-head"><span>' + esc(w.district) + ' — ' + esc(w.message) + '</span>' +
      chip(w.status, w.status === 'red' ? 'ควรสนับสนุนเร่งด่วน' : 'ควรติดตาม') + '</div>' +
      '<div class="w-sugg">' + esc(w.suggestion) + '</div></div>';
  }

  /* ======================================================================
   * 7.2 รายอำเภอ
   * ==================================================================== */
  var STATUS_BAR_COLOR = {
    green: 'var(--st-green)', yellow: 'var(--st-yellow)', red: 'var(--st-red)',
    check: 'var(--st-check)', gray: 'var(--st-gray)'
  };

  function renderDistricts(page) {
    var m = state.model;

    // กราฟแท่งจัดอันดับ 5 อำเภอสูงสุดตาม % เบิกจ่าย — สรุปย่อ (ตารางเต็ม 18 อำเภอดูด้านล่าง)
    var ranked = m.districts.filter(function (d) { return d.agg && d.agg.pct !== null; })
      .slice().sort(function (a, b) { return b.agg.pct - a.agg.pct; });
    var rankedBarsHtml = Charts.rankedBars(ranked.slice(0, 5).map(function (d) {
      var stKey = d.needsCheck ? 'check' : d.status;
      return { label: d.district, value: d.agg.pct, sublabel: d.agg.pct.toFixed(1) + '%', colorVar: STATUS_BAR_COLOR[stKey] };
    }), { max: 100 });

    var rows = m.districts.map(function (d) {
      return '<tr data-d="' + esc(d.district) + '" style="cursor:pointer">' +
        '<td><b>' + esc(d.district) + '</b></td>' +
        '<td class="num">' + fmtB(d.agg ? d.agg.allocated : null) + '</td>' +
        '<td class="num">' + fmtB(d.agg ? d.agg.disbursed : null) + '</td>' +
        '<td class="num">' + (d.agg && d.agg.pct !== null ? d.agg.pct.toFixed(1) + '%' : '—') + '</td>' +
        '<td>' + chip(d.needsCheck ? 'check' : d.status) + '</td>' +
        '<td class="num">' + (d.quality ? d.quality.score.toFixed(0) + '/5' : '—') + '</td>' +
        '<td class="num">' + (d.health.index !== null ? d.health.index : '—') + '</td>' +
        '</tr>';
    }).join('');

    var prov = m.agg.byUnit[E.PROVINCE_UNIT];
    var provRow = prov ?
      '<tr class="total-row"><td>สนง.จังหวัด (ส่วนกลาง)</td>' +
      '<td class="num">' + fmtB(prov.allocated) + '</td><td class="num">' + fmtB(prov.disbursed) + '</td>' +
      '<td class="num">' + (prov.pct !== null ? prov.pct.toFixed(1) + '%' : '—') + '</td><td colspan="3"></td></tr>' : '';

    var mcRanked = '<div class="mini-chart-card"><div class="mc-title">📊 5 อันดับสูงสุด (% เบิกจ่าย)</div>' +
      rankedBarsHtml.replace('class="ranked-bars"', 'class="ranked-bars compact"') + '</div>';

    page.appendChild(h(
      '<div class="page-head-row">' +
      '<div class="headline-sentence" style="flex:2;min-width:260px">รายอำเภอ (สะสมทั้งปี ทุกหมวดงบที่ข้อมูลใช้ได้) — กดที่แถวในตารางด้านล่างเพื่อดูรายละเอียดเจาะลึก</div>' +
      mcRanked +
      '</div>' +
      '<div class="card"><h2>รายอำเภอ (สะสมทั้งปี ทุกหมวดงบที่ข้อมูลใช้ได้)</h2>' +
      '<p class="hint">กดที่แถวเพื่อดูรายละเอียดเจาะลึก · คะแนนคุณภาพมาจากแบบประเมินที่ 1 · ดัชนีสุขภาพ 0–100</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>อำเภอ</th><th class="num">จัดสรร (บาท)</th><th class="num">เบิกจ่าย (บาท)</th><th class="num">%</th><th>สถานะ</th><th class="num">คะแนน</th><th class="num">ดัชนีสุขภาพ</th>' +
      '</tr></thead><tbody>' + rows + provRow + '</tbody></table></div></div>'
    ));
    page.querySelectorAll('tr[data-d]').forEach(function (tr) {
      tr.onclick = function () { location.hash = '#districts/' + encodeURIComponent(tr.dataset.d); };
    });
  }

  function renderDistrictDetail(page, name) {
    var m = state.model;
    var d = null;
    m.districts.forEach(function (x) { if (x.district === name) d = x; });
    if (!d) { page.appendChild(h('<div class="card">ไม่พบอำเภอ "' + esc(name) + '"</div>')); return; }

    var provinceAvgPct = (function () {
      var vals = m.districts.filter(function (x) { return x.agg && x.agg.pct !== null; });
      if (!vals.length) return null;
      return vals.reduce(function (s, x) { return s + x.agg.pct; }, 0) / vals.length;
    })();

    // ตารางรายหมวดงบของอำเภอนี้ + breakdown รายไตรมาส
    // (งบจังหวัด/กลุ่มจังหวัด เป็นงบระดับจังหวัดเท่านั้น — ไม่แสดงในระดับอำเภอ)
    var districtCats = E.CATEGORIES.filter(function (c) {
      return E.PROVINCE_ONLY_CATEGORIES.indexOf(c) < 0;
    });
    var catRows = districtCats.map(function (c) {
      var uc = m.agg.byUnitCat[name + '|' + c];
      if (!uc) {
        var broken = m.refBrokenCategories.indexOf(c) >= 0;
        return '<tr><td>' + esc(c) + '</td><td colspan="4">' +
          (broken ? chip('check', 'ข้อมูลเสียหาย (#REF!)') : '<span class="hint">ไม่มีข้อมูล</span>') + '</td></tr>';
      }
      return '<tr><td><b>' + esc(c) + '</b></td>' +
        '<td class="num">' + fmtB(uc.allocated) + '</td>' +
        '<td class="num">' + fmtB(uc.disbursed) + '</td>' +
        '<td class="num">' + (uc.pct !== null ? uc.pct.toFixed(1) + '%' : '—') + '</td>' +
        '<td>' + (uc.flags.length ? chip('check') : chip(E.paceStatus(uc.pct, m.fiscal.expectedPacePct, m.config.paceThreshold))) + '</td></tr>';
    }).join('');

    // คอลัมน์แนวโน้มรายช่วง (จากหมวดที่มี breakdown)
    var quarterOrder = ['ไตร1-2', 'ไตร3-4', 'ไตร4'];
    var qTotals = {};
    quarterOrder.forEach(function (q) { qTotals[q] = { allocated: 0, disbursed: 0 }; });
    districtCats.forEach(function (c) {
      var uc = m.agg.byUnitCat[name + '|' + c];
      if (!uc) return;
      quarterOrder.forEach(function (q) {
        if (uc.quarters[q]) {
          qTotals[q].allocated += uc.quarters[q].allocated;
          qTotals[q].disbursed += uc.quarters[q].disbursed;
        }
      });
    });
    var maxQ = Math.max.apply(null, quarterOrder.map(function (q) { return qTotals[q].disbursed; }).concat([1]));
    var cols = quarterOrder.map(function (q) {
      var v = qTotals[q];
      var pctQ = v.allocated > 0 ? (v.disbursed / v.allocated * 100).toFixed(0) + '%' : '—';
      return '<div class="mini-col">' +
        '<div class="col-val">' + E.fmtShort(v.disbursed) + '</div>' +
        '<div class="col-fill" style="height:' + Math.max(2, v.disbursed / maxQ * 100) + '%"></div>' +
        '<div class="col-label">' + esc(q) + '<br>(' + pctQ + ')</div></div>';
    }).join('');

    // เทียบกับค่าเฉลี่ยจังหวัด (ไม่จัดอันดับ)
    var cmp = '';
    if (d.agg && d.agg.pct !== null && provinceAvgPct !== null) {
      cmp =
        cmpRow('อำเภอนี้', d.agg.pct, 'var(--series-disbursed)') +
        cmpRow('ค่าเฉลี่ยจังหวัด', provinceAvgPct, 'var(--series-allocated)') +
        cmpRow('จังหวะที่ควรเป็น', m.fiscal.expectedPacePct, 'var(--baseline)');
    }

    // เส้นแนวโน้มเบิกจ่ายสะสมของอำเภอนี้ (checkpoint เดียวกับหน้าภาพรวม)
    var distPaceLine = d.agg && d.agg.pct !== null ? Charts.paceLineChart(
      [
        { label: 'เริ่มปีงบ', pct: 0 },
        { label: 'ไตร 1-2', pct: qTotals['ไตร1-2'].allocated > 0 ? qTotals['ไตร1-2'].disbursed / qTotals['ไตร1-2'].allocated * 100 : null },
        { label: 'YTD (ปัจจุบัน)', pct: d.agg.pct }
      ],
      m.fiscal.expectedPacePct,
      'เป้าวันนี้ ' + m.fiscal.expectedPacePct.toFixed(1) + '%'
    ) : '';

    // คุณภาพ
    var qHtml = d.quality
      ? '<div class="q-head"><b>คะแนนราชการ (แบบประเมินที่ 1)</b><span class="q-score">' + d.quality.score.toFixed(0) + '/5</span></div>' +
        '<ul class="q-reasons">' + d.quality.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>'
      : '<div class="empty-note">ยังไม่มีข้อมูลการประเมินคุณภาพของอำเภอนี้</div>';

    // ดัชนีสุขภาพ
    var healthHtml = d.health.index !== null
      ? '<div class="q-head"><b>ดัชนีสุขภาพโครงการ</b><span class="q-score">' + d.health.index + '/100</span></div>' +
        d.health.parts.map(function (pt) {
          return '<div class="compare-row"><span class="cmp-label">' + esc(pt.label) + '</span>' +
            '<div class="bar-track" style="flex:1"><div class="bar-fill disb" style="width:' + pt.score + '%"></div></div>' +
            '<span class="num">' + pt.score + '</span></div>';
        }).join('')
      : '';

    // enrichment โคกหนองนา
    var enr = '';
    if (d.enrichment) {
      enr = '<div class="card"><h3>🌾 โคก หนอง นา (ข้อมูลมอนิเตอร์เชิงลึก) <span class="tag">Enrichment — ยอดเงินรวมในงบยุทธศาสตร์แล้ว</span></h3>' +
        '<div class="table-wrap"><table class="data"><tbody>' +
        '<tr><td>จำนวนแปลงที่ดำเนินการ</td><td class="num"><b>' + d.enrichment.plots + ' แปลง</b></td></tr>' +
        '<tr><td>ค่าตอบแทนผู้ควบคุมงาน</td><td class="num">' + fmtB(d.enrichment.supervisorFee) + ' บาท</td></tr>' +
        '<tr><td>เบิกจ่ายของโครงการ (อ้างอิง — นับรวมในงบยุทธศาสตร์แล้ว)</td><td class="num">' + fmtB(d.enrichment.refDisbursed) + ' / ' + fmtB(d.enrichment.refAmount) + ' บาท</td></tr>' +
        '<tr><td>ส่งคืนกรมฯ</td><td class="num">' + fmtB(d.enrichment.refReturned) + ' บาท</td></tr>' +
        '</tbody></table></div></div>';
    }

    // หมายเหตุจากอำเภอ (ไม่บังคับ — บทบาทพัฒนาการอำเภอ)
    var notes = loadNotes();
    var noteHtml = '<div class="card"><h3>📝 หมายเหตุจากอำเภอ <span class="tag">ไม่บังคับ — อธิบายเหตุผล/บริบทเพิ่มเติมได้</span></h3>' +
      '<textarea id="noteBox" rows="3" style="width:100%;font-family:inherit;font-size:.95rem;border:1px solid var(--hairline);border-radius:10px;padding:10px;background:var(--surface);color:var(--ink)" ' +
      'placeholder="เช่น รอผลจัดซื้อจัดจ้าง / ผู้รับจ้างส่งมอบงานล่าช้า ...">' + esc(notes[name] || '') + '</textarea>' +
      '<div style="margin-top:8px"><button class="btn small primary" id="btnSaveNote">บันทึกหมายเหตุ</button></div></div>';

    var mcDistLine = distPaceLine ? '<div class="mini-chart-card"><div class="mc-title">📈 แนวโน้มเบิกจ่ายสะสม</div>' + distPaceLine +
      '<div class="hint">เทียบเป้าวันนี้ ' + m.fiscal.expectedPacePct.toFixed(1) + '%</div></div>' : '';

    page.appendChild(h(
      '<button class="back-link" onclick="location.hash=\'#districts\'">← กลับหน้ารายอำเภอ</button>' +
      '<div class="page-head-row">' +
      '<div class="card" style="flex:2;min-width:260px;margin-bottom:0"><h2>อำเภอ' + esc(name) + ' ' + chip(d.needsCheck ? 'check' : d.status) +
      (d.needsCheck ? ' <span class="hint">(มีตัวเลขผิดปกติ — สถานะจังหวะเวลาจะแสดงเมื่อข้อมูลถูกแก้ที่ต้นทาง)</span>' : '') + '</h2>' +
      '<div class="stat-grid" style="margin-top:10px">' +
      tile('จัดสรรรวม', fmtB(d.agg ? d.agg.allocated : null) + ' บาท', '') +
      tile('เบิกจ่ายสะสม', fmtB(d.agg ? d.agg.disbursed : null) + ' บาท', d.agg && d.agg.pct !== null ? 'ร้อยละ ' + d.agg.pct.toFixed(1) : '') +
      tile('คงเหลือ', fmtB(d.agg ? d.agg.remaining : null) + ' บาท', '') +
      tile('ดัชนีสุขภาพ', (d.health.index !== null ? d.health.index + '/100' : '—'), '') +
      '</div>' + (cmp ? '<h3 style="margin-top:8px">เทียบกับภาพรวมจังหวัด (%เบิกจ่ายสะสม)</h3>' + cmp : '') + '</div>' +
      mcDistLine +
      '</div>' +
      '<div class="two-col">' +
      '<div class="card"><h3>งบแต่ละประเภท</h3><div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>ประเภทงบ</th><th class="num">จัดสรร</th><th class="num">เบิกจ่าย</th><th class="num">%</th><th>สถานะ</th></tr></thead>' +
      '<tbody>' + catRows + '</tbody></table></div>' +
      '<p class="hint">งบจังหวัด/กลุ่มจังหวัด เป็นงบระดับจังหวัด — ดูได้ที่หน้าภาพรวม/รายโครงการ ไม่แสดงรายอำเภอ</p></div>' +
      '<div class="card"><h3>เบิกจ่ายรายช่วงเวลา (บาท)</h3><div class="mini-cols">' + cols + '</div>' +
      '<p class="hint">ช่วงเวลาตามชีตต้นทาง (ไตร 1-2 / ไตร 3-4 / ไตร 4 เป็นวงเงินคนละก้อน)</p></div>' +
      '</div>' +
      '<div class="two-col">' +
      '<div class="card">' + qHtml + '</div>' +
      (healthHtml ? '<div class="card">' + healthHtml + '</div>' : '') +
      '</div>' +
      enr + noteHtml
    ));

    var btn = page.querySelector('#btnSaveNote');
    btn.onclick = function () {
      saveNote(name, page.querySelector('#noteBox').value.trim());
      btn.textContent = '✓ บันทึกแล้ว';
      setTimeout(function () { btn.textContent = 'บันทึกหมายเหตุ'; }, 1500);
    };
  }

  function cmpRow(label, pct, color) {
    return '<div class="compare-row"><span class="cmp-label">' + esc(label) + '</span>' +
      '<div class="bar-track" style="flex:1"><div class="bar-fill" style="width:' + Math.min(100, pct) + '%;background:' + color + '"></div></div>' +
      '<span class="num" style="min-width:52px;text-align:right">' + pct.toFixed(1) + '%</span></div>';
  }

  /* ======================================================================
   * 7.3 รายโครงการ
   * ==================================================================== */
  var projFilter = { q: '', quarter: 'all', district: 'all', workGroup: 'all' };

  function levelTag(level) {
    var map = { province: 'ระดับจังหวัด', district: 'ระดับอำเภอ', mixed: 'ผสมจังหวัด+อำเภอ' };
    return '<span class="tag">' + esc(map[level] || level) + '</span>';
  }
  function workGroupTag(p) {
    return '<span class="tag">' + esc(p.workGroup) + (p.workGroupInferred ? ' (อนุมาน)' : '') + '</span>';
  }

  function renderProjects(page) {
    var m = state.model;

    var catRows = E.CATEGORIES.map(function (c) {
      var a = m.agg.byCat[c];
      var broken = m.refBrokenCategories.indexOf(c) >= 0;
      var provTag = E.PROVINCE_ONLY_CATEGORIES.indexOf(c) >= 0 ? ' <span class="tag">ระดับจังหวัด</span>' : '';
      return '<tr><td><b>' + esc(c) + '</b>' + provTag + '</td>' +
        (a ? '<td class="num">' + fmtB(a.allocated) + '</td><td class="num">' + fmtB(a.disbursed) + '</td>' +
          '<td class="num">' + (a.pct !== null ? a.pct.toFixed(1) + '%' : '—') + '</td>' +
          '<td>' + (a.pct !== null && a.pct > 100 ? chip('check', 'เกิน 100% — ข้อมูลควรตรวจสอบ')
            : chip(E.paceStatus(a.pct, m.fiscal.expectedPacePct, m.config.paceThreshold))) + '</td>'
          : '<td colspan="4">' + (broken ? chip('check', 'ข้อมูลเสียหาย (#REF!)') : '<span class="hint">ไม่มีข้อมูล</span>') + '</td>') +
        '</tr>';
    }).join('');

    // ---- ตารางทุกโครงการ (แกะจากบล็อกรายโครงการในชีตยุทธศาสตร์ 3 ชีต) ----
    var all = m.projects.list;
    var filtered = all.filter(function (p) {
      if (projFilter.quarter !== 'all' && p.quarterList.indexOf(projFilter.quarter) < 0) return false;
      if (projFilter.district !== 'all' && !p.byDistrict[projFilter.district]) return false;
      if (projFilter.workGroup !== 'all' && p.workGroup !== projFilter.workGroup) return false;
      if (projFilter.q) {
        var q = projFilter.q.toLowerCase();
        if ((p.name || '').toLowerCase().indexOf(q) < 0 && String(p.no || '').indexOf(q) < 0) return false;
      }
      return true;
    });

    var sumA = 0, sumB = 0;
    var rows = filtered.map(function (p, idx) {
      // เมื่อกรองตามอำเภอ แสดงตัวเลขเฉพาะอำเภอนั้น
      var a = p.allocated, b = p.disbursed;
      if (projFilter.district !== 'all') {
        a = p.byDistrict[projFilter.district].allocated;
        b = p.byDistrict[projFilter.district].disbursed;
      }
      sumA += a; sumB += b;
      var pct = a > 0 ? b / a * 100 : null;
      var st = p.flags.length ? chip('check')
        : chip(E.paceStatus(pct, m.fiscal.expectedPacePct, m.config.paceThreshold));
      var shortName = p.name.replace(/^เลขที่\s*[0-9\/]+\s*/, '');
      return '<tr class="proj-row" data-i="' + idx + '" style="cursor:pointer">' +
        '<td>' + (p.no ? '<b>' + esc(p.no) + '</b>' : '<span class="hint">—</span>') + '</td>' +
        '<td style="white-space:normal;min-width:260px">' + esc(shortName) +
        ' <span class="tag">' + p.quarterList.join('+') + ' · ' + p.districtCount + ' หน่วย</span> ' +
        levelTag(p.level) + ' ' + workGroupTag(p) + '</td>' +
        '<td class="num">' + fmtB(a) + '</td><td class="num">' + fmtB(b) + '</td>' +
        '<td class="num">' + (pct !== null ? pct.toFixed(1) + '%' : '—') + '</td>' +
        '<td>' + st + '</td></tr>' +
        '<tr class="proj-detail" data-i="' + idx + '" style="display:none"><td colspan="6" id="projDetail' + idx + '"></td></tr>';
    }).join('');

    var districtOpts = ['<option value="all">ทุกอำเภอ/หน่วย</option>']
      .concat([E.PROVINCE_UNIT].concat(E.MASTER_DISTRICTS).map(function (d) {
        return '<option value="' + esc(d) + '"' + (projFilter.district === d ? ' selected' : '') + '>' + esc(d) + '</option>';
      })).join('');
    var workGroupOpts = ['<option value="all">ทุกกลุ่มงาน</option>']
      .concat(E.WORK_GROUPS.map(function (g) {
        return '<option value="' + esc(g) + '"' + (projFilter.workGroup === g ? ' selected' : '') + '>' + esc(g) + '</option>';
      })).join('');

    var bpm = (window.APP_CONFIG && window.APP_CONFIG.bpm) || { url: '#', mockStatusLabel: 'ตัวอย่าง — ยังไม่ได้เชื่อมต่อจริง' };
    var bpmCard = '<div class="card"><h2>🔗 ระบบ BPM กรมการพัฒนาชุมชน (งบยุทธศาสตร์กรม)</h2>' +
      '<p>' + chip('check', bpm.mockStatusLabel) + '</p>' +
      '<p class="hint">ระบบ BPM ของกรมฯ มีอยู่จริงที่ <a href="' + esc(bpm.url) + '" target="_blank" rel="noopener">' + esc(bpm.url) + '</a> ' +
      'แต่หน้านี้ยังเป็นเพียงจุดเชื่อมโยงเบื้องต้น (mock) — ต้องมีสิทธิ์เข้าใช้งานจริงของกรมฯ จึงจะเชื่อมต่อสถานะโครงการแบบสดได้ ' +
      '(ตรวจสอบเมื่อ ' + esc(thDate(state.loadedAt)) + ')</p></div>';

    page.appendChild(h(
      '<div class="card"><h2>ภาพรวมรายประเภทงบ (สะสมทั้งปี)</h2>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>ประเภทงบ</th><th class="num">จัดสรร (บาท)</th><th class="num">เบิกจ่าย (บาท)</th><th class="num">%</th><th>สถานะ</th></tr></thead>' +
      '<tbody>' + catRows + '</tbody></table></div>' +
      '<p class="hint">โคก หนอง นา และ จปฐ. เป็นโครงการย่อยในงบยุทธศาสตร์ (ดูในตารางด้านล่าง: เลขที่ 71/24 และ 45/60/2) — ยอดนับรวมแล้ว ไม่แยกเป็นหมวดที่ 4</p></div>' +

      bpmCard +

      '<div class="card"><h2>📋 โครงการทั้งหมด (งบยุทธศาสตร์ ' + all.length + ' โครงการ/กิจกรรม)</h2>' +
      '<div class="opt-row" style="margin-bottom:10px">' +
      '<input type="text" id="projSearch" placeholder="🔍 ค้นหาชื่อ/เลขที่โครงการ..." value="' + esc(projFilter.q) + '" ' +
      'style="flex:1;min-width:200px;padding:9px 12px;border:1px solid var(--hairline);border-radius:10px;background:var(--surface);color:var(--ink);font-family:inherit;font-size:.95rem">' +
      '<select id="projQuarter"><option value="all">ทุกไตรมาส</option>' +
      '<option value="ไตร1-2"' + (projFilter.quarter === 'ไตร1-2' ? ' selected' : '') + '>ไตรมาส 1-2</option>' +
      '<option value="ไตร3-4"' + (projFilter.quarter === 'ไตร3-4' ? ' selected' : '') + '>ไตรมาส 3-4</option></select>' +
      '<select id="projDistrict">' + districtOpts + '</select>' +
      '<select id="projWorkGroup">' + workGroupOpts + '</select>' +
      '<button class="btn small" id="btnExportProjects">📤 ส่งออกรายโครงการ</button></div>' +
      '<p class="hint">แสดง ' + filtered.length + ' รายการ · รวมจัดสรร ' + fmtB(sumA) + ' บาท · เบิกจ่าย ' + fmtB(sumB) + ' บาท · กดที่แถวเพื่อดูการกระจายรายอำเภอ' +
      (projFilter.district !== 'all' ? ' · <b>ตัวเลขเป็นของ ' + esc(projFilter.district) + ' เท่านั้น</b>' : '') + '</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>เลขที่</th><th>ชื่อโครงการ/กิจกรรม</th><th class="num">จัดสรร (บาท)</th><th class="num">เบิกจ่าย (บาท)</th><th class="num">%</th><th>สถานะ</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="empty-note">ไม่พบโครงการตามเงื่อนไข</td></tr>') + '</tbody></table></div>' +
      '<p class="hint">ที่มา: บล็อกรายโครงการในชีต "ยุทธเข้าประชุม ไตร 1-2 / 3-4" และ "งบยุทธจังหวัดจัดสรรกรมฯ" — โครงการที่ปรากฏซ้ำหลายชีตถูกนับครั้งเดียวตามเลขที่โครงการ (ดูรายการซ้ำที่เมนูแจ้งเตือน)</p></div>'
    ));

    var bindFilter = function (id, key) {
      page.querySelector(id).onchange = function (e2) {
        projFilter[key] = e2.target.value; route();
      };
    };
    bindFilter('#projQuarter', 'quarter');
    bindFilter('#projDistrict', 'district');
    bindFilter('#projWorkGroup', 'workGroup');
    page.querySelector('#btnExportProjects').onclick = function () {
      window.ProjectExportWizard.open(state);
    };
    var si = page.querySelector('#projSearch');
    var t = null;
    si.oninput = function () {
      clearTimeout(t);
      t = setTimeout(function () { projFilter.q = si.value.trim(); route(); }, 350);
    };

    page.querySelectorAll('tr.proj-row').forEach(function (tr) {
      tr.onclick = function () {
        var i = tr.dataset.i;
        var det = page.querySelector('tr.proj-detail[data-i="' + i + '"]');
        var open = det.style.display !== 'none';
        det.style.display = open ? 'none' : '';
        if (!open) {
          var p = filtered[+i];
          var dRows = Object.keys(p.byDistrict).map(function (d) {
            var v = p.byDistrict[d];
            var pctD = v.allocated > 0 ? (v.disbursed / v.allocated * 100).toFixed(1) + '%' : '—';
            return '<tr><td>' + esc(d) + '</td><td class="num">' + fmtB(v.allocated) + '</td>' +
              '<td class="num">' + fmtB(v.disbursed) + '</td><td class="num">' + pctD + '</td></tr>';
          }).join('');

          var kpiHtml = '<div class="two-col" style="margin-top:10px">' +
            '<div class="card"><h3>🎯 ตัวชี้วัด <span class="tag">' + esc(E.KPI_LABEL) + '</span></h3>' +
            '<p>' + esc(p.kpi.dept) + '</p><p>' + esc(p.kpi.province) + '</p></div>' +
            '<div class="card"><h3>📎 เอกสารโครงการที่ผู้บริหารอนุมัติ (PDF)</h3>' +
            (p.attachment
              ? '<p><a href="' + esc(p.attachment) + '" target="_blank" rel="noopener">📄 ดูเอกสาร</a></p>'
              : '<p><button class="btn small" disabled>📄 ดูเอกสาร</button> <span class="hint">ตัวอย่าง — ยังไม่ได้แนบไฟล์จริง</span></p>') +
            '</div></div>';

          var m2 = state.model;
          var matched = E.matchQuery(p.name, m2.regulations.list, []);
          var regHtml = '<div class="card" style="margin-top:10px"><h3>📚 ระเบียบที่เกี่ยวข้อง (จับคู่คำสำคัญอัตโนมัติ — ต้นแบบ)</h3>' +
            (matched.regMatches.length
              ? '<ul class="q-reasons">' + matched.regMatches.map(function (rm) {
                  return '<li>' + esc(rm.reg.title) +
                    (rm.reg.sourceType === 'illustrative' ? ' <span class="tag">ตัวอย่างประกอบ (จำลอง)</span>' : ' <span class="tag">อ้างอิงจริง</span>') +
                    (rm.reg.sourceUrl ? ' — <a href="' + esc(rm.reg.sourceUrl) + '" target="_blank" rel="noopener">ลิงก์</a>' : '') + '</li>';
                }).join('') + '</ul>'
              : '<div class="empty-note">ไม่พบระเบียบที่จับคู่คำสำคัญได้กับโครงการนี้</div>') + '</div>';

          document.getElementById('projDetail' + i).innerHTML =
            '<div style="padding:6px 0"><b>' + esc(p.name) + '</b> ' + levelTag(p.level) + ' ' + workGroupTag(p) +
            '<div class="hint">ชีตที่มา: ' + Object.keys(p.sheets).map(esc).join(', ') + '</div>' +
            '<div class="table-wrap" style="margin-top:6px"><table class="data"><thead><tr>' +
            '<th>อำเภอ/หน่วย</th><th class="num">จัดสรร</th><th class="num">เบิกจ่าย</th><th class="num">%</th></tr></thead>' +
            '<tbody>' + dRows + '</tbody></table></div>' +
            kpiHtml + regHtml + '</div>';
        }
      };
    });
  }

  /* ======================================================================
   * กลุ่มงาน — โครงการไหนอยู่ภายใต้กลุ่มงานใด
   * ==================================================================== */
  function renderWorkGroups(page) {
    var m = state.model;
    var groups = {};
    E.WORK_GROUPS.forEach(function (g) { groups[g] = []; });
    m.projects.list.forEach(function (p) {
      if (!groups[p.workGroup]) groups[p.workGroup] = [];
      groups[p.workGroup].push(p);
    });

    var cardsHtml = E.WORK_GROUPS.map(function (g) {
      var list = groups[g] || [];
      var sumA = 0, sumB = 0;
      list.forEach(function (p) { sumA += p.allocated; sumB += p.disbursed; });
      var inferredCount = list.filter(function (p) { return p.workGroupInferred; }).length;
      var rows = list.map(function (p) {
        var shortName = p.name.replace(/^เลขที่\s*[0-9\/]+\s*/, '');
        var pct = p.allocated > 0 ? (p.disbursed / p.allocated * 100).toFixed(1) + '%' : '—';
        return '<tr class="wg-proj-row" data-no="' + esc(p.no || '') + '" style="cursor:pointer">' +
          '<td>' + (p.no ? esc(p.no) : '<span class="hint">—</span>') + '</td>' +
          '<td style="white-space:normal;min-width:220px">' + esc(shortName) + (p.workGroupInferred ? ' <span class="tag">(อนุมาน)</span>' : '') + '</td>' +
          '<td class="num">' + fmtB(p.allocated) + '</td><td class="num">' + fmtB(p.disbursed) + '</td>' +
          '<td class="num">' + pct + '</td></tr>';
      }).join('');

      return '<div class="card"><h2>' + esc(g) + '</h2>' +
        '<div class="stat-grid">' +
        tile('จำนวนโครงการ/กิจกรรม', String(list.length), inferredCount ? inferredCount + ' รายการอนุมานกลุ่มงาน (ไม่มี keyword ตรง)' : 'ทุกรายการจับคู่ keyword ได้ตรง') +
        tile('จัดสรรรวม', fmtB(sumA) + ' บาท', '') +
        tile('เบิกจ่ายสะสม', fmtB(sumB) + ' บาท', sumA > 0 ? 'ร้อยละ ' + (sumB / sumA * 100).toFixed(1) : '') +
        '</div>' +
        '<div class="table-wrap" style="margin-top:10px"><table class="data"><thead><tr>' +
        '<th>เลขที่</th><th>ชื่อโครงการ/กิจกรรม</th><th class="num">จัดสรร</th><th class="num">เบิกจ่าย</th><th class="num">%</th>' +
        '</tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="empty-note">ยังไม่มีโครงการในกลุ่มงานนี้</td></tr>') + '</tbody></table></div></div>';
    }).join('');

    // สรุปย่อ % เบิกจ่ายเทียบ 4 กลุ่มงาน (รายละเอียดจัดสรร/เบิกจ่ายเต็มอยู่ในการ์ดแต่ละกลุ่มด้านล่างแล้ว)
    var wgTotals = E.WORK_GROUPS.map(function (g) {
      var list = groups[g] || [];
      var a = 0, b = 0;
      list.forEach(function (p) { a += p.allocated; b += p.disbursed; });
      return { group: g, allocated: a, disbursed: b, pct: a > 0 ? b / a * 100 : null };
    });
    var wgRankedHtml = Charts.rankedBars(wgTotals.map(function (t) {
      return { label: t.group, value: t.pct || 0, sublabel: t.pct !== null ? t.pct.toFixed(1) + '%' : '—', colorVar: 'var(--series-disbursed)' };
    }), { max: 100 });
    var mcWg = '<div class="mini-chart-card"><div class="mc-title">📊 % เบิกจ่ายตามกลุ่มงาน</div>' +
      wgRankedHtml.replace('class="ranked-bars"', 'class="ranked-bars compact"') + '</div>';

    page.appendChild(h(
      '<div class="page-head-row">' +
      '<div class="headline-sentence" style="flex:2;min-width:260px">แบ่งตาม 4 กลุ่มงานของสำนักงาน — กลุ่มงานที่ไม่มี keyword ตรงกับชื่อโครงการจะถูก "อนุมาน" เป็นยุทธศาสตร์การพัฒนาชุมชนโดยปริยาย (แสดงป้าย "(อนุมาน)" กำกับเสมอ) กดที่แถวเพื่อไปหน้ารายโครงการพร้อมตัวกรอง</div>' +
      mcWg +
      '</div>' +
      cardsHtml
    ));

    page.querySelectorAll('tr.wg-proj-row').forEach(function (tr) {
      tr.onclick = function () {
        projFilter.q = tr.dataset.no || '';
        location.hash = '#projects';
      };
    });
  }

  /* ======================================================================
   * 7.4 มิติคุณภาพ
   * ==================================================================== */
  function renderQuality(page) {
    var m = state.model;

    // กราฟแท่งจัดอันดับคะแนนคุณภาพ 0-5 — สรุปย่อ 5 อันดับสูงสุด (การ์ดเต็มทั้ง 18 อำเภอดูด้านล่าง)
    var qRanked = m.districts.filter(function (d) { return d.quality; })
      .slice().sort(function (a, b) { return b.quality.score - a.quality.score; });
    var qRankedBarsHtml = Charts.rankedBars(qRanked.slice(0, 5).map(function (d) {
      var q = d.quality;
      var colorVar = q.score >= 4 ? 'var(--st-green)' : q.score >= 2 ? 'var(--st-yellow)' : 'var(--st-red)';
      return { label: d.district, value: q.score, sublabel: q.score.toFixed(0) + '/5', colorVar: colorVar };
    }), { max: 5 });

    var cards = m.districts.map(function (d) {
      var q = d.quality;
      if (!q) return '<div class="q-card"><div class="q-head"><b>' + esc(d.district) + '</b><span class="hint">รอข้อมูลประเมิน</span></div></div>';
      var dots = '';
      for (var i = 1; i <= 5; i++) dots += i <= q.score ? '●' : '○';
      var scoreColor = q.score >= 4 ? 'var(--st-green)' : q.score >= 2 ? 'var(--st-yellow)' : 'var(--st-red)';
      return '<div class="q-card"><div class="q-head"><b>' + esc(d.district) + '</b>' +
        '<span><span class="q-dots" style="color:' + scoreColor + '">' + dots + '</span> <b class="q-score" style="color:' + scoreColor + '">' + q.score.toFixed(0) + '/5</b></span></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
        '<span class="chip ' + (q.documentsComplete ? 'green' : 'yellow') + '"><span class="ic">' + (q.documentsComplete ? '✓' : '✗') + '</span>เอกสาร' + (q.documentsComplete ? 'ครบถ้วน' : 'ไม่ครบ') + '</span>' +
        '<span class="chip ' + (q.overdueLoanContracts === 0 ? 'green' : q.overdueLoanContracts > 4 ? 'red' : 'yellow') + '"><span class="ic">⏱</span>เงินยืมค้าง ' + q.overdueLoanContracts + ' สัญญา</span>' +
        '<span class="chip ' + (q.cumulativePct >= 90 ? 'green' : q.cumulativePct >= 80 ? 'yellow' : 'red') + '"><span class="ic">%</span>เบิกสะสม ' + q.cumulativePct.toFixed(1) + '%</span>' +
        (q.scoreMismatch ? '<span class="chip check"><span class="ic">?</span>คะแนนไม่ตรงเกณฑ์ (ควรได้ ' + q.expectedScore + ')</span>' : '') +
        '</div>' +
        '<ul class="q-reasons">' + q.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>';
    }).join('');

    var mcQRanked = '<div class="mini-chart-card"><div class="mc-title">📊 5 อันดับคะแนนสูงสุด</div>' +
      qRankedBarsHtml.replace('class="ranked-bars"', 'class="ranked-bars compact"') + '</div>';

    page.appendChild(h(
      '<div class="page-head-row">' +
      '<div class="headline-sentence" style="flex:2;min-width:260px">คะแนน 0–5 ตามเกณฑ์ราชการเดิม (แบบประเมินที่ 1): ฐานคะแนนจาก %เบิกจ่ายสะสม (≥80%=1 … ≥100%+เอกสารครบ=5) ' +
      'หักเมื่อส่งใช้เงินยืมเกิน 30 วัน (ค้าง 1-4 สัญญา หัก 1 ระดับ, เกิน 4 สัญญา หัก 2 ระดับ) — ระบบแสดง "เหตุผล" ประกอบทุกอำเภอ ไม่ตัดสินด้วยตัวเลขเดียว</div>' +
      mcQRanked +
      '</div>' +
      '<div class="q-grid">' + cards + '</div>'
    ));
  }

  /* ======================================================================
   * 7.5 แจ้งเตือนล่วงหน้า
   * ==================================================================== */
  function renderWarning(page) {
    var m = state.model;

    var risk = m.warnings.length
      ? m.warnings.map(warnItemHtml).join('')
      : '<div class="empty-note">ไม่มีความเสี่ยงที่ต้องติดตามในขณะนี้</div>';

    // จัดกลุ่ม REF error ตามหมวด+ไตรมาส เพื่อไม่ให้ list ยาว 38 รายการ
    var refGroups = {};
    var anomalies = [];
    m.issues.forEach(function (i) {
      if (i.type === 'REF_ERROR') {
        var k = i.category + ' (' + i.quarter + ')';
        refGroups[k] = (refGroups[k] || 0) + 1;
      } else anomalies.push(i);
    });
    var dataIssues = Object.keys(refGroups).map(function (k) {
      return '<div class="warn-item check"><div class="w-head"><span>💥 ' + esc(k) + ' — สูตร #REF! เสียหาย ' + refGroups[k] + ' แถว</span>' + chip('check') + '</div>' +
        '<div class="w-sugg">ตารางสรุปในชีตนี้อ้างอิงชีตที่ถูกลบ/เปลี่ยนชื่อ ต้องแก้สูตรที่ไฟล์ต้นทาง — ระหว่างนี้ระบบไม่นำตัวเลขหมวดนี้มารวมยอด เพื่อไม่ให้ยอดจังหวัดผิด</div></div>';
    }).join('') + anomalies.map(function (i) {
      return '<div class="warn-item check"><div class="w-head"><span>❓ ' + esc(i.district) + ' · ' + esc(i.category) + ' (' + esc(i.quarter) + ')</span>' + chip('check') + '</div>' +
        '<div class="w-sugg">' + esc(i.message) + '</div></div>';
    }).join('');

    page.appendChild(h(
      '<div class="card"><h2>🔔 ความเสี่ยงโครงการ/อำเภอ</h2>' +
      '<p class="hint">มุมมอง "เตือนล่วงหน้าเพื่อสนับสนุน" — ไม่ใช่การจัดอันดับหรือจับผิด</p>' + risk + '</div>' +
      '<div class="card"><h2>🛠️ ข้อมูลต้องตรวจสอบ (ระบบตรวจพบอัตโนมัติ)</h2>' +
      '<p class="hint">แยกจากความเสี่ยงโครงการ เพื่อไม่ให้สับสน — รายการนี้คือ "ข้อมูลผิดปกติ" ที่ควรแก้ที่ไฟล์ต้นทาง</p>' +
      (dataIssues || '<div class="empty-note">ไม่พบข้อมูลผิดปกติ</div>') + '</div>'
    ));
  }

  /* ======================================================================
   * ระเบียบ / แนวทาง / คู่มือ / หนังสือเวียน
   * ==================================================================== */
  var regFilter = { q: '' };
  function renderRegulations(page) {
    var m = state.model;
    var list = m.regulations.list.filter(function (r) {
      if (!regFilter.q) return true;
      var q = regFilter.q.toLowerCase();
      return (r.title || '').toLowerCase().indexOf(q) >= 0 || (r.issuer || '').toLowerCase().indexOf(q) >= 0;
    });

    var rows = list.map(function (r, idx) {
      return '<tr class="reg-row" data-i="' + idx + '" style="cursor:pointer">' +
        '<td style="white-space:normal;min-width:280px">' + esc(r.title) + '</td>' +
        '<td>' + esc(r.issuer) + '</td>' +
        '<td>' + (r.sourceType === 'real'
          ? '<span class="chip green"><span class="ic">✓</span>อ้างอิงจริง</span>'
          : '<span class="chip gray"><span class="ic">?</span>ตัวอย่างประกอบ (จำลอง)</span>') + '</td></tr>' +
        '<tr class="reg-detail" data-i="' + idx + '" style="display:none"><td colspan="3">' +
        '<div style="padding:6px 0">' + esc(r.summary) +
        (r.sourceUrl ? '<div style="margin-top:6px"><a href="' + esc(r.sourceUrl) + '" target="_blank" rel="noopener">🔗 ' + esc(r.sourceUrl) + '</a></div>' : '') +
        '<div class="hint" style="margin-top:6px">กลุ่มงานที่เกี่ยวข้อง: ' + (r.workGroups || []).map(esc).join(', ') + '</div>' +
        '</div></td></tr>';
    }).join('');

    page.appendChild(h(
      '<div class="card"><h2>📚 ระเบียบ/แนวทาง/คู่มือ/หนังสือเวียน</h2>' +
      '<p class="hint">รายการที่ระบุ "อ้างอิงจริง" คือระเบียบ/แหล่งอ้างอิงจริงที่สืบค้นยืนยันได้ ส่วน "ตัวอย่างประกอบ (จำลอง)" เป็นการสาธิตการทำงานของเมนูนี้เท่านั้น ไม่ใช่เอกสารทางการของกรมฯ</p>' +
      '<input type="text" id="regSearch" placeholder="🔍 ค้นหาชื่อระเบียบ/หน่วยงาน..." value="' + esc(regFilter.q) + '" ' +
      'style="width:100%;padding:9px 12px;margin-bottom:10px;border:1px solid var(--hairline);border-radius:10px;background:var(--surface);color:var(--ink);font-family:inherit;font-size:.95rem">' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>ชื่อเรื่อง</th><th>หน่วยงาน</th><th>ประเภท</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="3" class="empty-note">ไม่พบรายการตามเงื่อนไข</td></tr>') + '</tbody></table></div></div>'
    ));

    var si = page.querySelector('#regSearch');
    var t = null;
    si.oninput = function () {
      clearTimeout(t);
      t = setTimeout(function () { regFilter.q = si.value.trim(); route(); }, 350);
    };
    page.querySelectorAll('tr.reg-row').forEach(function (tr) {
      tr.onclick = function () {
        var det = page.querySelector('tr.reg-detail[data-i="' + tr.dataset.i + '"]');
        det.style.display = det.style.display !== 'none' ? 'none' : '';
      };
    });
  }

  /* ======================================================================
   * ถาม AI — ต้นแบบ: จับคู่คำสำคัญอัตโนมัติ ยังไม่เชื่อมต่อ AI จริง
   * ==================================================================== */
  var askAiState = { query: '', result: null };
  var ASK_AI_EXAMPLES = ['จัดซื้อจัดจ้างเครื่องมืออุปกรณ์ ต้องทำตามระเบียบอะไร', 'จะยืมเงินราชการไปใช้ในโครงการ ต้องดูแนวทางไหน', 'โคกหนองนา มีคู่มือดำเนินการอะไรบ้าง'];

  function renderAskAI(page) {
    var m = state.model;
    var resultHtml = '';
    if (askAiState.result) {
      var res = askAiState.result;
      var regHtml = res.regMatches.length
        ? '<ul class="q-reasons">' + res.regMatches.map(function (rm) {
            return '<li>' + esc(rm.reg.title) + ' ' + chip('gray', 'พบคำสำคัญตรงกัน ' + rm.score + ' คำ') +
              (rm.reg.sourceType === 'illustrative' ? ' <span class="tag">ตัวอย่างประกอบ (จำลอง)</span>' : ' <span class="tag">อ้างอิงจริง</span>') + '</li>';
          }).join('') + '</ul>'
        : '';
      var projHtml = res.projMatches.length
        ? '<ul class="q-reasons">' + res.projMatches.map(function (pm) {
            return '<li>' + esc(pm.project.name) + ' ' + chip('gray', 'พบคำสำคัญตรงกัน ' + pm.score + ' คำ') + '</li>';
          }).join('') + '</ul>'
        : '';
      resultHtml = '<div class="card"><h3>ผลลัพธ์</h3>' +
        (res.hasMatch
          ? (regHtml ? '<b>ระเบียบ/แนวทางที่เกี่ยวข้อง</b>' + regHtml : '') + (projHtml ? '<b>โครงการที่เกี่ยวข้อง</b>' + projHtml : '')
          : '<div class="empty-note">ไม่พบระเบียบหรือโครงการที่จับคู่คำสำคัญได้ ลองใช้คำอื่นหรือคำที่ตรงกับชื่อโครงการ/ระเบียบมากขึ้น</div>') +
        '</div>';
    }

    var pills = ASK_AI_EXAMPLES.map(function (ex) {
      return '<button class="opt-pill" data-q="' + esc(ex) + '">' + esc(ex) + '</button>';
    }).join('');

    page.appendChild(h(
      '<div class="card"><h2>🤖 ถาม AI</h2>' +
      '<p>' + chip('check', 'ต้นแบบ: จับคู่คำสำคัญอัตโนมัติ — ยังไม่เชื่อมต่อ AI จริง') + '</p>' +
      '<p class="hint">พิมพ์คำถามเป็นภาษาพูดง่ายๆ เช่น "จะซื้อของแบบนี้ตรงกับระเบียบไหน" ระบบจะค้นหาคำสำคัญที่ตรงกับระเบียบ/โครงการในฐานข้อมูล (ไม่ใช่ความเข้าใจภาษาธรรมชาติจริง)</p>' +
      '<div class="opt-row" style="margin-bottom:8px">' + pills + '</div>' +
      '<div class="opt-row">' +
      '<input type="text" id="aiQuery" placeholder="พิมพ์คำถามที่นี่..." value="' + esc(askAiState.query) + '" ' +
      'style="flex:1;min-width:220px;padding:9px 12px;border:1px solid var(--hairline);border-radius:10px;background:var(--surface);color:var(--ink);font-family:inherit;font-size:.95rem">' +
      '<button class="btn primary" id="btnAskAi">ถาม</button></div></div>' +
      resultHtml
    ));

    page.querySelectorAll('.opt-pill').forEach(function (btn) {
      btn.onclick = function () {
        askAiState.query = btn.dataset.q;
        askAiState.result = E.matchQuery(askAiState.query, m.regulations.list, m.projects.list);
        route();
      };
    });
    page.querySelector('#btnAskAi').onclick = function () {
      askAiState.query = page.querySelector('#aiQuery').value.trim();
      askAiState.result = askAiState.query ? E.matchQuery(askAiState.query, m.regulations.list, m.projects.list) : null;
      route();
    };
  }

  /* ======================================================================
   * ตั้งค่า (threshold / น้ำหนักดัชนี — หัวข้อ 8)
   * ==================================================================== */
  function renderSettings(page) {
    var c = state.config;
    page.appendChild(h(
      '<div class="card"><h2>⚙️ ตั้งค่าเกณฑ์ (ผู้บริหารปรับได้ ไม่ hardcode)</h2>' +
      '<div class="opt-group"><div class="g-label">ช่วงผ่อนผันสถานะเหลือง (จุดร้อยละต่ำกว่าจังหวะที่ควรเป็น)</div>' +
      '<input type="number" id="cfgThreshold" min="1" max="50" value="' + c.paceThreshold + '"> ' +
      '<span class="hint">ค่าเริ่มต้น 10 — ต่ำกว่าจังหวะเกินค่านี้ = สถานะแดง</span></div>' +
      '<div class="opt-group"><div class="g-label">น้ำหนักดัชนีสุขภาพโครงการ (รวมควรได้ 100)</div>' +
      '<div class="opt-row">' +
      '<label>จังหวะเบิกจ่าย <input type="number" id="cfgWPace" min="0" max="100" value="' + c.weights.pace + '" style="width:80px"></label>' +
      '<label>ระเบียบ/เอกสาร <input type="number" id="cfgWComp" min="0" max="100" value="' + c.weights.compliance + '" style="width:80px"></label>' +
      '<label>ความสมบูรณ์ข้อมูล <input type="number" id="cfgWData" min="0" max="100" value="' + c.weights.data + '" style="width:80px"></label>' +
      '</div></div>' +
      '<button class="btn primary" id="btnSaveCfg">บันทึกและคำนวณใหม่</button> ' +
      '<span class="hint" id="cfgMsg"></span></div>' +
      '<div class="card"><h3>เกี่ยวกับข้อมูล</h3>' +
      '<p class="hint">เฟส 1 ใช้ seed data จากไฟล์ Excel ปีงบ 2569 · เฟส 3 จะสลับเป็น Google Sheets อัตโนมัติเมื่อกำหนด Apps Script URL ใน <code>js/config.js</code> โดยไม่ต้องแก้หน้าจอใดๆ</p></div>'
    ));
    page.querySelector('#btnSaveCfg').onclick = function () {
      state.config.paceThreshold = +page.querySelector('#cfgThreshold').value || 10;
      state.config.weights = {
        pace: +page.querySelector('#cfgWPace').value || 50,
        compliance: +page.querySelector('#cfgWComp').value || 30,
        data: +page.querySelector('#cfgWData').value || 20
      };
      saveConfig();
      refresh().then(function () {
        location.hash = '#settings';
        var el = document.getElementById('page').querySelector('#cfgMsg');
        if (el) el.textContent = '✓ บันทึกแล้ว';
      });
    };
  }

  /* ---------- boot ---------- */
  function boot() {
    var nav = document.getElementById('mainNav');
    NAV.forEach(function (n) {
      var b = document.createElement('button');
      b.className = 'nav-btn'; b.dataset.hash = n.hash; b.textContent = n.label;
      b.onclick = function () { location.hash = n.hash; };
      nav.appendChild(b);
    });
    document.getElementById('btnExport').onclick = function () {
      window.ExportWizard.open(state);
    };
    window.addEventListener('hashchange', route);
    refresh();
    // Auto-refresh ทุก 10 นาที (หัวข้อ 6) — เฟส 1 อ่าน seed ใหม่, เฟส 3 จะดึงจาก endpoint จริง
    setInterval(refresh, 10 * 60 * 1000);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
