import { NextRequest, NextResponse } from 'next/server';
import { readConfig, writeConfig, getFormattedEndpoint } from '@/lib/config';
import { spawn } from 'child_process';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {

  const tableName = "flight_data";
  const bucketInfo = {
    status: "offline",
    hasTable: false,
    hasLvc: false,
    lvcCreated: false
  };

  const { name: bucketName } = await params;

  try {
    // Get configuration
    const config = await readConfig();

    if (!config.influxEndpoint || !config.adminToken) {
      return NextResponse.json(
        { success: false, error: 'InfluxDB configuration is incomplete. Please configure the endpoint and admin token first.' },
        { status: 400 }
      );
    }

    // Get  the properly formatted endpoint URL
    const endpointUrl = getFormattedEndpoint(config);

    if (!endpointUrl) {
      return NextResponse.json(
        { success: false, error: 'InfluxDB endpoint is not configured' },
        { status: 400 }
      );
    }

    // Find out if there are any records in the last minute
    const response = await fetch(`${endpointUrl}api/v3/query_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.adminToken}`
      },
      body: JSON.stringify({
        db: bucketName,
        q: `SELECT 1 AS online FROM ${tableName} WHERE time >= now() - INTERVAL '1 minute' LIMIT 1`
      })
    });

    if (response.ok) {
      bucketInfo.hasTable = true;
      const data = await response.json();
      bucketInfo.status = data[0]?.online > 0 ? "online" : "offline";

      if (bucketInfo.status === "online") {

        // Check if the bucket has an LVC configured
        if (config.buckets && config.buckets[bucketName] && config.buckets[bucketName].lvc) {
          bucketInfo.hasLvc = true;
        }

        // If there's no LVC, create one
        if (!bucketInfo.hasLvc) {
          try {
            // Using the Windows path to the InfluxDB CLI executable
            const cliPath = 'C:\\Program Files\\InfluxData\\influxdb\\influxdb3.exe';
            const keyColumns = 'aircraft_tailnumber';
            const valueColumns = 'flight_altitude,speed_true_airspeed,flight_heading_magnetic,flight_latitude,flight_longitude,speed_vertical,autopilot_heading_target,autopilot_master,autopilot_altitude_target,flight_bank,flight_pitch,aircraft_airline,aircraft_callsign,aircraft_type';
            const cacheName = `${bucketName}_${tableName}_lvc`;
            const ttl = '10s';
            const count = 1;

            const args = [
              'create', 'last_cache',
              '--database', bucketName,
              '--token', config.adminToken,
              '--table', tableName,
              '--key-columns', keyColumns,
              '--value-columns', valueColumns,
              '--count', count.toString(),
              '--ttl', ttl,
              cacheName
            ];

            // Use spawn to handle the CLI process
            console.log(`Creating LVC for bucket ${bucketName} with command:\n\ninfluxdb3 ${args.join(' ')}\n\n`);
            const cliProcess = spawn(cliPath, args);

            // Wait for the process to exit
            await new Promise<void>((resolve) => {
              cliProcess.on('close', (code: number) => {
                if (code !== 0) {
                  resolve();
                } else {
                  bucketInfo.lvcCreated = true;
                  resolve();
                }
              });

              cliProcess.on('error', () => {
                resolve();
              });
            });

            // If LVC was created successfully, store it in the configuration
            if (bucketInfo.lvcCreated) {
              if (!config.buckets) {
                config.buckets = {};
              }

              if (!config.buckets[bucketName]) {
                config.buckets[bucketName] = {
                  name: bucketName
                };
              }

              // Add or update LVC information in the bucket config
              config.buckets[bucketName].lvc = {
                name: cacheName,
                tableName,
                keyColumns,
                valueColumns,
                count,
                ttl
              };

              await writeConfig(config);
              bucketInfo.hasLvc = true;
            }
          } catch {
          }
        }
      }
    }

    return NextResponse.json(bucketInfo);
  } catch {
    return NextResponse.json({ status: "offline" });
  }
}
