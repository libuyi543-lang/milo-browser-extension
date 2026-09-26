import { popupPosition } from '@/content/floating-ui/position'

describe('measured popup positioning', () => {
  it('keeps a tall result above the pointer and inside the bottom/right edges', () => {
    const position = popupPosition(990, 750, 1024, 768, 328, 350)
    expect(position.left + 328).toBeLessThanOrEqual(1012)
    expect(position.top + 350).toBeLessThanOrEqual(756)
    expect(position.top).toBeGreaterThanOrEqual(12)
  })
  it('fits a narrow viewport using the measured responsive width', () => {
    const position = popupPosition(260, 480, 280, 520, 256, 280)
    expect(position.left).toBe(12)
    expect(position.top + 280).toBeLessThanOrEqual(508)
  })
})
