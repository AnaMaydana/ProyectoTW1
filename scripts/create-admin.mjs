import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  throw new Error('Definí ADMIN_EMAIL y ADMIN_PASSWORD en el entorno');
}
if (password.length < 8) throw new Error('ADMIN_PASSWORD debe tener al menos 8 caracteres');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
await client.connect();
try {
  const role = await client.query("SELECT id_rol FROM rol WHERE nombre = 'ADMIN'");
  if (!role.rowCount) throw new Error('Falta el rol ADMIN en la BD');

  const existing = await client.query(
    'SELECT id_usuario FROM usuario WHERE lower(correo) = lower($1)', [email]
  );
  if (existing.rowCount) {
    await client.query('UPDATE usuario SET id_rol = $2, activo = TRUE WHERE id_usuario = $1', [
      existing.rows[0].id_usuario, role.rows[0].id_rol
    ]);
    console.log(`ADMIN actualizado: ${email}`);
  } else {
    const hash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO usuario (id_rol, nombre, celular, correo, password_hash, activo)
       VALUES ($1,'Administrador',NULL,$2,$3,TRUE)`,
      [role.rows[0].id_rol, email, hash]
    );
    console.log(`ADMIN creado: ${email}`);
  }
} finally {
  await client.end();
}
