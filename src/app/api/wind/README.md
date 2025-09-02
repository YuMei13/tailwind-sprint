## `/api/wind` — Open-Meteo 風資料代理

回傳路線抽樣點（[lat,lon]）在當前小時的風速/風向。

+ Path：`POST /api/wind`

+ Body：

```
{ "points": [[lat, lon], [lat, lon], ...] }
```

+ Response：
```
{ "points": [
  { "lat": 25.047, "lon": 121.517, "speedKmh": 7.2, "dirDeg": 45 },
  { "lat": 25.057, "lon": 121.510, "speedKmh": 5.8, "dirDeg": 90 }
]}
```

+ 備註：目前逐點查詢並 10 分鐘再驗證快取；量大時建議做去重/共享與邊緣快取。

## 驗收標準（DoD）

+ `/api/wind` 可對任意少量點（5~20）回傳風速/風向

+ 首頁顯示路線與抽樣點的風資訊（Marker/Popup）

+ 程式無 `any`、CI 綠燈

+ PR 說明含：抽樣策略、curl 測試步驟、後續優化方向（去重/快取/分段上色）