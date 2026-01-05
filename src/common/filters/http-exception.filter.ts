import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Extract error message
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || 'An error occurred';

    // Generate error code based on status and error type
    const errorCode = this.generateErrorCode(status, exception.name);

    // Log the error
    this.logger.error(
      `${request.method} ${request.url} - Status: ${status} - Message: ${JSON.stringify(message)}`,
      exception.stack,
    );

    // Send standardized error response
    response.status(status).json({
      statusCode: status,
      message,
      error: exception.name || 'HttpException',
      errorCode,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private generateErrorCode(status: number, exceptionName: string): string {
    const prefix = exceptionName.replace('Exception', '').toUpperCase();
    return `${prefix}_${status}`;
  }
}
