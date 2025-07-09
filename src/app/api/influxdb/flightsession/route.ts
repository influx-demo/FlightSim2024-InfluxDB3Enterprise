import { NextRequest, NextResponse } from 'next/server';
import { readConfig, getFormattedEndpoint } from '@/lib/config';

export async function GET() {
    try {
        // Get configuration
        const config = await readConfig();
        if (!config.influxEndpoint || !config.adminToken) {
            return NextResponse.json(
                { success: false, error: 'InfluxDB configuration is incomplete.' },
                { status: 400 }
            );
        }
        const endpointUrl = getFormattedEndpoint(config);
        if (!endpointUrl) {
            return NextResponse.json(
                { success: false, error: 'InfluxDB endpoint is not configured' },
                { status: 400 }
            );
        }
        // Query all sessions using SQL API
        const sql = `SELECT pilot_name, anonymous, flight_time, time FROM flight_session ORDER BY time DESC`;
        const resp = await fetch(`${endpointUrl}api/v3/query_sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${config.adminToken}`
            },
            body: JSON.stringify({ db: config.activeBucket, q: sql })
        });
        const text = await resp.text();
        let data;
        let isJson = false;
        try {
            data = JSON.parse(text);
            isJson = true;
        } catch {
            data = text;
        }
        if (!resp.ok) {
            console.error('[FlightSession API] InfluxDB SQL error:', data);
            return NextResponse.json({ success: false, error: data }, { status: 500 });
        }
        // Return sessions as array
        return NextResponse.json({ success: true, sessions: isJson ? data : [] });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        // Get configuration
        const config = await readConfig();
        console.info('[Pilot API] Loaded config:', config);

        if (!config.influxEndpoint || !config.adminToken) {
            console.error('[Pilot API] InfluxDB configuration incomplete:', config);
            return NextResponse.json(
                { success: false, error: 'InfluxDB configuration is incomplete. Please configure the endpoint, admin token, and data path.' },
                { status: 400 }
            );
        }

        // Get the properly formatted endpoint URL
        const endpointUrl = getFormattedEndpoint(config);
        console.info('[Pilot API] Using endpointUrl:', endpointUrl);

        if (!endpointUrl) {
            console.error('[Pilot API] No endpointUrl resolved:', config);
            return NextResponse.json(
                { success: false, error: 'InfluxDB endpoint is not configured' },
                { status: 400 }
            );
        }
        const body = await req.json();
        console.info('[Pilot API] Request body:', body);
        const { pilotName } = body;
        if (!pilotName || typeof pilotName !== 'string') {
            console.error('[Pilot API] pilotName missing or invalid:', pilotName);
            return NextResponse.json({ success: false, error: 'pilotName is required' }, { status: 400 });
        }

        // Prepare InfluxDB line protocol
        const timestamp = Math.floor(Date.now() * 1e6); // nanoseconds
        // Escape only commas, spaces, and equals in pilot name for tag safety
        const escapedPilotName = pilotName.replace(/([ ,=])/g, '\\$1');
        // pilot_name is a tag, anonymous and flight_time are fields
        const line = `flight_session,pilot_name=${escapedPilotName} anonymous=false,flight_time=0i ${timestamp}`;
        console.info('[Pilot API] InfluxDB line protocol:', line);

        // Write to InfluxDB
        try {
            const influxResp = await fetch(`${endpointUrl}api/v2/write?bucket=${config.activeBucket}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.adminToken}`,
                    'Content-Type': 'text/plain',
                    'Accept': 'application/json',
                },
                body: line + '\n',
            });
            console.info('[Pilot API] InfluxDB response status:', influxResp.status);
            const influxText = await influxResp.text();
            console.info('[Pilot API] InfluxDB response text:', influxText);
            if (!influxResp.ok) {
                return NextResponse.json({ success: false, error: influxText }, { status: 500 });
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            console.error('[Pilot API] Fetch error:', err);
            return NextResponse.json({ success: false, error: err.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
