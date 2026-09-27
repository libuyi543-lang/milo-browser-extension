export interface ImageRegion {
  original: string
  translation: string
  box: [number, number, number, number]
}
export interface ImageTranslation {
  regions: ImageRegion[]
}
export type VisionProvider = 'deepseek' | 'xiaomi' | 'minimax'
