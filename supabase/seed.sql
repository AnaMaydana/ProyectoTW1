-- Seed adaptado al modelo lógico saltenanga (INT / nombres en español).
-- Las categorías ya fueron insertadas por saltenanga_schema_adaptado.sql.

INSERT INTO producto (id_categoria, nombre, descripcion, precio, foto_url, activo)
SELECT c.id_categoria, v.nombre, v.descripcion, v.precio, v.foto_url, TRUE
FROM categoria c
CROSS JOIN (VALUES
  ('Salteñas', 'Carne', 'Salteña de carne con ají', 12.00::numeric, 'https://placehold.co/600x400?text=Carne'),
  ('Salteñas', 'Pollo', 'Salteña de pollo', 11.00::numeric, 'https://placehold.co/600x400?text=Pollo'),
  ('Salteñas', 'Mixta', 'Carne y pollo', 13.00::numeric, 'https://placehold.co/600x400?text=Mixta'),
  ('Salteñas', 'Queso', 'Salteña de queso', 10.00::numeric, 'https://placehold.co/600x400?text=Queso'),
  ('Salteñas', 'Vegetariana', 'Verduras y queso', 10.50::numeric, 'https://placehold.co/600x400?text=Vegetariana'),
  ('Bebidas', 'Coca Cola', 'Botella 1.5 L', 8.00::numeric, 'https://placehold.co/600x400?text=Coca'),
  ('Bebidas', 'Agua', 'Botella 500 ml', 4.00::numeric, 'https://placehold.co/600x400?text=Agua')
) AS v(categoria, nombre, descripcion, precio, foto_url)
WHERE c.nombre = v.categoria
  AND NOT EXISTS (SELECT 1 FROM producto p WHERE p.nombre = v.nombre);

INSERT INTO inventario (id_producto, stock, disponible, disponible_hoy)
SELECT p.id_producto, 20, TRUE, TRUE
FROM producto p
WHERE p.nombre IN ('Carne','Pollo','Mixta','Queso','Vegetariana','Coca Cola','Agua')
  AND NOT EXISTS (SELECT 1 FROM inventario i WHERE i.id_producto = p.id_producto);

UPDATE inventario
SET disponible_hoy = FALSE
WHERE id_producto IN (SELECT id_producto FROM producto WHERE nombre = 'Queso');
