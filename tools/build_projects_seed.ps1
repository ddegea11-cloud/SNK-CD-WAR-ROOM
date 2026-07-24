# =========================================================================
# build_projects_seed.ps1 — แกะข้อมูล "รายโครงการ" จากไฟล์ Excel ต้นฉบับ
# แล้วสร้าง app/data/projects.js สำหรับ Dashboard (เฟส 1)
# วิธีใช้: เปิด PowerShell ในโฟลเดอร์โปรเจกต์ แล้วรัน  .\tools\build_projects_seed.ps1
# รันซ้ำได้ทุกครั้งที่ไฟล์ Excel ถูกอัปเดต
# =========================================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$xlsx = Join-Path $root "2569 เปอร์เซนต์ ผลการเบิกจ่าย .xlsx"
$outFile = Join-Path $root "app\data\projects.js"

# ---------- 1) unzip xlsx ----------
$tmp = Join-Path $env:TEMP ("xlsx_extract_" + [guid]::NewGuid().ToString('N'))
$zip = "$tmp.zip"
Copy-Item $xlsx $zip
Expand-Archive -Path $zip -DestinationPath $tmp -Force
Remove-Item $zip

# ---------- 2) shared strings / sheet map ----------
function Get-SiText($si) {
    if ($si.t -ne $null) { if ($si.t -is [string]) { return $si.t } else { return [string]$si.t.'#text' } }
    $s = ''
    foreach ($r in @($si.r)) { if ($r -and $r.t -ne $null) { if ($r.t -is [string]) { $s += $r.t } else { $s += [string]$r.t.'#text' } } }
    return $s
}
[xml]$ssXml = Get-Content -Raw -Encoding UTF8 (Join-Path $tmp "xl\sharedStrings.xml")
$shared = @(); foreach ($si in $ssXml.sst.si) { $shared += ,(Get-SiText $si) }

[xml]$wbXml = Get-Content -Raw -Encoding UTF8 (Join-Path $tmp "xl\workbook.xml")
[xml]$relXml = Get-Content -Raw -Encoding UTF8 (Join-Path $tmp "xl\_rels\workbook.xml.rels")
$relMap = @{}; foreach ($rel in $relXml.Relationships.Relationship) { $relMap[$rel.Id] = $rel.Target }
$sheetFile = @{}
foreach ($sh in $wbXml.workbook.sheets.sheet) {
    $rid = $sh.GetAttribute('r:id')
    $target = $relMap[$rid] -replace '^/xl/', '' -replace '^worksheets/', 'worksheets/'
    if ($target -notmatch '^worksheets') { $target = "worksheets/" + (Split-Path $target -Leaf) }
    $sheetFile[$sh.name] = Join-Path $tmp ("xl\" + ($target -replace '/', '\'))
}

# ---------- 3) cell grid + merge propagation ----------
function ColIndex([string]$letters) {
    $n = 0; foreach ($ch in $letters.ToCharArray()) { $n = $n * 26 + ([int]$ch - 64) }; return $n
}
function Load-Sheet([string]$path) {
    [xml]$x = Get-Content -Raw -Encoding UTF8 $path
    $grid = @{}   # "r,c" -> string value ('' = empty); errors เก็บเป็น "#REF!" ตามจริง
    $maxR = 0
    foreach ($row in $x.worksheet.sheetData.row) {
        foreach ($c in @($row.c)) {
            if ($c -eq $null) { continue }
            $ref = $c.r; if (-not $ref) { continue }
            if ($ref -notmatch '^([A-Z]+)([0-9]+)$') { continue }
            $ci = ColIndex $Matches[1]; $ri = [int]$Matches[2]
            if ($ri -gt $maxR) { $maxR = $ri }
            $t = $c.t; $v = $null
            if ($c.v -ne $null) { if ($c.v -is [string]) { $v = $c.v } else { $v = [string]$c.v.'#text' } }
            $val = ''
            if ($t -eq 's' -and $v -ne $null) { $val = $shared[[int]$v] }
            elseif ($t -eq 'e') { $val = $v }                      # เซล error เช่น #REF!
            elseif ($t -eq 'inlineStr') { $val = Get-SiText $c.is }
            elseif ($t -eq 'str') { $val = $v }
            elseif ($v -ne $null) { $val = $v }                     # ตัวเลข (รวมผลสูตรที่ cache ไว้)
            $grid["$ri,$ci"] = $val
        }
    }
    # กระจายค่าจากเซลหลักของ merge range ไปทุกเซลในช่วง (จำเป็นต่อการอ่านชื่อโครงการ)
    if ($x.worksheet.mergeCells) {
        foreach ($m in $x.worksheet.mergeCells.mergeCell) {
            if ($m.ref -match '^([A-Z]+)([0-9]+):([A-Z]+)([0-9]+)$') {
                $c1 = ColIndex $Matches[1]; $r1 = [int]$Matches[2]
                $c2 = ColIndex $Matches[3]; $r2 = [int]$Matches[4]
                $master = $grid["$r1,$c1"]
                if ($master) {
                    for ($r = $r1; $r -le $r2; $r++) { for ($c = $c1; $c -le $c2; $c++) { $grid["$r,$c"] = $master } }
                }
            }
        }
    }
    return @{ grid = $grid; maxR = $maxR }
}

# ---------- 4) master districts + canon (ตรงกับ etl.js) ----------
$MASTER = @('เมืองสกลนคร','สว่างแดนดิน','วานรนิวาส','พรรณานิคม','บ้านม่วง','อากาศอำนวย','วาริชภูมิ','กุสุมาลย์','กุดบาก','พังโคน','ส่องดาว','คำตากล้า','เต่างอย','นิคมน้ำอูน','โคกศรีสุพรรณ','เจริญศิลป์','โพนนาแก้ว','ภูพาน')
function Canon([string]$s) {
    if (-not $s) { return '' }
    $s = $s.Normalize([Text.NormalizationForm]::FormC) -replace '\s',''
    $out = New-Object Text.StringBuilder
    $prev = [char]0
    foreach ($ch in $s.ToCharArray()) { if ($ch -ne $prev) { [void]$out.Append($ch); $prev = $ch } }
    return $out.ToString()
}
$CMAP = @{}; foreach ($d in $MASTER) { $CMAP[(Canon $d)] = $d }
$CMAP[(Canon 'จังหวัด')] = 'จังหวัด'
function ResolveUnit([string]$s) { $c = Canon $s; if ($CMAP.ContainsKey($c)) { return $CMAP[$c] } return $null }

function CellText($sheet, [int]$r, [int]$c) { $v = $sheet.grid["$r,$c"]; if ($v -eq $null) { return '' } return [string]$v }
function CellNum($sheet, [int]$r, [int]$c) {
    $v = CellText $sheet $r $c
    if ($v -eq '') { return $null }
    if ($v -match '^#') { return $v }   # error เช่น #REF! ส่งต่อตามจริง
    $n = 0.0
    if ([double]::TryParse(($v -replace ',', ''), [ref]$n)) { return $n }
    return $null
}

# ---------- 5) block parser (port ตรงจาก tests/extract.html) ----------
function Extract-Sheet($sheet, [string]$sheetName, [string]$quarter) {
    $projects = New-Object Collections.ArrayList
    $maxC = 30
    $headerRows = @()
    for ($r = 1; $r -le $sheet.maxR; $r++) {
        $groups = @()
        for ($c = 1; $c -le $maxC; $c++) {
            $t = (CellText $sheet $r $c).Trim()
            if ($t -eq 'จัดสรร' -and (CellText $sheet $r ($c+1)) -match 'เบิกจ่าย') {
                if ((CellText $sheet $r ($c+3)) -match 'ร้อยละ') { continue } # ตารางสรุป — ข้าม (มีใน budget_summary แล้ว)
                $groups += ,@{ alloc = $c; disb = $c + 1 }
            }
        }
        if ($groups.Count) { $headerRows += ,@{ row = $r; groups = $groups } }
    }
    for ($hi = 0; $hi -lt $headerRows.Count; $hi++) {
        $h = $headerRows[$hi]
        $endRow = if ($hi + 1 -lt $headerRows.Count) { $headerRows[$hi+1].row - 4 } else { $sheet.maxR }
        foreach ($g in $h.groups) {
            $name = ''; $period = ''
            for ($up = 1; $up -le 6; $up++) {
                $t = ((CellText $sheet ($h.row - $up) $g.alloc) -replace '\s+', ' ').Trim()
                if (-not $t) { continue }
                if ($t -match '^ไตรมาส\s*[0-9]') { if (-not $period) { $period = $t }; continue }
                if ($t -match '^จัดสรร|^เบิกจ่าย|^คงเหลือ|^ร้อยละ') { continue }
                if ($t -notmatch '[ก-ฮ]') { continue }
                if ($t.Length -gt 6 -and -not $name) { $name = $t; break }
            }
            $no = $null
            if ($name -match 'เลขที่\s*([0-9]+(?:/[0-9]+)?)') { $no = $Matches[1] }
            $rows = New-Object Collections.ArrayList
            for ($r2 = $h.row + 1; $r2 -le $endRow; $r2++) {
                $dname = (CellText $sheet $r2 2).Trim(); if (-not $dname) { $dname = (CellText $sheet $r2 1).Trim() }
                if (-not $dname) { continue }
                if ($dname -match 'หมายเหตุ|เกณฑ์|ลงชื่อ') { break }
                $unit = ResolveUnit $dname
                $isTotal = (Canon $dname) -eq (Canon 'รวม')
                if (-not $unit -and -not $isTotal) { continue }
                if ($isTotal) { continue }
                $a = CellNum $sheet $r2 $g.alloc; $b = CellNum $sheet $r2 $g.disb
                if ($a -eq $null -and $b -eq $null) { continue }
                [void]$rows.Add([ordered]@{ d = $unit; a = $a; b = $b })
            }
            if ($rows.Count) {
                $nm = $name; if ($nm.Length -gt 140) { $nm = $nm.Substring(0, 140) }
                [void]$projects.Add([ordered]@{ no = $no; name = $nm; period = $period; quarter = $quarter; sheet = $sheetName; rows = $rows })
            }
        }
    }
    return $projects
}

# ---------- 6) รันกับ 3 ชีตยุทธศาสตร์ ----------
$targets = @(
    @('1.ยุทธเข้าประชุม ไตร 1-2', 'ไตร1-2'),
    @('1.ยุทธเข้าประชุม ไตร 3-4', 'ไตร3-4'),
    @('งบยุทธจังหวัดจัดสรรกรมฯ ไตร 3-4', 'ไตร3-4')
)
$all = New-Object Collections.ArrayList
foreach ($pair in $targets) {
    if (-not $sheetFile.ContainsKey($pair[0])) { Write-Warning ("ไม่พบชีต: " + $pair[0]); continue }
    $sheet = Load-Sheet $sheetFile[$pair[0]]
    $items = Extract-Sheet $sheet $pair[0] $pair[1]
    foreach ($p in $items) { [void]$all.Add($p) }
    Write-Host ($pair[0] + " -> " + $items.Count + " รายการ")
}

# ---------- 7) checksum + เขียนไฟล์ ----------
$rowCount = 0; $sumA = 0.0; $sumB = 0.0
foreach ($p in $all) { foreach ($r in $p.rows) { $rowCount++; if ($r.a -is [double]) { $sumA += $r.a }; if ($r.b -is [double]) { $sumB += $r.b } } }
Write-Host ("CHECKSUM projects=" + $all.Count + " rows=" + $rowCount + " sumAlloc=" + [math]::Round($sumA) + " sumDisb=" + [math]::Round($sumB))

$json = ConvertTo-Json -InputObject $all -Depth 6 -Compress
[IO.File]::WriteAllText($outFile, "window.SEED_PROJECTS = " + $json + ";", (New-Object Text.UTF8Encoding($true)))
Write-Host ("เขียนไฟล์แล้ว: " + $outFile + " (" + (Get-Item $outFile).Length + " bytes)")

Remove-Item -Recurse -Force $tmp
