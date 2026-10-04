/**
 * Regular English inflections, enough to recognise "running" or "studies" as a
 * saved "run" or "study". Irregular forms are not covered.
 */
const VOWEL = /[aeiou]/
const DOUBLE = /[^aeiou][aeiou]([bdfgklmnprtvz])$/

export function wordForms(base: string): string[] {
  const word = base.toLowerCase()
  if (!/^[a-z][a-z'-]*$/.test(word)) return []
  const forms = new Set([word])
  if (word.length < 3 || word.includes(' ')) return Array.from(forms)
  const last = word[word.length - 1]
  if (/(s|x|z|ch|sh)$/.test(word)) forms.add(word + 'es')
  else if (last === 'y' && !VOWEL.test(word[word.length - 2])) {
    const stem = word.slice(0, -1)
    forms.add(stem + 'ies')
    forms.add(stem + 'ied')
  } else forms.add(word + 's')
  if (last === 'e') {
    forms.add(word + 'd')
    if (!/(ee|ye|oe)$/.test(word)) forms.add(word.slice(0, -1) + 'ing')
    else forms.add(word + 'ing')
  } else {
    if (!(last === 'y' && !VOWEL.test(word[word.length - 2])))
      forms.add(word + 'ed')
    forms.add(word + 'ing')
    if (word.length <= 5 && DOUBLE.test(word)) {
      forms.add(word + last + 'ed')
      forms.add(word + last + 'ing')
    }
  }
  return Array.from(forms)
}

/** Words that could be the saved form of a token seen on the page, most likely first. */
export function baseCandidates(token: string): string[] {
  const word = token
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/'s$/, '')
  const candidates = [word]
  const add = (value: string) => {
    if (value.length >= 2 && !candidates.includes(value)) candidates.push(value)
  }
  if (word.endsWith('ies') || word.endsWith('ied')) add(word.slice(0, -3) + 'y')
  if (word.endsWith('es')) add(word.slice(0, -2))
  if (word.endsWith('s')) add(word.slice(0, -1))
  if (word.endsWith('ed')) {
    add(word.slice(0, -2))
    add(word.slice(0, -1))
    if (word[word.length - 3] === word[word.length - 4]) add(word.slice(0, -3))
  }
  if (word.endsWith('ing')) {
    const stem = word.slice(0, -3)
    add(stem)
    add(stem + 'e')
    if (stem[stem.length - 1] === stem[stem.length - 2]) add(stem.slice(0, -1))
  }
  return candidates.filter(candidate => wordForms(candidate).includes(word))
}
