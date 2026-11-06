/**
 * Reader-block vocabulary.
 *
 * The block types used to be tested as raw strings in the run, the translation
 * service, the digest schema and the reader. One set of predicates keeps the
 * "is this translatable / neutral?" decision in one place, so adding a block
 * type means editing this module rather than six comparisons.
 */

export const TEXT_BLOCK_TYPES = Object.freeze(['heading', 'paragraph'])
export const NEUTRAL_BLOCK_TYPES = Object.freeze(['equation', 'figure', 'code', 'table'])

const TEXT = new Set(TEXT_BLOCK_TYPES)
const NEUTRAL = new Set(NEUTRAL_BLOCK_TYPES)

/** A block type the reader may translate (heading or paragraph). */
export function isTextBlock(block) {
  return Boolean(block) && TEXT.has(block.type)
}

/** A block whose original text belongs to the item's source language. */
export function isHeadingBlock(block) {
  return Boolean(block) && block.type === 'heading'
}

export function isParagraphBlock(block) {
  return Boolean(block) && block.type === 'paragraph'
}

export function isEquationBlock(block) {
  return Boolean(block) && block.type === 'equation'
}

export function isFigureBlock(block) {
  return Boolean(block) && block.type === 'figure'
}

export function isTableBlock(block) {
  return Boolean(block) && block.type === 'table'
}

export function isCodeBlock(block) {
  return Boolean(block) && block.type === 'code'
}

/** A block that carries no translatable prose (equation, figure, code). */
export function isNeutralBlock(block) {
  return Boolean(block) && NEUTRAL.has(block.type)
}

/** The text a reading-time estimate should count for one block. */
export function readableTextOf(block) {
  if (!block || typeof block !== 'object') return ''
  if (typeof block.code === 'string') return block.code
  if (typeof block.original === 'string') return block.original
  if (typeof block.caption?.original === 'string') return block.caption.original
  if (Array.isArray(block.rows)) return block.rows.map(row => row.join(' ')).join(' ')
  if (typeof block.display === 'string') return block.display
  return ''
}
