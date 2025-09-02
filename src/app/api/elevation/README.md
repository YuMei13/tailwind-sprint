### `/api/elevation` — OpenTopoData 代理
- `POST /api/elevation`
- Body（二擇一）：
  1. `{ "coords": [[lon,lat], ...], "intervalMeters": 200, "dataset": "srtm90m" }`
  2. `{ "points": [[lat,lon], ...], "dataset": "srtm90m" }`
- Response：
  ```json
  { "points": [
    { "lat": 25.047, "lon": 121.517, "elevation": 21.3 },
    { "lat": 25.057, "lon": 121.510, "elevation": 18.6 }
  ]}
