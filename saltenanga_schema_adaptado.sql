BEGIN;

CREATE TABLE rol (
    id_rol      SERIAL PRIMARY KEY,
    nombre      VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE usuario (
    id_usuario     SERIAL PRIMARY KEY,
    id_rol         INT NOT NULL REFERENCES rol(id_rol),
    nombre         VARCHAR(100) NOT NULL,
    celular        VARCHAR(20),
    correo         VARCHAR(150) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    activo         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE categoria (
    id_categoria  SERIAL PRIMARY KEY,
    nombre        VARCHAR(80) NOT NULL UNIQUE,
    activa        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE producto (
    id_producto   SERIAL PRIMARY KEY,
    id_categoria  INT NOT NULL REFERENCES categoria(id_categoria),
    nombre        VARCHAR(120) NOT NULL,
    descripcion   TEXT,
    precio        NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
    foto_url      VARCHAR(500),
    activo        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE inventario (
    id_inventario  SERIAL PRIMARY KEY,
    id_producto    INT NOT NULL UNIQUE
                   REFERENCES producto(id_producto) ON DELETE CASCADE,
    stock          INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    disponible     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE pedido (
    id_pedido          SERIAL PRIMARY KEY,
    codigo             VARCHAR(30) NOT NULL UNIQUE,
    id_usuario         INT NOT NULL REFERENCES usuario(id_usuario),
    fecha_hora_recojo  TIMESTAMP NOT NULL,
    estado             VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                       CHECK (estado IN ('PENDIENTE','CONFIRMADO','PREPARANDO','LISTO','ENTREGADO','CANCELADO')),
    observaciones      TEXT,
    total              NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    fecha_creacion     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE detalle_pedido (
    id_detalle       SERIAL PRIMARY KEY,
    id_pedido        INT NOT NULL REFERENCES pedido(id_pedido) ON DELETE CASCADE,
    id_producto      INT NOT NULL REFERENCES producto(id_producto),
    cantidad         INT NOT NULL CHECK (cantidad > 0),
    precio_unitario  NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal         NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE metodo_pago (
    id_metodo_pago  SERIAL PRIMARY KEY,
    nombre          VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE pago (
    id_pago         SERIAL PRIMARY KEY,
    id_pedido       INT NOT NULL REFERENCES pedido(id_pedido),
    id_metodo_pago  INT NOT NULL REFERENCES metodo_pago(id_metodo_pago),
    monto           NUMERIC(10,2) NOT NULL CHECK (monto > 0),
    estado          VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','PAGADO','RECHAZADO','REEMBOLSADO')),
    fecha_pago      TIMESTAMP,
    referencia      VARCHAR(100)
);

CREATE TABLE comprobante (
    id_comprobante  SERIAL PRIMARY KEY,
    id_pedido       INT NOT NULL UNIQUE REFERENCES pedido(id_pedido),
    numero          VARCHAR(30) NOT NULL UNIQUE,
    fecha_emision   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuario_rol        ON usuario(id_rol);
CREATE INDEX idx_producto_categoria ON producto(id_categoria);
CREATE INDEX idx_pedido_usuario     ON pedido(id_usuario);
CREATE INDEX idx_pedido_estado      ON pedido(estado);
CREATE INDEX idx_detalle_pedido     ON detalle_pedido(id_pedido);
CREATE INDEX idx_detalle_producto   ON detalle_pedido(id_producto);
CREATE INDEX idx_pago_pedido        ON pago(id_pedido);
CREATE INDEX idx_pago_metodo        ON pago(id_metodo_pago);

INSERT INTO rol (nombre) VALUES ('ADMIN'), ('CLIENTE'), ('CAJERO');
INSERT INTO metodo_pago (nombre) VALUES ('EFECTIVO'), ('QR'), ('TARJETA'), ('TRANSFERENCIA');
INSERT INTO categoria (nombre) VALUES ('Salteñas'), ('Bebidas'), ('Postres');

-- Correcciones aditivas (no renombran tablas ni columnas del diagrama).
ALTER TABLE pedido ALTER COLUMN id_usuario DROP NOT NULL;
ALTER TABLE pedido ADD COLUMN cliente_nombre VARCHAR(100);
ALTER TABLE pedido ADD COLUMN cliente_celular VARCHAR(20);
ALTER TABLE pedido ADD COLUMN fecha_confirmacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE pedido ADD COLUMN fecha_expiracion TIMESTAMPTZ;
ALTER TABLE pedido ADD CONSTRAINT chk_pedido_cliente CHECK (
  id_usuario IS NOT NULL
  OR (NULLIF(BTRIM(cliente_nombre), '') IS NOT NULL
      AND NULLIF(BTRIM(cliente_celular), '') IS NOT NULL)
);
CREATE INDEX idx_pedido_expiracion ON pedido(fecha_expiracion);
ALTER TABLE pedido ADD COLUMN id_cajero INT NULL REFERENCES usuario(id_usuario);
ALTER TABLE pedido ADD COLUMN fecha_entrega TIMESTAMPTZ;

ALTER TABLE inventario ADD COLUMN disponible_hoy BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE detalle_pedido ADD CONSTRAINT chk_detalle_subtotal
  CHECK (subtotal = ROUND(cantidad * precio_unitario, 2));

CREATE TABLE carrito (
  id_carrito         SERIAL PRIMARY KEY,
  token              VARCHAR(100) NOT NULL UNIQUE,
  id_usuario         INT NULL REFERENCES usuario(id_usuario),
  fecha_creacion     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE carrito_detalle (
  id_carrito  INT NOT NULL REFERENCES carrito(id_carrito) ON DELETE CASCADE,
  id_producto INT NOT NULL REFERENCES producto(id_producto),
  cantidad    INT NOT NULL CHECK (cantidad > 0),
  PRIMARY KEY (id_carrito, id_producto)
);

CREATE INDEX idx_carrito_usuario ON carrito(id_usuario);
CREATE INDEX idx_carrito_detalle_producto ON carrito_detalle(id_producto);

COMMIT;
