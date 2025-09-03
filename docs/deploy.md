
---

## 2️⃣ docs/deploy.md – 部署指南
```markdown
# 部署指南

本專案採用 **Vercel** 進行 CI/CD。

---

## 環境變數
在 **Vercel → Project → Settings → Environment Variables** 中設定：

| 名稱 | 說明 | 範例 |
|---|---|---|
| `ORS_API_KEY` | OpenRouteService API Key | `xxxxxx` |
| `NEXT_PUBLIC_*` | 若要暴露到前端，請使用此前綴 | `NEXT_PUBLIC_MAP_TILE_URL=...` |

---

## 分支策略
- `main` → Production
- `dev` → Preview
- Feature/Chore → 建立 PR → merge 至 `dev`（Preview URL 自動產生）

---

## 部署步驟
1. 登入 [Vercel](https://vercel.com/) 使用 GitHub 帳號
2. Import 此 repo
3. 設定環境變數
4. Deploy！  

> Production URL: <https://tailwind-sprint.vercel.app/>  
> 每個 PR 將自動生成 Preview URL

---

## 注意事項
- **首次 build 較久**：因 Next.js Turbopack 會現編
- **API Key 必填**：ORS API 若未設定，地圖無法繪製路線
- **網路不穩容錯**：後端已加 timeout/retry；單筆失敗會 fallback `error:true`
