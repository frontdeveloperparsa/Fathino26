import 'reflect-metadata';
import { Body, Controller, Get, HttpException, HttpStatus, Injectable, Module, Param, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import axios from 'axios';
import { Pool } from 'pg';

@Injectable()
class DispatchService {
  private pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'uber',
  });

  private locationServiceUrl = process.env.LOCATION_SERVICE_URL || 'http://location-service:3003';

  async requestRide(body: {
    passenger_id: number;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_lat: number;
    dropoff_lng: number;
    radius?: number;
  }) {
    const { passenger_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, radius } = body;
    if (!passenger_id || [pickup_lat, pickup_lng, dropoff_lat, dropoff_lng].some((v) => v === undefined)) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    const nearby = await axios.get(`${this.locationServiceUrl}/location/nearby`, {
      params: { lat: pickup_lat, lng: pickup_lng, radius: radius || 5000 },
    });

    const driver = nearby.data.drivers?.[0];
    if (!driver) {
      throw new HttpException('No nearby drivers found', HttpStatus.NOT_FOUND);
    }

    const result = await this.pool.query(
      `INSERT INTO rides(passenger_id, driver_id, status, pickup, dropoff)
       VALUES(
         $1,
         $2,
         'requested',
         ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
         ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography
       )
       RETURNING id, passenger_id, driver_id, status`,
      [passenger_id, driver.driver_id, pickup_lng, pickup_lat, dropoff_lng, dropoff_lat],
    );

    return result.rows[0];
  }

  async acceptRide(id: number, body: { driver_id: number }) {
    const result = await this.pool.query(
      `UPDATE rides
       SET status = 'accepted', updated_at = NOW()
       WHERE id = $1 AND driver_id = $2
       RETURNING id, passenger_id, driver_id, status`,
      [id, body.driver_id],
    );

    if (!result.rowCount) {
      throw new HttpException('Ride not found or driver mismatch', HttpStatus.NOT_FOUND);
    }

    return result.rows[0];
  }

  async getRide(id: number) {
    const result = await this.pool.query(
      `SELECT id, passenger_id, driver_id, status,
              ST_Y(pickup::geometry) AS pickup_lat,
              ST_X(pickup::geometry) AS pickup_lng,
              ST_Y(dropoff::geometry) AS dropoff_lat,
              ST_X(dropoff::geometry) AS dropoff_lng,
              created_at,
              updated_at
       FROM rides
       WHERE id = $1`,
      [id],
    );

    if (!result.rowCount) {
      throw new HttpException('Ride not found', HttpStatus.NOT_FOUND);
    }

    return result.rows[0];
  }
}

@Controller()
class AppController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get('/health')
  health() {
    return { status: 'ok', service: 'dispatch-service' };
  }

  @Post('/rides/request')
  requestRide(@Body() body: { passenger_id: number; pickup_lat: number; pickup_lng: number; dropoff_lat: number; dropoff_lng: number; radius?: number }) {
    return this.dispatchService.requestRide(body);
  }

  @Post('/rides/:id/accept')
  acceptRide(@Param('id') id: string, @Body() body: { driver_id: number }) {
    return this.dispatchService.acceptRide(Number(id), body);
  }

  @Get('/rides/:id')
  getRide(@Param('id') id: string) {
    return this.dispatchService.getRide(Number(id));
  }
}

@Module({
  controllers: [AppController],
  providers: [DispatchService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3002, '0.0.0.0');
}

bootstrap();
