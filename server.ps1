# 180-Degree Smart Communication Assessment - PowerShell HTTP Web Server
# Serves static files and manages API endpoints to read/write JSON responses and Excel scores

$port = 8080
$url = "http://localhost:$port/"
$workspaceDir = $PSScriptRoot

$namelistPath = Join-Path $workspaceDir "namelist.json"
$questionsPath = Join-Path $workspaceDir "questions.json"
$responsesPath = Join-Path $workspaceDir "responses.json"
$excelPath = Join-Path $workspaceDir "3.Log data.xlsx"

# Load System.IO.Compression for zip operations
[System.Reflection.Assembly]::LoadWithPartialName("System.IO.Compression.FileSystem") | Out-Null

# Function to update excel scores based on responses.json
function Update-ExcelScores {
    Write-Host "Updating Excel scores..."
    if (-not (Test-Path $excelPath)) {
        Write-Host "Excel template not found at $excelPath"
        return
    }

    # 1. Read namelist and responses
    $namelist = Get-Content $namelistPath -Raw | ConvertFrom-Json
    $responses = @()
    if (Test-Path $responsesPath) {
        $responses = Get-Content $responsesPath -Raw | ConvertFrom-Json
    }

    # 2. Define the column map for 10 assessees
    $columnMap = @{
        "สมชาย ใจดี" = @{ "Self" = "D"; "Manager" = "E"; "Peer" = "F" };
        "พรทิพย์ สวยงาม" = @{ "Self" = "G"; "Manager" = "H"; "Peer" = "I" };
        "ธีรพล ก้าวหน้า" = @{ "Self" = "J"; "Manager" = "K"; "Peer" = "L" };
        "กมลวรรณ เด่นไทย" = @{ "Self" = "P"; "Manager" = "Q"; "Peer" = "R" };
        "ชาญชัย แข็งแรง" = @{ "Self" = "S"; "Manager" = "T"; "Peer" = "U" };
        "เบญจวรรณ พูนผล" = @{ "Self" = "V"; "Manager" = "W"; "Peer" = "X" };
        "อดิศักดิ์ รักไทย" = @{ "Self" = "Y"; "Manager" = "Z"; "Peer" = "AA" };
        "นงนุช เจริญสุข" = @{ "Self" = "AB"; "Manager" = "AC"; "Peer" = "AD" };
        "ปกรณ์ มีมานะ" = @{ "Self" = "AE"; "Manager" = "AF"; "Peer" = "AG" };
        "ลลิตา ใฝ่รู้" = @{ "Self" = "AH"; "Manager" = "AI"; "Peer" = "AJ" }
    }

    # Extract xlsx to temp folder
    $tempDir = Join-Path $env:TEMP ([Guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    
    try {
        [System.IO.Compression.ZipFile]::ExtractToDirectory($excelPath, $tempDir)
        
        $sheetFile = Join-Path $tempDir "xl/worksheets/sheet1.xml"
        if (Test-Path $sheetFile) {
            # Load sheet XML as UTF-8
            $content = [System.IO.File]::ReadAllText($sheetFile, [System.Text.Encoding]::UTF8)
            $xml = New-Object System.Xml.XmlDocument
            $xml.LoadXml($content)

            $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
            $ns.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
            $sheetData = $xml.SelectSingleNode("//x:sheetData", $ns)

            # Helper function to write/update cell in XmlDocument
            function Write-CellInXml {
                param ($xmlDoc, $sheetDataNode, $nsMgr, $cellRef, $value)
                
                if ($cellRef -match '^([A-Z]+)(\d+)$') {
                    $col = $Matches[1]
                    $rowNum = $Matches[2]
                } else { return }

                # Find or create row
                $row = $sheetDataNode.SelectSingleNode("x:row[@r='$rowNum']", $nsMgr)
                if ($row -eq $null) {
                    $row = $xmlDoc.CreateElement("row", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
                    $row.SetAttribute("r", $rowNum)
                    $nextRow = $sheetDataNode.SelectSingleNode("x:row[@r > $rowNum]", $nsMgr)
                    if ($nextRow -ne $null) {
                        $sheetDataNode.InsertBefore($row, $nextRow) | Out-Null
                    } else {
                        $sheetDataNode.AppendChild($row) | Out-Null
                    }
                }

                # Find or create cell
                $cell = $row.SelectSingleNode("x:c[@r='$cellRef']", $nsMgr)
                if ($cell -eq $null) {
                    $cell = $xmlDoc.CreateElement("c", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
                    $cell.SetAttribute("r", $cellRef)
                    
                    # Insert cell alphabetically by column ref
                    $inserted = $false
                    foreach ($child in $row.SelectNodes("x:c", $nsMgr)) {
                        $childRef = $child.GetAttribute("r")
                        $childCol = $childRef -replace '\d+', ''
                        
                        $cmp = 0
                        if ($childCol.Length -ne $col.Length) {
                            $cmp = $childCol.Length - $col.Length
                        } else {
                            $cmp = [string]::Compare($childCol, $col)
                        }

                        if ($cmp -gt 0) {
                            $row.InsertBefore($cell, $child) | Out-Null
                            $inserted = $true
                            break
                        }
                    }
                    if (-not $inserted) {
                        $row.AppendChild($cell) | Out-Null
                    }
                }

                # Set cell value
                $v = $cell.SelectSingleNode("x:v", $nsMgr)
                if ($v -eq $null) {
                    $v = $xmlDoc.CreateElement("v", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
                    $cell.AppendChild($v) | Out-Null
                }
                $v.InnerText = $value
                
                # If the value is text (like N/A or empty), mark cell type as str. Otherwise treat as numeric.
                if ($value -eq "N/A" -or $value -eq "") {
                    $cell.SetAttribute("t", "str")
                } else {
                    if ($cell.Attributes["t"] -ne $null) {
                        $cell.RemoveAttribute("t")
                    }
                }
            }

            # Find all unique targets in namelist
            $uniqueAssessees = @()
            for ($i = 1; $i -lt $namelist.rows.Count; $i++) {
                $name = $namelist.rows[$i].B
                $no = $namelist.rows[$i].A
                $key = "$no|$name"
                if ($uniqueAssessees -notcontains $key) {
                    $uniqueAssessees += $key
                }
            }

            foreach ($key in $uniqueAssessees) {
                $parts = $key.Split('|')
                $targetNo = $parts[0]
                $targetName = $parts[1]

                $cols = $columnMap[$targetName]
                if ($cols -eq $null) { continue }

                # Filter responses for this assessee
                $targetResponses = $responses | Where-Object { $_.targetNo -eq $targetNo }

                for ($q = 1; $q -le 19; $q++) {
                    $rowNum = $q + 3

                    # A. Self Score
                    $selfResp = $targetResponses | Where-Object { $_.role -eq "Self" }
                    $selfScore = ""
                    if ($selfResp -ne $null -and $selfResp.answers -ne $null -and $selfResp.answers."$q" -ne $null) {
                        $selfScore = $selfResp.answers."$q"
                    }
                    Write-CellInXml $xml $sheetData $ns "$($cols.Self)$rowNum" $selfScore

                    # B. Manager Score
                    $mgrResp = $targetResponses | Where-Object { $_.role -eq "Manager" }
                    $mgrScore = ""
                    if ($mgrResp -ne $null -and $mgrResp.answers -ne $null -and $mgrResp.answers."$q" -ne $null) {
                        $mgrScore = $mgrResp.answers."$q"
                    }
                    Write-CellInXml $xml $sheetData $ns "$($cols.Manager)$rowNum" $mgrScore

                    # C. Peer Score (Average of Peer 1, Peer 2, Peer 3)
                    $peerResps = $targetResponses | Where-Object { $_.role -like "Peer*" }
                    $peerScores = @()
                    foreach ($pr in $peerResps) {
                        if ($pr.answers -ne $null -and $pr.answers."$q" -ne $null) {
                            $val = $pr.answers."$q"
                            if ($val -ne "" -and $val -ne "N/A") {
                                $peerScores += [double]$val
                            }
                        }
                    }
                    
                    $peerAvgStr = ""
                    if ($peerScores.Count -gt 0) {
                        $sum = 0
                        foreach ($ps in $peerScores) { $sum += $ps }
                        $avg = $sum / $peerScores.Count
                        $peerAvgStr = "{0:N1}" -f $avg
                    }
                    Write-CellInXml $xml $sheetData $ns "$($cols.Peer)$rowNum" $peerAvgStr
                }
            }

            # Save XML sheet
            $xml.Save($sheetFile)
        }

        # Replace xlsx with newly zipped directory
        Remove-Item $excelPath -Force
        [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $excelPath)
        Write-Host "Excel scores successfully updated!"
    }
    catch {
        Write-Host "Error updating Excel: $_"
    }
    finally {
        if (Test-Path $tempDir) {
            Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
        }
    }
}

# Start HTTP Listener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)

try {
    $listener.Start()
    Write-Host "Web server started on $url"
    Write-Host "Press [Ctrl+C] to stop the server."
}
catch {
    Write-Error "Failed to start HTTP server: $_"
    Write-Host "Make sure port $port is not already in use by another server."
    Exit
}

# Main event loop
while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        Write-Host "Request: $($request.HttpMethod) $path"

        # Enable CORS for localhost testing
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        # Route matches
        if ($path -eq "/" -or $path -eq "/index.html") {
            # Serve index.html
            $filePath = Join-Path $workspaceDir "index.html"
            if (Test-Path $filePath) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = "text/html; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
            }
        }
        elseif ($path -eq "/style.css") {
            # Serve style.css
            $filePath = Join-Path $workspaceDir "style.css"
            if (Test-Path $filePath) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = "text/css; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
            }
        }
        elseif ($path -eq "/app.js") {
            # Serve app.js
            $filePath = Join-Path $workspaceDir "app.js"
            if (Test-Path $filePath) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = "application/javascript; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
            }
        }
        elseif ($path -eq "/api/namelist") {
            # Serve namelist.json
            if (Test-Path $namelistPath) {
                $bytes = [System.IO.File]::ReadAllBytes($namelistPath)
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
            }
        }
        elseif ($path -eq "/api/questions") {
            # Serve questions.json
            if (Test-Path $questionsPath) {
                $bytes = [System.IO.File]::ReadAllBytes($questionsPath)
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
            }
        }
        elseif ($path -eq "/api/responses") {
            # Serve responses.json
            if (Test-Path $responsesPath) {
                $bytes = [System.IO.File]::ReadAllBytes($responsesPath)
            } else {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("[]")
            }
            $response.ContentType = "application/json; charset=utf-8"
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        elseif ($path -eq "/api/submit" -and $request.HttpMethod -eq "POST") {
            # Handle assessment submission
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $newResponse = $body | ConvertFrom-Json

            Write-Host "Received submission from $($newResponse.assessorEmail) for target No $($newResponse.targetNo) as $($newResponse.role)"

            # Load existing responses
            $existing = @()
            if (Test-Path $responsesPath) {
                $existing = Get-Content $responsesPath -Raw | ConvertFrom-Json
            }

            # Filter out any old response for the same assessor and target
            $filtered = @()
            foreach ($res in $existing) {
                if ($res.assessorEmail -eq $newResponse.assessorEmail -and $res.targetNo -eq $newResponse.targetNo -and $res.role -eq $newResponse.role) {
                    # Skip to overwrite
                } else {
                    $filtered += $res
                }
            }
            $filtered += $newResponse

            # Save updated responses
            $json = ConvertTo-Json -InputObject $filtered -Depth 10
            [System.IO.File]::WriteAllText($responsesPath, $json, [System.Text.Encoding]::UTF8)

            # Recalculate and update the Excel log file
            Update-ExcelScores

            # Send success response
            $resBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success": true}')
            $response.ContentType = "application/json; charset=utf-8"
            $response.ContentLength64 = $resBytes.Length
            $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
        }
        else {
            $response.StatusCode = 404
        }
    }
    catch {
        Write-Host "Error processing request: $_"
        if ($response) {
            $response.StatusCode = 500
        }
    }
    finally {
        if ($response) {
            $response.Close()
        }
    }
}

# Clean up listener on shutdown
$listener.Stop()
$listener.Close()
