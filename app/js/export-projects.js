/* =========================================================================
 * Project Export Wizard — ส่งออก .xlsx รายโครงการ (แยกจาก ExportWizard เดิม
 * ที่ scope เป็นรายอำเภอ×ประเภทงบ) — โครงเดียวกันทุกประการ: 3 ขั้นตอน,
 * ExcelJS, สีสถานะเดียวกับหน้าจอ, freeze header, ชื่อไฟล์สื่อความหมาย
 * ========================================================================= */
window.ProjectExportWizard = (function () {
  'use strict';
  var E = window.ETL;

  var QUARTER_LABELS = { 'ไตร1-2': 'ไตรมาส 1-2', 'ไตร3-4': 'ไตรมาส 3-4' };
  var LEVEL_LABELS = { province: 'ระดับจังหวัด', district: 'ระดับอำเภอ', mixed: 'ผสมจังหวัด+อำเภอ' };
  var STATUS_TH = {
    green: '✓ ตามแผน', yellow: '◐ ต้องเร่ง', red: '! ควรสนับสนุนเร่งด่วน',
    gray: '… รอข้อมูล', check: '? ควรตรวจสอบ'
  };
  var STATUS_FILL = { green: 'FFE7F6E7', yellow: 'FFFDF3D9', red: 'FFFBE9E9', check: 'FFEDEAFA' };

  var COLUMNS_PROJECT = [
    { key: 'no', label: 'เลขที่', type: 'text', def: true },
    { key: 'name', label: 'ชื่อโครงการ', type: 'text', def: true },
    { key: 'workGroup', label: 'กลุ่มงาน', type: 'text', def: true },
    { key: 'level', label: 'ระดับ', type: 'text', def: true },
    { key: 'allocated', label: 'จัดสรร (บาท)', type: 'baht', def: true },
    { key: 'disbursed', label: 'เบิกจ่าย (บาท)', type: 'baht', def: true },
    { key: 'pct', label: 'ร้อยละการเบิกจ่าย', type: 'pct', def: true },
    { key: 'status', label: 'สถานะ', type: 'status', def: true },
    { key: 'districtCount', label: 'จำนวนอำเภอที่เกี่ยวข้อง', type: 'num', def: false },
    { key: 'kpiDept', label: 'ตัวชี้วัดกรม', type: 'text', def: false },
    { key: 'kpiProvince', label: 'ตัวชี้วัดจังหวัด', type: 'text', def: false },
    { key: 'attachment', label: 'เอกสารแนบ', type: 'text', def: false }
  ];

  var sel;

  function defaults() {
    return {
      step: 1,
      quarter: 'all', // all | ไตร1-2 | ไตร3-4
      workGroups: E.WORK_GROUPS.slice(),
      levels: ['province', 'district', 'mixed'],
      q: '',
      columns: COLUMNS_PROJECT.filter(function (c) { return c.def; }).map(function (c) { return c.key; }),
      sort: 'no' // no | pctDesc | pctAsc | workGroup
    };
  }

  function collectRowsProjects(state) {
    var m = state.model;
    var out = m.projects.list.filter(function (p) {
      if (sel.quarter !== 'all' && p.quarterList.indexOf(sel.quarter) < 0) return false;
      if (sel.workGroups.indexOf(p.workGroup) < 0) return false;
      if (sel.levels.indexOf(p.level) < 0) return false;
      if (sel.q) {
        var q = sel.q.toLowerCase();
        if ((p.name || '').toLowerCase().indexOf(q) < 0 && String(p.no || '').indexOf(q) < 0) return false;
      }
      return true;
    }).map(function (p) {
      var statusKey = p.flags.length ? 'check' : E.paceStatus(p.pct, m.fiscal.expectedPacePct, m.config.paceThreshold);
      return {
        no: p.no || '-', name: p.name, workGroup: p.workGroup + (p.workGroupInferred ? ' (อนุมาน)' : ''),
        level: LEVEL_LABELS[p.level] || p.level,
        allocated: p.allocated, disbursed: p.disbursed, remaining: p.remaining, pct: p.pct,
        statusKey: statusKey, status: STATUS_TH[statusKey],
        districtCount: p.districtCount,
        kpiDept: p.kpi.dept, kpiProvince: p.kpi.province,
        attachment: p.attachment || 'ยังไม่มี'
      };
    });

    var cmp;
    if (sel.sort === 'pctDesc') cmp = function (a, b) { return (b.pct || 0) - (a.pct || 0); };
    else if (sel.sort === 'pctAsc') cmp = function (a, b) { return (a.pct || 0) - (b.pct || 0); };
    else if (sel.sort === 'workGroup') cmp = function (a, b) { return a.workGroup.localeCompare(b.workGroup, 'th'); };
    else cmp = function (a, b) {
      var na = parseFloat(a.no), nb = parseFloat(b.no);
      if (isNaN(na) || isNaN(nb)) return String(a.no).localeCompare(String(b.no), 'th');
      return na - nb;
    };
    out.sort(cmp);
    return { rows: out };
  }

  function activeColumns() {
    return COLUMNS_PROJECT.filter(function (c) { return sel.columns.indexOf(c.key) >= 0; });
  }

  function scopeLabel() {
    var t = sel.quarter === 'all' ? 'ทุกไตรมาส' : (QUARTER_LABELS[sel.quarter] || sel.quarter);
    var w = sel.workGroups.length === E.WORK_GROUPS.length ? 'ทุกกลุ่มงาน' : sel.workGroups.join(', ');
    return t + ' · ' + w;
  }

  /* ---------- สร้างไฟล์ .xlsx ---------- */
  function download(state) {
    var data = collectRowsProjects(state);
    var cols = activeColumns();
    var wb = new ExcelJS.Workbook();
    wb.creator = 'SNK-CD War Room';
    var ws = wb.addWorksheet('รายโครงการ', { views: [{ state: 'frozen', ySplit: 3 }] });

    var thin = { style: 'thin', color: { argb: 'FFD0CFC8' } };
    var borderAll = { top: thin, bottom: thin, left: thin, right: thin };
    var baseFont = { name: 'TH Sarabun New', size: 14 };

    ws.mergeCells(1, 1, 1, cols.length);
    var t = ws.getCell(1, 1);
    t.value = 'รายงานรายโครงการ ปีงบประมาณ พ.ศ. ' + state.model.config.fiscalYear + ' — สำนักงานพัฒนาชุมชนจังหวัดสกลนคร';
    t.font = { name: 'TH Sarabun New', size: 18, bold: true };
    ws.mergeCells(2, 1, 2, cols.length);
    var meta = ws.getCell(2, 1);
    meta.value = 'ข้อมูล ณ วันที่ ' + new Date().toLocaleString('th-TH') + '  |  ขอบเขต: ' + scopeLabel() +
      '  |  ตัวชี้วัด/กลุ่มงานที่ไม่มี keyword ตรง = อนุมาน (ดูป้าย "(อนุมาน)"), ตัวชี้วัดเป็นกรอบตัวอย่าง (จำลอง) เท่านั้น';
    meta.font = { name: 'TH Sarabun New', size: 12, italic: true, color: { argb: 'FF6B6961' } };

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

    var r = 4;
    var totals = {};
    data.rows.forEach(function (rec) {
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
        cell.alignment = c.type === 'text' ? { wrapText: true, vertical: 'top' } : {};
        if (STATUS_FILL[rec.statusKey]) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[rec.statusKey] } };
        }
      });
      r++;
    });

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

    cols.forEach(function (c, i) {
      var maxLen = c.label.length;
      data.rows.forEach(function (rec) {
        var v = rec[c.key];
        var s = v == null ? '' : (typeof v === 'number' ? v.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : String(v));
        if (s.length > maxLen) maxLen = Math.min(s.length, 60);
      });
      ws.getColumn(i + 1).width = Math.min(60, Math.max(11, maxLen * 1.15 + 3));
    });

    var qPart = sel.quarter === 'all' ? 'ทุกไตรมาส' : sel.quarter.replace('ไตร', 'ไตร');
    var fname = 'รายงานรายโครงการ_' + qPart + '_' + state.model.config.fiscalYear + '.xlsx';

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
    sel = defaults();
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
      '<div class="modal"><h2>📤 ส่งออกรายโครงการ (Excel)' +
      '<button class="close-x" id="wzpClose">✕</button></h2>' +
      '<div class="wizard-steps">' +
      ['1. ขอบเขตข้อมูล', '2. เลือกคอลัมน์', '3. จัดรูปแบบ + ดาวน์โหลด'].map(function (s, i) {
        return '<div class="step' + (sel.step === i + 1 ? ' on' : '') + '">' + s + '</div>';
      }).join('') + '</div>' +
      stepHtml +
      '<div class="wizard-nav">' +
      (sel.step > 1 ? '<button class="btn" id="wzpBack">← ย้อนกลับ</button>' : '<span></span>') +
      (sel.step < 3
        ? '<button class="btn primary" id="wzpNext">ถัดไป →</button>'
        : '<button class="btn primary" id="wzpDownload">⬇️ ดาวน์โหลด Excel</button>') +
      '</div></div>';

    document.body.appendChild(backdrop);
    bind(state);
  }

  function pill(name, value, label, checked, type) {
    return '<label class="opt-pill' + (checked ? ' on' : '') + '"><input type="' + (type || 'checkbox') + '" name="' + name +
      '" value="' + esc(value) + '"' + (checked ? ' checked' : '') + '>' + esc(label) + '</label>';
  }

  function step1Html() {
    var quarters = [['all', 'ทุกไตรมาส'], ['ไตร1-2', 'ไตรมาส 1-2'], ['ไตร3-4', 'ไตรมาส 3-4']];
    var levels = [['province', 'ระดับจังหวัด'], ['district', 'ระดับอำเภอ'], ['mixed', 'ผสมจังหวัด+อำเภอ']];
    return '<div class="opt-group"><div class="g-label">ไตรมาส</div><div class="opt-row">' +
      quarters.map(function (t) { return pill('wzpQuarter', t[0], t[1], sel.quarter === t[0], 'radio'); }).join('') + '</div></div>' +
      '<div class="opt-group"><div class="g-label">กลุ่มงาน ' +
      '<button class="btn small" id="wzpAllWg" type="button">เลือกทั้งหมด</button> ' +
      '<button class="btn small" id="wzpNoWg" type="button">ล้าง</button></div>' +
      '<div class="check-list">' + E.WORK_GROUPS.map(function (g) {
        return '<label><input type="checkbox" name="wzpWg" value="' + esc(g) + '"' +
          (sel.workGroups.indexOf(g) >= 0 ? ' checked' : '') + '>' + esc(g) + '</label>';
      }).join('') + '</div></div>' +
      '<div class="opt-group"><div class="g-label">ระดับดำเนินการ</div><div class="opt-row">' +
      levels.map(function (l) { return pill('wzpLevel', l[0], l[1], sel.levels.indexOf(l[0]) >= 0); }).join('') +
      '</div><p class="preview-note">กลุ่มงาน/ระดับคำนวณจากข้อมูลที่มีอยู่แล้ว (ไม่มีฟิลด์ในไฟล์ต้นทาง) — กลุ่มงานที่ไม่มี keyword ตรงจะแสดง "(อนุมาน)" กำกับ</p></div>';
  }

  function step2Html() {
    return '<div class="opt-group"><div class="g-label">คอลัมน์ที่จะแสดง ' +
      '<button class="btn small" id="wzpAllCols" type="button">เลือกทั้งหมด</button></div>' +
      '<div class="check-list">' + COLUMNS_PROJECT.map(function (c) {
        return '<label><input type="checkbox" name="wzpCol" value="' + c.key + '"' +
          (sel.columns.indexOf(c.key) >= 0 ? ' checked' : '') + '>' + esc(c.label) + '</label>';
      }).join('') + '</div>' +
      '<p class="preview-note">คอลัมน์ "ตัวชี้วัดกรม/จังหวัด" เป็นกรอบตัวอย่าง (จำลอง) · คอลัมน์ "เอกสารแนบ" จะเป็น "ยังไม่มี" จนกว่าจะแนบไฟล์จริงในข้อมูลต้นทาง</p></div>';
  }

  function step3Html(state) {
    var sorts = [
      ['no', 'เลขที่โครงการ'], ['pctDesc', '% เบิกจ่าย มาก→น้อย'], ['pctAsc', '% เบิกจ่าย น้อย→มาก'], ['workGroup', 'กลุ่มงาน']
    ];
    var data = collectRowsProjects(state);
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
      sorts.map(function (s) { return pill('wzpSort', s[0], s[1], sel.sort === s[0], 'radio'); }).join('') + '</div></div>' +
      '<div class="opt-group"><div class="g-label">พรีวิว (5 แถวแรกจากทั้งหมด ' + data.rows.length + ' แถว)</div>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + (prevRows || '<tr><td colspan="' + cols.length + '">ไม่มีข้อมูลตามขอบเขตที่เลือก</td></tr>') + '</tbody></table></div>' +
      '<p class="preview-note">ไฟล์จริงจะมีหัวรายงาน + ตรึงแถวหัวตาราง + ตัวกรองอัตโนมัติ + สีสถานะเดียวกับหน้าจอ + แถวรวมท้ายตาราง (ฟอนต์ TH Sarabun New)</p></div>';
  }

  function bind(state) {
    document.getElementById('wzpClose').onclick = close;

    backdrop.querySelectorAll('input[name="wzpQuarter"]').forEach(function (i) {
      i.onchange = function () { sel.quarter = i.value; };
    });
    backdrop.querySelectorAll('input[name="wzpWg"]').forEach(function (i) {
      i.onchange = function () {
        sel.workGroups = Array.prototype.map.call(
          backdrop.querySelectorAll('input[name="wzpWg"]:checked'), function (x) { return x.value; });
      };
    });
    backdrop.querySelectorAll('input[name="wzpLevel"]').forEach(function (i) {
      i.onchange = function () {
        sel.levels = Array.prototype.map.call(
          backdrop.querySelectorAll('input[name="wzpLevel"]:checked'), function (x) { return x.value; });
      };
    });
    backdrop.querySelectorAll('input[name="wzpCol"]').forEach(function (i) {
      i.onchange = function () {
        sel.columns = Array.prototype.map.call(
          backdrop.querySelectorAll('input[name="wzpCol"]:checked'), function (x) { return x.value; });
      };
    });
    backdrop.querySelectorAll('input[name="wzpSort"]').forEach(function (i) {
      i.onchange = function () { sel.sort = i.value; render(state); };
    });

    var b;
    if ((b = document.getElementById('wzpAllWg'))) b.onclick = function () { sel.workGroups = E.WORK_GROUPS.slice(); render(state); };
    if ((b = document.getElementById('wzpNoWg'))) b.onclick = function () { sel.workGroups = []; render(state); };
    if ((b = document.getElementById('wzpAllCols'))) b.onclick = function () { sel.columns = COLUMNS_PROJECT.map(function (c) { return c.key; }); render(state); };

    if ((b = document.getElementById('wzpNext'))) b.onclick = function () {
      if (sel.step === 1 && (!sel.workGroups.length || !sel.levels.length)) {
        alert('กรุณาเลือกอย่างน้อย 1 กลุ่มงาน และ 1 ระดับดำเนินการ'); return;
      }
      sel.step++; render(state);
    };
    if ((b = document.getElementById('wzpBack'))) b.onclick = function () { sel.step--; render(state); };
    if ((b = document.getElementById('wzpDownload'))) b.onclick = function () {
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
