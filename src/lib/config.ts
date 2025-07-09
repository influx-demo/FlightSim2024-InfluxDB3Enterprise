import fs from 'fs/promises';
import path from 'path';

// Define the path to our config file
const configFilePath = path.join(process.cwd(), 'config.json');

// Interface for our config structure
export interface Config {
  influxEndpoint?: string;
  adminToken?: string;
  activeBucket?: string | null;
  buckets?: {
    [bucketName: string]: {
      name: string;
      retentionPeriod?: number | string;
      token?: string;
      tokenId?: string;
      lvc?: {
        name: string;
        tableName: string;
        keyColumns: string;
        valueColumns: string;
        count: number;
        ttl: string;
      };
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Allow for additional properties
}

/**
 * Reads the configuration file and returns its contents
 * @returns The configuration object
 */
export async function readConfig(): Promise<Config> {
  try {
    const data = await fs.readFile(configFilePath, 'utf8');
    return JSON.parse(data);
  } catch {
    // If file doesn't exist or has invalid JSON, return empty config
    return {};
  }
}

/**
 * Writes the configuration object to the config file
 * @param config The configuration object to write
 */
export async function writeConfig(config: Config): Promise<void> {
  await fs.writeFile(configFilePath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Updates specific properties in the configuration
 * @param updates The properties to update
 * @returns The updated configuration
 */
export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const currentConfig = await readConfig();
  const updatedConfig = { ...currentConfig, ...updates };
  await writeConfig(updatedConfig);
  return updatedConfig;
}

/**
 * Removes specific keys from the configuration
 * @param keys The keys to remove
 * @returns The updated configuration
 */
export async function removeConfigKeys(keys: string[]): Promise<Config> {
  const currentConfig = await readConfig();
  
  for (const key of keys) {
    delete currentConfig[key];
  }
  
  await writeConfig(currentConfig);
  return currentConfig;
}

/**
 * Gets the InfluxDB endpoint URL with proper formatting
 * @param config The configuration object
 * @returns The formatted endpoint URL
 */
export function getFormattedEndpoint(config: Config): string | null {
  if (!config.influxEndpoint) return null;
  
  // Ensure the endpoint URL is properly formatted with trailing slash
  return formatEndpointUrl(config.influxEndpoint);
}

/**
 * Formats an endpoint URL to ensure it has a trailing slash
 * @param url The endpoint URL to format
 * @returns The formatted endpoint URL
 */
export function formatEndpointUrl(url: string): string {
  if (!url) return '';
  
  // Ensure the endpoint URL is properly formatted with trailing slash
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Checks if the configuration has valid InfluxDB credentials
 * @param config The configuration object
 * @returns Whether the configuration has valid credentials
 */
export function hasValidCredentials(config: Config): boolean {
  return Boolean(config.influxEndpoint && config.adminToken);
}
