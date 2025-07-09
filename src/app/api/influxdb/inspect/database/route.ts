import { NextResponse } from 'next/server';
import { readConfig, getFormattedEndpoint } from '@/lib/config';

/**
 * GET handler to list all databases/buckets from InfluxDB
 */
export async function GET() {
  try {
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

    // Call the InfluxDB API to list databases
    const response = await fetch(`${endpointUrl}api/v3/configure/database?format=json`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.adminToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to list databases: ${response.statusText}`,
          status: response.status
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Extract database names from the response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const databases = data.map((db: any) => db['iox::database']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const databaseLinks = databases.map((db: any) => {
      return {
        name: db,
        href: `/api/influxdb/inspect/database/${db}`
      };
    });

    // Return the list of database names
    return NextResponse.json({
      success: true,
      databases: databases,
      _link: {
        self: `${endpointUrl}api/v3/configure/database`,
        databases: databaseLinks
      },
      count: databases.length
    });
  } catch (error) {
    console.error('Error listing databases:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list databases',
      },
      { status: 500 }
    );
  }
}
