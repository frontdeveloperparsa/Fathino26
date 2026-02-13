import 'reflect-metadata';
import { Body, Controller, Get, HttpException, HttpStatus, Injectable, Module, Post, Query } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

@Injectable()
class LocationService {
  private pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'uber',
  });

  async update(body: { driver_id: number; lat: number; lng: number }) {
    const { driver_id, lat, lng } = body;
    if (!driver_id || lat === undefined || lng === undefined) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    await this.pool.query(
      `INSERT INTO driver_locations(driver_id, location)
       VALUES($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)
       ON CONFLICT(driver_id)
       DO UPDATE SET location = EXCLUDED.location, updated_at = NOW()`,
      [driver_id, lng, lat],
    );

    return { success: true };
  }

  async nearby(lat: number, lng: number, radius: number) {
    const result = await this.pool.query(
      `SELECT driver_id,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng,
              ST_Distance(
                location,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
              ) AS distance_meters
       FROM driver_locations
       WHERE ST_DWithin(
         location,
         ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
         $3
       )
       ORDER BY distance_meters ASC`,
      [lat, lng, radius],
    );

    return { drivers: result.rows };
  }
}

@Controller()
class AppController {
  constructor(private readonly locationService: LocationService) {}

  @Get('/health')
  health() {
    return { status: 'ok', service: 'location-service' };
  }

  @Post('/location/update')
  update(@Body() body: { driver_id: number; lat: number; lng: number }) {
    return this.locationService.update(body);
  }

  @Get('/location/nearby')
  nearby(@Query('lat') lat?: string, @Query('lng') lng?: string, @Query('radius') radius?: string) {
    if (lat === undefined || lng === undefined) {
      throw new HttpException('lat and lng are required', HttpStatus.BAD_REQUEST);
    }
    return this.locationService.nearby(Number(lat), Number(lng), Number(radius || 5000));
  }
}

@Module({
  controllers: [AppController],
  providers: [LocationService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3003, '0.0.0.0');
}

bootstrap();
