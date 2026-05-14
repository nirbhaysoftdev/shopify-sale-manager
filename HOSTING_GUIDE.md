# Shopify Sale Manager — Local Hosting Guide

Complete step-by-step guide to host the Shopify Sale Manager app from your
local Mac and expose it to the internet (so Shopify can reach it), **without
Docker**.

**Stack:** React (port 3000) + Express API (port 5001) + Background worker
+ MySQL + Redis.

---

## Prerequisites

- macOS (Intel or Apple Silicon)
- Admin rights on your machine
- A Shopify Partner account + a development store
- Your Shopify app's API key + secret (from Partner dashboard)

---

## Step 1 — Install Homebrew

Skip if `brew --version` already works.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Verify:

```bash
brew --version
```

---

## Step 2 — Install Node.js (v18 or higher)

```bash
brew install node
node -v
npm -v
```

---

## Step 3 — Install MySQL

```bash
brew install mysql
brew services start mysql
mysql_secure_installation
```

During `mysql_secure_installation`: set a root password and accept the
defaults for the remaining prompts.

Verify:

```bash
mysql --version
```

---

## Step 4 — Install Redis

```bash
brew install redis
brew services start redis
redis-cli ping
```

Expected output: `PONG`

---

## Step 5 — Install ngrok (for the public HTTPS URL)

```bash
brew install ngrok/ngrok/ngrok
```

1. Sign up at https://dashboard.ngrok.com
2. Copy your authtoken
3. Run:

```bash
ngrok config add-authtoken <YOUR_TOKEN>
```

---

## Step 6 — Create the database & user

```bash
mysql -u root -p
```

Inside the MySQL prompt:

```sql
CREATE DATABASE shopify_sale_manager;
CREATE USER 'salemanager'@'localhost' IDENTIFIED BY 'salemanager123';
GRANT ALL PRIVILEGES ON shopify_sale_manager.* TO 'salemanager'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## Step 7 — Install backend dependencies

```bash
cd /Users/nirbhaykumar/Documents/shopify-sale-manager/backend
rm -rf node_modules package-lock.json
npm install
```

This installs: `express`, `cors`, `mysql2`, `ioredis`, `bullmq`, `axios`,
`dotenv`, `@shopify/shopify-api`, `http-proxy-middleware`, `csv-parser`,
`fast-csv`, and `nodemon` (dev).

---

## Step 8 — Install frontend dependencies

```bash
cd /Users/nirbhaykumar/Documents/shopify-sale-manager/frontend
rm -rf node_modules package-lock.json
npm install
```

This installs React, `@shopify/polaris`, `@shopify/app-bridge`,
`react-router-dom`, etc. The first run takes several minutes.

---

## Step 9 — Install the root-level "run everything" helper

```bash
cd /Users/nirbhaykumar/Documents/shopify-sale-manager
npm install --save-dev concurrently
```

Edit `/Users/nirbhaykumar/Documents/shopify-sale-manager/package.json` so it
looks like this:

```json
{
  "scripts": {
    "dev": "concurrently -n api,worker,web -c blue,magenta,green \"npm --prefix backend run dev\" \"npm --prefix backend run worker\" \"npm --prefix frontend start\""
  },
  "dependencies": {
    "react-router-dom": "^7.13.1"
  },
  "devDependencies": {
    "concurrently": "^8.0.0"
  }
}
```

---

## Step 10 — Configure `backend/.env`

Open `/Users/nirbhaykumar/Documents/shopify-sale-manager/backend/.env` and
set:

```env
# Database (native MySQL = port 3306)
DB_HOST=localhost
DB_PORT=3306
DB_USER=salemanager
DB_PASSWORD=salemanager123
DB_NAME=shopify_sale_manager

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Server
PORT=5001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Shopify (from Partner dashboard)
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SCOPES=read_products,write_products,read_orders,write_orders

# Filled after Step 11
HOST=https://REPLACE_AFTER_NGROK.ngrok-free.app
```

---

## Step 11 — Start ngrok

In its own terminal tab (keep it running):

```bash
ngrok http 5001
```

You will see:

```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:5001
```

**Copy that HTTPS URL.**

---

## Step 12 — Update the Shopify Partner dashboard

Go to https://partners.shopify.com → your app → **Configuration**:

- **App URL:** `https://abc123.ngrok-free.app`
- **Allowed redirection URLs:** `https://abc123.ngrok-free.app/auth/callback`

Save.

---

## Step 13 — Put the ngrok URL into `.env`

Edit `backend/.env`:

```env
HOST=https://abc123.ngrok-free.app
```

---

## Step 14 — Start the app

From the project root:

```bash
cd /Users/nirbhaykumar/Documents/shopify-sale-manager
npm run dev
```

You will see three colored log streams (api, worker, web). Wait for:

- `✅ Server running on port 5001`
- `webpack compiled successfully` (frontend)

Sanity check in another tab:

```bash
curl http://localhost:5001/api/health
```

---

## Step 15 — Install the app on your dev store

Open this URL in your browser (replace the shop name):

```
https://abc123.ngrok-free.app/auth?shop=<your-dev-store>.myshopify.com
```

Approve the install. You will be redirected back into the embedded app.

---

## Daily restart cheatsheet

After a reboot, you only need:

```bash
brew services start mysql
brew services start redis

# Tab 1
ngrok http 5001

# Tab 2
cd /Users/nirbhaykumar/Documents/shopify-sale-manager
npm run dev
```

If the ngrok URL changed (free plan rotates URLs on every restart), update
`HOST` in `backend/.env` **and** the redirect URL in the Shopify Partner
dashboard, then restart `npm run dev`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | `brew services start mysql` |
| `ECONNREFUSED 127.0.0.1:6379` | `brew services start redis` |
| `Access denied for user 'salemanager'` | Re-run the SQL in Step 6 |
| `Frontend not ready` (502) | Wait for CRA to finish compiling, then refresh |
| Shopify HMAC validation fails | `SHOPIFY_API_SECRET` does not match Partner dashboard |
| ngrok URL changed | Update `HOST` in `.env` + redirect URL in Partner dashboard |
| Port 5001 already in use | `lsof -ti:5001 \| xargs kill -9` |
| Port 3000 already in use | `lsof -ti:3000 \| xargs kill -9` |

---

## Notes

- Your laptop must stay awake and online — this is **not** real production
  hosting. For production use Render, Railway, Fly.io, or a VPS.
- Free ngrok URLs change on every restart. A paid ngrok plan or a Cloudflare
  Tunnel with a named tunnel gives you a stable URL.
- Never expose ports 3306 (MySQL) or 6379 (Redis) publicly — only tunnel
  port 5001.
- The Express server already proxies the React frontend, so a single ngrok
  tunnel on port 5001 covers both.
