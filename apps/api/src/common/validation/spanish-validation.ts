import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

function numberIn(message: string): string {
  return message.match(/\d+/)?.[0] ?? '';
}

function isSpanish(message: string): boolean {
  return /[áéíóúñ]/i.test(message) || /^[A-ZÁÉÍÓÚÑ]/.test(message);
}

function translate(property: string, constraint: string, message: string): string {
  if (isSpanish(message)) return `${property}: ${message}`;
  switch (constraint) {
    case 'isString': return `${property} debe ser texto`;
    case 'isInt': return `${property} debe ser un número entero`;
    case 'isNumber': return `${property} debe ser un número`;
    case 'isBoolean': return `${property} debe ser verdadero o falso`;
    case 'minLength': return `${property} debe tener al menos ${numberIn(message)} caracteres`;
    case 'maxLength': return `${property} debe tener como máximo ${numberIn(message)} caracteres`;
    case 'min': return `${property} debe ser mayor o igual a ${numberIn(message)}`;
    case 'max': return `${property} debe ser menor o igual a ${numberIn(message)}`;
    case 'isNotEmpty': return `${property} no puede estar vacío`;
    case 'isIn': return `${property} debe ser uno de los valores permitidos`;
    case 'matches': return `${property} tiene un formato inválido`;
    default: return `${property} no es válido`;
  }
}

/** Traduce los mensajes por defecto de class-validator y respeta los ya escritos en español. */
export function spanishValidationFactory(errors: ValidationError[]): BadRequestException {
  const messages = errors.flatMap((error) =>
    Object.entries(error.constraints ?? {})
      .map(([constraint, message]) => translate(error.property, constraint, message))
  );
  return new BadRequestException(messages.length ? messages : ['Datos no válidos']);
}
