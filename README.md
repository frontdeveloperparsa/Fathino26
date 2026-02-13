# MVP Uber Clone (Microservices)

## Services
- `api-gateway` (port 3000)
- `user-service` (port 3001)
- `dispatch-service` (port 3002)
- `location-service` (port 3003)
- `postgres` with PostGIS (port 5432)
- `redis` (port 6379)

## Run
```bash
docker compose up --build
```

## Test
```bash
bash test.sh
```

## Main Endpoints (via API Gateway)
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /rides/request`
- `POST /rides/:id/accept`
- `GET /rides/:id`
- `POST /location/update`
- `GET /location/nearby?lat=&lng=&radius=`
- `GET /health`
