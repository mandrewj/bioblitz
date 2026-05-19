# Regions

This directory holds the Area of Interest (AOI) polygons referenced from
`config/dashboard.config.yaml`.

## Accepted formats

- **GeoJSON** (`.geojson`): a `Feature` or `FeatureCollection` whose geometry is
  a `Polygon` or `MultiPolygon` in EPSG:4326 (lng/lat). Set
  `region.source.kind: geojson` in the config.
- **Shapefile zip** (`.zip`): a zipped bundle containing `.shp/.shx/.dbf/.prj`.
  Set `region.source.kind: shapefile-zip`. The cron handler converts the zip
  to GeoJSON via `shpjs` at ingestion time. Make sure the projection is
  WGS84 (EPSG:4326).

## TODO

- The bundled `eagle-creek.geojson` was fetched from the iNaturalist places
  API (`/v1/places/120856`) and represents the boundary of Eagle Creek Park
  as recorded by iNat. If you have a more authoritative shapefile from the
  park district, drop it in here (e.g. `eagle-creek.zip`) and switch
  `region.source.kind` to `shapefile-zip` in `dashboard.config.yaml`.
- If the polygon file is missing entirely the loader falls back to a
  bounding-box polygon around Eagle Creek Park (~39.85°N, -86.30°W,
  roughly 4×3 km) and logs a warning.
