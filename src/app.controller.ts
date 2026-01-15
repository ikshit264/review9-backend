import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
    @Get()
    getHealth() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            message: 'Service is healthy',
        };
    }
}
