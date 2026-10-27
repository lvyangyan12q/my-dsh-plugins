/** Early browser/v1 layouts omitted pane minima; modern documents remain strict. */
export function normalizeLegacyPaneMinimums(spec) {
  if (!spec || typeof spec !== 'object') return spec
  const pane = value => value && typeof value === 'object' && value.min === undefined ? {...value,min:200} : value
  const result = {...spec}
  if (result.left) result.left = pane(result.left)
  for (const key of ['leftMore','top','main']) if (Array.isArray(result[key])) result[key] = result[key].map(pane)
  return result
}
