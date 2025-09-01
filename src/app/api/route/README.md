## `/api/route` **— openrouteservice 路線代理**

## 此端點代理到 openrouteservice Directions（cycling-regular），回傳標準化 GeoJSON LineString，供前端 Leaflet 直接繪製。

## 環境變數

在專案根目錄建立 .env.local（本機）：

```
ORS_API_KEY=your_openrouteservice_api_key
```

取得方式：到 openrouteservice 官網註冊並在 Dashboard 產生 token。免費層約 2,500 req/day、40 req/min。

## Request

+ Method：POST

+ Path：/api/route

+ Headers：Content-Type: application/json

+ Body：
```
{
  "start": [lon, lat],
  "end":   [lon, lat]
}
```
## Response（200）
```
{
  "geometry": {
    "type": "LineString",
    "coordinates": [[lon,lat], [lon,lat], "..."]
  },
  "distance": 1234.5,
  "duration": 420,
  "bbox": [minLon, minLat, maxLon, maxLat]
}
```
## 錯誤回應

+ 400 BAD_REQUEST：格式錯誤（需包含 start、end 為 [lon,lat]）

+ 500 MISSING_ENV：缺少 ORS_API_KEY

+ 502 ORS_UPSTREAM_ERROR：上游 ORS 錯誤（可能為額度/參數）

+ 502 EMPTY_GEOMETRY：ORS 無回傳路線

## 測試（本地）
```
npm run dev
curl -X POST http://localhost:3000/api/route \
  -H "Content-Type: application/json" \
  -d '{"start":[121.517,25.047], "end":[121.510,25.057]}'
```
## 注意事項

+ 端點僅接受 [lon,lat] 順序（與 ORS 規格一致）；前端畫圖時再轉為 [lat,lon]。

+ 已加入 10 分鐘快取建議（revalidate: 600）；量大時可改為 Redis/Edge。

+ 請勿在前端直接曝露 ORS API Key。

## 這張 Issue 的 DoD（驗收標準）

+ `/api/route` 能在本地以 curl 成功取得路線（含 distance/duration）

+ 不同輸入錯誤能回應相對應的錯誤碼/訊息

+ 程式碼含基本輸入驗證與錯誤映射

+ PR 內附 測試步驟（curl 範例）與簡短說明

+ CI 綠燈