import fs from 'fs';
import path from 'path';
import { readConfig } from '@/lib/config';
import { NextResponse } from 'next/server';

// Create a global variable to track if monitoring is active
// This uses the Node.js global object which persists across module reloads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalMonitorState = (global as any).dirSizeMonitorState || {
    isActive: false,
    intervalId: null,
    instanceId: Date.now(), // Unique ID for this instance
    startTime: new Date().toISOString()
};

// Store it back in the global object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).dirSizeMonitorState = globalMonitorState;

// Clear any existing interval when the module is loaded
if (globalMonitorState.intervalId) {
    console.log(`[DirSizeMonitor] Clearing previous interval #${globalMonitorState.intervalId} from instance ${globalMonitorState.instanceId}`);
    clearInterval(globalMonitorState.intervalId);
    globalMonitorState.intervalId = null;
    globalMonitorState.isActive = false;
}

// Function to calculate directory size recursively
function calculateDirSize(dirPath: string): number {
    let totalSize = 0;

    try {
        const files = fs.readdirSync(dirPath);

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
                totalSize += calculateDirSize(filePath);
            } else {
                totalSize += stats.size;
            }
        }

        return totalSize;
    } catch (error) {
        console.error(`Error calculating size for ${dirPath}:`, error);
        return 0;
    }
}

// Function to write data to InfluxDB
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeToInfluxDB(data: string, config: any) {
    try {
        const url = new URL(`${config.influxEndpoint}api/v3/write_lp`);

        // Use the active bucket from config
        const bucketName = config.activeBucket;
        if (!bucketName) {
            console.error('[DirSizeMonitor] No active bucket configured');
            return;
        }
        url.searchParams.append('db', bucketName);
        url.searchParams.append('precision', 'nanosecond');

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.adminToken}`,
                'Content-Type': 'text/plain'
            },
            body: data
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`HTTP error ${response.status}: ${errorData}`);
        }

        console.log(`[DirSizeMonitor] Data written successfully: ${new Date().toISOString()}`);
        return await response.json().catch(() => ({})); // Handle empty responses
    } catch (error) {
        console.error('[DirSizeMonitor] Error writing to InfluxDB:',
            error instanceof Error ? error.message : String(error));
    }
}

// Main function to collect and send data
async function collectAndSendData() {
    try {
        const config = await readConfig();

        if (!config.influxEndpoint || !config.adminToken) {
            console.error('[DirSizeMonitor] InfluxDB configuration is incomplete');
            return;
        }

        if (!config.dataPath) {
            console.error('[DirSizeMonitor] dataPath is missing in config. Please add it to config.json');
            return;
        }

        const dbDirectory = config.dataPath;

        if (!fs.existsSync(dbDirectory)) {
            console.error('[DirSizeMonitor] Could not find DB directory');
            return;
        }

        console.log(`[DirSizeMonitor] Calculating size for DB directory: ${dbDirectory}`);
        const dbSize = calculateDirSize(dbDirectory);

        const timestamp = Date.now() * 1000000;

        const data = [
            `directory_stats,folder=db_size directory_size_bytes=${dbSize} ${timestamp}`,
        ].join('\n');

        console.log('[DirSizeMonitor] Data to send:', data);

        await writeToInfluxDB(data, config);

    } catch (error) {
        console.error('[DirSizeMonitor] Error in collection cycle:', error);
    }
}

// Start the monitoring
if (!globalMonitorState.isActive) {
    console.log(`[DirSizeMonitor] Starting monitoring with instance ID: ${globalMonitorState.instanceId} at ${globalMonitorState.startTime}`);
    // Run once immediately
    collectAndSendData();
    // Then set up interval
    globalMonitorState.intervalId = setInterval(collectAndSendData, 10 * 1000); // Every 10 seconds
    globalMonitorState.isActive = true;
}

// API route handlers
export async function GET() {
    return NextResponse.json({
        success: true,
        monitoring: globalMonitorState.isActive,
        instanceId: globalMonitorState.instanceId,
        startTime: globalMonitorState.startTime,
        message: globalMonitorState.isActive
            ? `Directory size monitoring is active (instance ${globalMonitorState.instanceId})`
            : 'Directory size monitoring is not active'
    });
}

export async function POST(request: Request) {
    const { action, intervalSeconds = 10 } = await request.json();

    if (action === 'start' && !globalMonitorState.isActive) {
        // Run once immediately
        collectAndSendData();
        // Then set up interval
        globalMonitorState.intervalId = setInterval(collectAndSendData, intervalSeconds * 1000);
        globalMonitorState.isActive = true;
        globalMonitorState.startTime = new Date().toISOString();
        return NextResponse.json({
            success: true,
            instanceId: globalMonitorState.instanceId,
            message: `Directory size monitoring started (instance ${globalMonitorState.instanceId})`
        });
    }
    else if (action === 'stop' && globalMonitorState.isActive) {
        if (globalMonitorState.intervalId) {
            clearInterval(globalMonitorState.intervalId);
            globalMonitorState.intervalId = null;
        }
        globalMonitorState.isActive = false;
        return NextResponse.json({
            success: true,
            instanceId: globalMonitorState.instanceId,
            message: `Directory size monitoring stopped (instance ${globalMonitorState.instanceId})`
        });
    }
    else if (action === 'restart') {
        // Stop any existing monitoring
        if (globalMonitorState.intervalId) {
            clearInterval(globalMonitorState.intervalId);
            globalMonitorState.intervalId = null;
        }
        // Create a new instance
        globalMonitorState.instanceId = Date.now();
        globalMonitorState.startTime = new Date().toISOString();
        // Start monitoring
        collectAndSendData();
        globalMonitorState.intervalId = setInterval(collectAndSendData, intervalSeconds * 1000);
        globalMonitorState.isActive = true;
        return NextResponse.json({
            success: true,
            instanceId: globalMonitorState.instanceId,
            message: `Directory size monitoring restarted with new instance ${globalMonitorState.instanceId}`
        });
    }
    else if (action === 'collect') {
        await collectAndSendData();
        return NextResponse.json({
            success: true,
            instanceId: globalMonitorState.instanceId,
            message: 'Directory sizes collected and sent'
        });
    }

    return NextResponse.json({
        success: false,
        message: `Invalid action or already in requested state (monitoring: ${globalMonitorState.isActive})`
    }, { status: 400 });
}