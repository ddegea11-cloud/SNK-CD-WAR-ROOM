/* =========================================================================
 * Export Wizard — ส่งออก .xlsx จริงด้วย ExcelJS (หัวข้อ 9)
 * 3 ขั้นตอน: ขอบเขตข้อมูล → เลือกคอลัมน์ → เรียง/จัดกลุ่ม + พรีวิว → ดาวน์โหลด
 * ========================================================================= */
window.ExportWizard = (function () {
  'use strict';
  var E = window.ETL;

  var QUARTER_LABELS = { 'ไตร1-2': 'ไตรมาส 1-2', 'ไตร3-4': 'ไตรมาส 3-4', 'ไตร4': 'ไตรมาส 4' };
  var STATUS_TH = {
    green: '✓ ตามแผน', yellow: '◐ ต้องเร่ง', red: '! ควรสนับสนุนเร่งด่วน',
    gray: '… รอข้อมูล', check: '? ควรตรวจสอบ'
  };
  var STATUS_FILL = { green: 'FFE7F6E7', yellow: 'FFFDF3D9', red: 'FFFBE9E9', check: 'FFEDEAFA' };

  var COLUMNS = [
    { key: 'allocated', label: 'จัดสรร (บาท)', type: 'baht', def: true },
    { key: 'disbursed', label: 'เบิกจ่าย (บาท)', type: 'baht', def: true },
    { key: 'remaining', label: 'คงเหลือ (บาท)', type: 'baht', def: true },
    { key: 'pct', label: 'ร้อยละการเบิกจ่าย', type: 'pct', def: true },
    { key: 'status', label: 'สถานะ', type: 'status', def: true },
    { key: 'score', label: 'คะแนนคุณภาพ (0-5)', type: 'num', def: false },
    { key: 'docs', label: 'เอกสารครบถ้วน', type: 'text', def: false },
    { key: 'overdue', label: 'สัญญายืมเงินค้าง (สัญญา)', type: 'num', def: false },
    { key: 'health', label: 'ดัชนีสุขภาพ (0-100)', type: 'num', def: false },
    { key: 'note', label: 'หมายเหตุจากอำเภอ', type: 'text', def: false }
  ];
  var PRESET_EXEC = ['disbursed', 'pct', 'status', 'score'];

  var sel; // ตัวเลือกปัจจุบันของ wizard

  /* หมวดที่เลือก export ได้ = เฉพาะหมวดที่มีข้อมูลรายอำเภอ
     (งบจังหวัด/กลุ่มจังหวัด เป็นระดับจังหวัดเท่านั้น — ไม่อยู่ในรายงานรายอำเภอ) */
  function exportableCategories() {
    return E.CATEGORIES.filter(function (c) {
      return E.PROVINCE_ONLY_CATEGORIES.indexOf(c) < 0;
    });
  }

  function defaults(state) {
    return {
      step: 1,
      time: 'ytd', // ytd | ไตร1-2 | ไตร3-4 | ไตร4 | compare
      districts: E.MASTER_DISTRICTS.slice(),
      categories: exportableCategories(),
      columns: COLUMNS.filter(function (c) { return c.def; }).map(function (c) { return c.key; }),
      sort: 'district', // district | pctDesc | pctAsc | score | status
      group: 'district' // district | category
    };
  }

  /* ---------- รวบรวมข้อมูลตามขอบเขตที่เลือก ---------- */
  function collectRows(state) {
    var m = state.model;
    var notes = (function () {
      try { return JSON.parse(localStorage.getItem('snkcd_notes') || '{}'); } catch (e) { return {}; }
    })();
    var out = [];

    sel.districts.forEach(function (d) {
      var dist = null;
      m.districts.forEach(function (x) { if (x.district === d) dist = x; });
      sel.categories.forEach(function (c) {
        var uc = m.agg.byUnitCat[d + '|' + c];
        if (!uc) return;
        var rec = { district: d, category: c };

        if (sel.time === 'ytd') {
          rec.allocated = uc.allocated; rec.disbursed = uc.disbursed;
        } else if (sel.time === 'compare') {
          ['ไตร1-2', 'ไตร3-4', 'ไตร4'].forEach(function (q) {
            var qq = uc.quarters[q] || { allocated: 0, disbursed: 0 };
            rec['alloc_' + q] = qq.allocated; rec['disb_' + q] = qq.disbursed;
          });
          rec.allocated = uc.allocated; rec.disbursed = uc.disbursed;
        } else {
          var qd = uc.quarters[sel.time];
          if (!qd) return;
          rec.allocated = qd.allocated; rec.disbursed = qd.disbursed;
        }
        rec.remaining = rec.allocated - rec.disbursed;
        rec.pct = rec.allocated > 0 ? +(rec.disbursed / rec.allocated * 100).toFixed(2) : null;
        rec.statusKey = uc.flags.length ? 'check'
          : E.paceStatus(rec.pct, m.fiscal.expectedPacePct, m.config.paceThreshold);
        rec.status = STATUS_TH[rec.statusKey];
        rec.score = dist && dist.quality ? dist.quality.score : null;
        rec.docs = dist && dist.quality ? (dist.quality.documentsComplete ? 'ครบถ้วน' : 'ไม่ครบถ้วน') : '';
        rec.overdue = dist && dist.quality ? dist.quality.overdueLoanContracts : null;
        rec.health = dist && dist.health ? dist.health.index : null;
        rec.note = notes[d] || '';
        out.push(rec);
      });
    });

    // เรียงลำดับ
    var cmp;
    if (sel.sort === 'pctDesc') cmp = function (a, b) { return (b.pct || 0) - (a.pct || 0); };
    else if (sel.sort === 'pctAsc') cmp = function (a, b) { return (a.pct || 0) - (b.pct || 0); };
    else if (sel.sort === 'score') cmp = function (a, b) { return (b.score || 0) - (a.score || 0); };
    else if (sel.sort === 'status') {
      var order = { red: 0, check: 1, yellow: 2, gray: 3, green: 4 };
      cmp = function (a, b) { return order[a.statusKey] - order[b.statusKey]; };
    } else cmp = function (a, b) { return a.district.localeCompare(b.district, 'th'); };

    var groupKey = sel.group === 'category' ? 'category' : 'district';
    out.sort(function (a, b) {
      var g = a[groupKey].localeCompare(b[groupKey], 'th');
      return g !== 0 ? g : cmp(a, b);
    });
    return { rows: out, groupKey: groupKey };
  }

  function activeColumns() {
    var cols = [{ key: 'district', label: 'อำเภอ', type: 'text' }, { key: 'category', label: 'ประเภทงบ', type: 'text' }];
    if (sel.time === 'compare') {
      ['ไตร1-2', 'ไตร3-4', 'ไตร4'].forEach(function (q) {
        if (sel.columns.indexOf('allocated') >= 0) cols.push({ key: 'alloc_' + q, label: 'จัดสรร ' + QUARTER_LABELS[q], type: 'baht' });
        if (sel.columns.indexOf('disbursed') >= 0) cols.push({ key: 'disb_' + q, label: 'เบิกจ่าย ' + QUARTER_LABELS[q], type: 'baht' });
      });
    }
    COLUMNS.forEach(function (c) {
      if (sel.columns.indexOf(c.key) < 0) return;
      if (sel.time === 'compare' && (c.key === 'allocated' || c.key === 'disbursed')) {
        cols.push({ key: c.key, label: c.label + ' (รวมปี)', type: c.type });
      } else cols.push(c);
    });
    return cols;
  }

  function scopeLabel() {
    var t = sel.time === 'ytd' ? 'สะสมทั้งปี' : sel.time === 'compare' ? 'เทียบรายไตรมาส' : (QUARTER_LABELS[sel.time] || sel.time);
    var d = sel.districts.length === E.MASTER_DISTRICTS.length ? 'ทั้ง 18 อำเภอ' : sel.districts.length + ' อำเภอ';
    var c = sel.categories.length === exportableCategories().length ? 'ทุกประเภทงบ' : sel.categories.join(', ');
    return t + ' · ' + d + ' · ' + c;
  }

  /* ---------- สร้างไฟล์ .xlsx ---------- */
  function download(state) {
    var data = collectRows(state);
    var cols = activeColumns();
    var wb = new ExcelJS.Workbook();
    wb.creator = 'SNK-CD War Room';
    var ws = wb.addWorksheet('รายงานเบิกจ่าย', { views: [{ state: 'frozen', ySplit: 3 }] });

    var thin = { style: 'thin', color: { argb: 'FFD0CFC8' } };
    var borderAll = { top: thin, bottom: thin, left: thin, right: thin };
    var baseFont = { name: 'TH Sarabun New', size: 14 };

    // แถวหัวรายงาน + ที่มา
    ws.mergeCells(1, 1, 1, cols.length);
    var t = ws.getCell(1, 1);
    t.value = 'รายงานผลการเบิกจ่ายงบประมาณ ปีงบประมาณ พ.ศ. ' + state.model.config.fiscalYear + ' — สำนักงานพัฒนาชุมชนจังหวัดสกลนคร';
    t.font = { name: 'TH Sarabun New', size: 18, bold: true };
    ws.mergeCells(2, 1, 2, cols.length);
    var meta = ws.getCell(2, 1);
    meta.value = 'ข้อมูล ณ วันที่ ' + new Date().toLocaleString('th-TH') + '  |  ขอบเขต: ' + scopeLabel() +
      '  |  จังหวะเวลาที่ควรจะเป็น: ' + state.model.fiscal.expectedPacePct + '%';
    meta.font = { name: 'TH Sarabun New', size: 12, italic: true, color: { argb: 'FF6B6961' } };

    // หัวตาราง
    var head = ws.getRow(3);
    cols.forEach(function (c, i) {
      var cell = head.getCell(i + 1);
      cell.value = c.label;
      cell.font = { name: 'TH Sarabun New', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C5CAB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = borderAll;
    });
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };

    // แถวข้อมูล (แทรกหัวกลุ่มเมื่อ group เปลี่ยน)
    var r = 4, lastGroup = null;
    var totals = {};
    data.rows.forEach(function (rec) {
      var g = rec[data.groupKey];
      if (g !== lastGroup && (sel.group === 'category' || sel.categories.length > 1)) {
        ws.mergeCells(r, 1, r, cols.length);
        var gc = ws.getCell(r, 1);
        gc.value = (data.groupKey === 'district' ? 'อำเภอ' : '') + g;
        gc.font = { name: 'TH Sarabun New', size: 14, bold: true };
        gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0EFEC' } };
        r++;
        lastGroup = g;
      }
      var row = ws.getRow(r);
      cols.forEach(function (c, i) {
        var cell = row.getCell(i + 1);
        var v = rec[c.key];
        if (c.type === 'baht') {
          cell.value = v == null ? null : v;
          cell.numFmt = '#,##0.00';
          totals[c.key] = (totals[c.key] || 0) + (v || 0);
        } else if (c.type === 'pct') {
          cell.value = v == null ? null : v / 100;
          cell.numFmt = '0.0%';
        } else if (c.type === 'num') {
          cell.value = v == null ? null : v;
          cell.numFmt = '0';
        } else cell.value = v == null ? '' : v;
        cell.font = baseFont;
        cell.border = borderAll;
        // Conditional fill สีเดียวกับ Dashboard (ทั้งแถว)
        if (STATUS_FILL[rec.statusKey]) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[rec.statusKey] } };
        }
      });
      r++;
    });

    // แถวรวมท้ายตาราง
    var tr = ws.getRow(r);
    cols.forEach(function (c, i) {
      var cell = tr.getCell(i + 1);
      if (i === 0) cell.value = 'รวมตามขอบเขตที่เลือก';
      else if (c.type === 'baht') { cell.value = totals[c.key] || 0; cell.numFmt = '#,##0.00'; }
      else if (c.type === 'pct' && totals.allocated > 0 && sel.columns.indexOf('pct') >= 0) {
        cell.value = (totals.disbursed || 0) / totals.allocated; cell.numFmt = '0.0%';
      }
      cell.font = { name: 'TH Sarabun New', size: 14, bold: true };
      cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' } };
    });

    // ความกว้างคอลัมน์ auto-fit จากเนื้อหา
    cols.forEach(function (c, i) {
      var maxLen = c.label.length;
      data.rows.forEach(function (rec) {
        var v = rec[c.key];
        var s = v == null ? '' : (typeof v === 'number' ? v.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : String(v));
        if (s.length > maxLen) maxLen = s.length;
      });
      ws.getColumn(i + 1).width = Math.min(44, Math.max(11, maxLen * 1.15 + 3));
    });

    // ชื่อไฟล์สื่อความหมาย
    var tPart = sel.time === 'ytd' ? 'สะสมทั้งปี' : sel.time === 'compare' ? 'เทียบไตรมาส' : sel.time.replace('ไตร', 'ไตร');
    var cPart = sel.categories.length === exportableCategories().length ? 'ทุกหมวดงบ'
      : sel.categories.map(function (c) { return c.replace('งบ', '').replace('/', '-'); }).join('+');
    var fname = 'รายงานเบิกจ่าย_' + cPart + '_' + tPart + '_' + state.model.config.fiscalYear + '.xlsx';

    return wb.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      return fname;
    });
  }

  /* ---------- UI ของ wizard ---------- */
  var backdrop;
  function open(state) {
    sel = defaults(state);
    render(state);
  }
  function close() { if (backdrop) { backdrop.remove(); backdrop = null; } }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(state) {
    close();
    backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.onclick = function (e) { if (e.target === backdrop) close(); };

    var stepHtml = '';
    if (sel.step === 1) stepHtml = step1Html();
    else if (sel.step === 2) stepHtml = step2Html();
    else stepHtml = step3Html(state);

    backdrop.innerHTML =
      '<div class="modal"><h2>📤 ส่งออกรายงาน Excel' +
      '<button class="close-x" id="wzClose">✕</button></h2>' +
      '<div class="wizard-steps">' +
      ['1. ขอบเขตข้อมูล', '2. เลือกคอลัมน์', '3. จัดรูปแบบ + ดาวน์โหลด'].map(function (s, i) {
        return '<div class="step' + (sel.step === i + 1 ? ' on' : '') + '">' + s + '</div>';
      }).join('') + '</div>' +
      stepHtml +
      '<div class="wizard-nav">' +
      (sel.step > 1 ? '<button class="btn" id="wzBack">← ย้อนกลับ</button>' : '<span></span>') +
      (sel.step < 3
        ? '<button class="btn primary" id="wzNext">ถัดไป →</button>'
        : '<button class="btn primary" id="wzDownload">⬇️ ดาวน์โหลด Excel</button>') +
      '</div></div>';

    document.body.appendChild(backdrop);
    bind(state);
  }

  function pill(name, value, label, checked, type) {
    return '<label class="opt-pill' + (checked ? ' on' : '') + '"><input type="' + (type || 'checkbox') + '" name="' + name +
      '" value="' + esc(value) + '"' + (checked ? ' checked' : '') + '>' + esc(label) + '</label>';
  }

  function step1Html() {
    var times = [
      ['ytd', 'สะสมทั้งปี (YTD)'], ['ไตร1-2', 'ไตรมาส 1-2'], ['ไตร3-4', 'ไตรมาส 3-4'],
      ['ไตร4', 'ไตรมาส 4'], ['compare', 'เทียบไตรมาสต่อไตรมาส']
    ];
    return '<div class="opt-group"><div class="g-label">ช่วงเวลา</div><div class="opt-row">' +
      times.map(function (t) { return pill('wzTime', t[0], t[1], sel.time === t[0], 'radio'); }).join('') + '</div></div>' +
      '<div class="opt-group"><div class="g-label">อำเภอ ' +
      '<button class="btn small" id="wzAllDist" type="button">เลือกทั้งหมด</button> ' +
      '<button class="btn small" id="wzNoDist" type="button">ล้าง</button></div>' +
      '<div class="check-list">' + E.MASTER_DISTRICTS.map(function (d) {
        return '<label><input type="checkbox" name="wzDist" value="' + esc(d) + '"' +
          (sel.districts.indexOf(d) >= 0 ? ' checked' : '') + '>' + esc(d) + '</label>';
      }).join('') + '</div></div>' +
      '<div class="opt-group"><div class="g-label">ประเภทงบ</div><div class="opt-row">' +
      exportableCategories().map(function (c) { return pill('wzCat', c, c, sel.categories.indexOf(c) >= 0); }).join('') +
      '</div><p class="preview-note">โคก หนอง นา / จปฐ. อยู่ภายใต้งบยุทธศาสตร์ (ไม่แยกเป็นหมวด เพื่อไม่ให้นับซ้ำ) · งบจังหวัด/กลุ่มจังหวัด เป็นงบระดับจังหวัด ไม่มีข้อมูลรายอำเภอ</p></div>';
  }

  function step2Html() {
    return '<div class="opt-group"><div class="g-label">คอลัมน์ที่จะแสดง ' +
      '<button class="btn small" id="wzAllCols" type="button">เลือกทั้งหมด</button> ' +
      '<button class="btn small" id="wzExecCols" type="button">เฉพาะที่ผู้บริหารใช้บ่อย</button></div>' +
      '<div class="check-list">' + COLUMNS.map(function (c) {
        return '<label><input type="checkbox" name="wzCol" value="' + c.key + '"' +
          (sel.columns.indexOf(c.key) >= 0 ? ' checked' : '') + '>' + esc(c.label) + '</label>';
      }).join('') + '</div>' +
      '<p class="preview-note">คอลัมน์ "อำเภอ" และ "ประเภทงบ" ใส่ให้เสมอ · โหมดเทียบไตรมาสจะขยายจัดสรร/เบิกจ่ายเป็นรายไตรมาสอัตโนมัติ</p></div>';
  }

  function step3Html(state) {
    var sorts = [
      ['district', 'ชื่ออำเภอ (ก-ฮ)'], ['pctDesc', '% เบิกจ่าย มาก→น้อย'], ['pctAsc', '% เบิกจ่าย น้อย→มาก'],
      ['score', 'คะแนนคุณภาพ'], ['status', 'สถานะ (เร่งด่วนก่อน)']
    ];
    var groups = [['district', 'จัดกลุ่มตามอำเภอ'], ['category', 'จัดกลุ่มตามประเภทงบ']];

    var data = collectRows(state);
    var cols = activeColumns();
    var prevRows = data.rows.slice(0, 5).map(function (rec) {
      return '<tr>' + cols.map(function (c) {
        var v = rec[c.key];
        if (c.type === 'baht') v = v == null ? '-' : E.fmtBaht(v);
        else if (c.type === 'pct') v = v == null ? '-' : v.toFixed(1) + '%';
        return '<td class="' + (c.type === 'text' || c.type === 'status' ? '' : 'num') + '">' + esc(v == null ? '-' : v) + '</td>';
      }).join('') + '</tr>';
    }).join('');

    return '<div class="opt-group"><div class="g-label">เรียงลำดับตาม</div><div class="opt-row">' +
      sorts.map(function (s) { return pill('wzSort', s[0], s[1], sel.sort === s[0], 'radio'); }).join('') + '</div></div>' +
      '<div class="opt-group"><div class="g-label">จัดกลุ่ม</div><div class="opt-row">' +
      groups.map(function (g) { return pill('wzGroup', g[0], g[1], sel.group === g[0], 'radio'); }).join('') + '</div></div>' +
      '<div class="opt-group"><div class="g-label">พรีวิว (5 แถวแรกจากทั้งหมด ' + data.rows.length + ' แถว)</div>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + (prevRows || '<tr><td colspan="' + cols.length + '">ไม่มีข้อมูลตามขอบเขตที่เลือก</td></tr>') + '</tbody></table></div>' +
      '<p class="preview-note">ไฟล์จริงจะมีหัวรายงาน + ตรึงแถวหัวตาราง + ตัวกรองอัตโนมัติ + สีสถานะเดียวกับหน้าจอ + แถวรวมท้ายตาราง (ฟอนต์ TH Sarabun New)</p></div>';
  }

  function bind(state) {
    document.getElementById('wzClose').onclick = close;

    backdrop.querySelectorAll('input[name="wzTime"]').forEach(function (i) {
      i.onchange = function () { sel.time = i.value; };
    });
    backdrop.querySelectorAll('input[name="wzDist"]').forEach(function (i) {
      i.onchange = function () {
        sel.districts = Array.prototype.map.call(
          backdrop.querySelectorAll('input[name="wzDist"]:checked'), function (x) { return x.value; });
      };
    });
    backdrop.querySelectorAll('input[name="wzCat"]').forEach(function (i) {
      i.onchange = function () {
        sel.categories = Array.prototype.map.call(
          backdrop.querySelectorAll('input[name="wzCat"]:checked'), function (x) { return x.value; });
      };
    });
    backdrop.querySelectorAll('input[name="wzCol"]').forEach(function (i) {
      i.onchange = function () {
        sel.columns = Array.prototype.map.call(
          backdrop.querySelectorAll('input[name="wzCol"]:checked'), function (x) { return x.value; });
      };
    });
    backdrop.querySelectorAll('input[name="wzSort"]').forEach(function (i) {
      i.onchange = function () { sel.sort = i.value; render(state); };
    });
    backdrop.querySelectorAll('input[name="wzGroup"]').forEach(function (i) {
      i.onchange = function () { sel.group = i.value; render(state); };
    });

    var b;
    if ((b = document.getElementById('wzAllDist'))) b.onclick = function () { sel.districts = E.MASTER_DISTRICTS.slice(); render(state); };
    if ((b = document.getElementById('wzNoDist'))) b.onclick = function () { sel.districts = []; render(state); };
    if ((b = document.getElementById('wzAllCols'))) b.onclick = function () { sel.columns = COLUMNS.map(function (c) { return c.key; }); render(state); };
    if ((b = document.getElementById('wzExecCols'))) b.onclick = function () { sel.columns = PRESET_EXEC.slice(); render(state); };

    if ((b = document.getElementById('wzNext'))) b.onclick = function () {
      if (sel.step === 1 && (!sel.districts.length || !sel.categories.length)) {
        alert('กรุณาเลือกอย่างน้อย 1 อำเภอ และ 1 ประเภทงบ'); return;
      }
      sel.step++; render(state);
    };
    if ((b = document.getElementById('wzBack'))) b.onclick = function () { sel.step--; render(state); };
    if ((b = document.getElementById('wzDownload'))) b.onclick = function () {
      b.disabled = true; b.textContent = 'กำลังสร้างไฟล์...';
      download(state).then(function (fname) {
        b.textContent = '✓ ดาวน์โหลดแล้ว: ' + fname;
        setTimeout(close, 2200);
      }).catch(function (err) {
        b.disabled = false; b.textContent = '⬇️ ดาวน์โหลด Excel';
        alert('สร้างไฟล์ไม่สำเร็จ: ' + err.message);
      });
    };
  }

  return { open: open };
})();
