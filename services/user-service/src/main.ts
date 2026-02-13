import 'reflect-metadata';
import { Body, Controller, Get, Headers, HttpException, HttpStatus, Injectable, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { Pool } from 'pg';

type UserRole = 'passenger' | 'driver';

@Injectable()
class AuthService {
  private pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'uber',
  });

  private jwtSecret = process.env.JWT_SECRET || 'supersecret';

  async register(payload: { email: string; phone: string; name: string; password: string; role: UserRole }) {
    const { email, phone, name, password, role } = payload;
    if (!email || !phone || !name || !password || !role) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }
    if (!['passenger', 'driver'].includes(role)) {
      throw new HttpException('Invalid role', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount) {
      throw new HttpException('Email already exists', HttpStatus.CONFLICT);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await this.pool.query(
      `INSERT INTO users(email, phone, name, password_hash, role)
       VALUES($1, $2, $3, $4, $5)
       RETURNING id, email, phone, name, role`,
      [email, phone, name, passwordHash, role],
    );

    const user = result.rows[0];
    const token = jwt.sign({ sub: user.id, role: user.role }, this.jwtSecret, { expiresIn: '7d' });
    return { token, user };
  }

  async login(payload: { email: string; password: string }) {
    const { email, password } = payload;
    if (!email || !password) {
      throw new HttpException('Missing credentials', HttpStatus.BAD_REQUEST);
    }

    const result = await this.pool.query('SELECT id, email, phone, name, password_hash, role FROM users WHERE email = $1', [email]);
    if (!result.rowCount) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const token = jwt.sign({ sub: user.id, role: user.role }, this.jwtSecret, { expiresIn: '7d' });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
      },
    };
  }

  async me(authHeader?: string) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HttpException('Missing Bearer token', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.slice('Bearer '.length);
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { sub: number };
      const result = await this.pool.query('SELECT id, email, phone, name, role FROM users WHERE id = $1', [decoded.sub]);
      if (!result.rowCount) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      return result.rows[0];
    } catch {
      throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
    }
  }
}

@Controller()
class AppController {
  constructor(private readonly authService: AuthService) {}

  @Get('/health')
  health() {
    return { status: 'ok', service: 'user-service' };
  }

  @Post('/auth/register')
  register(@Body() body: { email: string; phone: string; name: string; password: string; role: UserRole }) {
    return this.authService.register(body);
  }

  @Post('/auth/login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body);
  }

  @Get('/auth/me')
  me(@Headers('authorization') authHeader?: string) {
    return this.authService.me(authHeader);
  }
}

@Module({
  controllers: [AppController],
  providers: [AuthService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3001, '0.0.0.0');
}

bootstrap();
