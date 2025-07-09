"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ConfigContextType {
  influxEndpoint: string | null;
  adminToken: string | null;
  isConfigured: boolean;
  currentBucket: string | null;
  activeBucket: string | null;
  gamificationEnabled: boolean;
  saveConfiguration: (url: string, token: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createBucket: (name: string, retentionPeriod?: number) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createToken: (bucketName: string, tokenName: string, description?: string) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getBuckets: () => Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTokens: () => Promise<any[]>;
  setActiveBucket: (bucketName: string | null) => void;
  isLoading: boolean;
  error: string | null;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

interface ConfigProviderProps {
  children: ReactNode;
}

export const ConfigProvider = ({ children }: ConfigProviderProps) => {
  const [influxEndpoint, setEndpoint] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [currentBucket, setCurrentBucket] = useState<string | null>(null);
  const [activeBucket, setActiveBucketState] = useState<string | null>(null);
  const [gamificationEnabled, setGamificationEnabled] = useState(false);
  
  // Function to set active bucket and save it to config
  const setActiveBucket = async (bucketName: string | null) => {
    console.log(`Setting active bucket to: ${bucketName}`);
    setActiveBucketState(bucketName);
    
    // Save to config file
    try {
      // First get the current config to ensure we're only updating the activeBucket property
      const configResponse = await fetch('/api/config');
      if (!configResponse.ok) {
        console.error(`Failed to get current config: ${configResponse.status} ${configResponse.statusText}`);
        return;
      }
      
      const currentConfig = await configResponse.json();
      
      // Now update only the activeBucket property
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          ...currentConfig,
          activeBucket: bucketName 
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to save active bucket to config: ${response.status} ${response.statusText}`, errorText);
        return;
      }
      
      const result = await response.json();
      console.log('Active bucket saved to config:', result);
    } catch (err) {
      console.error('Error saving active bucket to config:', err);
    }
  };

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load config from server API on initial mount
  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        // Fetch configuration from our API endpoint
        const response = await fetch('/api/config');
        if (!response.ok) {
          throw new Error(`Failed to load config: ${response.statusText}`);
        }
        
        const config = await response.json();
        
        if (config.influxEndpoint) {
          setEndpoint(config.influxEndpoint);
        }
        
        if (config.adminToken) {
          setAdminToken(config.adminToken);
        }

        if (config.gamificationEnabled) {
          setGamificationEnabled(config.gamificationEnabled);
        }
        
        // Set current bucket if available
        if (config.buckets && Object.keys(config.buckets).length > 0) {
          // Use the first bucket as the current bucket
          const firstBucketName = Object.keys(config.buckets)[0];
          setCurrentBucket(firstBucketName);
          
          // Set active bucket for data tab
          // If there's only one bucket (excluding _internal), use that as default
          // Otherwise use the first non-internal bucket
          const bucketNames = Object.keys(config.buckets);
          const nonInternalBuckets = bucketNames.filter(name => name !== '_internal');
          
          if (nonInternalBuckets.length === 1) {
            // Only one non-internal bucket exists, use it
            setActiveBucket(nonInternalBuckets[0]);
          } else if (nonInternalBuckets.length > 1) {
            // Multiple non-internal buckets, use the first one
            setActiveBucket(nonInternalBuckets[0]);
          } else {
            // Only _internal bucket exists, set to null
            setActiveBucket(null);
          }
          
          // If activeBucket was previously set in config, use that
          if (config.activeBucket) {
            setActiveBucketState(config.activeBucket);
          }
        }
      } catch (err) {
        setError('Failed to load configuration from server');
        console.error('Error loading config:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  const saveConfiguration = async (url: string, token: string) => {
    setIsLoading(true);
    try {
      // Validate URL format
      new URL(url); // Will throw if invalid

      if (!token || token.trim() === '') {
        throw new Error('Admin token is required');
      }

      // Verify the connection with a health check before saving
      const healthCheckResponse = await fetch('/api/influxdb/health-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          influxEndpoint: url,
          adminToken: token
        })
      });

      if (!healthCheckResponse.ok) {
        const errorData = await healthCheckResponse.json();
        throw new Error(errorData.error || `Failed to connect to InfluxDB: ${healthCheckResponse.statusText}`);
      }
      
      // Health check passed, now save the configuration
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          influxEndpoint: url,
          adminToken: token
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save configuration: ${response.statusText}`);
      }

      // Update local state
      setEndpoint(url);
      setAdminToken(token);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Determine if configuration is complete
  const isConfigured = Boolean(influxEndpoint && adminToken);

  const createBucket = async (name: string, retentionPeriod?: number) => {
    setIsLoading(true);
    try {
      if (!influxEndpoint || !adminToken) {
        throw new Error('InfluxDB configuration is incomplete. Please configure the endpoint and admin token first.');
      }

      const response = await fetch('/api/influxdb/bucket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          bucketName: name,
          retentionPeriod
        })
      });

      // Check if the response is ok or if we need to handle it specially
      let data;
      try {
        // Try to parse the response as JSON
        const textResponse = await response.text();
        
        // Only try to parse if we have content
        if (textResponse && textResponse.trim()) {
          data = JSON.parse(textResponse);
        } else {
          // If no content, create a default response
          data = { 
            success: response.ok, 
            bucket: { name }
          };
        }
      } catch (error) {
        // Handle parsing error with proper type checking
        console.error('Error parsing bucket creation response:', error);
        const parseError = error as Error;
        throw new Error(`Failed to parse bucket creation response: ${parseError.message}`);
      }
      
      // If the response indicates an error and we have error information, throw it
      if (!response.ok && data && data.error) {
        throw new Error(data.error || `Failed to create bucket: ${response.statusText}`);
      }
      
      // If we don't have a success flag or it's false, and we're not ok, throw an error
      if ((!data.success || data.success === false) && !response.ok) {
        throw new Error(`Failed to create bucket: ${response.statusText}`);
      }
      return data.bucket;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bucket');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const createToken = async (bucketName: string, tokenName: string, description?: string) => {
    setIsLoading(true);
    try {
      if (!influxEndpoint || !adminToken) {
        throw new Error('InfluxDB configuration is incomplete. Please configure the endpoint and admin token first.');
      }

      const response = await fetch('/api/influxdb/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          bucketName,
          tokenName,
          description
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create token: ${response.statusText}`);
      }

      const data = await response.json();
      return data.token;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const getBuckets = async () => {
    try {
      if (!influxEndpoint || !adminToken) {
        throw new Error('InfluxDB configuration is incomplete. Please configure the endpoint and admin token first.');
      }

      const response = await fetch('/api/influxdb/bucket');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to get buckets: ${response.statusText}`);
      }

      const data = await response.json();
      return data.buckets || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get buckets');
      throw err;
    }
  };

  const getTokens = async () => {
    try {
      if (!influxEndpoint || !adminToken) {
        throw new Error('InfluxDB configuration is incomplete. Please configure the endpoint and admin token first.');
      }

      const response = await fetch('/api/influxdb/token');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to get tokens: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tokens || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get tokens');
      throw err;
    }
  };

  const value = {
    influxEndpoint,
    adminToken,
    isConfigured,
    currentBucket,
    activeBucket,
    gamificationEnabled,
    saveConfiguration,
    createBucket,
    createToken,
    getBuckets,
    getTokens,
    setActiveBucket,
    isLoading,
    error
  };

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};
