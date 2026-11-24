# SALTEÑANGA — Fase 1

Tienda online para clientes: catálogo en Bs, carrito persistente, login con cookies persistentes, pedidos para recoger el mismo día con código, historial, repetir y cancelar.

## Configuración

1. Copiar `.env.example` a `.env` y completar:
   - `DATABASE_URL`: cadena de conexión Postgres de Supabase.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Aplicar el esquema y los datos de prueba:

```bash
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

3. Verificar:

```bash
node scripts/verify-schema.mjs
node scripts/verify-db.mjs
```

## Arranque

```bash
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:3001

## Pruebas

```bash
npm install
npm -w apps/api test -- --runInBand
npm -w apps/web test -- --runInBand
npm -w apps/web e2e
```

## Fases pendientes

- Fase 2: panel del cajero, realtime, entrega y comprobante.
- Fase 3: administración de productos, inventario y reportes.
- Fase 4: QR/transferencia y descarga de comprobantes.
- Fase 5: despliegue con HTTPS, rendimiento y disponibilidad.

No hacer push a GitHub hasta la aprobación final del usuario.
