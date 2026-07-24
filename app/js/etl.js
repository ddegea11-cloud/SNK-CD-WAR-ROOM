/* =========================================================================
 * SNK-CD War Room — ETL / Data Layer (เฟส 1: อ่านจาก seed data)
 * -------------------------------------------------------------------------
 * กฎทอง (จากเอกสารวิเคราะห์ไฟล์ต้นทาง หัวข้อ 3.3–3.4):
 *  1) นับเป็น "ข้อมูล" เฉพาะแถวที่อยู่ในขอบเขตตารางที่ระบุ header ได้
 *  2) คอลัมน์/เซลนอกขอบเขต (ที่ทดเลข, วันโอนเงิน) ห้ามปนเข้าคอลัมน์ตัวเงิน
 *  3) แถวหมายเหตุ/เชิงอรรถใต้ตาราง ตัดออกจากข้อมูลรายอำเภอ
 *  4) มี unit test ยืนยันว่า parser ไม่ดึง noise เข้ามา (ดู tests/tests.html)
 *  5) ห้ามมี source of truth สองจุดต่อโครงการเดียวกัน — ชีตมอนิเตอร์
 *     (โคกหนองนา/จปฐ) เป็น Enrichment Layer เท่านั้น ห้ามบวกยอดเงินซ้ำ
 * ไฟล์นี้เป็น pure logic ไม่แตะ DOM — UI เรียกผ่าน window.ETL
 * ========================================================================= */
window.ETL = (function () {
  'use strict';

  /* ---------- Master data ---------- */
  var MASTER_DISTRICTS = [
    'เมืองสกลนคร', 'สว่างแดนดิน', 'วานรนิวาส', 'พรรณานิคม', 'บ้านม่วง',
    'อากาศอำนวย', 'วาริชภูมิ', 'กุสุมาลย์', 'กุดบาก', 'พังโคน',
    'ส่องดาว', 'คำตากล้า', 'เต่างอย', 'นิคมน้ำอูน', 'โคกศรีสุพรรณ',
    'เจริญศิลป์', 'โพนนาแก้ว', 'ภูพาน'
  ];
  var PROVINCE_UNIT = 'จังหวัด'; // แถวงบของ สนง.จังหวัด (เป็นอีก 1 หน่วย ไม่ใช่ยอดรวม)
  var TOTAL_ROW = 'รวม';         // แถวผลรวมที่ไฟล์ต้นทางคำนวณไว้ — ระบบคำนวณเองเสมอ

  var CATEGORIES = ['งบบริหาร', 'งบยุทธศาสตร์', 'งบจังหวัด/กลุ่มจังหวัด'];

  /* หมวดงบที่มีเฉพาะระดับจังหวัด (ยืนยันโดยผู้ใช้ 15 ก.ค. 69):
     ห้ามแสดง/คำนวณระดับอำเภอ — แถวรายอำเภอในหมวดนี้ถือว่าผิดโครงสร้าง ให้กันออก */
  var PROVINCE_ONLY_CATEGORIES = ['งบจังหวัด/กลุ่มจังหวัด'];

  /* ทะเบียนโครงการเด่น (flagship) — ยอดเงินอยู่ในงบยุทธศาสตร์แล้ว (หัวข้อ 3.4)
     ใช้เป็นจุดอ้างอิงเดียว (single source of truth) สำหรับ dedupe ด้วย project_no */
  var FLAGSHIP_PROJECTS = [
    {
      project_no: '71',
      aliases: ['24/2569'],
      name: 'โคก หนอง นา (พัฒนาศูนย์เรียนรู้ทฤษฎีใหม่)',
      parent_category: 'งบยุทธศาสตร์',
      monitor_sheet: 'โคกหนองนา',
      note: 'ยอดเงินรวมอยู่ในงบยุทธศาสตร์แล้ว — แสดงมิติเสริม (จำนวนแปลง/ค่าควบคุมงาน) เท่านั้น'
    },
    {
      project_no: '45',
      aliases: ['60', '2/2569'],
      name: 'จปฐ. (บริหารการจัดเก็บและใช้ประโยชน์ข้อมูลความจำเป็นพื้นฐาน)',
      parent_category: 'งบยุทธศาสตร์',
      monitor_sheet: 'จปฐ / จัดเก็บจปฐ',
      note: 'ชีต "จัดเก็บจปฐ" (ไตร 1-2) และ "จปฐ" (ไตร 3) คือโครงการเดียวกัน ต้องรวมเป็น YTD ก้อนเดียวก่อน dedupe กับงบยุทธศาสตร์'
    }
  ];

  /* ---------- กลุ่มงาน (4 กลุ่มงานจริงของสำนักงาน) ----------
     workGroup คำนวณจากชื่อโครงการ (keyword matching) เพราะ seed ปัจจุบันไม่มีฟิลด์นี้อยู่แล้ว
     ไม่เจอ keyword ใดเลย -> fallback เป็น "ยุทธศาสตร์การพัฒนาชุมชน" (กลุ่มงานเดียวที่ 92 โครงการ
     สังกัดอยู่แล้วจริงจากชีตต้นทาง) พร้อมตั้ง workGroupInferred:true ให้ UI ต้องกำกับ "(อนุมาน)" เสมอ */
  var WORK_GROUPS = [
    'อำนวยการ',
    'ส่งเสริมการพัฒนาชุมชน',
    'ยุทธศาสตร์การพัฒนาชุมชน',
    'สารสนเทศการพัฒนาชุมชน'
  ];
  var WORK_GROUP_KEYWORDS = {
    'ส่งเสริมการพัฒนาชุมชน': ['สัมมาชีพ', 'otop', 'โอทอป', 'กองทุน', 'อาชีพ', 'รายได้', 'เศรษฐกิจฐานราก', 'กข.คจ'],
    'ยุทธศาสตร์การพัฒนาชุมชน': ['จปฐ', 'แผนพัฒนา', 'โคกหนองนา', 'โคก หนอง นา', 'ทฤษฎีใหม่', 'ข้อมูลความจำเป็นพื้นฐาน'],
    'สารสนเทศการพัฒนาชุมชน': ['ข้อมูลอิเล็กทรอนิกส์', 'ระบบ', 'เทคโนโลยี', 'ดิจิทัล', 'ฐานข้อมูล'],
    'อำนวยการ': ['อำนวยการ', 'บริหารสำนักงาน', 'บุคลากร', 'ประชุมข้าราชการ']
  };
  var WORK_GROUP_FALLBACK = 'ยุทธศาสตร์การพัฒนาชุมชน';

  function inferWorkGroup(name) {
    var n = (name || '');
    for (var i = 0; i < WORK_GROUPS.length; i++) {
      var g = WORK_GROUPS[i];
      var kws = WORK_GROUP_KEYWORDS[g] || [];
      for (var j = 0; j < kws.length; j++) {
        if (n.indexOf(kws[j]) >= 0) return { workGroup: g, workGroupInferred: false };
      }
    }
    return { workGroup: WORK_GROUP_FALLBACK, workGroupInferred: true };
  }

  /* ---------- กรอบตัวชี้วัด (จำลอง) ต่อกลุ่มงาน ----------
     ข้อความเป็นกรอบทั่วไปเท่านั้น ไม่ใช่ตัวชี้วัดจริงที่กรมประกาศต่อโครงการ — ต้องติด label
     "ตัวอย่างกรอบตัวชี้วัด (จำลอง)" ทุกครั้งที่แสดงผลใน UI ห้ามนำเสนอเป็นข้อเท็จจริง */
  var KPI_TEMPLATES = {
    'ส่งเสริมการพัฒนาชุมชน': {
      dept: 'กรมวัด: จำนวนครัวเรือน/กลุ่มอาชีพที่เข้าร่วมและมีรายได้เพิ่มขึ้นตามเป้าที่กรมกำหนด',
      province: 'จังหวัดวัด: ร้อยละเบิกจ่ายสะสมเทียบแผน (ปัจจุบัน {pct}% เป้า 100% ภายในสิ้นปีงบ)'
    },
    'ยุทธศาสตร์การพัฒนาชุมชน': {
      dept: 'กรมวัด: ความครบถ้วน/ทันเวลาของข้อมูล จปฐ. หรือแผนพัฒนาที่ส่งให้กรมตามปฏิทินที่กำหนด',
      province: 'จังหวัดวัด: ร้อยละเบิกจ่ายสะสมเทียบแผน (ปัจจุบัน {pct}% เป้า 100% ภายในสิ้นปีงบ) และความครบถ้วนของเอกสาร'
    },
    'สารสนเทศการพัฒนาชุมชน': {
      dept: 'กรมวัด: ความสำเร็จของการพัฒนา/ใช้งานระบบตามแผนที่กรมกำหนด (จำนวนผู้ใช้งาน/module ที่แล้วเสร็จ)',
      province: 'จังหวัดวัด: ร้อยละเบิกจ่ายสะสมเทียบแผน (ปัจจุบัน {pct}% เป้า 100% ภายในสิ้นปีงบ)'
    },
    'อำนวยการ': {
      dept: 'กรมวัด: ความครบถ้วนของรายงาน/เอกสารบริหารสำนักงานตามรอบเวลาที่กรมกำหนด',
      province: 'จังหวัดวัด: ร้อยละเบิกจ่ายสะสมเทียบแผน (ปัจจุบัน {pct}% เป้า 100% ภายในสิ้นปีงบ)'
    }
  };
  var KPI_LABEL = 'ตัวอย่างกรอบตัวชี้วัด (จำลอง)';

  function buildKpi(workGroup, pct) {
    var t = KPI_TEMPLATES[workGroup] || KPI_TEMPLATES[WORK_GROUP_FALLBACK];
    var pctStr = (pct === null || pct === undefined) ? '-' : pct.toFixed(1);
    return {
      dept: KPI_LABEL + ' — ' + t.dept.replace('{pct}', pctStr) + ' (' + KPI_LABEL + ')',
      province: KPI_LABEL + ' — ' + t.province.replace('{pct}', pctStr) + ' (' + KPI_LABEL + ')'
    };
  }

  /* ---------- ระเบียบ/แนวทาง/คู่มือ ---------- */
  function processRegulations(rawRegs) {
    var list = [], issues = [];
    (rawRegs || []).forEach(function (r) {
      if (!r || !r.id || !r.title) {
        issues.push({
          type: 'BAD_REGULATION', severity: 'warn',
          category: 'ระเบียบ/แนวทาง', quarter: '-', district: '-',
          message: 'พบรายการระเบียบที่ไม่มี id/title ครบถ้วน — ข้ามรายการนี้'
        });
        return;
      }
      list.push(r);
    });
    return { list: list, issues: issues };
  }

  /* ---------- Ask AI (prototype): จับคู่คำสำคัญล้วนๆ ไม่ใช่ AI จริง ---------- */
  var SYNONYMS = {
    'ซื้อของ': 'จัดซื้อ',
    'จัดซื้อจัดจ้าง': 'จัดซื้อ',
    'เบิกเงิน': 'เบิกจ่าย',
    'ยืมเงิน': 'ยืมเงินราชการ',
    'โคกหนองนาโมเดล': 'โคกหนองนา'
  };

  function expandQuery(queryText) {
    var q = (queryText || '').trim();
    var expanded = [q];
    Object.keys(SYNONYMS).forEach(function (k) {
      if (q.indexOf(k) >= 0) expanded.push(SYNONYMS[k]);
    });
    return expanded;
  }

  function matchQuery(queryText, regulations, projects) {
    var terms = expandQuery(queryText);
    function scoreKeywords(kws) {
      var s = 0;
      (kws || []).forEach(function (kw) {
        terms.forEach(function (t) { if (t && kw && t.indexOf(kw) >= 0) s++; });
      });
      return s;
    }
    var regMatches = (regulations || []).map(function (reg) {
      return { reg: reg, score: scoreKeywords(reg.keywords) };
    }).filter(function (m) { return m.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 5);

    // คำถามจริงมักเป็นประโยคยาว (เช่น "โคกหนองนา มีคู่มือดำเนินการอะไรบ้าง") ไม่ใช่แค่คำเดียว —
    // จับคู่ทั้งประโยคเป็น substring ตรงๆ จะไม่เจออะไรเลย จึงตัดเป็น "วรรค" (แยกด้วยช่องว่าง)
    // แล้วเทียบทีละวรรคแทน เหมือนวิธีที่ scoreKeywords ใช้กับคำสำคัญของระเบียบ
    var tokens = [];
    terms.forEach(function (t) {
      (t || '').split(/\s+/).forEach(function (w) {
        var cw = canon(w);
        if (cw && cw.length >= 2) tokens.push(cw);
      });
    });
    var projMatches = (projects || []).map(function (p) {
      var score = 0;
      var cName = canon(p.name || '');
      tokens.forEach(function (tok) { if (cName.indexOf(tok) >= 0) score++; });
      return { project: p, score: score };
    }).filter(function (m) { return m.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 5);

    return { regMatches: regMatches, projMatches: projMatches, hasMatch: regMatches.length > 0 || projMatches.length > 0 };
  }

  /* ---------- Utilities ---------- */

  /* normalize ชื่ออำเภอ: ตัดช่องว่าง + ยุบตัวอักษรซ้ำติดกัน (แก้ "กุุสุมาลย์","เต่่างอย")
     เทียบแบบยุบทั้งสองฝั่ง จึงไม่กระทบชื่อที่มีอักษรซ้ำจริง เช่น "พรรณานิคม" */
  function canon(s) {
    if (typeof s !== 'string') return '';
    s = s.normalize('NFC').replace(/\s+/g, '');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (s[i] !== out[out.length - 1]) out += s[i];
    }
    return out;
  }

  var CANON_MAP = {};
  MASTER_DISTRICTS.forEach(function (d) { CANON_MAP[canon(d)] = d; });

  function resolveUnit(name) {
    var c = canon(name);
    if (CANON_MAP[c]) return CANON_MAP[c];
    if (c === canon(PROVINCE_UNIT)) return PROVINCE_UNIT;
    return null;
  }

  function isRefError(v) { return v === '#REF!'; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* ---------- ปีงบประมาณ / จังหวะเวลา (pace) ---------- */
  function fiscalInfo(now, fiscalYearBE) {
    // ปีงบ 2569 = 1 ต.ค. 2568 (2025) – 30 ก.ย. 2569 (2026)
    var startCE = fiscalYearBE - 544; // 2569 -> 2025
    var start = new Date(startCE, 9, 1);
    var end = new Date(startCE + 1, 8, 30, 23, 59, 59);
    var msDay = 86400000;
    var elapsed = Math.floor((now - start) / msDay) + 1;
    var total = Math.round((end - start) / msDay) + 1;
    elapsed = Math.max(0, Math.min(elapsed, total));
    return {
      start: start, end: end,
      daysElapsed: elapsed,
      daysRemaining: Math.max(0, total - elapsed),
      totalDays: total,
      expectedPacePct: +(elapsed / total * 100).toFixed(1)
    };
  }

  /* สถานะสีแบบเทียบจังหวะเวลา (หัวข้อ 8.1) — threshold ปรับได้จากหน้าตั้งค่า */
  function paceStatus(actualPct, expectedPct, threshold) {
    if (actualPct === null || actualPct === undefined) return 'gray';
    if (actualPct >= expectedPct) return 'green';
    if (actualPct >= expectedPct - threshold) return 'yellow';
    return 'red';
  }

  var STATUS_META = {
    green:  { label: 'ตามแผน/เร็วกว่าแผน', icon: '✓' },
    yellow: { label: 'ตามหลังเล็กน้อย ต้องเร่ง', icon: '◐' },
    red:    { label: 'ควรสนับสนุนเร่งด่วน', icon: '!' },
    gray:   { label: 'รอข้อมูล/ยังไม่เริ่ม', icon: '…' },
    check:  { label: 'ข้อมูลควรตรวจสอบ', icon: '?' }
  };

  /* เกณฑ์คะแนนราชการ (หัวข้อ 8.2) — คงสูตรเดิมขององค์กร ห้ามเปลี่ยน */
  function officialScore(pct, docsComplete, overdueContracts) {
    var base = 0;
    if (pct >= 100 && docsComplete) base = 5;
    else if (pct >= 95) base = 4;
    else if (pct >= 90) base = 3;
    else if (pct >= 85) base = 2;
    else if (pct >= 80) base = 1;
    var deduct = 0;
    if (overdueContracts > 4) deduct = 2;
    else if (overdueContracts >= 1) deduct = 1;
    return Math.max(0, base - deduct);
  }

  /* ---------- แกนหลัก: ประมวลผล budget_summary ---------- */
  /* คืน { rows, issues, noise, droppedTotals } โดย
     rows        = แถวข้อมูลจริงรายหน่วย (สะอาด ผ่านการ normalize แล้ว)
     issues      = ข้อผิดพลาดที่ตรวจพบ (#REF!, anomaly) สำหรับหมวด "ข้อมูลต้องตรวจสอบ"
     noise       = แถวที่ถูกกรองทิ้ง (ที่ทดเลข ฯลฯ) เก็บไว้เพื่อความโปร่งใส
     droppedTotals = แถว "รวม" ของไฟล์ต้นทาง (ใช้ cross-check เท่านั้น)          */
  function processBudget(rawRows, fiscalYearBE) {
    var fy = fiscalYearBE || 2569;
    var rows = [], issues = [], noise = [], droppedTotals = [];

    rawRows.forEach(function (r) {
      // ล็อกปีงบประมาณ: ใช้เฉพาะ พ.ศ. 2569 (1 ต.ค. 68 – 30 ก.ย. 69) —
      // แถวที่ระบุปีงบอื่นถูกกันออกและแจ้งเตือน (กันข้อมูลปีเก่าปนตอนย้ายขึ้น Google Sheets)
      if (r.fiscal_year != null && +r.fiscal_year !== fy) {
        issues.push({
          type: 'WRONG_FISCAL_YEAR',
          severity: 'warn',
          category: r.category, quarter: r.quarter || '-',
          district: resolveUnit(r.district) || r.district,
          message: 'พบข้อมูลปีงบประมาณ ' + r.fiscal_year + ' ปนมา — ระบบใช้เฉพาะปีงบ ' + fy +
            ' จึงไม่นำมารวมยอด ควรแยกข้อมูลปีเก่าออกจากชีตต้นทาง'
        });
        return;
      }

      var brokenQuarter = /_BROKEN$/.test(r.quarter || '');
      var hasRef = [r.allocated, r.disbursed, r.remaining, r.pct].some(isRefError);

      if (hasRef || brokenQuarter) {
        issues.push({
          type: 'REF_ERROR',
          severity: 'error',
          category: r.category, quarter: (r.quarter || '').replace('_BROKEN', ''),
          district: resolveUnit(r.district) || r.district,
          message: 'สูตรอ้างอิงชีตที่ถูกลบ/เปลี่ยนชื่อ (#REF!) — ตัวเลขหมวดนี้ใช้ไม่ได้ ต้องแก้ที่ไฟล์ต้นทาง'
        });
        return;
      }

      // แถว "รวม" ของต้นทาง — ไม่ ingest แต่เก็บไว้ตรวจทานยอดที่ระบบคำนวณเอง
      if (canon(r.district) === canon(TOTAL_ROW)) {
        droppedTotals.push(r);
        return;
      }

      var unit = resolveUnit(r.district);
      // แถวที่ชื่อไม่ตรง master list เลย = noise (เช่น "เงินยืม 9300", ที่ทดเลข)
      if (!unit) { noise.push(r); return; }
      // แถวไม่มีตัวเลขเลย = noise
      if (!isNum(r.allocated) && !isNum(r.disbursed)) { noise.push(r); return; }

      // งบจังหวัด/กลุ่มจังหวัด มีเฉพาะระดับจังหวัด — แถวรายอำเภอในหมวดนี้ผิดโครงสร้าง
      // ห้ามเข้าการคำนวณระดับอำเภอ และแจ้งให้ตรวจสอบต้นทาง
      if (PROVINCE_ONLY_CATEGORIES.indexOf(r.category) >= 0 && unit !== PROVINCE_UNIT) {
        issues.push({
          type: 'PROVINCE_ONLY_VIOLATION',
          severity: 'warn',
          category: r.category, quarter: r.quarter, district: unit,
          message: 'หมวด "' + r.category + '" เป็นงบระดับจังหวัดเท่านั้น แต่พบแถวระดับอำเภอในชีตต้นทาง — ระบบไม่นำมาคำนวณ ควรตรวจสอบโครงสร้างชีต'
        });
        return;
      }

      var allocated = isNum(r.allocated) ? r.allocated : 0;
      var disbursed = isNum(r.disbursed) ? r.disbursed : 0;
      var remaining = isNum(r.remaining) ? r.remaining : allocated - disbursed;
      var pct = allocated > 0 ? disbursed / allocated * 100 : (disbursed > 0 ? null : 0);

      var flags = [];
      if (pct !== null && pct > 100.0001) flags.push('PCT_OVER_100');
      if (remaining < -0.0001) flags.push('NEGATIVE_REMAINING');

      var row = {
        category: r.category, quarter: r.quarter, unit: unit,
        allocated: allocated, disbursed: disbursed, remaining: remaining,
        pct: pct === null ? null : +pct.toFixed(2),
        flags: flags
      };
      rows.push(row);

      if (flags.length) {
        issues.push({
          type: 'ANOMALY',
          severity: 'warn',
          category: r.category, quarter: r.quarter, district: unit,
          message: 'เบิกจ่าย ' + fmtBaht(disbursed) + ' เกินยอดจัดสรร ' + fmtBaht(allocated) +
            ' (' + (pct === null ? '-' : pct.toFixed(1)) + '%) — น่าจะพิมพ์ตัวเลขผิดหรือยังไม่ปรับปรุงยอดจัดสรร ควรตรวจสอบกับต้นทาง'
        });
      }
    });

    return { rows: rows, issues: issues, noise: noise, droppedTotals: droppedTotals };
  }

  /* ---------- ประมวลผลข้อมูลคุณภาพ (ชีต "ประเมินที่ 1") ---------- */
  function processQuality(rawRows) {
    var byDistrict = {}, unmatched = [], issues = [];
    (rawRows || []).forEach(function (r) {
      var unit = resolveUnit(r.district);
      if (!unit) { unmatched.push(r); return; }
      // validation: คะแนนในไฟล์ควรตรงกับเกณฑ์ที่องค์กรประกาศเอง — ถ้าไม่ตรง ติด flag
      var expected = officialScore(r.cumulative_disbursement_pct, !!r.documents_complete, r.overdue_loan_contracts || 0);
      var mismatch = expected !== r.score_0_to_5;
      byDistrict[unit] = {
        district: unit,
        cumulativePct: r.cumulative_disbursement_pct,
        documentsComplete: !!r.documents_complete,
        overdueLoanContracts: r.overdue_loan_contracts || 0,
        score: r.score_0_to_5,          // แสดงตามไฟล์จริง (official record)
        expectedScore: expected,        // คะแนนตามเกณฑ์ที่คำนวณได้
        scoreMismatch: mismatch,
        rawSummary: r.raw_summary || '',
        reasons: qualityReasons(r)
      };
      if (mismatch) {
        issues.push({
          type: 'SCORE_MISMATCH',
          severity: 'warn',
          category: 'แบบประเมินที่ 1', quarter: '-', district: unit,
          message: 'คะแนนในไฟล์ = ' + r.score_0_to_5 + ' แต่ตามเกณฑ์ที่ประกาศควรได้ ' + expected +
            ' (เบิกสะสม ' + r.cumulative_disbursement_pct + '%, เอกสาร' + (r.documents_complete ? 'ครบ' : 'ไม่ครบ') +
            ', ค้างเงินยืม ' + (r.overdue_loan_contracts || 0) + ' สัญญา) — ควรตรวจสอบการให้คะแนนกับต้นทาง'
        });
      }
    });
    return { byDistrict: byDistrict, unmatched: unmatched, issues: issues };
  }

  function qualityReasons(r) {
    var out = [];
    out.push('เบิกจ่ายสะสมร้อยละ ' + (r.cumulative_disbursement_pct != null ? r.cumulative_disbursement_pct.toFixed(2) : '-'));
    out.push(r.documents_complete ? 'เอกสารการเงินครบถ้วน' : 'เอกสารการเงินยังไม่ครบถ้วน');
    if ((r.overdue_loan_contracts || 0) > 0) {
      out.push('สัญญายืมเงินค้างเกิน 30 วัน ' + r.overdue_loan_contracts + ' สัญญา');
    } else {
      out.push('ไม่มีสัญญายืมเงินค้างเกินกำหนด');
    }
    return out;
  }

  /* ---------- รายโครงการ (แกะจากบล็อกรายโครงการในชีตยุทธศาสตร์) ----------
     dedupe ข้ามชีตด้วย (project_no + อำเภอ + ไตรมาส): โครงการเดียวกันที่ปรากฏ
     ในชีตหลักและชีตรอง (เช่น เลขที่ 52 อยู่ทั้ง "ยุทธเข้าประชุม" และ "จัดสรรกรมฯ")
     นับจากชีตแรกเท่านั้น — ชีตหลังถูกข้ามพร้อมแจ้งเตือน (กฎทองข้อ 5)
     หมายเหตุ: กิจกรรมย่อยหลายคอลัมน์ของโครงการเดียวกัน "ในชีตเดียวกัน" ไม่ใช่ข้อมูลซ้ำ */
  function processProjects(rawEntries) {
    var issues = [];
    var seen = {};      // no|district|quarter -> ชีตแรกที่พบ
    var groups = {};    // key โครงการ -> aggregate
    var order = [];

    (rawEntries || []).forEach(function (p) {
      var key = p.no ? 'no:' + p.no : 'nm:' + canon(p.name || '');
      if (!groups[key]) {
        groups[key] = {
          key: key, no: p.no || null, name: p.name || '',
          quarters: {}, sheets: {}, allocated: 0, disbursed: 0,
          byDistrict: {}, flags: []
        };
        order.push(key);
      }
      var g = groups[key];
      if ((p.name || '').length > g.name.length) g.name = p.name;
      g.quarters[p.quarter] = true;
      g.sheets[p.sheet] = true;

      (p.rows || []).forEach(function (r) {
        var unit = resolveUnit(r.d);
        if (!unit) return;
        var a = isNum(r.a) ? r.a : 0;
        var b = isNum(r.b) ? r.b : 0;
        if (isRefError(r.a) || isRefError(r.b)) {
          issues.push({
            type: 'REF_ERROR', severity: 'error',
            category: 'รายโครงการ', quarter: p.quarter, district: unit,
            message: 'พบ #REF! ในคอลัมน์โครงการ "' + (p.no || p.name) + '"'
          });
          return;
        }

        // dedupe ข้ามชีต (เฉพาะโครงการที่มีเลขที่กำกับ)
        if (p.no) {
          var dk = p.no + '|' + unit + '|' + p.quarter;
          if (seen[dk] && seen[dk] !== p.sheet) {
            issues.push({
              type: 'DUP_PROJECT', severity: 'warn',
              category: 'รายโครงการ', quarter: p.quarter, district: unit,
              message: 'เลขที่ ' + p.no + ' (' + unit + ') ปรากฏทั้งชีต "' + seen[dk] + '" และ "' + p.sheet +
                '" — ระบบนับจากชีตแรกเท่านั้น เพื่อไม่ให้ยอดซ้ำ ควรตรวจสอบว่าตัวเลขสองชีตตรงกันหรือไม่'
            });
            return;
          }
          seen[dk] = p.sheet;
        }

        g.allocated += a; g.disbursed += b;
        if (!g.byDistrict[unit]) g.byDistrict[unit] = { allocated: 0, disbursed: 0 };
        g.byDistrict[unit].allocated += a;
        g.byDistrict[unit].disbursed += b;
      });
    });

    var list = order.map(function (k) {
      var g = groups[k];
      g.pct = g.allocated > 0 ? +(g.disbursed / g.allocated * 100).toFixed(2) : null;
      if (g.pct !== null && g.pct > 100.0001) g.flags.push('PCT_OVER_100');
      g.remaining = g.allocated - g.disbursed;
      g.districtCount = Object.keys(g.byDistrict).length;
      g.quarterList = Object.keys(g.quarters);

      // ระดับดำเนินการ: จาก key ใน byDistrict ที่มีอยู่แล้ว (ไม่ต้องเติมข้อมูลใหม่)
      var hasProvince = !!g.byDistrict[PROVINCE_UNIT];
      var hasDistrict = Object.keys(g.byDistrict).some(function (u) { return u !== PROVINCE_UNIT; });
      g.level = (hasProvince && hasDistrict) ? 'mixed' : (hasProvince ? 'province' : 'district');

      var wg = inferWorkGroup(g.name);
      g.workGroup = wg.workGroup;
      g.workGroupInferred = wg.workGroupInferred;
      g.kpi = buildKpi(g.workGroup, g.pct);
      g.attachment = g.attachment_url || null;

      return g;
    }).filter(function (g) { return g.allocated > 0 || g.disbursed > 0; });

    // เรียงตามเลขที่โครงการ (ตัวเลขก่อน) แล้วตามชื่อ
    list.sort(function (x, y) {
      var nx = x.no ? parseFloat(x.no) : Infinity;
      var ny = y.no ? parseFloat(y.no) : Infinity;
      if (nx !== ny) return nx - ny;
      return x.name.localeCompare(y.name, 'th');
    });

    return { list: list, issues: issues };
  }

  /* ---------- Enrichment Layer: โคกหนองนา (กฎทองข้อ 5 — ห้ามบวกยอดเงินซ้ำ) ---------- */
  function processKokNongNa(rawRows) {
    var byDistrict = {}, dropped = [];
    (rawRows || []).forEach(function (r) {
      if (canon(r.district) === canon(TOTAL_ROW)) { dropped.push(r); return; }
      var unit = resolveUnit(r.district);
      if (!unit) { dropped.push(r); return; }
      byDistrict[unit] = {
        district: unit,
        plots: r.plots,                       // มิติเสริม: จำนวนแปลง
        supervisorFee: r.supervisor_fee,      // มิติเสริม: ค่าตอบแทนผู้ควบคุมงาน
        // ตัวเลขเงินด้านล่างเก็บไว้ "แสดงอ้างอิง" เท่านั้น — ห้าม sum เข้ายอดรวมทุกกรณี
        refAmount: r.amount, refDisbursed: r.disbursed,
        refPoCommitted: r.po_committed, refReturned: r.returned_to_dept
      };
    });
    return { byDistrict: byDistrict, dropped: dropped };
  }

  /* ---------- รวมยอด (YTD) ---------- */
  function aggregate(rows) {
    var byUnitCat = {};   // unit|category -> {allocated,disbursed,quarters:{}}
    var byUnit = {};      // unit -> รวมทุกหมวด
    var byCat = {};       // category -> รวมทุกหน่วย
    var province = { allocated: 0, disbursed: 0 };

    rows.forEach(function (r) {
      var kc = r.unit + '|' + r.category;
      if (!byUnitCat[kc]) byUnitCat[kc] = { unit: r.unit, category: r.category, allocated: 0, disbursed: 0, quarters: {}, flags: [] };
      var uc = byUnitCat[kc];
      uc.allocated += r.allocated; uc.disbursed += r.disbursed;
      if (!uc.quarters[r.quarter]) uc.quarters[r.quarter] = { allocated: 0, disbursed: 0 };
      uc.quarters[r.quarter].allocated += r.allocated;
      uc.quarters[r.quarter].disbursed += r.disbursed;
      r.flags.forEach(function (f) { if (uc.flags.indexOf(f) < 0) uc.flags.push(f); });

      if (!byUnit[r.unit]) byUnit[r.unit] = { unit: r.unit, allocated: 0, disbursed: 0, flags: [] };
      byUnit[r.unit].allocated += r.allocated;
      byUnit[r.unit].disbursed += r.disbursed;
      r.flags.forEach(function (f) { if (byUnit[r.unit].flags.indexOf(f) < 0) byUnit[r.unit].flags.push(f); });

      if (!byCat[r.category]) byCat[r.category] = { category: r.category, allocated: 0, disbursed: 0 };
      byCat[r.category].allocated += r.allocated;
      byCat[r.category].disbursed += r.disbursed;

      province.allocated += r.allocated;
      province.disbursed += r.disbursed;
    });

    function finalize(o) {
      o.remaining = o.allocated - o.disbursed;
      o.pct = o.allocated > 0 ? +(o.disbursed / o.allocated * 100).toFixed(2) : null;
      return o;
    }
    Object.keys(byUnitCat).forEach(function (k) { finalize(byUnitCat[k]); });
    Object.keys(byUnit).forEach(function (k) { finalize(byUnit[k]); });
    Object.keys(byCat).forEach(function (k) { finalize(byCat[k]); });
    finalize(province);

    return { byUnitCat: byUnitCat, byUnit: byUnit, byCat: byCat, province: province };
  }

  /* ---------- ดัชนีสุขภาพ (หัวข้อ 8.3) — น้ำหนักปรับได้จาก config ---------- */
  function healthIndex(unitAgg, quality, expectedPct, weights) {
    var w = weights || { pace: 50, compliance: 30, data: 20 };
    var parts = [], totalW = 0, sum = 0;

    if (unitAgg && unitAgg.pct !== null) {
      var paceScore = expectedPct > 0 ? Math.min(100, unitAgg.pct / expectedPct * 100) : 100;
      parts.push({ key: 'pace', label: 'จังหวะการเบิกจ่าย', score: Math.round(paceScore), weight: w.pace });
    }
    if (quality) {
      var comp = 100;
      if (!quality.documentsComplete) comp -= 40;
      comp -= Math.min(60, (quality.overdueLoanContracts || 0) * 15);
      parts.push({ key: 'compliance', label: 'การปฏิบัติตามระเบียบ', score: Math.max(0, comp), weight: w.compliance });
    }
    var flagCount = unitAgg ? unitAgg.flags.length : 0;
    parts.push({ key: 'data', label: 'ความสมบูรณ์ของข้อมูล', score: Math.max(0, 100 - flagCount * 30), weight: w.data });

    parts.forEach(function (p) { totalW += p.weight; sum += p.score * p.weight; });
    return { index: totalW > 0 ? Math.round(sum / totalW) : null, parts: parts };
  }

  /* ---------- สร้างโมเดลรวมสำหรับ UI ---------- */
  function buildModel(seed, config, now) {
    var cfg = config || {};
    var threshold = cfg.paceThreshold != null ? cfg.paceThreshold : 10;
    var weights = cfg.weights || { pace: 50, compliance: 30, data: 20 };
    var fy = cfg.fiscalYear || 2569;

    var fis = fiscalInfo(now || new Date(), fy);
    var budget = processBudget(seed.budget || [], fy);
    var quality = processQuality(seed.quality || []);
    var knn = processKokNongNa(seed.kokNongNa || []);
    var projects = processProjects(seed.projects || []);
    var regulations = processRegulations(seed.regulations || []);
    var agg = aggregate(budget.rows);

    // สถานะรายอำเภอ (เฉพาะ 18 อำเภอ — หน่วย "จังหวัด" แสดงแยก)
    var districts = MASTER_DISTRICTS.map(function (d) {
      var u = agg.byUnit[d] || null;
      var q = quality.byDistrict[d] || null;
      var status = u ? paceStatus(u.pct, fis.expectedPacePct, threshold) : 'gray';
      var needsCheck = u && u.flags.length > 0;
      var health = healthIndex(u, q, fis.expectedPacePct, weights);
      return {
        district: d,
        agg: u, quality: q,
        enrichment: knn.byDistrict[d] || null,
        status: status, needsCheck: needsCheck,
        health: health
      };
    });

    // หมวดที่ข้อมูลพังทั้งก้อน (#REF! ครบทุกแถว)
    var refCats = {};
    budget.issues.forEach(function (i) {
      if (i.type === 'REF_ERROR') refCats[i.category] = (refCats[i.category] || 0) + 1;
    });

    // Early warning: อำเภอที่ควรสนับสนุน (แดง/เหลือง) + คุณภาพที่ควรติดตาม
    var warnings = [];
    districts.forEach(function (d) {
      if (d.status === 'red' || d.status === 'yellow') {
        warnings.push({
          kind: 'pace', district: d.district, status: d.status,
          message: 'เบิกจ่ายสะสม ' + (d.agg && d.agg.pct !== null ? d.agg.pct.toFixed(1) : '-') +
            '% ต่ำกว่าจังหวะเวลาที่ควรจะเป็น (' + fis.expectedPacePct + '%)',
          suggestion: d.status === 'red'
            ? 'ควรประสานทีมจังหวัดลงไปสนับสนุน เร่งลงนามสัญญา/ตรวจใบสำคัญที่ค้างก่อนสิ้นไตรมาส'
            : 'ควรติดตามแผนการเบิกจ่ายเดือนถัดไปให้กลับมาตามจังหวะ'
        });
      }
      if (d.quality && !d.quality.documentsComplete) {
        warnings.push({
          kind: 'docs', district: d.district, status: 'yellow',
          message: 'เอกสารหลักฐานทางการเงินยังไม่ครบถ้วน',
          suggestion: 'ควรติดตามใบสำคัญ/หลักฐานการเงินที่ค้างส่ง'
        });
      }
      if (d.quality && d.quality.overdueLoanContracts > 0) {
        warnings.push({
          kind: 'loan', district: d.district,
          status: d.quality.overdueLoanContracts > 4 ? 'red' : 'yellow',
          message: 'สัญญายืมเงินค้างส่งใช้เกิน 30 วัน ' + d.quality.overdueLoanContracts + ' สัญญา',
          suggestion: 'ควรเร่งรัดการส่งใช้เงินยืมและวางแผนยืมเงินรอบถัดไปให้พอดีงาน'
        });
      }
    });

    return {
      fiscal: fis,
      config: { paceThreshold: threshold, weights: weights, fiscalYear: fy },
      budget: budget, qualityData: quality, kokNongNa: knn,
      projects: projects,
      regulations: regulations,
      agg: agg, districts: districts,
      issues: budget.issues.concat(quality.issues || []).concat(projects.issues || []).concat(regulations.issues || []), warnings: warnings,
      refBrokenCategories: Object.keys(refCats),
      flagships: FLAGSHIP_PROJECTS
    };
  }

  /* ---------- format helpers ---------- */
  function fmtBaht(n) {
    if (n === null || n === undefined || !isFinite(n)) return '-';
    return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function fmtShort(n) {
    if (n === null || n === undefined || !isFinite(n)) return '-';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' ล้าน';
    return n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
  }

  return {
    MASTER_DISTRICTS: MASTER_DISTRICTS,
    PROVINCE_UNIT: PROVINCE_UNIT,
    CATEGORIES: CATEGORIES,
    PROVINCE_ONLY_CATEGORIES: PROVINCE_ONLY_CATEGORIES,
    FLAGSHIP_PROJECTS: FLAGSHIP_PROJECTS,
    WORK_GROUPS: WORK_GROUPS,
    WORK_GROUP_KEYWORDS: WORK_GROUP_KEYWORDS,
    KPI_TEMPLATES: KPI_TEMPLATES,
    KPI_LABEL: KPI_LABEL,
    SYNONYMS: SYNONYMS,
    STATUS_META: STATUS_META,
    canon: canon,
    resolveUnit: resolveUnit,
    fiscalInfo: fiscalInfo,
    paceStatus: paceStatus,
    officialScore: officialScore,
    inferWorkGroup: inferWorkGroup,
    processBudget: processBudget,
    processQuality: processQuality,
    processKokNongNa: processKokNongNa,
    processProjects: processProjects,
    processRegulations: processRegulations,
    matchQuery: matchQuery,
    aggregate: aggregate,
    healthIndex: healthIndex,
    buildModel: buildModel,
    fmtBaht: fmtBaht,
    fmtShort: fmtShort
  };
})();
