import { business } from '../config/business';

export function BusinessInfo() {
  return (
    <section className="card" aria-label="Información del negocio">
      <h2>SALTEÑANGA</h2>
      <p>Horario: {business.openTime} - {business.closeTime}</p>
      {business.phones.length > 0 && (
        <p>Teléfonos: {business.phones.join(', ')}</p>
      )}
      {business.socials.length > 0 && (
        <p>
          Redes:{' '}
          {business.socials.map((social) => (
            <a key={social.url} href={social.url}>{social.label} </a>
          ))}
        </p>
      )}
    </section>
  );
}
