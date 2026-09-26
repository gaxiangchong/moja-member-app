import { Transform } from 'class-transformer';

/**
 * Parses an optional `?flag=true|false` query parameter.
 *
 * Reads the **raw** value off the source object rather than the already
 * converted `value`. The global ValidationPipe runs with
 * `enableImplicitConversion: true` (see `main.ts`), which coerces any
 * non-empty string to `true` for a boolean-typed property — so a plain
 * `@Transform(({ value }) => ...)` sees `true` for `?flag=false` and the
 * filter silently behaves as if it were on.
 *
 * Anything other than a recognised true/false spelling yields `undefined`,
 * i.e. "filter not applied".
 */
export function BooleanQueryParam(): PropertyDecorator {
  return Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];
    if (raw === true || raw === 'true' || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === '0') return false;
    return undefined;
  });
}
