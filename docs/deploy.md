
---

## 2️⃣ docs/deploy.md – Deployment Guideline
```markdown
# 

This project adopts **Vercel** to implement CI/CD。

---

## Environment Variables
Set in **Vercel → Project → Settings → Environment Variables** ：

| Name | Introduction | Example |
|---|---|---|
| `ORS_API_KEY` | OpenRouteService API Key | `xxxxxx` |
| `NEXT_PUBLIC_*` | If you like to make it public, using this prefix
| `NEXT_PUBLIC_MAP_TILE_URL=...` |

---

## Branch strategy
- `main` → Production
- `dev` → Preview
- Feature/Chore → Request PR → merge 至 `dev`（Preview URL generateted automatically）

---

## Procedure of Deployment
1. Log in [Vercel](https://vercel.com/) with GitHub account
2. Import 此 repo
3. Set environment variables
4. Deploy！  

> Production URL: <https://tailwind-sprint.vercel.app/>  
> every PR will generate Preview URL automatically

---

## Notice
- **Take time to build at beginning**：Since Next.js Turbopack complies contemporary.
- **API Key is a must**：If the ORS API key is not set，the route can not be completed.
- **Internet unstable tolerance**：timeout/retry already added in the backend；fallback would occur when try the first time. `error:true`
