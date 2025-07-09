import { NextRequest, NextResponse } from 'next/server';
import { readConfig, getFormattedEndpoint } from '@/lib/config';

/**
 * GET handler to list all tables in a specific database
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dbname: string }> }
) {
  try {
    const paramsObj = await params;
    const { dbname } = paramsObj;

    if (!dbname) {
      return NextResponse.json(
        { success: false, error: 'Database name is required' },
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

    // Call the InfluxDB API to list tables in the database
    // Using SQL query to get table information
    const response = await fetch(`${endpointUrl}api/v3/query_sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.adminToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        db: dbname,
        q: `SHOW TABLES`
      })
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to list tables: ${response.statusText}`,
          status: response.status
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Extract table names from the response
    // The response format depends on InfluxDB's SQL query result structure
    // We'll handle both empty results and populated results
    let tables = [];

    if (Array.isArray(data) && data.length > 0) {
      // If there are tables, they should be in the first result set
      // Each row should have a 'name' field which is the table name
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tables = data.map((row: any) => {
        // Handle different possible response formats
        if (row.name) return row.name;
        if (row.table_name) return row.table_name;

        // If the structure is different, try to extract the first string value
        const firstValue = Object.values(row).find(v => typeof v === 'string');
        return firstValue || 'unknown';
      });
    }

    // Return the list of table names
    return NextResponse.json({
      success: true,
      database: dbname,
      tables: tables,
      count: tables.length
    });
  } catch (error) {
    // Use the local variable instead of accessing params directly
    const paramsObj = await params;
    const db = paramsObj.dbname;
    console.error(`Error listing tables for database ${db}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list tables',
      },
      { status: 500 }
    );
  }
}
