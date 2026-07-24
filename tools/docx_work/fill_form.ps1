# =========================================================================
# fill_form.ps1 — กรอกแบบฟอร์ม แบบพัฒนาโครงการนวัตกรรมรายบุคคล_CDD.docx
# โดยอ้างอิงจากโครงการ SNK-CD War Room ที่พัฒนาในเซสชันนี้
# ใช้ System.Xml.XmlDocument ตรงๆ (ไม่มี python/node/LibreOffice บนเครื่องนี้)
# =========================================================================
$ErrorActionPreference = 'Stop'
$work = "C:\Users\ACER2025\Desktop\ระบบสำนักงาน 69\tools\docx_work"
$docPath = Join-Path $work "unpacked\word\document.xml"

# ---------- ขั้นที่ 1: string-level replace (checkbox เดี่ยว + fill-in-the-blank) ----------
$raw = [IO.File]::ReadAllText($docPath, [Text.UTF8Encoding]::new($false))

$checkboxReplacements = @(
  @("☐ ใช้ข้อมูลเพื่อการตัดสินใจ", "☑ ใช้ข้อมูลเพื่อการตัดสินใจ"),
  @("☐ พัฒนาระบบดิจิทัลหรือ AI", "☑ พัฒนาระบบดิจิทัลหรือ AI"),
  @("☐ AI ไม่ตัดสินใจเรื่องสำคัญแทนมนุษย์โดยไม่มีการตรวจสอบ", "☑ AI ไม่ตัดสินใจเรื่องสำคัญแทนมนุษย์โดยไม่มีการตรวจสอบ"),
  @("☐ มีผู้รับผิดชอบตรวจสอบผลลัพธ์", "☑ มีผู้รับผิดชอบตรวจสอบผลลัพธ์"),
  @("☐ ไม่ป้อนข้อมูลลับหรือข้อมูลส่วนบุคคลเข้าสู่ระบบที่ไม่ได้รับอนุญาต", "☑ ไม่ป้อนข้อมูลลับหรือข้อมูลส่วนบุคคลเข้าสู่ระบบที่ไม่ได้รับอนุญาต"),
  @("☐ มีแหล่งข้อมูลอ้างอิง", "☑ มีแหล่งข้อมูลอ้างอิง"),
  @("☐ มีวิธีรับมือเมื่อ AI ตอบผิดหรือระบบไม่ทำงาน", "☑ มีวิธีรับมือเมื่อ AI ตอบผิดหรือระบบไม่ทำงาน"),
  @("☐ พร้อมแบบมีเงื่อนไข", "☑ พร้อมแบบมีเงื่อนไข"),
  @("☐ มีคู่มือหรือแนวปฏิบัติ", "☑ มีคู่มือหรือแนวปฏิบัติ"),
  @("☐ สามารถนำไปใช้ในพื้นที่อื่นได้", "☑ สามารถนำไปใช้ในพื้นที่อื่นได้"),
  # T33 checklist (checked items)
  @("☐ ปัญหาชัดเจน", "☑ ปัญหาชัดเจน"),
  @("☐ มีหลักฐานรองรับ", "☑ มีหลักฐานรองรับ"),
  @("☐ มีกลุ่มเป้าหมายชัดเจน", "☑ มีกลุ่มเป้าหมายชัดเจน"),
  @("☐ มีแนวทางแก้ไข", "☑ มีแนวทางแก้ไข"),
  @("☐ มี As-Is และ To-Be", "☑ มี As-Is และ To-Be"),
  @("☐ ระบุข้อมูลที่ต้องใช้", "☑ ระบุข้อมูลที่ต้องใช้"),
  @("☐ มีต้นแบบหรือภาพจำลอง", "☑ มีต้นแบบหรือภาพจำลอง"),
  @("☐ มีแผนความเสี่ยง", "☑ มีแผนความเสี่ยง"),
  @("☐ มีแผนขยายผล", "☑ มีแผนขยายผล"),
  @("☐ ระบุสิ่งที่ต้องการให้ผู้บริหารตัดสินใจ", "☑ ระบุสิ่งที่ต้องการให้ผู้บริหารตัดสินใจ")
)
foreach ($pair in $checkboxReplacements) {
    if ($raw.IndexOf($pair[0]) -lt 0) { throw "ไม่พบข้อความ: $($pair[0])" }
    $raw = $raw.Replace($pair[0], $pair[1])
}

$fillBlanks = @(
  @("Problem Statement: กลุ่มเป้าหมาย........................ กำลังเผชิญปัญหา........................ ในบริบท........................ เนื่องจาก........................ ส่งผลให้........................",
    "Problem Statement: กลุ่มเป้าหมาย ผู้บริหารจังหวัดและพัฒนาการอำเภอ 18 อำเภอ กำลังเผชิญปัญหา ไม่สามารถเห็นภาพรวมการเบิกจ่ายงบประมาณและตรวจพบความผิดปกติของข้อมูลได้ทันเวลา ในบริบท การรวบรวมข้อมูลจากไฟล์ Excel 14 ชีตด้วยมือทุกไตรมาส เนื่องจาก ไม่มีระบบตรวจสอบและแจ้งเตือนอัตโนมัติ ส่งผลให้ การตัดสินใจล่าช้า มีความเสี่ยงนับงบซ้ำซ้อน และเสียเวลาบุคลากรจำนวนมากในการสรุปรายงาน"),
  @("สรุปผลการเรียนรู้: สมมติฐานที่ยืนยัน........................ สมมติฐานที่ยังไม่จริง........................ ส่วนที่ต้องปรับเปลี่ยน........................",
    "สรุปผลการเรียนรู้: สมมติฐานที่ยืนยัน ระบบสามารถประมวลผลข้อมูลจากไฟล์ Excel รูปแบบเดิมได้ถูกต้องอัตโนมัติ (ยืนยันจาก unit test 19 ข้อ) สมมติฐานที่ยังไม่จริง (ต้องทดสอบเพิ่ม) ยังไม่ยืนยันว่าผู้บริหารเข้าใจสถานะสีได้ภายใน 5 วินาทีตามที่ออกแบบไว้ เนื่องจากยังไม่ได้ทดลองกับผู้ใช้จริง ส่วนที่ต้องปรับเปลี่ยน รอ feedback จากการทดลองใช้งานจริงก่อนสรุป")
)
foreach ($pair in $fillBlanks) {
    if ($raw.IndexOf($pair[0]) -lt 0) { throw "ไม่พบบรรทัด fill-in-blank: $($pair[0].Substring(0,40))..." }
    $raw = $raw.Replace($pair[0], $pair[1])
}

[IO.File]::WriteAllText($docPath, $raw, [Text.UTF8Encoding]::new($false))
Write-Host "ขั้นที่ 1 เสร็จ: string-level replace ($($checkboxReplacements.Count) checkbox + $($fillBlanks.Count) fill-in-blank)"

# ---------- ขั้นที่ 2: โหลด XML tree สำหรับแก้ตาราง ----------
$xmlDoc = New-Object System.Xml.XmlDocument
$xmlDoc.PreserveWhitespace = $true
$xmlDoc.Load($docPath)
$ns = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
$wNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
$ns.AddNamespace('w', $wNs)

function New-TextRun($doc, [string]$text, [bool]$red, [bool]$breakBefore) {
    $r = $doc.CreateElement('w', 'r', $wNs)
    if ($red) {
        $rPr = $doc.CreateElement('w', 'rPr', $wNs)
        $color = $doc.CreateElement('w', 'color', $wNs)
        $colorAttr = $doc.CreateAttribute('w', 'val', $wNs)
        $colorAttr.Value = 'FF0000'
        [void]$color.Attributes.Append($colorAttr)
        [void]$rPr.AppendChild($color)
        [void]$r.AppendChild($rPr)
    }
    if ($breakBefore) {
        $br = $doc.CreateElement('w', 'br', $wNs)
        [void]$r.AppendChild($br)
    }
    $t = $doc.CreateElement('w', 't', $wNs)
    $spaceAttr = $doc.CreateAttribute('xml', 'space', 'http://www.w3.org/XML/1998/namespace')
    $spaceAttr.Value = 'preserve'
    [void]$t.Attributes.Append($spaceAttr)
    $t.InnerText = $text
    [void]$r.AppendChild($t)
    return $r
}

function Set-CellContent($tc, [string[]]$mainLines, [string[]]$redLines) {
    $p = $tc.SelectSingleNode('w:p', $ns)
    if (-not $p) { throw "cell has no w:p" }
    $isFirst = $true
    foreach ($line in $mainLines) {
        $run = New-TextRun $xmlDoc $line $false (-not $isFirst)
        [void]$p.AppendChild($run)
        $isFirst = $false
    }
    foreach ($line in $redLines) {
        $run = New-TextRun $xmlDoc $line $true (-not $isFirst)
        [void]$p.AppendChild($run)
        $isFirst = $false
    }
}

$tables = $xmlDoc.SelectNodes('//w:tbl', $ns)
Write-Host ("พบตารางทั้งหมด: " + $tables.Count + " (ต้องเป็น 34)")
if ($tables.Count -ne 34) { throw "จำนวนตารางไม่ตรง คาดหวัง 34 พบ $($tables.Count)" }

function Get-DataRows($tbl) {
    $allRows = $tbl.SelectNodes('w:tr', $ns)
    return @($allRows | Select-Object -Skip 1)
}

# ---------- ขั้นที่ 3: กรอกตามแผน plan.json ----------
$plan = Get-Content -Raw -Encoding UTF8 (Join-Path $work "plan.json") | ConvertFrom-Json
$filledCount = 0
foreach ($tblPlan in $plan) {
    $tbl = $tables.Item([int]$tblPlan.t)
    $dataRows = Get-DataRows $tbl
    foreach ($cellPlan in $tblPlan.cells) {
        $row = $dataRows[[int]$cellPlan.r]
        if (-not $row) { throw "table $($tblPlan.t) row $($cellPlan.r) ไม่พบ" }
        $cells = $row.SelectNodes('w:tc', $ns)
        $tc = $cells.Item([int]$cellPlan.c)
        if (-not $tc) { throw "table $($tblPlan.t) row $($cellPlan.r) col $($cellPlan.c) ไม่พบ" }
        $mainArr = @(); if ($cellPlan.main) { $mainArr = @($cellPlan.main) }
        $redArr = @(); if ($cellPlan.red) { $redArr = @($cellPlan.red) }
        Set-CellContent $tc $mainArr $redArr
        $filledCount++
    }
}
Write-Host ("ขั้นที่ 3 เสร็จ: กรอกเซลทั้งหมด $filledCount เซล จาก plan.json")

# ---------- ขั้นที่ 4: Table 2 (หน้าสรุปความก้าวหน้า) — toggle checkbox สถานะต่อแถว ----------
$t2 = $tables.Item(2)
$t2Rows = Get-DataRows $t2
$t2Status = @('เสร็จแล้ว','เสร็จแล้ว','เสร็จแล้ว','กำลังดำเนินการ','กำลังดำเนินการ','เสร็จแล้ว','เสร็จแล้ว','ยังไม่เริ่ม','กำลังดำเนินการ','ยังไม่เริ่ม')
for ($i = 0; $i -lt $t2Rows.Count; $i++) {
    $cells = $t2Rows[$i].SelectNodes('w:tc', $ns)
    $statusCell = $cells.Item(1)
    $tNodes = $statusCell.SelectNodes('.//w:t', $ns)
    $target = $null
    foreach ($tn in $tNodes) { if ($tn.InnerText -eq ("☐ " + $t2Status[$i])) { $target = $tn; break } }
    if (-not $target) { throw "T2 row ${i}: ไม่พบเซลที่มีข้อความ '☐ $($t2Status[$i])' (พบ $($tNodes.Count) w:t nodes)" }
    $target.InnerText = "☑ " + $t2Status[$i]
}
Write-Host "ขั้นที่ 4 เสร็จ: toggle checkbox สถานะในตารางความก้าวหน้า (10 แถว)"

# ---------- ขั้นที่ 5: Table 33 (ภาคผนวก C) — append หมายเหตุ หลังคำว่า "หมายเหตุ:" ----------
$t33 = $tables.Item(33)
$t33Rows = Get-DataRows $t33
if ($t33Rows.Count -ne 15) { throw "T33 ควรมี 15 แถว พบ $($t33Rows.Count)" }
$t33Notes = @(
  @{ red=$false; text='มีหลักฐานจากไฟล์ Excel ต้นทางจริงประกอบ (ส่วนที่ 2)' },
  @{ red=$false; text='มีไฟล์ต้นทางและชีตประเมินคุณภาพอ้างอิง (ภาคผนวก A)' },
  @{ red=$false; text='ระบุ 3 กลุ่มผู้ใช้งานชัดเจน (ส่วนที่ 1 และ 3)' },
  @{ red=$false; text='มี Solution Canvas ครบถ้วน (ส่วนที่ 5)' },
  @{ red=$false; text='มีทั้งสองผัง แต่ As-Is ยังขาดข้อมูลระยะเวลาจริง (ส่วนที่ 4-5)' },
  @{ red=$false; text='ระบุครบในส่วนที่ 6' },
  @{ red=$true;  text='บางด้าน (ความสอดคล้องยุทธศาสตร์, ความถูกต้องตามระเบียบ, งบประมาณ) ยังประเมินไม่ได้ — ดูส่วนที่ 7' },
  @{ red=$false; text='มี Prototype ใช้งานได้จริงแล้ว (ส่วนที่ 9)' },
  @{ red=$true;  text='มีเฉพาะการทดสอบเชิงเทคนิค ยังไม่ได้ทดลองกับผู้ใช้จริง' },
  @{ red=$true;  text='มีลำดับกิจกรรม 4 ระยะ แต่ยังไม่มีกำหนดวันที่จริง (ส่วนที่ 11)' },
  @{ red=$true;  text='ยังไม่มีตัวเลขงบประมาณที่ยืนยันได้ (ส่วนที่ 11)' },
  @{ red=$true;  text='มีตัวชี้วัดบางส่วน แต่ยังไม่มี baseline/เป้าหมายที่ยืนยันได้ครบ (ส่วนที่ 12)' },
  @{ red=$false; text='ระบุความเสี่ยง 4 จาก 5 ข้อ พร้อมแผนป้องกัน (ส่วนที่ 10)' },
  @{ red=$false; text='มี Scaling Plan ครบถ้วน (ส่วนที่ 13)' },
  @{ red=$false; text='ระบุไว้ในบทสรุปผู้บริหาร (ส่วนที่ 14)' }
)
for ($i = 0; $i -lt $t33Rows.Count; $i++) {
    $cells = $t33Rows[$i].SelectNodes('w:tc', $ns)
    $noteCell = $cells.Item(1)
    $p = $noteCell.SelectSingleNode('w:p', $ns)
    $run = New-TextRun $xmlDoc (' ' + $t33Notes[$i].text) ([bool]$t33Notes[$i].red) $false
    [void]$p.AppendChild($run)
}
Write-Host "ขั้นที่ 5 เสร็จ: เติมหมายเหตุใน ภาคผนวก C (15 แถว)"

# ---------- ขั้นที่ 6: บันทึกไฟล์ ----------
$settings = New-Object System.Xml.XmlWriterSettings
$settings.Encoding = New-Object System.Text.UTF8Encoding($false)
$settings.OmitXmlDeclaration = $false
$settings.Indent = $false
$writer = [System.Xml.XmlWriter]::Create($docPath, $settings)
$xmlDoc.Save($writer)
$writer.Close()
Write-Host "ขั้นที่ 6 เสร็จ: บันทึก document.xml แล้ว"
