import { NextRequest, NextResponse } from 'next/server';
import { readConfig, getFormattedEndpoint } from '@/lib/config';

/**
 * GET handler to show the first 10 rows of a specific table in a database
 * sorted by timestamp in descending order
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dbname: string; tablename: string }> }
) {
  try {
    // Extract the database name and table name from the URL parameters
    const paramsObj = await params;
    const {dbname, tablename} = paramsObj;
    
    if (!dbname || !tablename) {
      return NextResponse.json(
        { success: false, error: 'Database name and table name are required' },
        { status: 400 }
      );
    }

    // Read the current configuration to get the endpoint and admin token
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

    // Call the InfluxDB API to query the table data
    const response = await fetch(`${endpointUrl}api/v3/query_sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.adminToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        db: dbname,
        q: `SELECT * FROM ${tablename} ORDER BY time DESC LIMIT 10`
      })
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to query table data: ${response.statusText}`,
          status: response.status
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Return the query results
    return NextResponse.json({
      success: true,
      database: dbname,
      table: tablename,
      rows: data,
      count: Array.isArray(data) ? data.length : 0
    });
  } catch (error) {
    // Use the local variables instead of accessing params directly
    const paramsObj = await params;
    const db = paramsObj.dbname;
    const table = paramsObj.tablename;
    console.error(`Error querying table data for ${db}/${table}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to query table data',
      },
      { status: 500 }
    );
  }
}
