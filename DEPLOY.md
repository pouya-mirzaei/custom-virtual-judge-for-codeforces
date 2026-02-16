# algo404 — Deployment Guide

## Prerequisites on the Server

- **Docker** (20.10+) and **Docker Compose** (v2)
- **Git** to clone the repo

Install Docker on Ubuntu/Debian:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # then re-login
```

---

## 1. Clone & Configure

```bash
git clone <your-repo-url> algo404
cd algo404

# Create .env from template
cp .env.example .env

# Generate secrets and paste them in .env
openssl rand -hex 32   # → JWT_SECRET
openssl rand -hex 32   # → ENCRYPTION_KEY

# Edit .env
nano .env
```

Set these values in `.env`:

```
JWT_SECRET=<paste-first-random-hex>
ENCRYPTION_KEY=<paste-second-random-hex>
FRONTEND_URL=http://your-server-ip-or-domain
PORT=80
```

---

## 2. Build & Start

```bash
docker compose up -d --build
```

This builds and starts 4 containers:
| Container | Description | Internal Port |
|-----------|-------------|---------------|
| `algo404-frontend` | Nginx + React SPA | 80 (exposed) |
| `algo404-backend` | Express API + Socket.io | 5000 |
| `algo404-cf` | Python CF proxy | 8000 |
| `algo404-mongo` | MongoDB 7 | 27017 |

The platform is accessible at `http://your-server-ip:80`.

---

## 3. Create Admin User

Register at the site, then promote to admin:

```bash
docker exec -it algo404-mongo mongosh algo404 \
  --eval 'db.users.updateOne({username:"YOUR_USERNAME"},{$set:{role:"admin"}})'
```

---

## 4. Common Commands

```bash
# View logs
docker compose logs -f backend
docker compose logs -f cf-service

# Restart a service
docker compose restart backend

# Stop everything
docker compose down

# Stop and wipe data (⚠️ deletes database)
docker compose down -v

# Rebuild after code changes
docker compose up -d --build

# Check status
docker compose ps
```

---

## 5. Custom Domain / HTTPS (Optional)

If you have a domain pointing to the server, you can add a reverse proxy with HTTPS using Caddy or Certbot:

**Option A — Caddy (easiest):**

```bash
# Install Caddy
sudo apt install caddy

# /etc/caddy/Caddyfile
your-domain.com {
    reverse_proxy localhost:80
}

sudo systemctl restart caddy
```

Caddy automatically provisions Let's Encrypt certificates.

**Option B — Nginx + Certbot:**

```bash
sudo apt install nginx certbot python3-certbot-nginx
# configure nginx, then:
sudo certbot --nginx -d your-domain.com
```

After setting up HTTPS, update `FRONTEND_URL` in `.env` to `https://your-domain.com` and restart:

```bash
docker compose up -d
```

---

## Architecture

```
Browser → Nginx (port 80)
            ├── /api/*        → Express backend (port 5000)
            ├── /socket.io/*  → Express backend (WebSocket)
            └── /*            → React SPA (static files)

Express backend → MongoDB (port 27017)
               → CF Service (port 8000) → Codeforces.com
```
