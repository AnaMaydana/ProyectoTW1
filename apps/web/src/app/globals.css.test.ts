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

describe('campo de foto del admin', () => {
  it('define contenedor, vista previa y acciones', () => {
    expect(css).toMatch(/\.photo-field\s*\{/);
    expect(css).toMatch(/\.photo-preview\s*\{/);
    expect(css).toMatch(/\.photo-actions\s*\{/);
  });

  it('mantiene los targets de 44 px', () => {
    expect(css).toMatch(/min-height:\s*44px/);
  });
});
