#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://localhost:3000"

docker compose up -d --build

echo "Waiting for API Gateway to come up..."
for i in {1..120}; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" || true)
  if [[ "$code" == "200" ]]; then
    break
  fi
  sleep 2
done

check_health() {
  local url="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
  if [[ "$code" != "200" ]]; then
    echo "Health check failed: $url ($code)"
    exit 1
  fi
}

check_health "http://localhost:3000/health"
check_health "http://localhost:3001/health"
check_health "http://localhost:3002/health"
check_health "http://localhost:3003/health"

login_response=$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" -d '{"email":"passenger@test.com","password":"password"}')
TOKEN=$(echo "$login_response" | python -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
if [[ -z "$TOKEN" ]]; then
  echo "Login failed: $login_response"
  exit 1
fi

passenger_id=$(echo "$login_response" | python -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")
driver1_login=$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" -d '{"email":"driver1@test.com","password":"password"}')
driver1_id=$(echo "$driver1_login" | python -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")

ride_request=$(curl -s -X POST "$BASE_URL/rides/request" -H "Content-Type: application/json" -d "{\"passenger_id\":$passenger_id,\"pickup_lat\":37.7749,\"pickup_lng\":-122.4194,\"dropoff_lat\":37.7840,\"dropoff_lng\":-122.4090}")
ride_id=$(echo "$ride_request" | python -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
if [[ -z "$ride_id" ]]; then
  echo "Ride request failed: $ride_request"
  exit 1
fi

accept_response=$(curl -s -X POST "$BASE_URL/rides/$ride_id/accept" -H "Content-Type: application/json" -d "{\"driver_id\":$driver1_id}")
status=$(echo "$accept_response" | python -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
if [[ "$status" != "accepted" ]]; then
  echo "Ride accept failed: $accept_response"
  exit 1
fi

seed_count=$(docker compose exec -T postgres psql -U postgres -d uber -t -c "SELECT COUNT(*) FROM users;" | xargs)
if [[ "$seed_count" -lt 4 ]]; then
  echo "Seed user count check failed: $seed_count"
  exit 1
fi

echo "All tests passed."
