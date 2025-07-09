import { NextRequest, NextResponse } from 'next/server';
import { readConfig, getFormattedEndpoint } from '@/lib/config';

// GET handler to retrieve recent measurements
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name: bucketName } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const limit = searchParams.get('limit') || '20';
  const getCached = searchParams.get('cached') || 'false';

  try {
    // Get configuration
    const config = await readConfig();

    if (!config.influxEndpoint || !config.adminToken) {
      return NextResponse.json(
        { success: false, error: 'InfluxDB configuration is incomplete. Please configure the endpoint and admin token first.' },
        { status: 400 }
      );
    }

    // Get the properly formatted endpoint URL
    const endpointUrl = getFormattedEndpoint(config);

    if (!endpointUrl) {
      return NextResponse.json(
        { success: false, error: 'InfluxDB endpoint is not configured' },
        { status: 400 }
      );
    }

    // Use Last Value Cache?
    let q;
    if (getCached === 'true') {
      // For LVC, we need to use the specific cache name format: {bucketName}_flight_data_lvc
      const tableName = 'flight_data';
      const cacheName = `${bucketName}_${tableName}_lvc`;
      q = `SELECT * FROM last_cache('${tableName}', '${cacheName}')`;
    } else {
      q = `SELECT * FROM flight_data WHERE time >= now() - INTERVAL '1 minute' ORDER BY time DESC LIMIT ${limit}`;
    }

    // Get the most recent $limit measurements within the last minute
    const dataResponse = await fetch(`${endpointUrl}api/v3/query_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.adminToken}`
      },
      body: JSON.stringify({
        db: bucketName,
        q
      })
    });

    let records = [];

    if (dataResponse.ok) {
      try {
        const responseData = await dataResponse.json();
        // Make sure we always return an array, even if empty
        records = Array.isArray(responseData) ? responseData : [];
      } catch (err) {
        console.error('Error parsing response data:', err);
        // Return empty array if parsing fails
        records = [];
      }
    }

    return NextResponse.json({
      success: true,
      bucketName,
      records,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error fetching flight data records for bucket ${bucketName}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch flight data records',
      },
      { status: 500 }
    );
  }
}
