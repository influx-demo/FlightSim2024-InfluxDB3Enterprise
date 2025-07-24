# Configure InfluxDB 3.x environment variables
$env:INFLUXDB3_EXE = "C:\Program Files\InfluxData\influxdb\influxdb3.exe"
$env:INFLUXDB3_NODE_IDENTIFIER_PREFIX = "demonode"
$env:INFLUXDB3_OBJECT_STORE = "file"
$env:INFLUXDB3_DB_DIR = "$env:USERPROFILE\influxdb_data"
$env:INFLUXDB3_ENTERPRISE_CLUSTER_ID = "cluster"
$env:INFLUXDB3_GEN1_DURATION = "10m"
$env:INFLUXDB3_ENTERPRISE_COMPACTION_MAX_NUM_FILES_PER_PLAN = "100"
$env:INFLUXDB3_ENTERPRISE_COMPACTION_GEN2_DURATION = "10m"
$env:INFLUXDB3_DATAFUSION_NUM_THREADS = "16"
$env:INFLUXDB3_WAL_FLUSH_INTERVAL = "100ms"
$env:INFLUXDB3_WAL_MAX_WRITE_BUFFER_SIZE = "200000"
$env:INFLUXDB3_EXEC_MEM_POOL_BYTES = "40%"
$env:INFLUXDB3_PARQUET_MEM_CACHE_SIZE = "40%"

# Start InfluxDB 3.x
& "$env:INFLUXDB3_EXE" serve

# Check if the command was successful
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start InfluxDB 3.x. Please check the configuration and try again." -ForegroundColor Red
    Read-Host -Prompt "Press Enter to exit"
    exit $LASTEXITCODE
}
