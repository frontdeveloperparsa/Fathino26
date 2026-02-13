CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('passenger', 'driver')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rides (
  id SERIAL PRIMARY KEY,
  passenger_id INTEGER NOT NULL REFERENCES users(id),
  driver_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  pickup GEOGRAPHY(POINT, 4326) NOT NULL,
  dropoff GEOGRAPHY(POINT, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO users(email, phone, name, password_hash, role)
VALUES
  ('passenger@test.com', '1111111111', 'Passenger One', crypt('password', gen_salt('bf')), 'passenger'),
  ('driver1@test.com', '2222222222', 'Driver One', crypt('password', gen_salt('bf')), 'driver'),
  ('driver2@test.com', '3333333333', 'Driver Two', crypt('password', gen_salt('bf')), 'driver'),
  ('driver3@test.com', '4444444444', 'Driver Three', crypt('password', gen_salt('bf')), 'driver')
ON CONFLICT (email) DO NOTHING;

INSERT INTO driver_locations(driver_id, location)
SELECT id, ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography
FROM users WHERE email = 'driver1@test.com'
ON CONFLICT (driver_id) DO NOTHING;

INSERT INTO driver_locations(driver_id, location)
SELECT id, ST_SetSRID(ST_MakePoint(-122.418, 37.7755), 4326)::geography
FROM users WHERE email = 'driver2@test.com'
ON CONFLICT (driver_id) DO NOTHING;

INSERT INTO driver_locations(driver_id, location)
SELECT id, ST_SetSRID(ST_MakePoint(-122.42, 37.776), 4326)::geography
FROM users WHERE email = 'driver3@test.com'
ON CONFLICT (driver_id) DO NOTHING;
