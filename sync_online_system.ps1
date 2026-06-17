$excelPath = "c:\Users\111009\OneDrive - BAFS\BAFS-HOD\10_HOD Team Project\P'Cream\180 degree Smart Communication\Master Pre 180degree.xlsx"
$htmlPath = "c:\Users\111009\OneDrive - BAFS\BAFS-HOD\10_HOD Team Project\P'Cream\180 degree Smart Communication\index.html"

# Extract Google Script URL from index.html
$htmlContent = [System.IO.File]::ReadAllText($htmlPath, [System.Text.Encoding]::UTF8)
if ($htmlContent -match 'window\.GOOGLE_SCRIPT_API_URL\s*=\s*"([^"]+)"') {
    $apiUrl = $Matches[1]
    Write-Host "Detected Google Script API URL: $apiUrl"
} else {
    Write-Error "Could not find window.GOOGLE_SCRIPT_API_URL in index.html"
    exit 1
}

# Read Namelist sheet
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$participants = @()
try {
    Write-Host "Opening Excel file..."
    $workbook = $excel.Workbooks.Open($excelPath)
    $sheet = $workbook.Sheets.Item("Namelist")
    
    $row = 3
    while ($true) {
        $noText = $sheet.Cells.Item($row, 1).Text
        if ([string]::IsNullOrEmpty($noText)) {
            break
        }
        
        $pName = $sheet.Cells.Item($row, 2).Text.Trim()
        $pEmail = $sheet.Cells.Item($row, 3).Text.Trim().ToLower()
        $mName = $sheet.Cells.Item($row, 4).Text.Trim()
        $mEmail = $sheet.Cells.Item($row, 5).Text.Trim().ToLower()
        
        $manager = @{
            name = $mName
            email = $mEmail
        }
        
        $peers = @()
        for ($col = 6; $col -le 10; $col += 2) {
            $pNameCol = $sheet.Cells.Item($row, $col).Text.Trim()
            $pEmailCol = $sheet.Cells.Item($row, $col+1).Text.Trim().ToLower()
            if (![string]::IsNullOrEmpty($pNameCol) -and $pNameCol -ne "-" -and $pNameCol -ne "") {
                $peers += @{
                    name = $pNameCol
                    email = $pEmailCol
                }
            }
        }
        
        $participants += @{
            id = "P" + ([int]$noText).ToString("00")
            name = $pName
            email = $pEmail
            manager = $manager
            peers = $peers
        }
        $row++
    }
    $workbook.Close($false)
    Write-Host "Successfully parsed $($participants.Count) participants from Excel."
}
finally {
    $excel.Quit()
}

# Prepare JSON payload
$payload = @{
    action = "updateSystem"
    participants = $participants
} | ConvertTo-Json -Depth 5

Write-Host "Sending update request to Google Sheets Web App..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body $payload -ContentType "application/json" -TimeoutSec 30
    Write-Host "Response Status: $($response.status)"
    Write-Host "Response Message: $($response.message)"
}
catch {
    Write-Error $_
}
