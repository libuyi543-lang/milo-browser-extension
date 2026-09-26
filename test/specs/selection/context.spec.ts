import { getReadingSentence } from '@/selection/context'

describe('reading context', () => {
  afterEach(() => {
    const selection = window.getSelection()
    if (selection) selection.removeAllRanges()
    document.body.innerHTML = ''
  })

  it('retains the complete sentence around a selected word', () => {
    document.body.innerHTML = '<p>The decline seemed inevitable after several years of falling demand. A second sentence.</p>'
    const node = document.querySelector('p')!.firstChild as Text
    const start = node.data.indexOf('inevitable')
    const range = document.createRange()
    range.setStart(node, start)
    range.setEnd(node, start + 'inevitable'.length)
    const selection = window.getSelection()!
    selection.addRange(range)

    expect(getReadingSentence(selection)).toBe(
      'The decline seemed inevitable after several years of falling demand.'
    )
  })
})
