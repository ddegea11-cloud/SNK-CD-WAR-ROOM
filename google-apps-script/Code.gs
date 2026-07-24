/**
 * =========================================================================
 * SNK-CD War Room — เฟส 2: ETL Layer บน Google Apps Script
 * =========================================================================
 * หน้าที่: อ่าน Google Sheet ต้นทาง (ที่ย้ายมาจากไฟล์ 2569_เปอร์เซ็นต์_ผลการเบิกจ่าย.xlsx)
 * → parse แบบ "หา keyword header" (ไม่ fix ตำแหน่งแถว/คอลัมน์)
 * → กรอง noise ตามกฎทองหัวข้อ 3.3 → ตรวจ #REF!/anomaly
 * → คืน JSON ตาม contract เดียวกับ seed data ของเฟส 1 ทุกประการ:
 *     { budget:[], quality:[], kokNongNa:[], lastUpdated:"ISO", diagnostics:{} }
 *   ดังนั้น Dashboard ไม่ต้องแก้โค้ดใดๆ — แค่ใส่ URL ของ Web App นี้ใน app/js/config.js
 *
 * กฎทอง 5 ข้อ (บังคับใช้ในไฟล์นี้):
 *  1) นับเป็นข้อมูลเฉพาะแถวในขอบเขตตารางที่ระบุ header ได้
 *  2) คอลัมน์นอกช่วงที่ header ระบุ ห้ามดึงอัตโนมัติ (วันโอนเงิน = enrichment แยกชัดเจน)
 *  3) แถวใต้ขอบเขตตาราง (หมายเหตุ/เชิงอรรถ) ตัดทิ้งจากข้อมูลรายอำเภอ
 *  4) ทดสอบผลลัพธ์เทียบ seed data เฟส 1 ก่อนใช้จริง (ดู testAgainstSeedContract)
 *  5) ชีตมอนิเตอร์ (โคกหนองนา/จปฐ) ห้ามสร้างแถวงบใหม่ — เป็น enrichment เท่านั้น
 *     (บังคับเชิงโครงสร้าง: ชีตเหล่านี้ไหลเข้า kokNongNa/enrichment ไม่มีทางเข้า budget)
 */

/* ========================= CONFIG ========================= */
var CONFIG = {
  // ★ ใส่ ID ของ Google Sheet ต้นทาง (ตัวอักษรยาวๆ ใน URL ของชีต)
  SOURCE_SPREADSHEET_ID: 'ใส่_SPREADSHEET_ID_ที่นี่',

  FISCAL_YEAR: 2569,        // ใช้เฉพาะปีงบ 2569 (1 ต.ค. 2568 – 30 ก.ย. 2569)
  CACHE_SECONDS: 300,       // cache ผลลัพธ์ 5 นาที → dashboard เร็ว และไม่อ่านชีตถี่เกิน

  /* กติกาจับคู่ "ชื่อชีต" → หมวดงบ/ไตรมาส (ยืดหยุ่นต่อการเปลี่ยนชื่อเล็กน้อย)
     level: 'district' = มีข้อมูลรายอำเภอ | 'province' = ระดับจังหวัดเท่านั้น (ยืนยัน 15 ก.ค. 69) */
  SHEET_RULES: [
    { pattern: /ยุทธ.*ไตร\s*1\s*-\s*2/, category: 'งบยุทธศาสตร์', quarter: 'ไตร1-2', level: 'district' },
    { pattern: /ยุทธ.*ไตร\s*3\s*-\s*4/, category: 'งบยุทธศาสตร์', quarter: 'ไตร3-4', level: 'district' },
    { pattern: /บริหาร.*ไตร\s*1\s*-\s*2/, category: 'งบบริหาร', quarter: 'ไตร1-2', level: 'district' },
    { pattern: /บริหาร.*ไตร\s*3\s*-\s*4/, category: 'งบบริหาร', quarter: 'ไตร3-4', level: 'district' },
    { pattern: /บริหาร.*ไตร\s*4\s*$/,    category: 'งบบริหาร', quarter: 'ไตร4',   level: 'district' },
    { pattern: /งบจังหวัด.*ไตร\s*3\s*-\s*4/, category: 'งบจังหวัด/กลุ่มจังหวัด', quarter: 'ไตร3-4', level: 'province' },
    { pattern: /งบจังหวัด/,             category: 'งบจังหวัด/กลุ่มจังหวัด', quarter: 'ไตร1-2', level: 'province' }
  ],

  /* ชีตมอนิเตอร์ (Enrichment เท่านั้น — กฎทองข้อ 5) */
  MONITOR_SHEETS: {
    kokNongNa: /โคกหนองนา/,
    jpthQ3: /^จปฐ\s*$/,          // จปฐ (ข้อมูลไตร 3) — โครงการเดียวกับ จัดเก็บจปฐ
    jpthQ12: /จัดเก็บจปฐ/        // จัดเก็บจปฐ (ข้อมูลไตร 1-2)
  },
  QUALITY_SHEET: /ประเมินที่\s*1/,

  /* keyword หา header ของตารางงบ */
  HEADER_KEYWORDS: {
    allocated: ['จัดสรร', 'ได้รับจัดสรร', 'งบประมาณที่ได้รับ'],
    disbursed: ['เบิกจ่าย', 'ผลการเบิกจ่าย', 'เบิกจ่ายแล้ว'],
    remaining: ['คงเหลือ'],
    pct: ['ร้อยละ', 'เปอร์เซ็นต์', '%'],
    district: ['อำเภอ', 'หน่วยงาน', 'สพอ.']
  },

  /* keyword ที่บอกว่า "จบขอบเขตตารางแล้ว" (กฎทองข้อ 3) */
  FOOTER_KEYWORDS: ['หมายเหตุ', 'เกณฑ์การให้คะแนน', 'คำอธิบาย', 'ผู้รายงาน', 'ลงชื่อ']
};

/* master list 18 อำเภอ + หน่วยจังหวัด (ตรงกับ etl.js ฝั่ง Dashboard) */
var MASTER_DISTRICTS = [
  'เมืองสกลนคร', 'สว่างแดนดิน', 'วานรนิวาส', 'พรรณานิคม', 'บ้านม่วง',
  'อากาศอำนวย', 'วาริชภูมิ', 'กุสุมาลย์', 'กุดบาก', 'พังโคน',
  'ส่องดาว', 'คำตากล้า', 'เต่างอย', 'นิคมน้ำอูน', 'โคกศรีสุพรรณ',
  'เจริญศิลป์', 'โพนนาแก้ว', 'ภูพาน'
];
var PROVINCE_UNIT = 'จังหวัด';
var TOTAL_ROW = 'รวม';
var ERROR_VALUES = ['#REF!', '#VALUE!', '#DIV/0!', '#N/A', '#NAME?', '#NULL!', '#NUM!'];

/* ========================= Web App endpoint ========================= */

/**
 * doGet — Dashboard เรียก URL นี้เพื่อดึงข้อมูล (Deploy เป็น Web App: Anyone)
 * ?nocache=1 เพื่อบังคับอ่านชีตใหม่ทันที (ปุ่ม "รีเฟรชตอนนี้" บน dashboard)
 */
function doGet(e) {
  var noCache = e && e.parameter && e.parameter.nocache === '1';
  var cache = CacheService.getScriptCache();
  var payload;

  if (!noCache) {
    var hit = cache.get('warroom_payload');
    if (hit) payload = hit;
  }
  if (!payload) {
    payload = JSON.stringify(buildPayload());
    // CacheService จำกัด 100KB ต่อ key — ข้อมูล 18 อำเภอปกติไม่ถึง แต่กันไว้
    if (payload.length < 95000) cache.put('warroom_payload', payload, CONFIG.CACHE_SECONDS);
  }
  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ========================= แกนหลัก ETL ========================= */

function buildPayload() {
  var ss = SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID);
  var sheets = ss.getSheets();
  var budget = [], kokNongNa = [], quality = [];
  var diagnostics = { parsedSheets: [], skippedSheets: [], noiseCells: [], errors: [] };

  sheets.forEach(function (sh) {
    var name = sh.getName();
    try {
      // 1) ชีตมอนิเตอร์ → enrichment เท่านั้น (กฎทองข้อ 5 — ไม่มีทางเข้า budget)
      if (CONFIG.MONITOR_SHEETS.kokNongNa.test(name)) {
        kokNongNa = parseKokNongNa(sh, diagnostics);
        diagnostics.parsedSheets.push(name + ' → enrichment โคกหนองนา');
        return;
      }
      if (CONFIG.MONITOR_SHEETS.jpthQ3.test(name) || CONFIG.MONITOR_SHEETS.jpthQ12.test(name)) {
        // จปฐ + จัดเก็บจปฐ = โครงการเดียวกันคนละช่วงเวลา (หัวข้อ 3.4)
        // เฟสนี้เก็บเป็น diagnostics ก่อน — มิติเสริม (วันโอนเงิน) จะเปิดใช้เมื่อ calibrate กับชีตจริง
        diagnostics.parsedSheets.push(name + ' → รอ calibrate มิติเสริม จปฐ (ไม่สร้างแถวงบ — กันนับซ้ำ)');
        return;
      }
      // 2) ชีตประเมินคุณภาพ
      if (CONFIG.QUALITY_SHEET.test(name)) {
        quality = parseQuality(sh, diagnostics);
        diagnostics.parsedSheets.push(name + ' → quality ' + quality.length + ' อำเภอ');
        return;
      }
      // 3) ชีตงบประมาณ (ตาม SHEET_RULES ตัวแรกที่ match)
      var rule = null;
      for (var i = 0; i < CONFIG.SHEET_RULES.length; i++) {
        if (CONFIG.SHEET_RULES[i].pattern.test(name)) { rule = CONFIG.SHEET_RULES[i]; break; }
      }
      if (!rule) { diagnostics.skippedSheets.push(name); return; }

      var rows = parseBudgetSheet(sh, rule, diagnostics);
      budget = budget.concat(rows);
      diagnostics.parsedSheets.push(name + ' → ' + rule.category + ' ' + rule.quarter + ' (' + rows.length + ' แถว)');
    } catch (err) {
      diagnostics.errors.push('ชีต "' + name + '": ' + err.message);
    }
  });

  return {
    budget: budget,
    quality: quality,
    kokNongNa: kokNongNa,
    lastUpdated: new Date().toISOString(),
    fiscalYear: CONFIG.FISCAL_YEAR,
    diagnostics: diagnostics
  };
}

/* ---------- parser: ตารางงบรายอำเภอ ---------- */

function parseBudgetSheet(sheet, rule, diagnostics) {
  var values = sheet.getDataRange().getDisplayValues(); // DisplayValues เพื่อเห็น "#REF!" ตามจริง
  var header = findHeader(values);
  if (!header) {
    diagnostics.errors.push('ชีต "' + sheet.getName() + '": หา header (จัดสรร/เบิกจ่าย) ไม่พบ — ข้ามทั้งชีต');
    return [];
  }

  var out = [];
  var no = 0;
  var blankStreak = 0;

  for (var r = header.rowIndex + 1; r < values.length; r++) {
    var row = values[r];
    var rawDistrict = String(row[header.cols.district] || '').trim();

    // กฎทองข้อ 3: เจอ keyword ท้ายตาราง = จบขอบเขต หยุดอ่านทันที
    if (isFooterRow(row)) break;

    if (!rawDistrict) {
      // แถวว่างติดกัน 5 แถว = พ้นขอบเขตตารางแล้ว
      if (++blankStreak >= 5) break;
      continue;
    }
    blankStreak = 0;

    var unit = resolveUnit(rawDistrict);
    var isTotal = canon(rawDistrict) === canon(TOTAL_ROW);

    // กฎทองข้อ 2: อ่านเฉพาะคอลัมน์ที่ header ระบุ — คอลัมน์แถมท้าย (วันโอนเงิน ฯลฯ) ไม่ถูกแตะ
    var allocated = readCell(row, header.cols.allocated);
    var disbursed = readCell(row, header.cols.disbursed);
    var remaining = readCell(row, header.cols.remaining);
    var pct = readCell(row, header.cols.pct);

    if (!unit && !isTotal) {
      // ชื่อไม่ตรง master list = noise (ที่ทดเลข เช่น "เงินยืม 9300") — จดไว้เพื่อความโปร่งใส
      diagnostics.noiseCells.push(sheet.getName() + ' แถว ' + (r + 1) + ': "' + rawDistrict + '"');
      continue;
    }

    no++;
    out.push({
      category: rule.category,
      quarter: rule.quarter,
      fiscal_year: CONFIG.FISCAL_YEAR,
      no: isTotal ? null : no,
      district: isTotal ? TOTAL_ROW : (unit || rawDistrict),
      allocated: allocated, disbursed: disbursed,
      remaining: remaining, pct: pct
    });
    // หมายเหตุ: แถว "รวม" ส่งไปด้วย — ฝั่ง Dashboard ใช้ cross-check แล้วตัดทิ้งเอง
    // แถว #REF!/anomaly ก็ส่งตามจริง — validation layer ฝั่ง Dashboard ตรวจซ้ำ (defense in depth)
  }
  return out;
}

/** หา header: แถวแรกใน 20 แถวบนที่มีทั้ง keyword "จัดสรร" และ "เบิกจ่าย" */
function findHeader(values) {
  var K = CONFIG.HEADER_KEYWORDS;
  var maxScan = Math.min(values.length, 20);
  for (var r = 0; r < maxScan; r++) {
    var cols = { district: -1, allocated: -1, disbursed: -1, remaining: -1, pct: -1 };
    for (var c = 0; c < values[r].length; c++) {
      var cell = String(values[r][c] || '');
      if (cols.allocated < 0 && matchAny(cell, K.allocated)) cols.allocated = c;
      else if (cols.disbursed < 0 && matchAny(cell, K.disbursed)) cols.disbursed = c;
      else if (cols.remaining < 0 && matchAny(cell, K.remaining)) cols.remaining = c;
      else if (cols.pct < 0 && matchAny(cell, K.pct)) cols.pct = c;
      if (cols.district < 0 && matchAny(cell, K.district)) cols.district = c;
    }
    if (cols.allocated >= 0 && cols.disbursed >= 0) {
      // ถ้าไม่มีหัว "อำเภอ" ชัดเจน ใช้คอลัมน์ก่อนหน้า "จัดสรร" (โครงชีตจริงเป็นแบบนี้)
      if (cols.district < 0) cols.district = Math.max(0, cols.allocated - 1);
      return { rowIndex: r, cols: cols };
    }
  }
  return null;
}

/* ---------- parser: ชีตประเมินคุณภาพ (ประเมินที่ 1) ---------- */

function parseQuality(sheet, diagnostics) {
  var values = sheet.getDataRange().getDisplayValues();
  // header ของชีตนี้: หาแถวที่มี "อำเภอ" และ ("คะแนน" หรือ "สรุป")
  var headerRow = -1, colDistrict = -1, colScore = -1, colSummary = -1;
  for (var r = 0; r < Math.min(values.length, 20); r++) {
    for (var c = 0; c < values[r].length; c++) {
      var cell = String(values[r][c] || '');
      if (/อำเภอ/.test(cell)) { headerRow = r; colDistrict = c; }
      if (/คะแนน/.test(cell)) colScore = c;
      if (/สรุป|ผลการประเมิน|รายละเอียด/.test(cell)) colSummary = c;
    }
    if (headerRow === r && colDistrict >= 0 && colScore >= 0) break;
  }
  if (headerRow < 0) {
    diagnostics.errors.push('ชีตประเมิน: หา header ไม่พบ');
    return [];
  }

  var out = [], no = 0;
  for (var r2 = headerRow + 1; r2 < values.length; r2++) {
    var row = values[r2];
    var rawDistrict = String(row[colDistrict] || '').trim();
    if (isFooterRow(row)) break;             // กฎทองข้อ 3: "หมายเหตุ * ส่งใช้เงินยืม..." อยู่ใต้ตาราง
    if (!rawDistrict) continue;
    var unit = resolveUnit(rawDistrict);
    if (!unit) {
      diagnostics.noiseCells.push(sheet.getName() + ' แถว ' + (r2 + 1) + ': "' + rawDistrict + '"');
      continue;
    }

    // ดึงข้อเท็จจริงจากข้อความสรุป (รูปแบบเดียวกับไฟล์จริง)
    var summary = colSummary >= 0 ? String(row[colSummary] || '') : row.join(' ');
    var pctMatch = summary.match(/ร้อยละ\s*([0-9]+(?:\.[0-9]+)?)/);
    var overdueMatch = summary.match(/จำนวน\s*([0-9]+)\s*สัญญา/);
    var docsComplete = !/ไม่ครบถ้วน/.test(summary);

    no++;
    out.push({
      no: no,
      district: unit,
      cumulative_disbursement_pct: pctMatch ? parseFloat(pctMatch[1]) : null,
      documents_complete: docsComplete,
      overdue_loan_contracts: overdueMatch ? parseInt(overdueMatch[1], 10) : 0,
      score_0_to_5: colScore >= 0 ? toNumber(row[colScore]) : null,
      raw_summary: summary.trim()
    });
  }
  return out;
}

/* ---------- parser: ชีตโคกหนองนา (Enrichment เท่านั้น) ---------- */

function parseKokNongNa(sheet, diagnostics) {
  var values = sheet.getDataRange().getDisplayValues();
  // หา header: แถวที่มี "อำเภอ" + "แปลง"
  var headerRow = -1;
  var cols = { district: -1, plots: -1, amount: -1, po: -1, disbursed: -1, fee: -1, remaining: -1, returned: -1 };
  for (var r = 0; r < Math.min(values.length, 20); r++) {
    for (var c = 0; c < values[r].length; c++) {
      var cell = String(values[r][c] || '');
      if (/อำเภอ/.test(cell)) { headerRow = r; cols.district = c; }
      if (/แปลง/.test(cell) && cols.plots < 0) cols.plots = c;
      if (/จำนวนเงิน|งบประมาณ|จัดสรร/.test(cell) && cols.amount < 0) cols.amount = c;
      if (/PO|ก่อหนี้/.test(cell) && cols.po < 0) cols.po = c;
      if (/เบิกจ่าย/.test(cell) && cols.disbursed < 0) cols.disbursed = c;
      if (/ควบคุมงาน|ผู้ควบคุม/.test(cell) && cols.fee < 0) cols.fee = c;
      if (/คงเหลือ/.test(cell) && cols.remaining < 0) cols.remaining = c;
      if (/ส่งคืน|คืนกรม/.test(cell) && cols.returned < 0) cols.returned = c;
    }
    if (headerRow === r && cols.district >= 0 && cols.plots >= 0) break;
  }
  if (headerRow < 0) {
    diagnostics.errors.push('ชีตโคกหนองนา: หา header ไม่พบ');
    return [];
  }

  var out = [];
  for (var r2 = headerRow + 1; r2 < values.length; r2++) {
    var row = values[r2];
    var rawDistrict = String(row[cols.district] || '').trim();
    if (isFooterRow(row)) break;
    if (!rawDistrict) continue;
    var unit = resolveUnit(rawDistrict);
    var isTotal = canon(rawDistrict) === canon(TOTAL_ROW);
    if (!unit && !isTotal) {
      diagnostics.noiseCells.push(sheet.getName() + ' แถว ' + (r2 + 1) + ': "' + rawDistrict + '"');
      continue;
    }
    out.push({
      district: isTotal ? TOTAL_ROW : unit,
      plots: toNumber(row[cols.plots]),
      amount: toNumber(row[cols.amount]),
      po_committed: toNumber(row[cols.po]),
      disbursed: toNumber(row[cols.disbursed]),
      supervisor_fee: toNumber(row[cols.fee]),
      remaining: toNumber(row[cols.remaining]),
      returned_to_dept: toNumber(row[cols.returned])
    });
  }
  return out;
}

/* ========================= utilities ========================= */

/** normalize ชื่ออำเภอ: ตัดช่องว่าง + ยุบอักษรซ้ำติดกัน (ตรงกับ etl.js ฝั่ง Dashboard) */
function canon(s) {
  if (typeof s !== 'string') return '';
  s = s.replace(/\s+/g, '');
  var out = '';
  for (var i = 0; i < s.length; i++) {
    if (s[i] !== out[out.length - 1]) out += s[i];
  }
  return out;
}

var CANON_MAP = null;
function resolveUnit(name) {
  if (!CANON_MAP) {
    CANON_MAP = {};
    MASTER_DISTRICTS.forEach(function (d) { CANON_MAP[canon(d)] = d; });
    // รองรับคำนำหน้า "อำเภอ..." / "สพอ. ..."
    MASTER_DISTRICTS.forEach(function (d) {
      CANON_MAP[canon('อำเภอ' + d)] = d;
      CANON_MAP[canon('สพอ.' + d)] = d;
    });
    CANON_MAP[canon(PROVINCE_UNIT)] = PROVINCE_UNIT;
    CANON_MAP[canon('สนง.' + PROVINCE_UNIT)] = PROVINCE_UNIT;
  }
  return CANON_MAP[canon(name)] || null;
}

function matchAny(cell, keywords) {
  for (var i = 0; i < keywords.length; i++) {
    if (cell.indexOf(keywords[i]) >= 0) return true;
  }
  return false;
}

function isFooterRow(row) {
  var joined = row.join(' ');
  return CONFIG.FOOTER_KEYWORDS.some(function (k) { return joined.indexOf(k) >= 0; });
}

/** อ่านค่าเซล: เก็บ error ของ Excel/Sheets เป็น string ตามจริง (Dashboard ตรวจจับต่อ) */
function readCell(row, colIndex) {
  if (colIndex < 0 || colIndex >= row.length) return null;
  var v = String(row[colIndex] || '').trim();
  if (v === '') return null;
  if (ERROR_VALUES.indexOf(v) >= 0) return v; // ส่ง "#REF!" ตรงๆ ให้ validation layer จัดการ
  return toNumber(v);
}

function toNumber(v) {
  if (v === null || v === undefined) return null;
  var s = String(v).replace(/,/g, '').trim();
  if (s === '' || ERROR_VALUES.indexOf(s) >= 0) return null;
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/* ========================= เครื่องมือทดสอบ/ดูแลระบบ ========================= */

/**
 * รันจากเมนู Apps Script เพื่อดูผล parse ทั้งหมดใน Log (ก่อน deploy จริง)
 * เทียบ diagnostics กับ seed data เฟส 1: จำนวนแถว budget ควรใกล้เคียง 135 แถว,
 * noiseCells ควรมี "เงินยืม 9300"/"ค่าจ้าง 6900"/"ค่่าวัสดุ 3150" ถ้าชีตต้นทางยังมีอยู่
 */
function testAgainstSeedContract() {
  var p = buildPayload();
  Logger.log('budget rows: ' + p.budget.length);
  Logger.log('quality rows: ' + p.quality.length + ' (ควรเป็น 18)');
  Logger.log('kokNongNa rows: ' + p.kokNongNa.length + ' (ควรเป็น 10-11 รวมแถวรวม)');
  Logger.log('parsed: \n' + p.diagnostics.parsedSheets.join('\n'));
  Logger.log('skipped: \n' + p.diagnostics.skippedSheets.join('\n'));
  Logger.log('noise: \n' + p.diagnostics.noiseCells.join('\n'));
  Logger.log('errors: \n' + p.diagnostics.errors.join('\n'));
}

/** ล้าง cache ทันที (เช่น หลังแก้ข้อมูลในชีตแล้วอยากให้ dashboard เห็นเดี๋ยวนั้น) */
function clearCache() {
  CacheService.getScriptCache().remove('warroom_payload');
}
