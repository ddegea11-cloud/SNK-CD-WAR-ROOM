# =========================================================================
# fill_deck.ps1 — เติมเนื้อหาโครงการ SNK-CD War Room ลงใน Template งาน 22 กค 2569
# ใช้ PowerPoint COM automation โดยตรง (มี Office ติดตั้งจริงในเครื่องนี้)
# =========================================================================
$ErrorActionPreference = 'Stop'
$path = "C:\Users\ACER2025\Downloads\Template งาน 22 กค 2569 เดี่ยว.pptx"

function RedRGB() { return 255 } # R=255,G=0,B=0 -> OLE COLOR = R + G*256 + B*65536 = 255

$ppt = New-Object -ComObject PowerPoint.Application
$pres = $ppt.Presentations.Open($path, $false, $true, $false)

Write-Host ("เปิดไฟล์แล้ว สไลด์ทั้งหมด (ก่อนแก้ไข): " + $pres.Slides.Count)

# ---------- จับ reference ของสไลด์ที่ต้องแก้ "ก่อน" duplication (กันปัญหา index เลื่อน) ----------
$slide3 = $pres.Slides.Item(3)   # Insight Transfer Matrix
$slide5 = $pres.Slides.Item(5)   # Feedback Capture Grid
$slideFinal = $pres.Slides.Item(11) # แบบสรุปข้อแก้ไขและการปรับผังรอบสุดท้าย

# ---------- Duplicate สไลด์ 10 (แบบฟอร์มจุดล้มเหลว) และสไลด์ 8 (Blueprint) ----------
$dupFailForm = $pres.Slides.Item(10).Duplicate().Item(1)
$dupBlueprint = $pres.Slides.Item(8).Duplicate().Item(1)

Write-Host ("สไลด์ทั้งหมดหลัง duplicate: " + $pres.Slides.Count + " (ควรเป็น 13)")

# ---------- แก้ไข dupBlueprint: ตัวอย่างจากโครงการ SNK-CD War Room ----------
$titleShape9 = $dupBlueprint.Shapes.Item(2)
$titleShape9.TextFrame.TextRange.Text = "AI Blueprint — ตัวอย่างโครงการ SNK-CD"
$titleShape9.TextFrame.TextRange.Font.Size = 24

$examples9 = @(
  "โครงการเรา: พัฒนาการอำเภอ/ผู้บริหารเปิดเว็บแอป Dashboard, กดดูอำเภอตนเอง",
  "โครงการเรา: หน้าภาพรวมจังหวัด, กริดสีสถานะ 18 อำเภอ, ปุ่ม Export Excel",
  "โครงการเรา: Google Apps Script (ETL) อ่านชีต Google Sheets กรอง noise",
  "โครงการเรา: ตรวจจับ #REF!/เบิกเกิน 100% อัตโนมัติ คำนวณสถานะสี",
  "โครงการเรา: ไฟล์ Excel/Google Sheet งบประมาณ + ชีตประเมินคุณภาพ",
  "โครงการเรา: รายการ 'ข้อมูลต้องตรวจสอบ' ให้เจ้าหน้าที่ยุทธศาสตร์ตรวจทานเอง"
)
$idx9 = @(9,16,23,30,37,44)
for ($k = 0; $k -lt 6; $k++) {
    $sh = $dupBlueprint.Shapes.Item($idx9[$k])
    $sh.TextFrame.TextRange.Text = $examples9[$k]
    $sh.TextFrame.TextRange.Font.Italic = [Microsoft.Office.Core.MsoTriState]::msoTrue
}
$dupBlueprint.Shapes.Item(45).TextFrame.TextRange.Text = "สไลด์นี้คือตัวอย่างจริงจากโครงการ SNK-CD War Room ที่พัฒนาไปแล้ว ใช้เทียบเคียงตอนออกแบบผังของกลุ่มตนเอง"
Write-Host "แก้ dupBlueprint เสร็จ"

# ---------- แก้ไข dupFailForm: กรณีจริงจากโครงการ SNK-CD War Room ----------
$dupFailForm.Shapes.Item(2).TextFrame.TextRange.Text = "แบบฟอร์มบันทึกจุดล้มเหลวและแผนสำรอง — กรณีของโครงการ SNK-CD War Room"

$rows = @(
  @(12,"ข้อมูลต้นทาง (Excel) มีข้อผิดพลาดที่ยังไม่ได้แก้ก่อนเชื่อมต่อจริง"),
  @(14,"ระบบขึ้นสถานะ 'ข้อมูลต้องตรวจสอบ' มากผิดปกติหลังเชื่อมข้อมูลใหม่"),
  @(16,"เจ้าหน้าที่ยุทธศาสตร์จังหวัด"),
  @(18,"ประสานเจ้าหน้าที่การเงินแก้ไขข้อมูลต้นทางก่อน migrate เต็มรูปแบบ"),
  @(20,"ผู้ใช้งานไม่ยอมรับระบบ กลัวถูกใช้ 'จับผิด' ผลงานอำเภอ"),
  @(22,"อำเภอไม่เข้าใช้งาน Dashboard หรือมีข้อร้องเรียนเรื่องสถานะสี"),
  @(24,"พัฒนาการจังหวัด/ทีมพัฒนาระบบ"),
  @(26,"สื่อสารว่าเป็นเครื่องมือสนับสนุน ไม่ใช่จัดอันดับ + จัดอบรมทำความเข้าใจ"),
  @(28,"การ deploy Google Apps Script ล่าช้าเพราะติดขั้นตอนขออนุมัติสิทธิ์ IT"),
  @(30,"เลยกำหนดเฟส 2 แต่ยังไม่ได้รับสิทธิ์เข้าถึง Google Workspace"),
  @(32,"ผู้ดูแลระบบ IT ขององค์กร"),
  @(34,"ใช้ seed data (เฟส 1) นำเสนอไปพลางก่อนระหว่างรออนุมัติ")
)
foreach ($r in $rows) {
    $dupFailForm.Shapes.Item([int]$r[0]).TextFrame.TextRange.Text = $r[1]
}
$dupFailForm.Shapes.Item(35).TextFrame.TextRange.Text = "กรณีข้างต้นเป็นความเสี่ยงจริงที่วิเคราะห์ไว้แล้วสำหรับโครงการ SNK-CD War Room (อ้างอิงเอกสารวิเคราะห์ความเสี่ยงของโครงการ)"
Write-Host "แก้ dupFailForm เสร็จ"

# ---------- สไลด์ 3: Insight Transfer Matrix — เพิ่ม banner สีแดงอธิบายว่าตอบไม่ได้ ----------
$banner3 = $slide3.Shapes.AddTextbox(1, 50, 250, 830, 70)  # msoTextOrientationHorizontal=1
$banner3.Fill.ForeColor.RGB = 16777215  # white
$banner3.Fill.Transparency = 0.15
$banner3.Line.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
$banner3.Line.ForeColor.RGB = (RedRGB)
$tf3 = $banner3.TextFrame.TextRange
$tf3.Text = "ตอบไม่ได้ทั้งกระดานนี้ — เครื่องมือนี้ต้องใช้ข้อมูลจากการลงพื้นที่จริงที่คูโบต้าฟาร์มและการสังเกตหน้างานของกลุ่ม ซึ่งไม่มีข้อมูลนี้อยู่ในบทสนทนา ต้องกรอกเองระหว่างทำกิจกรรมจริง"
$tf3.Font.Color.RGB = (RedRGB)
$tf3.Font.Bold = [Microsoft.Office.Core.MsoTriState]::msoTrue
$tf3.Font.Size = 12
Write-Host "แก้สไลด์ 3 เสร็จ"

# ---------- สไลด์ 5: Feedback Capture Grid — เติม note สีแดงในกล่อง Post-it ทั้ง 4 ----------
$noteIdx5 = @(9,15,21,27)
foreach ($ix in $noteIdx5) {
    $sh = $slide5.Shapes.Item($ix)
    $sh.TextFrame.TextRange.Text = "พื้นที่บันทึก / แปะ Post-it — (ตอบไม่ได้: ต้องฟังจากผู้เชี่ยวชาญที่ฐานจริง ไม่มีข้อมูลนี้ในบทสนทนา)"
    $sh.TextFrame.TextRange.Font.Color.RGB = (RedRGB)
}
Write-Host "แก้สไลด์ 5 เสร็จ"

# ---------- สไลด์สุดท้าย (แบบสรุปข้อแก้ไขรอบสุดท้าย) — เพิ่ม banner สีแดง ----------
$bannerF = $slideFinal.Shapes.AddTextbox(1, 50, 230, 830, 70)
$bannerF.Fill.ForeColor.RGB = 16777215
$bannerF.Fill.Transparency = 0.15
$bannerF.Line.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
$bannerF.Line.ForeColor.RGB = (RedRGB)
$tfF = $bannerF.TextFrame.TextRange
$tfF.Text = "ตอบไม่ได้ทั้งภาพนี้ — ต้องใช้ข้อสังเกตจริงจากกลุ่มผู้ตรวจ (Peer Review) ที่เกิดขึ้นระหว่าง Session 2.7 ซึ่งยังไม่มีข้อมูลนี้ในบทสนทนา ต้องกรอกสดในห้องประชุม"
$tfF.Font.Color.RGB = (RedRGB)
$tfF.Font.Bold = [Microsoft.Office.Core.MsoTriState]::msoTrue
$tfF.Font.Size = 12
Write-Host "แก้สไลด์สุดท้ายเสร็จ"

# ---------- บันทึก ----------
$outPath = "C:\Users\ACER2025\Desktop\ระบบสำนักงาน 69\tools\pptx_work\output.pptx"
if (Test-Path $outPath) { Remove-Item $outPath -Force }
$pres.SaveAs($outPath, 24, [Microsoft.Office.Core.MsoTriState]::msoTrue)  # 24 = ppSaveAsOpenXMLPresentation; embed TrueType fonts
$count = $pres.Slides.Count
$pres.Close()
$ppt.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
Write-Host ("บันทึกเสร็จแล้ว จำนวนสไลด์สุดท้าย: " + $count)
