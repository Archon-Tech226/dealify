# Dealify

Dealify is a multivendor e-commerce platform with a Node.js/Express backend and a static frontend.

## Tech Stack

- Backend: Node.js, Express, MongoDB (Mongoose)
- Frontend: HTML, CSS, JavaScript
- Auth: JWT + refresh token flow
- Media: Cloudinary
- Payments: Razorpay (test/live by key configuration)
- Deployment: Render (backend), Vercel/static hosting (frontend)

## Project Structure

```text
dealify/
├─ backend/
│  ├─ config/
│  ├─ controllers/
│  ├─ middleware/
│  ├─ models/
│  ├─ routes/
│  ├─ services/
│  ├─ utils/
│  ├─ package.json
│  └─ server.js
├─ frontend/
│  ├─ css/
│  ├─ js/
│  ├─ pages/
│  └─ index.html
├─ render.yaml
└─ DEPLOYMENT_PREREQUISITES.md
```

## Backend Environment Variables

Create `backend/.env` and configure:

```dotenv
PORT=5000
NODE_ENV=development

MONGODB_URI=<your_mongodb_uri>

JWT_SECRET=<strong_random_secret>
JWT_EXPIRE=7d

CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
CLOUDINARY_CLOUD_NAME=<cloud_name>
CLOUDINARY_API_KEY=<api_key>
CLOUDINARY_API_SECRET=<api_secret>
CLOUDINARY_FALLBACK_LOCAL=false

RAZORPAY_KEY_ID=<rzp_test_or_live_key_id>
RAZORPAY_KEY_SECRET=<rzp_test_or_live_secret>

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=<email>
EMAIL_PASS=<app_password>
EMAIL_FROM=Dealify <<email>>

FRONTEND_URL=http://localhost:3000
```

For production deployment, also set variables listed in `render.yaml` and `DEPLOYMENT_PREREQUISITES.md`.

## Local Development

### 1) Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs at `http://localhost:5000`.

Health check:

```bash
GET http://localhost:5000/api/health
```

### 2) Frontend

Serve `frontend` on a local static server at port `3000`.

Example:

```bash
cd frontend
python -m http.server 3000
```

Or any static server of your choice.

Frontend runs at `http://localhost:3000`.

## Payment Flow (Razorpay)

- Buyer places order with payment method `razorpay`
- Backend creates internal order and Razorpay order
- Frontend opens Razorpay Checkout
- On success, frontend calls payment verification endpoint
- Backend verifies signature and finalizes order payment status

Endpoints:

- `POST /api/payments/create-order`
- `POST /api/payments/verify-payment`
- `GET /api/payments/razorpay-key`

## Deployment

### Backend (Render)

- `render.yaml` is included for backend service configuration
- Set all required env vars in Render dashboard
- Ensure `FRONTEND_URL`/`FRONTEND_URLS` point to deployed frontend domains

### Frontend

- Deploy `frontend` as static site (for example on Vercel)
- Ensure frontend API proxy/base URL points to deployed backend

Refer to `DEPLOYMENT_PREREQUISITES.md` for the complete checklist.

## Scripts

From `backend/package.json`:

- `npm start` – run backend in production mode
- `npm run dev` – run backend with nodemon
- `npm run seed` – seed initial data

## License

ISC