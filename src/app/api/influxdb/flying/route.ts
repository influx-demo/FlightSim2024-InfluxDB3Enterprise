import { NextResponse } from 'next/server';
import { readConfig, getFormattedEndpoint } from '@/lib/config';

export async function GET() {

  const tableName = "flight_data";
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

    // Query last 2 seconds for min/max of three metrics
    const sql = `SELECT 
      MIN(flight_altitude) AS min_altitude, MAX(flight_altitude) AS max_altitude,
      MIN(flight_heading_true) AS min_heading, MAX(flight_heading_true) AS max_heading,
      MIN(speed_indicated_airspeed) AS min_airspeed, MAX(speed_indicated_airspeed) AS max_airspeed
      FROM ${tableName} WHERE time >= now() - INTERVAL '2 seconds'`;
    const response = await fetch(`${endpointUrl}api/v3/query_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.adminToken}`
      },
      body: JSON.stringify({
        db: config.activeBucket,
        q: sql
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ success: false, error: errText }, { status: 500 });
    }
    const [row] = await response.json();
    const flying = (
      row.min_altitude !== row.max_altitude ||
      row.min_heading !== row.max_heading ||
      row.min_airspeed !== row.max_airspeed
    );
    return NextResponse.json({ flying });
  } catch (error) {
    console.error(`Error fetching flight data records`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch flight data records',
      },
      { status: 500 }
    );
  }
}