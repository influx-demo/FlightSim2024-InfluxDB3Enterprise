import { NextRequest, NextResponse } from 'next/server';
import { readConfig, writeConfig, getFormattedEndpoint } from '@/lib/config';
import { spawn } from 'child_process';

// Create a read/write token for a specific bucket
export async function POST(request: NextRequest) {
  try {
    const { bucketName, tokenName, description } = await request.json();

    if (!bucketName || !tokenName) {
      return NextResponse.json(
        { success: false, error: 'Bucket name and token name are required' },
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

    try {
      // Using the Windows path to the InfluxDB CLI executable
      const cliPath = 'C:\\Program Files\\InfluxData\\influxdb\\influxdb3.exe';
      const args = [
        'create', 'token',
        '--permission', `db:${bucketName}:read,write`,
        '--name', `Token for ${bucketName}`,
        '--token', config.adminToken,
        '--expiry', '7y'
      ];

      // Use spawn to handle the CLI process
      console.log(`Creating token for bucket ${bucketName} with command:\n\ninfluxdb3 ${args.join(' ')}\n\n`);
      const cliProcess = spawn(cliPath, args);

      // Collect output
      let stdoutData = '';
      let stderrData = '';

      // Collect stdout data
      cliProcess.stdout.on('data', (data: Buffer) => {
        stdoutData += data.toString();
      });

      // Collect stderr data
      cliProcess.stderr.on('data', (data: Buffer) => {
        stderrData += data.toString();
      });

      // Wait for the process to exit
      await new Promise<void>((resolve, reject) => {
        cliProcess.on('close', (code: number) => {
          if (code !== 0) {
            reject(new Error(`CLI process exited with code ${code}: ${stderrData}`));
          } else {
            resolve();
          }
        });

        cliProcess.on('error', (error: Error) => {
          reject(error);
        });
      });

      // Log the full output for debugging
      console.log('CLI command output:', { stdout: stdoutData, stderr: stderrData });

      // Try to extract the token from the output
      // First try to match the full token line with ANSI codes
      const tokenMatch = stdoutData.match(/\x1B\[1mToken:\x1B\[0m\s+([^\s]+)/) ||
        // Fallback to matching any token-like string that's at least 20 chars long
        stdoutData.match(/([a-zA-Z0-9_\-]{20,})/);

      if (!tokenMatch || !tokenMatch[1]) {
        console.error('Failed to parse token from CLI output. Full output:', stdoutData);
        throw new Error('Failed to parse token from CLI output');
      }

      // Clean up the token in case there are any ANSI escape codes or extra characters
      const token = tokenMatch[1].trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      const tokenId = `cli-${Date.now()}`;

      // Save the token in our configuration
      if (!config.buckets) {
        config.buckets = {};
      }

      // If the bucket doesn't exist, create it
      if (!config.buckets[bucketName]) {
        config.buckets[bucketName] = {
          name: bucketName,
          retentionPeriod: 'infinite'
        };
      }

      // Add the token to the bucket
      config.buckets[bucketName].token = token;
      config.buckets[bucketName].tokenId = tokenId;

      await writeConfig(config);

      return NextResponse.json({
        success: true,
        token: token,
        tokenDetails: {
          id: tokenId,
          token: token,
          name: tokenName,
          description: description || `Token for ${bucketName} bucket`
        },
        message: `Token for bucket '${bucketName}' created successfully`
      }, { status: 201 });
    } catch (error) {
      console.error('CLI command failed:', error);
      throw new Error(`Failed to create token using CLI: ${error instanceof Error ? error.message : String(error)}`);
    }
  } catch (error) {
    console.error('Error creating token:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create token',
      },
      { status: 500 }
    );
  }
}

// GET handler to retrieve tokens - either all tokens or tokens for a specific bucket
export async function GET(request: NextRequest) {
  try {
    // Get the bucket name from the query parameters if provided
    const searchParams = request.nextUrl.searchParams;
    const bucketName = searchParams.get('bucket');

    // Read the current configuration to get the endpoint and admin token
    const config = await readConfig();

    if (!config.influxEndpoint || !config.adminToken) {
      return NextResponse.json(
        { success: false, error: 'InfluxDB configuration is incomplete. Please configure the endpoint and admin token first.' },
        { status: 400 }
      );
    }

    // If a bucket name is provided, check if we have a token for this bucket in config
    if (bucketName) {
      // Check if we have a token for this bucket in our config
      if (config.buckets && config.buckets[bucketName] && config.buckets[bucketName].token) {
        // Create a token object from the config data
        const tokenFromConfig = {
          id: config.buckets[bucketName].tokenId || '',
          name: `Token for ${bucketName}`,
          description: `Token for ${bucketName} bucket`,
          created_at: new Date().toISOString(),
          expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };

        return NextResponse.json({
          success: true,
          token: config.buckets[bucketName].token,
          tokens: [tokenFromConfig], // Include the token in the tokens array
          message: `Retrieved token for bucket '${bucketName}'`
        });
      }

      // If not in config, try to get from InfluxDB
      // Get the properly formatted endpoint URL
      const endpointUrl = getFormattedEndpoint(config);

      if (!endpointUrl) {
        return NextResponse.json(
          { success: false, error: 'InfluxDB endpoint is not configured' },
          { status: 400 }
        );
      }

      // Use a simpler query that's more likely to work
      // We'll filter the results in code instead of in the SQL query
      const query = `SELECT * FROM system.tokens WHERE permissions NOT LIKE '\*%'`;

      // Call the InfluxDB API to execute the SQL query
      const response = await fetch(`${endpointUrl}api/v3/query_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${config.adminToken}`
        },
        body: JSON.stringify({
          db: '_internal',
          q: query
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { success: false, error: `Failed to list tokens: ${response.statusText}`, details: errorText },
          { status: response.status }
        );
      }

      // Parse the response
      const data = await response.json();

      // Find the tokens where `name` === "Token for bucket-name" 
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tokens = data.filter((token: any) => {
        return token.name === `Token for ${bucketName}`;
      });

      // Process tokens from the query results

      // Make sure we're returning properly formatted tokens
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formattedTokens = tokens.map((token: any) => ({
        id: token.id || '',
        name: token.name || `Token for ${bucketName}`,
        description: token.description || '',
        created_at: token.created_at || new Date().toISOString(),
        expiry: token.expiry || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }));

      return NextResponse.json({
        success: true,
        tokens: formattedTokens,
        message: `Retrieved tokens for bucket '${bucketName}'`
      });
    }

    // If no bucket name provided, list all tokens
    // Get the properly formatted endpoint URL
    const endpointUrl = getFormattedEndpoint(config);

    if (!endpointUrl) {
      return NextResponse.json(
        { success: false, error: 'InfluxDB endpoint is not configured' },
        { status: 400 }
      );
    }

    // Call the InfluxDB API to list enterprise tokens
    const response = await fetch(`${endpointUrl}api/v3/configure/enterprise/token`, {
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
          error: `Failed to list tokens: ${response.statusText}`,
          status: response.status
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Make sure we're returning properly formatted tokens
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedTokens = (data.tokens || []).map((token: any) => ({
      id: token.id || '',
      name: token.name || 'Unnamed Token',
      description: token.description || '',
      created_at: token.created_at || new Date().toISOString(),
      expiry: token.expiry || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }));

    return NextResponse.json({
      success: true,
      tokens: formattedTokens,
      message: 'Retrieved all tokens'
    });
  } catch (error) {
    console.error('Error listing tokens:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list tokens',
      },
      { status: 500 }
    );
  }
}

// Import child_process for executing system commands is no longer needed

// DELETE handler to remove a token
export async function DELETE(request: NextRequest) {
  try {
    // Get the token ID and optional bucket name from the query parameters
    const searchParams = request.nextUrl.searchParams;
    const tokenName = searchParams.get('tokenName');
    const bucketName = searchParams.get('bucket');

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

    if (!tokenName) {
      return NextResponse.json(
        { success: false, error: 'Token name is required' },
        { status: 400 }
      );
    }

    // We must use the CLI to delete the token since there is no REST API for token deletion
    try {
      // Using the Windows path to the InfluxDB CLI executable
      const cliPath = 'C:\\Program Files\\InfluxData\\influxdb\\influxdb3.exe';

      // Delete token with the specified name

      // Use spawn to create a process that we can interact with
      const cliProcess = spawn(cliPath, [
        'delete', 'token',
        '--token-name', tokenName,
        '--token', config.adminToken
      ]);

      // Collect stdout data
      cliProcess.stdout.on('data', (data: Buffer) => {
        // If the CLI is asking for confirmation, automatically send 'yes'
        if (data.toString().includes("Enter 'yes' to confirm")) {
          cliProcess.stdin.write('yes\n');
        }
      });

      // Collect stderr data
      let stderrData = '';
      cliProcess.stderr.on('data', (data: Buffer) => {
        stderrData += data.toString();
        // Collect error output
      });

      // Return a promise that resolves when the process exits
      await new Promise((resolve, reject) => {
        cliProcess.on('close', (code: number | null) => {
          // Check process exit code
          if (code === 0) {
            resolve(code);
          } else {
            reject(new Error(`CLI process exited with code ${code}: ${stderrData}`));
          }
        });

        cliProcess.on('error', (err: Error) => {
          console.error('CLI process error:', err);
          reject(err);
        });
      });

      // Token deletion completed successfully
    } catch (error) {
      console.error('Error executing CLI command:', error);
      return NextResponse.json({
        success: false,
        error: `Failed to delete token: ${error instanceof Error ? error.message : 'Unknown error'}`
      }, { status: 500 });
    }

    // If we got here, the token deletion was successful
    // Now update our local config

    // If a bucket name was provided, also remove the token from the config
    if (bucketName && config.buckets && config.buckets[bucketName]) {
      if (config.buckets[bucketName].token) {
        delete config.buckets[bucketName].token;
        // Also remove the tokenId if it exists
        if (config.buckets[bucketName].tokenId) {
          delete config.buckets[bucketName].tokenId;
        }
        await writeConfig(config);
      }
    }

    // Clean up any old tokens structure if it exists
    if (bucketName && config.tokens && config.tokens[bucketName]) {
      delete config.tokens[bucketName];
      await writeConfig(config);
    }

    return NextResponse.json({
      success: true,
      message: bucketName
        ? `Token for bucket '${bucketName}' deleted successfully`
        : 'Token deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting token:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete token',
      },
      { status: 500 }
    );
  }
}
