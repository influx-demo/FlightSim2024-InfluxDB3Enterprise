"use client";

import { useState, useEffect, useRef } from 'react';
import { useConfig } from '@/contexts/ConfigContext';
import AppLayout from '../app-layout';
import Notice from '@/components/ui/Notice';
import styles from './data.module.css';
import PilotName from '../components/PilotName';

// Types for our data
interface DataPoint {
  timestamp: string;
  value: number;
}

// Interface for the consolidated flight data format
interface FlightDataPoint {
  time: string;
  topic: string;
  host: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface BucketStats {
  recordCount: number;
  measurementCountPerRecord: number;
  compactionEvents: number;
  lastCompactionSaved: number | null;
  totalCompactionSavings: number | null;
  dbSizeData: DataPoint[];
}

export default function DataPage() {
  const { activeBucket } = useConfig();
  const [stats, setStats] = useState<BucketStats | null>(null);
  const [records, setRecords] = useState<FlightDataPoint[]>([]);
  const [metricFilter, setMetricFilter] = useState<string>('all');
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);

  // Units for size displays
  const [measurementInterval, setMeasurementInterval] = useState<'min' | 'sec' | 'ms'>('sec');
  const [dbSizeUnits, setDbSizeUnits] = useState<'kb' | 'mb' | 'gb'>('mb');
  const [lastCompactionSavedUnits, setLastCompactionSavedUnits] = useState<'kb' | 'mb' | 'gb'>('mb');
  const [totalCompactionSavingsUnits, setTotalCompactionSavingsUnits] = useState<'kb' | 'mb' | 'gb'>('gb');

  const cycleMeasurementInterval = () => {
    const intervals = ['min', 'sec', 'ms'] as const;
    const currentIndex = intervals.indexOf(measurementInterval);
    const nextIndex = (currentIndex + 1) % intervals.length;
    setMeasurementInterval(intervals[nextIndex]);
  };

  const cycleDbSizeUnits = () => {
    const units = ['kb', 'mb', 'gb'] as const;
    const currentIndex = units.indexOf(dbSizeUnits);
    const nextIndex = (currentIndex + 1) % units.length;
    setDbSizeUnits(units[nextIndex]);
  };

  const cycleLastCompactionSavedUnits = () => {
    const units = ['kb', 'mb', 'gb'] as const;
    const currentIndex = units.indexOf(lastCompactionSavedUnits);
    const nextIndex = (currentIndex + 1) % units.length;
    setLastCompactionSavedUnits(units[nextIndex]);
  };

  const cycleTotalCompactionSavingsUnits = () => {
    const units = ['kb', 'mb', 'gb'] as const;
    const currentIndex = units.indexOf(totalCompactionSavingsUnits);
    const nextIndex = (currentIndex + 1) % units.length;
    setTotalCompactionSavingsUnits(units[nextIndex]);
  };

  // Helper to convert minutes to selected units
  const formatMinutes = (minutes: number | null | undefined, units: 'min' | 'sec' | 'ms') => {
    if (minutes == null) return 'N/A';
    let value = minutes;
    if (units === 'min') value = value;
    if (units === 'sec') value = value / 60;
    if (units === 'ms') value = value / 60 / 1000;
    return value.toFixed(2);
  };

  // Helper to convert bytes to selected units
  const formatSize = (bytes: number | null | undefined, units: 'kb' | 'mb' | 'gb') => {
    if (bytes == null) return 'N/A';
    let value = bytes;
    if (units === 'kb') value = value / 1024;
    if (units === 'mb') value = value / 1024 / 1024;
    if (units === 'gb') value = value / 1024 / 1024 / 1024;
    return value.toFixed(2);
  };

  // Refs for canvas elements
  const dbSizeCanvasRef = useRef<HTMLCanvasElement>(null);

  // Function to fetch data
  const fetchData = async () => {
    if (!activeBucket) return;

    try {
      // Fetch stats with cache control headers
      fetch(`/api/influxdb/bucket/${encodeURIComponent(activeBucket)}/stats`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }).then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setStats(data.stats);
          }
        }
      });

      // Fetch measurements with cache control headers
      fetch(`/api/influxdb/bucket/${encodeURIComponent(activeBucket)}/measurements?limit=10`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }).then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setRecords(data.records);

            // Extract unique metrics from the properties
            if (data.records.length > 0) {
              const firstRecord = data.records[0];
              const metrics = Object.keys(firstRecord);

              setAvailableMetrics(metrics.sort());
            }
          }
        }
      });

    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  // Function to draw the database size graph
  const drawDbSizeGraph = () => {
    if (!dbSizeCanvasRef.current || !stats?.dbSizeData) return;

    const canvas = dbSizeCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const data = stats.dbSizeData;
    const width = canvas.width;
    const height = canvas.height;
    const padding = 45;

    // Helper to find a nice step size
    function niceStep(range: number) {
      const steps = [1, 2, 5, 10];
      const magnitude = Math.pow(10, Math.floor(Math.log10(range)));
      let step = magnitude;
      for (const s of steps) {
        if (range / (s * magnitude) <= 5) {
          step = s * magnitude;
          break;
        }
      }
      return step;
    }

    // Find min and max values
    const values = data.map(d => d.value);
    const rawMin = Math.min(...values) / 1024 / 1024;
    const rawMax = Math.max(...values) / 1024 / 1024;
    const range = rawMax - rawMin;
    const step = niceStep(range);
    const niceMin = Math.floor(rawMin / step) * step;
    const niceMax = Math.ceil(rawMax / step) * step;
    const minValue = niceMin;
    const maxValue = niceMax;

    // Draw horizontal grid lines and y-axis labels before the data line
    const numTicks = Math.round((maxValue - minValue) / step) + 1;
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < numTicks; i++) {
      const val = minValue + i * step;
      const y = height - padding - ((val - minValue) / (maxValue - minValue)) * (height - 2 * padding);
      // Draw grid line
      ctx.beginPath();
      ctx.strokeStyle = '#eee';
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      // Draw y-axis label
      ctx.fillStyle = '#666';
      ctx.fillText(Math.round(val).toString(), padding - 5, y);
    }

    // Draw x-axis timestamp markers and vertical grid lines
    if (data.length > 1) {
      // Parse timestamps
      const timestamps = data.map(d => new Date(d.timestamp));
      const minTime = Math.min(...timestamps.map(t => t.getTime()));
      const maxTime = Math.max(...timestamps.map(t => t.getTime()));
      const totalMinutes = (maxTime - minTime) / (1000 * 60);
      // Decide interval
      let interval = 10; // default 10 min
      if (totalMinutes < 20) interval = 2;
      else if (totalMinutes < 40) interval = 5;
      // Find the first tick >= minTime rounded up to interval
      const startTick = Math.ceil(minTime / (interval * 60 * 1000)) * (interval * 60 * 1000);
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let tick = startTick; tick <= maxTime; tick += interval * 60 * 1000) {
        // Find x position
        const ratio = (tick - minTime) / (maxTime - minTime);
        const x = padding + ratio * (width - 2 * padding);
        // Draw vertical grid line
        ctx.beginPath();
        ctx.strokeStyle = '#eee';
        ctx.moveTo(x, padding);
        ctx.lineTo(x, height - padding);
        ctx.stroke();
        // Draw timestamp label
        const date = new Date(tick);
        const label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        ctx.fillStyle = '#666';
        ctx.fillText(label, x, height - padding + 5);
      }
    }

    // Draw axes
    ctx.beginPath();
    ctx.strokeStyle = '#ccc';
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw data points (timestamp-based X axis)
    if (data.length > 1) {
      // Parse timestamps
      const timestamps = data.map(d => new Date(d.timestamp).getTime());
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      const timeRange = maxTime - minTime || 1; // prevent divide by zero

      // Draw line
      ctx.beginPath();
      ctx.strokeStyle = '#aaa'; // grey lines
      ctx.lineWidth = 2;

      data.forEach((point, i) => {
        const value = point.value / 1024 / 1024;
        const t = new Date(point.timestamp).getTime();
        const x = padding + ((t - minTime) / timeRange) * (width - 2 * padding);
        const y = height - padding - ((value - minValue) / (maxValue - minValue)) * (height - 2 * padding);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw points
      data.forEach((point) => {
        const value = point.value / 1024 / 1024;
        const t = new Date(point.timestamp).getTime();
        const x = padding + ((t - minTime) / timeRange) * (width - 2 * padding);
        const y = height - padding - ((value - minValue) / (maxValue - minValue)) * (height - 2 * padding);

        ctx.beginPath();
        ctx.fillStyle = '#3182ce';
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  };

  // Draw graphs when stats change
  useEffect(() => {
    if (stats) {
      drawDbSizeGraph();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);

  // Fetch data on mount and when activeBucket changes
  useEffect(() => {
    if (activeBucket) {
      // Initial data fetch
      fetchData();

      // Set up polling interval (every 1 second)
      const interval = setInterval(() => {
        fetchData();
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBucket]);

  // Format timestamp for display in UTC Zulu time with milliseconds
  const formatTimestamp = (timestamp: string) => {
    // Return the ISO string which is already in UTC Zulu time with milliseconds
    return timestamp;
  };

  // Let AppLayout handle the loading state
  // We don't need to check isLoading here anymore since AppLayout will handle it

  // Only show the "select a bucket" message if loading is complete and there's no active bucket
  if (!activeBucket) {
    return (
      <AppLayout>
        <div className={styles.tabContent}>
          <h2>Data Visualization</h2>
          <Notice type="info">
            Please select a bucket with data from the Buckets tab to view visualizations.
          </Notice>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className={styles.tabContent}>
        <div className={styles.headerRow}>
          <h2 className={styles.headerTitle}>Flight Data</h2>
          <PilotName />
        </div>

        <div className={styles.dashboardGrid}>

          <div className={styles.chart}>
            {/* Database size graph */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Database Size (MB)</h3>
              </div>
              <div className={styles.cardContent}>
                <div className={styles.graphContainer}>
                  <canvas
                    ref={dbSizeCanvasRef}
                    width="1000"
                    height="500"
                    style={{ width: '100%', height: '100%' }}
                  ></canvas>
                </div>
                <div className={styles.statLabel}>
                  Last hour (10s intervals)
                </div>
              </div>
            </div>
          </div>

          <div className={styles.indicators}>
            {/* Indicator 1 - Measurements per minute */}
            <div className={`${styles.indicator} ${styles.cursor}`} onClick={cycleMeasurementInterval}>
              <div className={styles.indicatorValue}>
                {formatMinutes((stats?.recordCount || 0) * (stats?.measurementCountPerRecord || 0), measurementInterval)}
              </div>
              <div className={styles.indicatorLabel}>
                Measurements / {measurementInterval}
              </div>
            </div>

            {/* Indicator 3 - Database Size */}
            <div className={styles.indicator + ' ' + styles.cursor} onClick={cycleDbSizeUnits}>
              <div className={styles.indicatorValue}>
                {stats?.dbSizeData && stats.dbSizeData.length > 0
                  ? formatSize(stats.dbSizeData[stats.dbSizeData.length - 1].value, dbSizeUnits)
                  : 'N/A'}
              </div>
              <div className={styles.indicatorLabel}>
                Database Size ({dbSizeUnits.toUpperCase()})
              </div>
            </div>

            {/* Indicator 4 - Compaction Events */}
            <div className={styles.indicator}>
              <div className={styles.indicatorValue}>
                {stats?.compactionEvents}
              </div>
              <div className={styles.indicatorLabel}>
                Compaction Events
              </div>
            </div>

            {/* Indicator 5 - Last Compaction Saved */}
            <div className={styles.indicator + ' ' + styles.cursor} onClick={cycleLastCompactionSavedUnits}>
              <div className={styles.indicatorValue}>
                {formatSize(stats?.lastCompactionSaved, lastCompactionSavedUnits)}
              </div>
              <div className={styles.indicatorLabel}>
                Last Compaction Saved ({lastCompactionSavedUnits.toUpperCase()})
              </div>
            </div>

            {/* Indicator 6 - Total Compaction Savings */}
            <div className={styles.indicator + ' ' + styles.cursor} onClick={cycleTotalCompactionSavingsUnits}>
              <div className={styles.indicatorValue}>
                {formatSize(stats?.totalCompactionSavings, totalCompactionSavingsUnits)}
              </div>
              <div className={styles.indicatorLabel}>
                Total Compaction Savings ({totalCompactionSavingsUnits.toUpperCase()})
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Recent Measurements ({stats?.measurementCountPerRecord} unique)</h3>
              <div className={styles.filterContainer}>
                <label htmlFor="metricFilter" className={styles.filterLabel}>Filter by metric:</label>
                <select
                  id="metricFilter"
                  value={metricFilter}
                  onChange={(e) => setMetricFilter(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="all">All metrics</option>
                  {availableMetrics.map((metric) => (
                    <option key={metric} value={metric}>{metric}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.cardContent}>
              <div className={styles.tableContainer}>
                <table className={styles.measurementsTable}>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Value</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '20px' }}>
                          No flight data records found
                        </td>
                      </tr>
                    ) : (
                      // If showing all metrics, just show first record
                      metricFilter === 'all' ? availableMetrics.map((metric) => (
                        <tr key={metric}>
                          <td>{metric}</td>
                          <td>{String(records[0][metric])}</td>
                          <td>{formatTimestamp(records[0].time)}</td>
                        </tr>
                      )) : (
                      // For each record, we'll display the selected metric
                      records.map((record: FlightDataPoint, recordIndex: number) => {
                        // Only show the selected metric
                        const fieldKey = metricFilter;
                        if (record[fieldKey] !== undefined) {
                          return (
                            <tr key={recordIndex}>
                              <td>{metricFilter}</td>
                                <td>{String(record[fieldKey])}</td>
                                <td>{formatTimestamp(record.time)}</td>
                              </tr>
                            );
                          }
                          return null;
                        }
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
