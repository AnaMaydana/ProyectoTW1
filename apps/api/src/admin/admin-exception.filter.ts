import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/** Traduce fallos inesperados de BD a 502 sin filtrar detalle al cliente. */
@Catch()
export class AdminExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AdminExceptionFilter.name);

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

    const code = (exception as { code?: string } | null)?.code;
    if (code === '23505') {
      res.status(409).json({ message: 'Nombre duplicado', error: 'Conflict', statusCode: 409 });
      return;
    }

    const detail = exception instanceof Error ? exception.message : 'desconocido';
    this.logger.error(`Error de BD en ${req.method} ${req.originalUrl ?? req.url}: ${detail}`);
    res.status(502).json({
      message: 'Error de base de datos', error: 'Bad Gateway', statusCode: 502
    });
  }
}
