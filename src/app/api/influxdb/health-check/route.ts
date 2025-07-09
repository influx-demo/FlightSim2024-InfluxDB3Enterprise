import { NextRequest, NextResponse } from 'next/server';
import { formatEndpointUrl } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const { influxEndpoint, adminToken } = await request.json();
    
    if (!influxEndpoint || !adminToken) {
      return NextResponse.json(
        { success: false, error: 'InfluxDB endpoint URL and admin token are required' },
        { status: 400 }
      );
    }

    // Get the properly formatted endpoint URL
    const endpointUrl = formatEndpointUrl(influxEndpoint);

    // Make a health check request to InfluxDB
    const response = await fetch(`${endpointUrl}health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Unable to connect to InfluxDB. Check your endpoint URL and admin token.`,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'InfluxDB connection verified successfully'
    });
  } catch (error) {
    console.error('Error checking InfluxDB health:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to check InfluxDB health',
      },
      { status: 500 }
    );
  }
}
