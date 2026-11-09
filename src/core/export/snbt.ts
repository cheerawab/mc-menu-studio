// JSON value -> SNBT, as used by `dialog show @s {...}` in function files (VERIFIED §4: same structure as the JSON,
// quoted keys, `"` and `\` escaped, mixed-type lists allowed since 1.21.5, raw private-use characters are fine).

function quote(s: string): string {
  let out = '"';
  for (const ch of s) {
    switch (ch) {
      case '\\':
        out += '\\\\';
        break;
      case '"':
        out += '\\"';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\r':
        out += '\\r';
        break;
      case '\t':
        out += '\\t';
        break;
      default:
        if (ch < ' ' || ch === '\u007f') throw new Error(`control character U+${ch.charCodeAt(0).toString(16)} in SNBT string`);
        out += ch;
    }
  }
  return `${out}"`;
}

/**
 * Serialises plain JSON data (objects, arrays, strings, finite numbers, booleans) as SNBT. Keys are always quoted,
 * integers in int range stay plain ints, other integers get `L`, fractions get `d`. `undefined` object fields are
 * skipped; `null` and other types throw.
 */
export function toSnbt(value: unknown): string {
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new Error('SNBT cannot hold NaN or Infinity');
      if (Number.isInteger(value)) return value >= -2147483648 && value <= 2147483647 ? String(value) : `${value}L`;
      return `${value}d`;
    case 'string':
      return quote(value);
    case 'object': {
      if (value === null) break;
      if (Array.isArray(value)) return `[${value.map(toSnbt).join(',')}]`;
      const parts: string[] = [];
      for (const [k, v] of Object.entries(value)) if (v !== undefined) parts.push(`${quote(k)}:${toSnbt(v)}`);
      return `{${parts.join(',')}}`;
    }
  }
  throw new Error(`cannot write ${value === null ? 'null' : typeof value} as SNBT`);
}
