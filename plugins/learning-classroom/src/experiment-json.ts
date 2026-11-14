/**
 * Serialize a JSON value for a text node inside a `<script>` element. `<` is
 * escaped so `</script>` in any model-authored string cannot close the tag;
 * U+2028/U+2029 are escaped for pre-ES2019 JavaScript parsers.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}
