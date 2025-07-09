# install.ps1 - Setup InfluxDB demo environment

# === ENVIRONMENT SETUP ===
$ErrorActionPreference = "Stop"
$INFLUXDB3_EXE = "C:\Program Files\InfluxData\influxdb\influxdb3.exe"
$SCRIPT_DIR = $PSScriptRoot
$CONFIG_FILE = Join-Path $SCRIPT_DIR "config.json"
$OUTPUT_TMP_FILE = Join-Path $SCRIPT_DIR "output.tmp"
$DATAPATH = $env:USERPROFILE + "\influxdb_data\demonode\"

function Format-Json {
    param([string]$Json)
    
    $indent = 0
    $result = @()
    $inString = $false
    $escaped = $false
    
    for ($i = 0; $i -lt $Json.Length; $i++) {
        $char = $Json[$i]
        
        # Handle string detection
        if ($char -eq '"' -and -not $escaped) {
            $inString = -not $inString
        }
        
        # Handle escape sequences
        $escaped = ($char -eq '\' -and -not $escaped)
        
        # Skip formatting inside strings
        if ($inString) {
            if ($result.Count -eq 0) { $result += "" }
            $result[-1] += $char
            continue
        }
        
        switch ($char) {
            '{' {
                if ($result.Count -eq 0) { $result += "" }
                $result[-1] += $char
                $result += ""
                $indent++
                $result[-1] += "  " * $indent
            }
            '}' {
                $indent--
                if ($result[-1].Trim() -eq "") {
                    $result[-1] = ("  " * $indent) + $char
                } else {
                    $result += ""
                    $result[-1] = ("  " * $indent) + $char
                }
            }
            '[' {
                if ($result.Count -eq 0) { $result += "" }
                $result[-1] += $char
                $result += ""
                $indent++
                $result[-1] += "  " * $indent
            }
            ']' {
                $indent--
                if ($result[-1].Trim() -eq "") {
                    $result[-1] = ("  " * $indent) + $char
                } else {
                    $result += ""
                    $result[-1] = ("  " * $indent) + $char
                }
            }
            ',' {
                if ($result.Count -eq 0) { $result += "" }
                $result[-1] += $char
                $result += ""
                $result[-1] += "  " * $indent
            }
            ' ' {
                # Skip spaces outside of strings (they'll be added by indentation)
            }
            default {
                if ($result.Count -eq 0) { $result += "" }
                $result[-1] += $char
            }
        }
    }
    
    return ($result | Where-Object { $_ -ne "" }) -join "`n"
}

function Extract-Token {
    param([string]$OutputFile)
    
    $content = Get-Content $OutputFile -Raw
    
    # Try to find token directly in the content
    if ($content -match "apiv3_[a-zA-Z0-9_-]+") {
        return $matches[0]
    }
    
    # Try line-by-line approach for "Authorization: Bearer" format
    $lines = Get-Content $OutputFile
    $foundHeader = $false
    
    foreach ($line in $lines) {
        if ($foundHeader -and $line -match "apiv3_[a-zA-Z0-9_-]+") {
            return $matches[0]
        }
        if ($line -match "Authorization: Bearer") {
            $foundHeader = $true
        }
    }
    
    return $null
}

try {
    # === CREATE ADMIN TOKEN ===
    Write-Host "Creating InfluxDB admin token" -NoNewline
    & $INFLUXDB3_EXE create token --admin > $OUTPUT_TMP_FILE 2>&1
    
    $INFLUXDB3_AUTH_TOKEN = Extract-Token -OutputFile $OUTPUT_TMP_FILE
    
    if (-not $INFLUXDB3_AUTH_TOKEN) {
        Write-Host " - Could not find API token in the output"
        Write-Host "--- OUTPUT ---"
        Get-Content $OUTPUT_TMP_FILE
        Write-Host "--- END OUTPUT ---"
        Remove-Item $OUTPUT_TMP_FILE -ErrorAction SilentlyContinue
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    Remove-Item $OUTPUT_TMP_FILE -ErrorAction SilentlyContinue
    Write-Host " - Done"
    
    # === CREATE BUCKET ===
    Write-Host "Creating bucket 'flightsim'" -NoNewline
    & $INFLUXDB3_EXE create database flightsim --retention-period 5d --token $INFLUXDB3_AUTH_TOKEN > $OUTPUT_TMP_FILE 2>&1
    
    $output = Get-Content $OUTPUT_TMP_FILE -Raw
    
    if ($output -match "created successfully") {
        Write-Host " - Done"
    }
    elseif ($output -match "already exists") {
        Write-Host " - Already exists"
    }
    else {
        Write-Host " - Failed to create bucket."
        Write-Host "--- OUTPUT ---"
        Get-Content $OUTPUT_TMP_FILE
        Write-Host "--- END OUTPUT ---"
        Remove-Item $OUTPUT_TMP_FILE -ErrorAction SilentlyContinue
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    Remove-Item $OUTPUT_TMP_FILE -ErrorAction SilentlyContinue
    
    # === CREATE BUCKET TOKEN ===
    Write-Host "Creating bucket token for 'flightsim'" -NoNewline
    & $INFLUXDB3_EXE create token --permission "db:flightsim:read,write" --name "Token for flightsim" --expiry 7y --token $INFLUXDB3_AUTH_TOKEN > $OUTPUT_TMP_FILE 2>&1
    
    $INFLUXDB3_BUCKET_TOKEN = Extract-Token -OutputFile $OUTPUT_TMP_FILE
    
    if (-not $INFLUXDB3_BUCKET_TOKEN) {
        Write-Host ""
        Write-Host "ERROR: Could not find API token in the output:"
        Write-Host "--- OUTPUT ---"
        Get-Content $OUTPUT_TMP_FILE
        Write-Host "--- END OUTPUT ---"
        Remove-Item $OUTPUT_TMP_FILE -ErrorAction SilentlyContinue
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    Remove-Item $OUTPUT_TMP_FILE -ErrorAction SilentlyContinue
    Write-Host " - Done"
    
    # === CREATE CONFIG FILE ===
    Write-Host "Creating config.json" -NoNewline
    
    $config = @{
        influxEndpoint = "http://localhost:8181/"
        adminToken     = $INFLUXDB3_AUTH_TOKEN
        dataPath       = $DATAPATH
        buckets        = @{
            flightsim = @{
                name            = "flightsim"
                retentionPeriod = 24
                token           = $INFLUXDB3_BUCKET_TOKEN
            }
        }
    }
    
    # Create properly formatted JSON using built-in formatting
    $formattedJson = $config | ConvertTo-Json -Depth 10
    
    # Write without BOM for older PowerShell versions
    $utf8NoBomEncoding = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($CONFIG_FILE, $formattedJson, $utf8NoBomEncoding)
    Write-Host " - Done"

    # === BUILD THE DEMO APP ===
    Write-Host "Building the demo app" -NoNewline
    npm install
    npm run build
    Write-Host " - Done"
    
    Write-Host ""
    Write-Host "Setup completed successfully!"
    Write-Host "Config file created at: $CONFIG_FILE"
}
catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
finally {
    # Clean up temp file if it still exists
    Remove-Item $OUTPUT_TMP_FILE -ErrorAction SilentlyContinue
}

# Pause to allow the user to see the output
Read-Host "Press Enter to continue"