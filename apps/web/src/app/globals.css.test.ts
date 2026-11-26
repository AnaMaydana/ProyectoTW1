import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, 'globals.css'), 'utf8');

describe('paleta cálida de SALTEÑANGA', () => {
  it('define tokens de crema, amarillo y naranja', () => {
    expect(css).toMatch(/--crema:/);
    expect(css).toMatch(/--amarillo:/);
    expect(css).toMatch(/--naranja:/);
  });

  it('ya no usa el rojo oscuro anterior', () => {
    expect(css).not.toContain('#7a1f1f');
  });
});
