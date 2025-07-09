import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Define the path to our config file
const configFilePath = path.join(process.cwd(), 'config.json');

// Helper to read the config file
async function readConfig() {
  try {
    const data = await fs.readFile(configFilePath, 'utf8');
    return JSON.parse(data);
  } catch {
    // If file doesn't exist or has invalid JSON, return empty config
    return {};
  }
}

// GET handler to retrieve config for debugging
export async function GET() {
  try {
    // Read the current configuration
    const config = await readConfig();
    
    // Create a safe version of the config with masked token
    const safeConfig = { ...config };
    if (safeConfig.adminToken) {
      const tokenLength = safeConfig.adminToken.length;
      safeConfig.adminToken = `${safeConfig.adminToken.substring(0, 8)}...${safeConfig.adminToken.substring(tokenLength - 8)}`;
    }
    
    // Log what buckets are in the config
    console.log('Debug API: Buckets in config:', safeConfig.buckets || {});
    
    return NextResponse.json({ 
      success: true, 
      config: safeConfig
    });
  } catch (error) {
    console.error('Error reading config:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to read config',
      },
      { status: 500 }
    );
  }
}
