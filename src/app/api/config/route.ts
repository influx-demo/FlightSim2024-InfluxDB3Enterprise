import { NextRequest, NextResponse } from 'next/server';
import { readConfig, updateConfig, removeConfigKeys } from '@/lib/config';

// GET handler to retrieve configuration
export async function GET() {
  const config = await readConfig();
  return NextResponse.json(config);
}

// POST handler to update configuration
export async function POST(request: NextRequest) {
  try {
    const newData = await request.json();
    
    // Use the updateConfig function from the config library
    const updatedConfig = await updateConfig(newData);
    
    return NextResponse.json(
      { success: true, config: updatedConfig },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating config:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update configuration' },
      { status: 500 }
    );
  }
}

// DELETE handler to remove specific configuration keys
export async function DELETE(request: NextRequest) {
  try {
    const { keys } = await request.json();
    
    if (Array.isArray(keys)) {
      // Use the removeConfigKeys function from the config library
      const updatedConfig = await removeConfigKeys(keys);
      
      return NextResponse.json(
        { success: true, config: updatedConfig },
        { status: 200 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Invalid keys provided' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error deleting config keys:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete configuration keys' },
      { status: 500 }
    );
  }
}
