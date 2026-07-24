-- =========================================================================
-- SNK-CD War Room — Supabase schema (เฟส 2 ทางเลือก: แทน Google Sheets)
-- -------------------------------------------------------------------------
-- ออกแบบให้ตรงกับ "รูปดิบ" ที่ app/js/etl.js คาดหวังจาก provider.load() ทุก
-- ประการ (ดู provider.js: SeedDataProvider / AppsScriptProvider คืนค่าเดียวกัน)
-- เพื่อไม่ต้องแก้ etl.js / app.js แม้แต่บรรทัดเดียวเมื่อสลับมาใช้ Supabase —
-- SupabaseProvider (ที่จะเพิ่มใน provider.js) มีหน้าที่ query ตารางเหล่านี้
-- แล้ว "คืนรูปร่างเดิม" ให้ etl.js เท่านั้น
--
-- วิธีใช้: วางไฟล์นี้ทั้งหมดใน Supabase Dashboard → SQL Editor → Run
-- (รันซ้ำได้ปลอดภัย - ใช้ CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS)
-- =========================================================================

-- ---------- 1. งบประมาณรายหน่วย (ตรงกับ SEED_BUDGET / ชีตงบประมาณ) ----------
create table if not exists budget_rows (
  id           bigint generated always as identity primary key,
  fiscal_year  integer not null default 2569,
  category     text not null,              -- เช่น 'งบบริหาร', 'งบยุทธศาสตร์', 'งบจังหวัด/กลุ่มจังหวัด'
  quarter      text not null,              -- เช่น 'ไตร1-2', 'ไตร3-4', 'ไตร4'
  line_no      numeric,                    -- เลขบรรทัดจากชีตต้นทาง (อ้างอิงเท่านั้น ไม่ใช้คำนวณ)
  district     text not null,              -- ชื่อหน่วยตามต้นทาง (ดิบ) — etl.js เป็นผู้ resolve/normalize เอง
  allocated    numeric,                    -- null เมื่อ ref_error = true
  disbursed    numeric,
  remaining    numeric,
  pct          numeric,
  ref_error    boolean not null default false,  -- แทนค่า '#REF!' ในต้นทาง (สูตรอ้างอิงชีตที่ถูกลบ)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_budget_rows_fy on budget_rows(fiscal_year);
create index if not exists idx_budget_rows_district on budget_rows(district);

-- ---------- 2. แบบประเมินที่ 1 (ตรงกับ SEED_QUALITY) ----------
create table if not exists quality_evaluations (
  id                          bigint generated always as identity primary key,
  fiscal_year                 integer not null default 2569,
  district                    text not null,
  cumulative_disbursement_pct numeric,
  documents_complete          boolean not null default false,
  overdue_loan_contracts      integer not null default 0,
  score_0_to_5                numeric,
  raw_summary                 text,
  updated_at                  timestamptz not null default now(),
  unique (fiscal_year, district)
);

-- ---------- 3. Enrichment: โคกหนองนา (ตรงกับ SEED_KOKNONGNA) ----------
-- กฎทองข้อ 5: ตัวเลขเงินในตารางนี้ใช้ "แสดงอ้างอิง" เท่านั้น ห้ามใครนำไป sum
-- รวมกับ budget_rows — etl.js (processKokNongNa) บังคับกฎนี้อยู่แล้วในโค้ด
create table if not exists kok_nong_na_enrichment (
  id                 bigint generated always as identity primary key,
  fiscal_year        integer not null default 2569,
  district           text not null,
  plots              numeric,               -- จำนวนแปลง (มิติเสริม ไม่ใช่เงิน)
  amount             numeric,               -- อ้างอิงเท่านั้น
  po_committed       numeric,
  disbursed          numeric,
  supervisor_fee     numeric,
  remaining          numeric,
  returned_to_dept   numeric,
  updated_at         timestamptz not null default now(),
  unique (fiscal_year, district)
);

-- ---------- 4. ระเบียบ/แนวทาง/คู่มือ (ตรงกับ SEED_REGULATIONS) ----------
create table if not exists regulations (
  id           text primary key,           -- เช่น 'reg-treasury-withdrawal-2562' (คงรูปแบบเดิม)
  title        text not null,
  issuer       text,
  source_url   text,
  source_type  text not null check (source_type in ('real','illustrative')),
  work_groups  text[] not null default '{}',
  keywords     text[] not null default '{}',
  summary      text,
  updated_at   timestamptz not null default now()
);

-- ---------- 5. รายโครงการ ----------
-- รูปดิบที่ etl.js (processProjects) ต้องการคือ
--   { no, name, period, quarter, sheet, rows: [{d, a, b}, ...] }
-- หนึ่ง "entry" = โครงการหนึ่งปรากฏในชีต/ไตรมาสหนึ่ง ๆ (มีได้หลาย entry ต่อ no เดียวกัน
-- เช่นปรากฏทั้งชีตหลักและชีตรอง — ให้ etl.js เป็นผู้ dedupe เองตามที่ออกแบบไว้เดิม)
create table if not exists project_entries (
  id             bigint generated always as identity primary key,
  fiscal_year    integer not null default 2569,
  project_no     text,                     -- เช่น '4/2569' — เป็น null ได้ (โครงการไม่มีเลขที่กำกับ)
  name           text not null,
  period         text,                     -- เช่น 'ไตรมาส 1'
  quarter        text not null,            -- เช่น 'ไตร1-2'
  sheet_name     text not null,            -- ชื่อชีตต้นทาง (ใช้ dedupe ข้ามชีต)
  attachment_url text,                     -- สำรองไว้เฟสถัดไป (เอกสาร PDF จริง) — ปัจจุบันเป็น null เสมอ
  created_at     timestamptz not null default now()
);
create index if not exists idx_project_entries_fy on project_entries(fiscal_year);
create index if not exists idx_project_entries_no on project_entries(project_no);

create table if not exists project_entry_rows (
  id         bigint generated always as identity primary key,
  entry_id   bigint not null references project_entries(id) on delete cascade,
  district   text not null,               -- ชื่อหน่วยดิบ (etl.js resolve เอง เหมือนตารางอื่น)
  allocated  numeric,                     -- null เมื่อ ref_error = true (เหมือน budget_rows)
  disbursed  numeric,
  ref_error  boolean not null default false
);
create index if not exists idx_project_entry_rows_entry on project_entry_rows(entry_id);

-- ---------- updated_at อัตโนมัติ (ใช้คำนวณ lastUpdated ฝั่ง provider) ----------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_budget_rows_updated on budget_rows;
create trigger trg_budget_rows_updated before update on budget_rows
  for each row execute function set_updated_at();

drop trigger if exists trg_quality_updated on quality_evaluations;
create trigger trg_quality_updated before update on quality_evaluations
  for each row execute function set_updated_at();

drop trigger if exists trg_knn_updated on kok_nong_na_enrichment;
create trigger trg_knn_updated before update on kok_nong_na_enrichment
  for each row execute function set_updated_at();

drop trigger if exists trg_regulations_updated on regulations;
create trigger trg_regulations_updated before update on regulations
  for each row execute function set_updated_at();

-- =========================================================================
-- Row Level Security — เว็บเป็น static SPA ฝั่ง client เห็น anon key ได้ทุกคน
-- จึงอนุญาตแค่ "อ่านอย่างเดียว" (SELECT) จาก anon/authenticated เท่านั้น
-- การเขียน/แก้ข้อมูลให้ทำผ่าน Supabase Table Editor (เจ้าของโปรเจกต์เท่านั้น)
-- หรือ service_role key ฝั่งเครื่องมือ import — ห้ามฝัง service_role ใน client
-- =========================================================================
alter table budget_rows            enable row level security;
alter table quality_evaluations    enable row level security;
alter table kok_nong_na_enrichment enable row level security;
alter table regulations            enable row level security;
alter table project_entries        enable row level security;
alter table project_entry_rows     enable row level security;

drop policy if exists "public read" on budget_rows;
create policy "public read" on budget_rows for select using (true);

drop policy if exists "public read" on quality_evaluations;
create policy "public read" on quality_evaluations for select using (true);

drop policy if exists "public read" on kok_nong_na_enrichment;
create policy "public read" on kok_nong_na_enrichment for select using (true);

drop policy if exists "public read" on regulations;
create policy "public read" on regulations for select using (true);

drop policy if exists "public read" on project_entries;
create policy "public read" on project_entries for select using (true);

drop policy if exists "public read" on project_entry_rows;
create policy "public read" on project_entry_rows for select using (true);

-- ไม่มี policy สำหรับ insert/update/delete ให้ anon/authenticated โดยตั้งใจ —
-- ภายใต้ RLS แปลว่าทุกฝั่ง client เขียนข้อมูลไม่ได้เลย (อ่านได้อย่างเดียว)
