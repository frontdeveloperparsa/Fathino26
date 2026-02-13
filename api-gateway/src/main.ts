import 'reflect-metadata';
import { All, Controller, Get, Injectable, Module, Req, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import axios, { Method } from 'axios';
import { Request, Response } from 'express';

@Injectable()
class ProxyService {
  private userService = process.env.USER_SERVICE_URL || 'http://user-service:3001';
  private dispatchService = process.env.DISPATCH_SERVICE_URL || 'http://dispatch-service:3002';
  private locationService = process.env.LOCATION_SERVICE_URL || 'http://location-service:3003';

  async proxyRequest(targetBase: string, req: Request, res: Response) {
    const targetUrl = `${targetBase}${req.originalUrl}`;
    const response = await axios.request({
      url: targetUrl,
      method: req.method as Method,
      headers: {
        authorization: req.headers.authorization,
        'content-type': req.headers['content-type'] || 'application/json',
      },
      params: req.query,
      data: req.body,
      validateStatus: () => true,
    });

    res.status(response.status).json(response.data);
  }

  user(req: Request, res: Response) {
    return this.proxyRequest(this.userService, req, res);
  }

  dispatch(req: Request, res: Response) {
    return this.proxyRequest(this.dispatchService, req, res);
  }

  location(req: Request, res: Response) {
    return this.proxyRequest(this.locationService, req, res);
  }
}

@Controller()
class AppController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get('/health')
  health() {
    return { status: 'ok', service: 'api-gateway' };
  }

  @All('/auth/:path(*)')
  authProxy(@Req() req: Request, @Res() res: Response) {
    return this.proxyService.user(req, res);
  }

  @All('/auth')
  authRootProxy(@Req() req: Request, @Res() res: Response) {
    return this.proxyService.user(req, res);
  }

  @All('/rides/:path(*)')
  ridesProxy(@Req() req: Request, @Res() res: Response) {
    return this.proxyService.dispatch(req, res);
  }

  @All('/rides')
  ridesRootProxy(@Req() req: Request, @Res() res: Response) {
    return this.proxyService.dispatch(req, res);
  }

  @All('/location/:path(*)')
  locationProxy(@Req() req: Request, @Res() res: Response) {
    return this.proxyService.location(req, res);
  }

  @All('/location')
  locationRootProxy(@Req() req: Request, @Res() res: Response) {
    return this.proxyService.location(req, res);
  }
}

@Module({
  controllers: [AppController],
  providers: [ProxyService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000, '0.0.0.0');
}

bootstrap();
