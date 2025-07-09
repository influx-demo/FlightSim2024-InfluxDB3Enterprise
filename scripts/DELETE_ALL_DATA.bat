@echo off

echo This will delete the entire InfluxDB data and reset the demo app
echo.
echo Press CTRL-C to cancel this operation.
pause

rd /s /q C:\Users\influ\influxdb_data\
del /q D:\repos\FlightSim2024-InfluxDB3Enterprise\config.json

echo.
echo Delete Completed
pause