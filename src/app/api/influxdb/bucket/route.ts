import { NextRequest, NextResponse } from 'next/server';
import { readConfig, writeConfig, getFormattedEndpoint } from '@/lib/config';

// Create a bucket
export async function POST(request: NextRequest) {
  try {
    const requestData = await request.json();
    const { bucketName, retentionPeriod } = requestData;

    if (!bucketName) {
      return NextResponse.json(
        { success: false, error: 'Bucket name is required' },
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

    // Prepare the request body for database creation
    // For InfluxDB v3, we use the database endpoint
    const databaseRequestBody = {
      db: bucketName
    };

    // Call the InfluxDB API to create a database
    const response = await fetch(`${endpointUrl}api/v3/configure/database`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.adminToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(databaseRequestBody)
    });


    // Handle 409 status code (database already exists) as a success
    if (response.status === 409) {

      // Update the configuration with the database information even though it already exists
      if (!config.buckets) {
        config.buckets = {};
      }

      config.buckets[bucketName] = {
        name: bucketName,
        retentionPeriod: retentionPeriod || 'infinite'
      };

      await writeConfig(config);

      return NextResponse.json({
        success: true,
        bucket: {
          name: bucketName,
          retentionPeriod: retentionPeriod || 'infinite'
        },
        message: `Database '${bucketName}' already exists and has been configured for use`
      }, { status: 200 });
    }

    // Handle other error status codes
    if (response.status === 422) {
      return NextResponse.json(
        { success: false, error: `Invalid database name: '${bucketName}'` },
        { status: 422 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to create bucket: ${response.statusText}`,
          status: response.status
        },
        { status: response.status }
      );
    }

    // Update the configuration with the bucket information
    if (!config.buckets) {
      config.buckets = {};
    }
    config.buckets[bucketName] = {
      name: bucketName,
      retentionPeriod: retentionPeriod || 'infinite'
    };

    await writeConfig(config);

    return NextResponse.json({
      success: true,
      bucket: {
        name: bucketName,
        retentionPeriod: retentionPeriod || 'infinite'
      },
      message: `Bucket '${bucketName}' created successfully`
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating bucket:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create bucket',
      },
      { status: 500 }
    );
  }
}

// Get list of buckets
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
          error: `Failed to list buckets: ${response.statusText}`,
          status: response.status
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buckets = data.map((bucket: any) => bucket['iox::database']);

    return NextResponse.json({
      success: true,
      buckets: buckets
    });
  } catch (error) {
    console.error('Error listing buckets:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list buckets',
      },
      { status: 500 }
    );
  }
}

// DELETE handler to remove a bucket
export async function DELETE(request: NextRequest) {
  try {
    // Get the bucket name from the query parameters
    const searchParams = request.nextUrl.searchParams;
    const bucketName = searchParams.get('name');

    if (!bucketName) {
      return NextResponse.json(
        { success: false, error: 'Bucket name is required' },
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

    // First, try to delete from the config file
    if (config.buckets && config.buckets[bucketName]) {
      delete config.buckets[bucketName];
      await writeConfig(config);
    }

    // Then attempt to delete from InfluxDB
    // Use the correct endpoint format for InfluxDB v3 database deletion
    const response = await fetch(`${endpointUrl}api/v3/configure/database?db=${encodeURIComponent(bucketName)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${config.adminToken}`,
        'Accept': 'application/json'
      }
    });

    // Handle response
    if (!response.ok) {
      // Try to get error details from response
      let errorMessage = `Failed to delete bucket: ${response.statusText}`;
      try {
        const errorData = await response.text();
        console.log('Delete API: Error response:', errorData);
        if (errorData) {
          try {
            const parsedError = JSON.parse(errorData);
            if (parsedError.error) {
              errorMessage = parsedError.error;
            }
          } catch {
            // If we can't parse the error as JSON, use the raw text
            if (errorData.length < 100) { // Only use the text if it's reasonably short
              errorMessage = errorData;
            }
          }
        }
      } catch {
        // Ignore error parsing errors
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          status: response.status
        },
        { status: response.status }
      );
    }

    // Remove the bucket from the config file if it exists there
    if (config.buckets && config.buckets[bucketName]) {
      delete config.buckets[bucketName];
      await writeConfig(config);
    }

    return NextResponse.json({
      success: true,
      message: `Bucket '${bucketName}' deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting bucket:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete bucket',
      },
      { status: 500 }
    );
  }
}
