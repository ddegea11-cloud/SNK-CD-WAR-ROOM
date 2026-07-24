/* =========================================================================
 * ค่าตั้งต้นของระบบ — จุดเดียวที่ต้องแก้เมื่อขึ้นเฟส 3 (เชื่อม Google Sheets จริง)
 * ========================================================================= */
window.APP_CONFIG = {
  /* เฟส 2 (ทางเลือก Supabase): ใส่ URL โปรเจกต์ + anon public key
     แล้วระบบจะสลับจาก seed data เป็น Supabase อัตโนมัติ — UI ไม่ต้องแก้
     ค่า anon key ถูกออกแบบให้เปิดเผยฝั่ง client ได้ (Supabase RLS เป็นผู้ป้องกันจริง
     ดู supabase/schema.sql — อนุญาตแค่ SELECT เท่านั้น) ห้ามใส่ service_role key ที่นี่เด็ดขาด
     ตัวอย่าง: supabaseUrl: 'https://xxxx.supabase.co', supabaseAnonKey: 'eyJ...' */
  supabaseUrl: 'https://kphgornxgmcxojuumkkf.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwaGdvcm54Z21jeG9qdXVta2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NzAxMDAsImV4cCI6MjEwMDQ0NjEwMH0.cSqyt19zonqsRXslnfhR3Pbk2_yAYIch64rlyokMuBM',

  /* เฟส 3 (ทางเลือกเดิม): ใส่ URL ของ Google Apps Script Web App (doGet ที่คืน JSON)
     แล้วระบบจะสลับจาก seed data เป็นข้อมูลจริงอัตโนมัติ — UI ไม่ต้องแก้
     ตัวอย่าง: appsScriptUrl: 'https://script.google.com/macros/s/XXXX/exec' */
  appsScriptUrl: null,

  /* ระบบ BPM ของกรมการพัฒนาชุมชน (bpm.cdd.go.th) มีอยู่จริง แต่เรายังไม่มีสิทธิ์เข้าถึง/เชื่อมต่อจริง
     การ์ดในหน้ารายโครงการจึงต้องแสดง mockStatusLabel นี้เสมอ ห้ามแสดงเป็นสถานะเชื่อมต่อจริง */
  bpm: {
    url: 'https://bpm.cdd.go.th',
    mockStatusLabel: 'ตัวอย่าง — ยังไม่ได้เชื่อมต่อจริง'
  }
};
