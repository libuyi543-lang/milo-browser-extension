/**
 * What one paragraph-translation request may carry. The background rejects
 * anything outside these limits, so every caller reads them from here: a
 * caller that batches more than the background accepts fails on every
 * retry, and the request is never sent.
 */
export const MAX_PARAGRAPHS = 8
export const MAX_PARAGRAPH_CHARS = 6500
export const MAX_PARAGRAPH_ID = 120
