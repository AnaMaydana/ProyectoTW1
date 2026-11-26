import { ValidationError } from 'class-validator';
import { spanishValidationFactory } from './spanish-validation';

const error = (property: string, constraints: Record<string, string>): ValidationError =>
  ({ property, constraints } as ValidationError);

describe('spanishValidationFactory', () => {
  it('traduce las restricciones por defecto', () => {
    const exception = spanishValidationFactory([
      error('nombre', {
        isString: 'nombre must be a string',
        minLength: 'must be longer than or equal to 1 characters',
        maxLength: 'must be shorter than or equal to 120 characters'
      }),
      error('precio', { min: 'precio must not be less than 0' })
    ]);
    expect((exception.getResponse() as { message: string[] }).message).toEqual([
      'nombre debe ser texto',
      'nombre debe tener al menos 1 caracteres',
      'nombre debe tener como máximo 120 caracteres',
      'precio debe ser mayor o igual a 0'
    ]);
  });

  it('conserva los mensajes españoles definidos en los DTO', () => {
    const exception = spanishValidationFactory([
      error('status', { isIn: 'Estado no permitido' })
    ]);
    expect((exception.getResponse() as { message: string[] }).message).toEqual(['status: Estado no permitido']);
  });
});
