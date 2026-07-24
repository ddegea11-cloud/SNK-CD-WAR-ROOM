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

  /* โครงสำหรับเฟส 3 — ดึง JSON จาก Google Apps Script Web App (doGet)
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
    if (cfg.appsScriptUrl) return AppsScriptProvider(cfg.appsScriptUrl);
    return SeedDataProvider;
  }

  return { SeedDataProvider: SeedDataProvider, AppsScriptProvider: AppsScriptProvider, pick: pick };
})();
