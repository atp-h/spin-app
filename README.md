# Spin The Wheel

Interactive spin-the-wheel web application with React frontend and Node.js backend.

## Features

- Create and manage multiple wheels
- Add, edit, and remove items from wheels
- Smooth spin animation with easing
- Fair random selection
- Persistent storage with SQLite
- Responsive design (mobile + desktop)

## Project Structure

```
spin-app/
├── frontend/           # React application
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── SpinWheel.js
│   │   │   └── ItemList.js
│   │   ├── App.js
│   │   ├── App.css
│   │   └── index.js
│   └── package.json
├── backend/            # Express API server
│   ├── server.js
│   └── package.json
├── Dockerfile.frontend
├── Dockerfile.backend
├── docker-compose.yml
└── README.md
```

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
cd spin-app

# Install all dependencies
npm run install:all

# Run both frontend and backend
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

### Running Frontend Only (without backend)

```bash
cd frontend
npm install
npm start
```

### Running Backend Only

```bash
cd backend
npm install
npm start
```

## Docker Deployment

### Build and Run

```bash
cd spin-app
docker-compose up -d
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

### Stop

```bash
docker-compose down
```

### Rebuild

```bash
docker-compose up -d --build
```

## Server Deployment (Linux)

### Option 1: Docker (Recommended)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Clone/build your project
cd spin-app
docker-compose up -d --build
```

### Option 2: Direct Installation

```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Setup backend
cd spin-app/backend
npm install
npm start &

# Build and serve frontend
cd spin-app/frontend
npm install
npm run build
npx serve -s build -l 3000 &
```

## HAProxy Configuration

Example HAProxy config for reverse proxy:

```haproxy
frontend http_front
    bind *:80
    bind *:443 ssl crt /path/to/certs.pem
    default_backend spin_app

backend spin_app
    option httpchk GET /api/wheels
    http-check expect status 200
    server frontend localhost:3000 check
    server backend localhost:5000 check
```

Or with path-based routing:

```haproxy
frontend http_front
    bind *:80
    default_backend spin_app

backend spin_app
    http-request set-path %[path,regsub(/api,/api)]
    acl is_api path_beg /api
    use_backend api_backend if is_api
    use_backend frontend_backend if !is_api

backend frontend_backend
    server frontend localhost:3000

backend api_backend
    server backend localhost:5000
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/wheels | List all wheels |
| GET | /api/wheels/:id | Get wheel by ID |
| POST | /api/wheels | Create new wheel |
| PUT | /api/wheels/:id | Update wheel |
| DELETE | /api/wheels/:id | Delete wheel |

## License

MIT
