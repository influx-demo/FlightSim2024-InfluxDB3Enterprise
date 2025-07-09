import { NextRequest, NextResponse } from 'next/server';
import { readConfig, getFormattedEndpoint } from '@/lib/config';

// GET handler to retrieve bucket statistics
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name: bucketName } = await context.params;

  const stats = {
    recordCount: 0,
    measurementCountPerRecord: 0,
    dbSizeData: [],
    compactedSizeData: [],
    compactionEvents: 0,
    lastCompactionSaved: null,
    totalCompactionSavings: null,
    lastUpdated: new Date().toISOString()
  };

  try {
    // Get configuration
    const config = await readConfig();

    if (!config.influxEndpoint || !config.adminToken) {
      return NextResponse.json(
        { success: false, error: 'InfluxDB configuration is incomplete. Please configure the endpoint, admin token, and data path.' },
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

    // Count the number of records in the last minute
    try {
      const recordCountResponse = await fetch(`${endpointUrl}api/v3/query_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${config.adminToken}`
        },
        body: JSON.stringify({
          db: bucketName,
          q: `SELECT COUNT(*) AS count FROM flight_data WHERE time >= now() - INTERVAL '1 minute'`
        })
      });

      if (recordCountResponse.ok) {
        const data = await recordCountResponse.json();
        stats.recordCount = data[0].count;
      }
    } catch (err) {
      console.error('Error fetching record count:', err);
    }

    // Count the number of measurements in a record
    try {
      const measurementCountResponse = await fetch(`${endpointUrl}api/v3/query_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${config.adminToken}`
        },
        body: JSON.stringify({
          db: bucketName,
          q: `SELECT * FROM flight_data WHERE time >= now() - INTERVAL '1 minute' LIMIT 1`
        })
      });

      if (measurementCountResponse.ok) {
        const data = await measurementCountResponse.json();
        stats.measurementCountPerRecord = Object.keys(data[0]).length;
      }
    } catch (err) {
      console.error('Error fetching measurement count:', err);
    }

    // Count the number of directory stats records in the last hour
    const sizeDataResponse = await fetch(`${endpointUrl}api/v3/query_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.adminToken}`
      },
      body: JSON.stringify({
        db: bucketName,
        q: `SELECT * FROM directory_stats WHERE time >= now() - INTERVAL '1 hour'`
      })
    });

    if (sizeDataResponse.ok) {
      const data = await sizeDataResponse.json();
      // data looks like this:
      // [{
      //   directory_size_bytes: 161574683,
      //   folder: 'db_size',
      //   time: '2025-05-07T06:03:10.474'
      // }]

      // Convert data to the format we need
      // [{
      //   timestamp: '2025-05-07T06:03:10.474',
      //   value: 161574683
      // }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stats.dbSizeData = data.filter((item: any) => item.folder === 'db_size').map((item: any) => ({
        timestamp: item.time,
        value: item.directory_size_bytes
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    // Query for all compaction events (savings, count, last event)
    const compactionEventsResponse = await fetch(`${endpointUrl}api/v3/query_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.adminToken}`
      },
      body: JSON.stringify({
        db: bucketName,
        q: `
          SELECT 
            (prev_size - directory_size_bytes) AS saved_bytes,
            time,
            directory_size_bytes AS post_compaction_usage
          FROM (
            SELECT 
              time, 
              directory_size_bytes, 
              LAG(directory_size_bytes) OVER (ORDER BY time) AS prev_size
            FROM directory_stats
            WHERE folder = 'db_size'
          )
          WHERE directory_size_bytes < prev_size
          ORDER BY time DESC
        `
      })
    });

    let compactionEvents = [];
    if (compactionEventsResponse.ok) {
      compactionEvents = await compactionEventsResponse.json();
      // Get the number of compaction events
      stats.compactionEvents = compactionEvents.length;
      // Get the last compaction event
      stats.lastCompactionSaved = compactionEvents.length > 0 ? compactionEvents[0].saved_bytes ?? null : null;
      // Get the total compaction savings
      stats.totalCompactionSavings = compactionEvents.reduce((sum: number, ev: { saved_bytes?: number }) => sum + (ev.saved_bytes ?? 0), 0);
    }

    return NextResponse.json({
      success: true,
      bucketName,
      stats
    });
  } catch (error) {
    console.error(`Error fetching stats for bucket ${bucketName}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch bucket statistics',
      },
      { status: 500 }
    );
  }
}