insert into categories (id,name) values
  ('11111111-1111-4111-8111-111111111111','salteñas'),
  ('22222222-2222-4222-8222-222222222222','bebidas')
on conflict (id) do nothing;

insert into products (id,category_id,name,description,price_bs,image_url,available_today) values
  ('a1000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Carne','Salteña de carne con ají',12.00,'https://placehold.co/600x400?text=Carne',true),
  ('a1000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Pollo','Salteña de pollo',11.00,'https://placehold.co/600x400?text=Pollo',true),
  ('a1000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Mixta','Carne y pollo',13.00,'https://placehold.co/600x400?text=Mixta',true),
  ('a1000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','Queso','Salteña de queso',10.00,'https://placehold.co/600x400?text=Queso',false),
  ('a1000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','Vegetariana','Verduras y queso',10.50,'https://placehold.co/600x400?text=Vegetariana',true),
  ('b1000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','Coca Cola','Botella 1.5 L',8.00,'https://placehold.co/600x400?text=Coca',true),
  ('b1000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','Agua','Botella 500 ml',4.00,'https://placehold.co/600x400?text=Agua',true)
on conflict (id) do nothing;
