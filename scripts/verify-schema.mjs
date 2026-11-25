import { readFileSync } from 'node:fs';

const exact = readFileSync('saltenanga_schema.sql', 'utf8');
const adapted = readFileSync('saltenanga_schema_adaptado.sql', 'utf8');

// Tablas y columnas del diagrama lógico entregado por el usuario.
const base = [
  'CREATE TABLE rol (',
  'CREATE TABLE usuario (',
  'CREATE TABLE categoria (',
  'CREATE TABLE producto (',
  'CREATE TABLE inventario (',
  'CREATE TABLE pedido (',
  'CREATE TABLE detalle_pedido (',
  'CREATE TABLE metodo_pago (',
  'CREATE TABLE pago (',
  'CREATE TABLE comprobante (',
  'id_rol', 'nombre', 'id_usuario', 'password_hash', 'activo',
  'id_categoria', 'id_producto', 'descripcion', 'precio', 'foto_url',
  'id_inventario', 'stock', 'disponible', 'id_pedido', 'codigo',
  'fecha_hora_recojo', 'estado', 'observaciones', 'total', 'fecha_creacion',
  'id_detalle', 'cantidad', 'precio_unitario', 'subtotal',
  'id_metodo_pago', 'id_pago', 'monto', 'fecha_pago', 'referencia',
  'id_comprobante', 'numero', 'fecha_emision',
  "INSERT INTO rol (nombre) VALUES ('ADMIN'), ('CLIENTE'), ('CAJERO');",
  "INSERT INTO metodo_pago (nombre) VALUES ('EFECTIVO'), ('QR'), ('TARJETA'), ('TRANSFERENCIA');",
  "INSERT INTO categoria (nombre) VALUES ('Salteñas'), ('Bebidas'), ('Postres');"
];

// Correcciones permitidas: solo aditivas, nunca renombran lo anterior.
const additive = [
  'ALTER TABLE pedido ALTER COLUMN id_usuario DROP NOT NULL;',
  'ALTER TABLE pedido ADD COLUMN cliente_nombre VARCHAR(100);',
  'ALTER TABLE pedido ADD COLUMN cliente_celular VARCHAR(20);',
  'ALTER TABLE pedido ADD COLUMN fecha_confirmacion TIMESTAMPTZ NOT NULL DEFAULT NOW();',
  'ALTER TABLE pedido ADD COLUMN fecha_expiracion TIMESTAMPTZ;',
  'chk_pedido_cliente',
  'CREATE INDEX idx_pedido_expiracion ON pedido(fecha_expiracion);',
  'ALTER TABLE inventario ADD COLUMN disponible_hoy BOOLEAN NOT NULL DEFAULT TRUE;',
  'chk_detalle_subtotal',
  'CREATE TABLE carrito (',
  'CREATE TABLE carrito_detalle (',
  'idx_carrito_usuario',
  'idx_carrito_detalle_producto'
];

for (const fragment of base) {
  if (!exact.includes(fragment)) throw new Error(`Falta en saltenanga_schema.sql: ${fragment}`);
  if (!adapted.includes(fragment)) throw new Error(`Falta en saltenanga_schema_adaptado.sql: ${fragment}`);
}
for (const fragment of additive) {
  if (!adapted.includes(fragment)) throw new Error(`Falta corrección aditiva: ${fragment}`);
  if (exact.includes(fragment)) throw new Error(`El script exacto fue modificado: ${fragment}`);
}
if (!exact.trim().startsWith('BEGIN;') || !exact.trim().endsWith('COMMIT;')) {
  throw new Error('saltenanga_schema.sql debe ser transaccional');
}
if (!adapted.trim().startsWith('BEGIN;') || !adapted.trim().endsWith('COMMIT;')) {
  throw new Error('saltenanga_schema_adaptado.sql debe ser transaccional');
}
console.log(`SCHEMA OK (${base.length} elementos base, ${additive.length} correcciones aditivas)`);
