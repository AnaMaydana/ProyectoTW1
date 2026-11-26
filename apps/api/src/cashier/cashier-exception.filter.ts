import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class CashierExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CashierExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(
        typeof body === 'string' ? { message: body, statusCode: status } : body
      );
      return;
    }
    if ((exception as { code?: string } | null)?.code === '23505') {
      res.status(409).json({ message: 'Conflicto con el pedido', error: 'Conflict', statusCode: 409 });
      return;
    }
    const detail = exception instanceof Error ? exception.message : 'desconocido';
    this.logger.error(`Error de BD en ${req.method} ${req.originalUrl ?? req.url}: ${detail}`);
    res.status(502).json({ message: 'Error de base de datos', error: 'Bad Gateway', statusCode: 502 });
  }
}
