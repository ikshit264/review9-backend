import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body } = request;
    const now = Date.now();

    return next.handle().pipe(
      tap((response) => {
        const statusCode = context.switchToHttp().getResponse().statusCode;
        const delay = Date.now() - now;
        this.logger.log(`${method} ${url} ${statusCode} - ${delay}ms`);
        if (body && Object.keys(body).length > 0) {
          // this.logger.debug(`Request Body: ${JSON.stringify(body)}`);
        }
        // this.logger.debug(`Response: ${JSON.stringify(response)}`);
      }),
      catchError((error) => {
        const delay = Date.now() - now;
        this.logger.error(
          `${method} ${url} - Error: ${error.message} - ${delay}ms`,
        );
        if (body && Object.keys(body).length > 0) {
          // this.logger.debug(`Request Body (Failed): ${JSON.stringify(body)}`);
        }
        return throwError(() => error);
      }),
    );
  }
}
