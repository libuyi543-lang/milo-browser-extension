import { getSentenceFromSelection } from 'get-selection-more'

/** Keep the original sentence extraction, with a bound for extension storage. */
export function getReadingSentence(selection: Selection | null): string {
  return getSentenceFromSelection(selection)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)
}
