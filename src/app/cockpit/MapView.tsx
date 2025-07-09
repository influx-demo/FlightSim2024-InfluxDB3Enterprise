'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import styles from './cockpit.module.css';

// Fix for default marker icons in Next.js
// @ts-expect-error Leaflet types are not compatible with Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface MapViewProps {
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
}

export default function MapView({ latitude, longitude, heading }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const lastPositionRef = useRef<L.LatLng | null>(null);
  const isMapMoving = useRef(false);

  // Initialize map on component mount
  useEffect(() => {
    // Only initialize if the map container exists and we don't have a map instance yet
    if (!mapContainerRef.current || mapRef.current) return;

    // Initialize map with default center (will be updated when we get coordinates)
    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
      zoom: 13,
      center: [0, 0], // Will be updated immediately when coordinates are available
      preferCanvas: true, // Better performance for markers
      fadeAnimation: false, // Disable fade animation for better performance
      zoomSnap: 0.1, // Allow fractional zoom levels for smoother transitions
      zoomDelta: 0.5, // Smoother zoom steps
      wheelPxPerZoomLevel: 60, // Slower zoom with mouse wheel
      scrollWheelZoom: 'center', // Zoom to mouse position
    });

    // Add tile layer with optimization options
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      minZoom: 2,
      detectRetina: false, // Disable retina detection to prevent blurry tiles
      tileSize: 256,
      zoomOffset: 0,
      noWrap: true, // Prevent wrapping around the world
      bounds: [[-85.0511, -180], [85.0511, 180]], // Prevent loading tiles outside valid range
    }).addTo(mapRef.current);

    // Add a small delay to ensure the map container is properly sized
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize({ animate: false, pan: false });
      }
    }, 100);

    // Force a redraw of the map to fix any tile loading issues
    mapRef.current.invalidateSize({ animate: false, pan: false });

    // Add scale control
    L.control.scale({ imperial: true, metric: true }).addTo(mapRef.current);

    // Create initial marker (invisible until we have coordinates)
    const icon = L.divIcon({
      html: `
        <div style="
          width: 24px;
          height: 24px;
          background: #ff4d4d;
          border: 2px solid #fff;
          border-radius: 50%;
          position: relative;
          transform: rotate(${heading || 0}deg);
          transform-origin: center;
        ">
          <div style="
            position: absolute;
            top: -10px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-bottom: 10px solid #ff4d4d;
          "></div>
        </div>
      `,
      className: 'aircraft-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    markerRef.current = L.marker([0, 0], {
      icon,
      opacity: 0, // Start invisible
      zIndexOffset: 1000,
    }).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Update marker position and map view when position changes
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || isMapMoving.current) return;
    if (latitude === null || longitude === null) return;

    // Make marker visible once we have coordinates
    markerRef.current.setOpacity(1);

    // Keep marker at the center of the map
    const mapCenter = mapRef.current.getCenter();
    markerRef.current.setLatLng(mapCenter);

    // Update marker rotation if heading is available
    if (heading !== null && markerRef.current) {
      const icon = markerRef.current.getIcon() as L.DivIcon;
      if (icon) {
        const newHtml = (icon.options.html as string).replace(
          /transform: rotate\([\d.]+deg\)/,
          `transform: rotate(${heading}deg)`
        );
        icon.options.html = newHtml;
        markerRef.current.setIcon(icon);
      }
    }

    // Calculate the new position
    const newLatLng = L.latLng(latitude, longitude);

    // Center the map on the new position
    mapRef.current.setView(newLatLng, mapRef.current.getZoom(), {
      animate: true,
      duration: 0.5,
      easeLinearity: 0.25,
      noMoveStart: true
    });

    // Store the current position for the next update
    lastPositionRef.current = newLatLng;
  }, [latitude, longitude, heading]);

  return (
    <div className={styles.mapContainer} ref={mapContainerRef}>
      {!initialized.current && (
        <div className={styles.mapLoading}>
          Loading map...
        </div>
      )}
    </div>
  );
}
