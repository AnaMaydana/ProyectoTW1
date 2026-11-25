-- Seguridad: habilita RLS en todo el modelo lógico y expone solo el catálogo.
-- La API NestJS usa una conexión Postgres directa como propietario de las tablas,
-- por lo que estas políticas no afectan su operación.
-- Sin políticas, anon/authenticated no pueden leer ni escribir esas tablas.

BEGIN;

ALTER TABLE public.rol ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metodo_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprobante ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrito_detalle ENABLE ROW LEVEL SECURITY;

-- Catálogo: lectura pública, solo filas activas/disponibles.
CREATE POLICY catalogo_lectura ON public.categoria
  FOR SELECT TO anon, authenticated USING (activa);
CREATE POLICY catalogo_lectura ON public.producto
  FOR SELECT TO anon, authenticated USING (activo);
CREATE POLICY catalogo_lectura ON public.inventario
  FOR SELECT TO anon, authenticated USING (disponible);
CREATE POLICY catalogo_lectura ON public.metodo_pago
  FOR SELECT TO anon, authenticated USING (true);

-- El resto (usuario, pedido, detalle_pedido, pago, comprobante, carrito,
-- carrito_detalle, rol) queda sin políticas: acceso denegado a anon/authenticated.

COMMIT;
