export type RenderMode = 'hd' | 'full' | 'chat'
export type LightOption = 'auto' | 'manha' | 'tarde' | 'golden' | 'noturno' | 'nublado'
export type AngleOption = 'frontal' | '45' | 'lateral' | 'ampla' | 'closeup' | 'aerea'

export interface AppliedMaterial {
  zone: string
  name: string
  color: string
  promptFragment: string
}

export interface RenderConfig {
  mode: RenderMode
  light: LightOption
  angle: AngleOption
  materials: AppliedMaterial[]
  prompt: string
  imageUrl?: string
}
