import { BadRequestException } from '@nestjs/common';
import { AdminReportsService } from './admin-reports.service';
import { DatabaseService } from '../database/database.service';

const db = { query: jest.fn() } as unknown as DatabaseService;
const service = new AdminReportsService(db);

describe('AdminReportsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('valida formato de fecha', async () => {
    await expect(service.sales('25-11-2026', undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.sales('2026-11-25', '2026-11-24')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('desplaza 4 horas los limites si Postgres esta en UTC', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ TimeZone: 'UTC' }] })
      .mockResolvedValueOnce({ rows: [] });
    await service.sales('2026-11-25', '2026-11-25');
    const params = (db.query as jest.Mock).mock.calls[1][1];
    expect(params[0]).toBe('2026-11-24T20:00:00.000Z');
    expect(params[1]).toBe('2026-11-25T20:00:00.000Z');
  });

  it('excluye cancellados de ventas y top productos', async () => {
    (db.query as jest.Mock)
      .mockResolvedValue({ rows: [{ TimeZone: 'America/La_Paz' }] });
    await service.sales(undefined, undefined);
    await service.topProducts(undefined, undefined, 10);
    expect((db.query as jest.Mock).mock.calls[1][0]).toContain("estado <> 'CANCELADO'");
    expect((db.query as jest.Mock).mock.calls[3][0]).toContain("estado <> 'CANCELADO'");
  });

  it('stock bajo usa el umbral por defecto 5', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    await service.lowStock(undefined);
    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual([5]);
  });
});
