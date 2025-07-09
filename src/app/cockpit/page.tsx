"use client";

import { useState, useEffect } from 'react';
import { useConfig } from '@/contexts/ConfigContext';
import AppLayout from '../app-layout';
import dynamic from 'next/dynamic';
import styles from './cockpit.module.css';
import PilotName from '../components/PilotName';

// Dynamically import the MapView component with no SSR
const MapView = dynamic(
  () => import('./MapView'),
  { ssr: false }
);

// Interface for the consolidated flight data format
interface FlightDataRecord {
  time: string;
  topic: string;
  host: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export default function CockpitPage() {
  const { activeBucket } = useConfig();
  const [records, setRecords] = useState<FlightDataRecord[]>([]);

  // Helper function to extract values from records
  const getMetricValue = (metricName: string, defaultValue: number | null): number | null => {
    if (records.length === 0) return defaultValue;

    if (records[0][metricName] !== undefined) {
      return Number(records[0][metricName]);
    }

    return defaultValue;
  };

  // Fetch data on mount and when activeBucket changes
  useEffect(() => {
    if (activeBucket) {

      // Set up polling interval (every 0.5 seconds for cockpit data)
      const interval = setInterval(() => {
        (async () => {
          try {
            fetch(`/api/influxdb/bucket/${encodeURIComponent(activeBucket)}/measurements?cached=true`, {
              // Add cache control headers to prevent caching
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
                }
              }
            });

          } catch (err) {
            console.error('Error in auto-refresh:', err);
          }
        })();
      }, 200); // Update cockpit data every 200ms

      return () => {
        clearInterval(interval);
      };
    }
  }, [activeBucket]);

  // Only show the "select a bucket" message if loading is complete and there's no active bucket
  if (!activeBucket) {
    return (
      <AppLayout>
        <div className={styles.tabContent}>
          <h2>Cockpit Visualization</h2>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className={styles.tabContent}>
        <div className={styles.headerRow}>
          <h2 className={styles.headerTitle}>Cockpit Dashboard: {activeBucket}</h2>
          <PilotName />
        </div>

        <div className={styles.dashboardGrid}>
          <div className={styles.indicatorsRow}>
            {/* Indicator 1 - True Air Speed */}
            <div className={styles.indicator}>
              <div className={styles.indicatorValue}>
                {getMetricValue('speed_true_airspeed', null)?.toFixed(0) || '---'}
              </div>
              <div className={styles.indicatorLabel}>
                True Air Speed (knots)
              </div>
            </div>

            {/* Indicator 2 - Current Heading */}
            <div className={styles.indicator}>
              <div className={styles.indicatorValue}>
                {getMetricValue('flight_heading_magnetic', null)?.toFixed(0) || '---'}
              </div>
              <div className={styles.indicatorLabel}>
                Current Heading (°)
              </div>
            </div>

            {/* Indicator 3 - Current Altitude */}
            <div className={styles.indicator}>
              <div className={styles.indicatorValue}>
                {getMetricValue('flight_altitude', null)?.toFixed(0) || '---'}
              </div>
              <div className={styles.indicatorLabel}>
                Current Altitude (ft)
              </div>
            </div>

            {/* Indicator 4 - Vertical Speed with conditional color */}
            {(() => {
              const vs = getMetricValue('speed_vertical', 0) || 0;
              let vsColor = 'black';
              if (Math.abs(vs) < 1) {
                vsColor = 'black';
              } else if (vs > 0) {
                vsColor = 'green';
              } else {
                vsColor = 'red';
              }

              return (
                <div className={styles.indicator}>
                  <div className={styles.indicatorValue} style={{ color: vsColor }}>
                    {vs.toFixed(0)}
                  </div>
                  <div className={styles.indicatorLabel}>
                    Vertical Speed (ft/min)
                  </div>
                </div>
              );
            })()}

            {/* Indicator 5 - AP Heading with conditional color */}
            {(() => {
              const apHeading = getMetricValue('autopilot_heading_target', 0);
              const apOn = getMetricValue('autopilot_master', 0) === 1;

              return (
                <div className={styles.indicator}>
                  <div className={styles.indicatorValue} style={{ color: apOn ? 'green' : 'inherit' }}>
                    {/* this value can be negative - if so, add 360 */}
                    {apHeading !== null ? (apHeading < 0 ? apHeading + 360 : apHeading).toFixed(0) : '---'}
                  </div>
                  <div className={styles.indicatorLabel}>
                    AP HDG (°)
                  </div>
                </div>
              );
            })()}

            {/* Indicator 6 - AP Altitude with conditional color */}
            {(() => {
              const apAltitude = getMetricValue('autopilot_altitude_target', 0);
              const apOn = getMetricValue('autopilot_master', 0) === 1;

              return (
                <div className={styles.indicator}>
                  <div className={styles.indicatorValue} style={{ color: apOn ? 'green' : 'inherit' }}>
                    {apAltitude !== null ? apAltitude.toFixed(0) : '---'}
                  </div>
                  <div className={styles.indicatorLabel}>
                    AP ALT (ft)
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Flight Attitude Row - Side by side */}
          <div className={styles.graphsRow}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Attitude Indicator</h3>
              </div>
              <div className={styles.cardContent}>
                <div className={styles.attitudeContainer}>
                  {(() => {
                    const bankAngleRaw = getMetricValue('flight_bank', 0);
                    const bankAngle = bankAngleRaw ? -bankAngleRaw : 0;

                    // Get pitch angle value
                    const pitchAngle = getMetricValue('flight_pitch', 0) || 0;

                    // Calculate vertical offset for pitch (scale to fit within the indicator)
                    // We're mapping -35 to +35 degrees to a reasonable pixel range
                    // Negative pitch moves horizon up (aircraft nose down), positive pitch moves horizon down (aircraft nose up)
                    const pitchOffset = -pitchAngle * 4;

                    // Combined style for horizon elements with both rotation and vertical offset
                    const horizonStyle = {
                      transform: `rotate(${-bankAngle}deg) translateY(${pitchOffset}px)`,
                      transition: 'transform 0.1s'
                    };

                    // Create bank angle markers
                    const bankMarkers: React.ReactNode[] = [];
                    const markerAngles = [0, 10, 20, 30, 60, 90, -10, -20, -30, -60, -90];

                    markerAngles.forEach(angle => {
                      const isZero = angle === 0;
                      const isLabeledMarker = angle === 0 || Math.abs(angle) === 30 || Math.abs(angle) === 60 || Math.abs(angle) === 90;
                      const markerStyle = {
                        transform: `rotate(${angle}deg)`
                      };

                      const labelStyle = {
                        transform: `rotate(${-angle}deg)`
                      };

                      bankMarkers.push(
                        <div
                          key={`marker-${angle}`}
                          className={`${styles.marker} ${isZero ? styles.markerZero : ''} ${isLabeledMarker ? styles.markerLabeled : ''}`}
                          style={markerStyle}
                        >
                          {isLabeledMarker && (
                            <div className={styles.markerLabel} style={labelStyle}>
                              {Math.abs(angle)}°
                            </div>
                          )}
                        </div>
                      );
                    });

                    return (
                      <div className={styles.attitudeIndicator}>
                        <div className={styles.attitudeDisplay}>
                          <div className={styles.bankMarkersContainer} style={{ transform: `rotate(${-bankAngle}deg)`, transition: 'transform 0.1s' }}>
                            <div className={styles.bankMarkers}>
                              {bankMarkers}
                            </div>
                          </div>

                          <div className={styles.horizonContainer} style={horizonStyle}>
                            {/* Pitch reference lines */}
                            <div className={styles.pitchLines}>
                              {/* Positive pitch lines (above horizon) */}
                              <div className={styles.pitchLineShort} style={{ top: 'calc(50% - 20px)' }}></div>
                              <div className={styles.pitchLine} style={{ top: 'calc(50% - 40px)' }}></div>
                              <div className={styles.pitchLineShort} style={{ top: 'calc(50% - 60px)' }}></div>
                              <div className={styles.pitchLine} style={{ top: 'calc(50% - 80px)' }}></div>

                              {/* Negative pitch lines (below horizon) */}
                              <div className={styles.pitchLineShortWhite} style={{ top: 'calc(50% + 20px)' }}></div>
                              <div className={styles.pitchLineWhite} style={{ top: 'calc(50% + 40px)' }}></div>
                              <div className={styles.pitchLineShortWhite} style={{ top: 'calc(50% + 60px)' }}></div>
                              <div className={styles.pitchLineWhite} style={{ top: 'calc(50% + 80px)' }}></div>
                            </div>

                            <div className={styles.horizonLine}></div>
                            <div className={styles.skyBackground}></div>
                            <div className={styles.groundBackground}></div>
                          </div>

                          <div className={styles.planeContainer}>
                            <div className={styles.bankPointer}></div>
                            <div className={styles.leftWing}></div>
                            <div className={styles.rightWing}></div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Map View */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Flight Position</h3>
              </div>
              <div className={styles.cardContent}>
                <MapView
                  latitude={getMetricValue('flight_latitude', null)}
                  longitude={getMetricValue('flight_longitude', null)}
                  heading={getMetricValue('flight_heading_magnetic', null)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
