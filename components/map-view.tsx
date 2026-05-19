"use client";

import * as React from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from "react-leaflet";
import L, { type LatLngBoundsExpression, type LatLngTuple } from "leaflet";
import "leaflet.markercluster";
import {
  basemapTileUrl,
  BASEMAP_SUBDOMAINS,
  BASEMAP_ATTRIBUTION,
  type BasemapKey,
} from "@/lib/basemap";
import type { OccurrenceFeature } from "@/lib/queries";
import { Select } from "@/components/ui/primitives";

interface RegionFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: unknown;
  bbox: [number, number, number, number];
}

export interface MapViewProps {
  occurrences: OccurrenceFeature[];
  region: RegionFeature | null;
  defaultBasemap: BasemapKey;
}

// Okabe-Ito orange + green — distinct from each other AND from the
// brand-blue clusters (which would otherwise read as GBIF points).
const COLOR_INAT = "#E69F00"; // okabe-ito orange
const COLOR_GBIF = "#009E73"; // okabe-ito green

function regionBounds(region: RegionFeature | null): LatLngBoundsExpression | null {
  if (!region?.bbox) return null;
  const [w, s, e, n] = region.bbox;
  return [
    [s, w],
    [n, e],
  ];
}

function buildClusterIcon(cluster: { getChildCount: () => number }) {
  const count = cluster.getChildCount();
  const size = count < 25 ? 28 : count < 100 ? 36 : 46;
  const bucket = count < 25 ? "small" : count < 100 ? "medium" : "large";
  return L.divIcon({
    html: `<div><span>${count}</span></div>`,
    className: `marker-cluster marker-cluster-${bucket}`,
    iconSize: L.point(size, size),
  });
}

/**
 * Drop-in MarkerClusterGroup for react-leaflet 5. We avoid the
 * react-leaflet-cluster package (its types lag) and hand-wire the
 * markercluster plugin against the parent map instance.
 */
function MarkerClusterLayer({ occurrences }: { occurrences: OccurrenceFeature[] }) {
  const map = useMap();
  const groupRef = React.useRef<L.MarkerClusterGroup | null>(null);

  React.useEffect(() => {
    const group = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: false, // custom rule below
      showCoverageOnHover: false,
      iconCreateFunction: buildClusterIcon,
      // Hybrid: spider-fy at high zoom, zoom-to at low zoom.
      zoomToBoundsOnClick: false,
    });

    group.on("clusterclick", (e: L.LeafletEvent) => {
      const evt = e as L.LeafletEvent & { layer: L.MarkerCluster };
      const cluster = evt.layer;
      const z = map.getZoom();
      if (z >= 16) {
        cluster.spiderfy();
      } else if (z >= 12) {
        // If all children stay together at zoom+1, spider-fy instead.
        const bounds = cluster.getBounds();
        const next = map.getBoundsZoom(bounds, true);
        if (next - z <= 1) cluster.spiderfy();
        else map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        map.fitBounds(cluster.getBounds(), { padding: [40, 40] });
      }
    });

    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  React.useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    const markers: L.CircleMarker[] = [];
    for (const o of occurrences) {
      const m = L.circleMarker([o.lat, o.lng], {
        radius: 6,
        color: "#ffffff",
        weight: 1.5,
        fillColor: o.source === "inat" ? COLOR_INAT : COLOR_GBIF,
        fillOpacity: 0.95,
      });
      const html = renderPopupHtml(o);
      m.bindPopup(html, { maxWidth: 260, autoPan: true });
      markers.push(m);
    }
    group.addLayers(markers);
  }, [occurrences]);

  return null;
}

function renderPopupHtml(o: OccurrenceFeature): string {
  const photo = o.photo
    ? `<img src="${escapeAttr(o.photo)}" alt="" style="display:block;width:100%;max-height:160px;object-fit:cover;border-radius:6px;margin-bottom:6px"/>`
    : "";
  const date = o.observedOn ?? "no date";
  const observer = o.observer ? ` · ${escapeHtml(o.observer)}` : "";
  const linkColor = o.source === "inat" ? COLOR_INAT : COLOR_GBIF;
  const sourceName = o.source === "inat" ? "iNaturalist" : "GBIF";
  return `
    <div style="font-size:12px;max-width:240px">
      ${photo}
      <div style="font-weight:700;font-style:italic;color:#1F2222">${escapeHtml(o.taxon)}</div>
      <div style="color:#5f6360;margin:2px 0">${escapeHtml(date)}${observer}</div>
      <div style="color:#5f6360;font-size:11px;margin:4px 0">${escapeHtml(o.attribution)}</div>
      <div><a href="${escapeAttr(o.sourceUrl)}" target="_blank" rel="noreferrer" style="color:${linkColor};font-weight:700">View on ${sourceName} →</a></div>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function escapeAttr(s: string): string {
  return s.replace(/[&"]/g, (c) => ({ "&": "&amp;", '"': "&quot;" }[c]!));
}

function BoundsFitter({ region }: { region: RegionFeature | null }) {
  const map = useMap();
  const lastBboxRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!region?.bbox) return;
    const key = region.bbox.join(",");
    if (lastBboxRef.current === key) return;
    lastBboxRef.current = key;
    const [w, s, e, n] = region.bbox;
    map.fitBounds(
      [
        [s, w],
        [n, e],
      ],
      { padding: [40, 40] }
    );
  }, [map, region]);
  return null;
}

const REGION_STYLE = {
  color: "#116dff",
  weight: 2,
  fillColor: "#116dff",
  fillOpacity: 0.06,
};

export default function MapView({
  occurrences,
  region,
  defaultBasemap,
}: MapViewProps) {
  const [basemap, setBasemap] = React.useState<BasemapKey>(defaultBasemap);

  const fallbackCenter: LatLngTuple = [39.85, -86.3];
  const bounds = regionBounds(region);

  return (
    <div className="relative w-full" style={{ height: "60vh", minHeight: 460 }}>
      <MapContainer
        center={fallbackCenter}
        zoom={12}
        bounds={bounds ?? undefined}
        scrollWheelZoom
        className="h-full w-full overflow-hidden rounded-lg"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          key={basemap}
          url={basemapTileUrl(basemap)}
          subdomains={BASEMAP_SUBDOMAINS}
          attribution={BASEMAP_ATTRIBUTION}
          maxZoom={19}
        />
        {region ? (
          <GeoJSON data={region as unknown as GeoJSON.Feature} style={() => REGION_STYLE} />
        ) : null}
        <BoundsFitter region={region} />
        <MarkerClusterLayer occurrences={occurrences} />
      </MapContainer>

      <div className="absolute right-3 top-3 z-[400] flex flex-wrap items-center gap-2 rounded-md border border-cream-300 bg-cream-50/95 px-2 py-1.5 shadow-leaf backdrop-blur">
        <Select
          aria-label="Basemap"
          value={basemap}
          onChange={(v) => setBasemap(v as BasemapKey)}
          options={[
            { value: "positron", label: "Light" },
            { value: "voyager", label: "Voyager" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </div>
      <div className="absolute right-3 bottom-9 z-[400] flex flex-col gap-1 rounded-md border border-cream-300 bg-cream-50/95 px-2 py-1.5 text-xs shadow-leaf backdrop-blur">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-moss-600">Sources</div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR_INAT }} /> iNaturalist
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR_GBIF }} /> GBIF
        </div>
      </div>
    </div>
  );
}
