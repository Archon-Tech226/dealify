# Dealify Deployment Prerequisites (Render + Vercel)

This checklist is prepared for your current codebase so deployment works without auth/CORS/API issues.

## 1) Render (Backend) — Required Environment Variables

Set these in **Render → Backend Service → Environment**:

- `NODE_ENV=production`
- `PORT=10000` (Render also injects `PORT` automatically)
- `MONGODB_URI=<your_mongodb_atlas_uri>`
- `JWT_SECRET=<strong_random_secret_32+chars>`
- `JWT_EXPIRE=15m`
- `REFRESH_TOKEN_EXPIRE_DAYS=30`
- `FRONTEND_URL=https://<your-vercel-domain>.vercel.app`
- `FRONTEND_URLS=https://<your-vercel-domain>.vercel.app,https://<your-vercel-preview-domain>.vercel.app`
- `COOKIE_SAME_SITE=none`
- `COOKIE_SECURE=true`
- `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`
- `CLOUDINARY_FALLBACK_LOCAL=false`
- `EMAIL_HOST=smtp.gmail.com`
- `EMAIL_PORT=587`
- `EMAIL_USER=<your_email_address>`
- `EMAIL_PASS=<your_email_app_password>`
- `EMAIL_FROM=Dealify <your_email_address>`
- `LOG_LEVEL=info` (optional)

## 2) Vercel (Frontend) — Required Setup

### Root directory
- Set project root to: `frontend`

### API proxy prereq
- Update `frontend/vercel.json`:
  - Replace `https://YOUR-RENDER-SERVICE.onrender.com` with your actual Render backend URL.

This makes frontend call `/api/...` and Vercel proxies to Render.

## 3) Deployment Order (Important)

1. Deploy backend on Render first.
2. Copy Render backend URL (example: `https://dealify-api.onrender.com`).
3. Update `frontend/vercel.json` destination to that URL.
4. Deploy frontend on Vercel.
5. Copy final Vercel domain.
6. Update Render `FRONTEND_URL` and `FRONTEND_URLS` with final Vercel domain(s).
7. Redeploy Render service once.

## 4) Post-deploy Verification Checklist

- `/api/health` returns OK from deployed frontend domain.
- Login works and refresh token cookie is set.
- Refresh flow works (stay logged in after token refresh).
- Forgot-password request succeeds and email arrives.
- Upload health endpoint succeeds.
- Seller uploads image(s) successfully.
- Buyer: add to cart, checkout, place order.
- Admin: create/update/delete coupon.

## 5) Common Pitfalls to Avoid

- Wrong `FRONTEND_URL` or missing preview domain in `FRONTEND_URLS` causes CORS failures.
- Not updating `frontend/vercel.json` backend destination causes frontend API failures.
- Using normal Gmail password instead of app password breaks mail sending.
- `COOKIE_SAME_SITE` not set to `none` in cross-domain setup can break refresh/logout flow.