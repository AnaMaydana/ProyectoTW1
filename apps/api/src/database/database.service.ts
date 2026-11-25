import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';

/**
 * Único acceso a Postgres. Todas las consultas usan parámetros, nunca
 * concatenación, y las escrituras críticas pasan por `transaction`.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: env.databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 5
  });

  query<T extends QueryResultRow = any>(
    text: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params as any[]);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
