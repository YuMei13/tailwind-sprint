# API 說明

此專案後端設計為 **Next.js App Router API Routes**，提供三個 proxy 服務：

- `/api/route` → OpenRouteService (ORS)
- `/api/wind` → Open-Meteo
- `/api/elevation` → OpenTopoData

---

## `/api/route` (ORS)
- **POST** `/api/route`
- **Request**
  ```json
  {
    "start": [121.517, 25.047], // [lon,lat]
    "end":   [121.510, 25.057], // [lon,lat]
    "profile": "cycling-regular"
  }
  ````
- **Response**
    ```json
    {
    "geometry": {
        "type": "LineString",
        "coordinates": [[121.517,25.047],[121.516,25.049], ...]
    },
    "distance": 1234,
    "duration": 456
    }
    ```
- **cURL
    ```bash
    curl -s -X POST http://127.0.0.1:3000/api/route \
    -H "Content-Type: application/json" \
    --data-binary '{"start":[121.517,25.047],"end":[121.510,25.057]}'
    ```
## `/api/wind` (Open-Meteo)
- **POST** `/api/wind`
- **Request**
  ```json
  { "points": [[25.047,121.517],[25.057,121.510]] }
  ```
- **Response**
    ```json
    {
    "points": [
        { "lat": 25.047, "lon": 121.517, "speedKmh": 7.2, "dirDeg": 45 },
        {"lat": 25.057, "lon": 121.510, "error": true, "msg": "..." }
        ]
    }
    ```
## `/api/elevation` (OpenTopoData)
- **POST** `/api/elevation`
- **Body**
  ```json
  { "points": [[25.047,121.517],[25.057,121.510]] }
  ```
- **Response**
    ```json
    {
        "points": [
            { "lat": 25.047, "lon": 121.517, "elevation": 21.3 },
            { "lat": 25.057, "lon": 121.510, "elevation": 18.6 }
        ] 
    }
    ```