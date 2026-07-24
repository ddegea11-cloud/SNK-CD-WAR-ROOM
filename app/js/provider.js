/* =========================================================================
 * Data Provider Layer — แยก "แหล่งข้อมูล" ออกจาก UI (หัวข้อ 6 + 12)
 * เฟส 1: SeedDataProvider อ่านจากไฟล์ seed ที่ฝังมากับแอป
 * เฟส 3: เปลี่ยนเป็น AppsScriptProvider โดย UI ไม่ต้องแก้แม้แต่บรรทัดเดียว —
 *         แค่ตั้งค่า window.APP_CONFIG.appsScriptUrl แล้วระบบเลือก provider ให้เอง
 * ========================================================================= */
window.DataProviders = (function () {
  'use strict';

  var SeedDataProvider = {
    name: 'seed',
    sourceLabel: 'ข้อมูลตัวอย่าง (seed data จากไฟล์ Excel ปีงบ 2569)',
    load: function () {
      return Promise.resolve({
        budget: window.SEED_BUDGET || [],
        quality: window.SEED_QUALITY || [],
        kokNongNa: window.SEED_KOKNONGNA || [],
        projects: window.SEED_PROJECTS || [],  // แกะจาก Excel ด้วย tools/build_projects_seed.ps1
        regulations: window.SEED_REGULATIONS || [],
        lastUpdated: null // seed ไม่มี timestamp จริง — UI จะแสดงว่าเป็นข้อมูลตัวอย่าง
      });
    }
  };

  /* เฟส 2 ทางเลือก — ดึงข้อมูลตรงจาก Supabase (Postgres) ผ่าน REST API (PostgREST)
     ใช้ fetch() ธรรมดาแบบเดียวกับ AppsScriptProvider ไม่ต้องพึ่งไลบรารี supabase-js —
     ต้องคืนรูปร่างเดียวกับ seed เป๊ะ (ดู supabase/schema.sql สำหรับตาราง/คอลัมน์จริง)
     คำเตือน: supabaseAnonKey ถูกออกแบบให้เปิดเผยฝั่ง client ได้ — ความปลอดภัยจริงมาจาก
     Row Level Security (RLS) ฝั่ง Supabase ที่อนุญาตแค่ SELECT เท่านั้น ห้ามใส่ service_role key ที่นี่ */
  function SupabaseProvider(url, anonKey) {
    var REST = url.replace(/\/+$/, '') + '/rest/v1/';
    var HEADERS = { apikey: anonKey, Authorization: 'Bearer ' + anonKey };

    function get(table, query) {
      return fetch(REST + table + (query || ''), { headers: HEADERS, cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('Supabase อ่านตาราง ' + table + ' ไม่สำเร็จ (HTTP ' + res.status + ')');
          return res.json();
        });
    }

    // แปลงแถว budget_rows กลับเป็นรูปดิบที่ etl.js คาดหวัง (รวมสัญลักษณ์ '#REF!')
    function toBudgetRow(r) {
      var refVal = function (v) { return r.ref_error ? '#REF!' : v; };
      return {
        category: r.category, quarter: r.quarter, no: r.line_no,
        district: r.district, fiscal_year: r.fiscal_year,
        allocated: refVal(r.allocated), disbursed: refVal(r.disbursed),
        remaining: refVal(r.remaining), pct: refVal(r.pct)
      };
    }
    function toQualityRow(r) {
      return {
        district: r.district, fiscal_year: r.fiscal_year,
        cumulative_disbursement_pct: r.cumulative_disbursement_pct,
        documents_complete: r.documents_complete,
        overdue_loan_contracts: r.overdue_loan_contracts,
        score_0_to_5: r.score_0_to_5, raw_summary: r.raw_summary
      };
    }
    function toKnnRow(r) {
      return {
        district: r.district, fiscal_year: r.fiscal_year,
        plots: r.plots, amount: r.amount, po_committed: r.po_committed,
        disbursed: r.disbursed, supervisor_fee: r.supervisor_fee,
        remaining: r.remaining, returned_to_dept: r.returned_to_dept
      };
    }
    function toRegulation(r) {
      return {
        id: r.id, title: r.title, issuer: r.issuer, sourceUrl: r.source_url,
        sourceType: r.source_type, workGroups: r.work_groups || [],
        keywords: r.keywords || [], summary: r.summary
      };
    }
    // project_entries ถูก query แบบฝัง (embed) project_entry_rows มาด้วยในคำเดียว
    // (PostgREST resource embedding ผ่าน foreign key) ได้รูป { ..., project_entry_rows: [...] }
    // ต้องแปลงกลับเป็น { no, name, period, quarter, sheet, rows:[{d,a,b}] } ตามที่ etl.js อ่าน
    function toProjectEntry(r) {
      var refFlag = (r.project_entry_rows || []).some(function (row) { return row.ref_error; });
      return {
        no: r.project_no, name: r.name, period: r.period,
        quarter: r.quarter, sheet: r.sheet_name,
        attachment_url: r.attachment_url,
        rows: (r.project_entry_rows || []).map(function (row) {
          return {
            d: row.district,
            a: row.ref_error ? '#REF!' : row.allocated,
            b: row.ref_error ? '#REF!' : row.disbursed
          };
        }),
        _refFlag: refFlag // เผื่อ debug — etl.js ไม่ได้อ่านฟิลด์นี้
      };
    }

    function maxTimestamp(rows, fields) {
      var max = null;
      rows.forEach(function (r) {
        fields.forEach(function (f) {
          if (r[f] && (!max || r[f] > max)) max = r[f];
        });
      });
      return max;
    }

    return {
      name: 'supabase',
      sourceLabel: 'Supabase (ฐานข้อมูลจริง)',
      load: function () {
        return Promise.all([
          get('budget_rows', '?select=*'),
          get('quality_evaluations', '?select=*'),
          get('kok_nong_na_enrichment', '?select=*'),
          get('regulations', '?select=*'),
          get('project_entries', '?select=id,project_no,name,period,quarter,sheet_name,attachment_url,project_entry_rows(district,allocated,disbursed,ref_error)')
        ]).then(function (res) {
          var budgetRaw = res[0], qualityRaw = res[1], knnRaw = res[2], regsRaw = res[3], projRaw = res[4];
          var lastUpdated = maxTimestamp(budgetRaw, ['updated_at'])
            || maxTimestamp(qualityRaw, ['updated_at'])
            || maxTimestamp(knnRaw, ['updated_at'])
            || maxTimestamp(regsRaw, ['updated_at']);
          return {
            budget: budgetRaw.map(toBudgetRow),
            quality: qualityRaw.map(toQualityRow),
            kokNongNa: knnRaw.map(toKnnRow),
            projects: projRaw.map(toProjectEntry),
            regulations: regsRaw.map(toRegulation),
            lastUpdated: lastUpdated
          };
        });
      }
    };
  }

  /* โครงสำหรับเฟส 3 (ทางเลือกเดิม) — ดึง JSON จาก Google Apps Script Web App (doGet)
     endpoint ต้องคืน { budget:[], quality:[], kokNongNa:[], lastUpdated:"ISO" } */
  function AppsScriptProvider(url) {
    return {
      name: 'apps-script',
      sourceLabel: 'Google Sheets (อัปเดตอัตโนมัติผ่าน Apps Script)',
      load: function (opts) {
        // force = ปุ่ม "รีเฟรชตอนนี้" → ขอให้ Apps Script ข้าม cache ฝั่ง server ด้วย
        var u = url + ((opts && opts.force) ? (url.indexOf('?') >= 0 ? '&' : '?') + 'nocache=1' : '');
        return fetch(u, { cache: 'no-store' }).then(function (res) {
          if (!res.ok) throw new Error('โหลดข้อมูลจาก Apps Script ไม่สำเร็จ (HTTP ' + res.status + ')');
          return res.json();
        });
      }
    };
  }

  function pick() {
    var cfg = window.APP_CONFIG || {};
    if (cfg.supabaseUrl && cfg.supabaseAnonKey) return SupabaseProvider(cfg.supabaseUrl, cfg.supabaseAnonKey);
    if (cfg.appsScriptUrl) return AppsScriptProvider(cfg.appsScriptUrl);
    return SeedDataProvider;
  }

  return {
    SeedDataProvider: SeedDataProvider,
    AppsScriptProvider: AppsScriptProvider,
    SupabaseProvider: SupabaseProvider,
    pick: pick
  };
})();
