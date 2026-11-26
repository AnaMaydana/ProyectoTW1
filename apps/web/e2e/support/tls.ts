/** Solo en E2E local contra HTTPS con la CA interna de Caddy. */
export const ignoreHTTPSErrors = (process.env.E2E_BASE_URL ?? '').startsWith('https://');
