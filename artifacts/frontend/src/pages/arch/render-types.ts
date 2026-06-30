export type RenderMode = 'hd' | 'full' | 'chat'
export type LightOption = 'auto' | 'manha' | 'tarde' | 'golden' | 'noturno' | 'nublado'
export type AngleOption = 'frontal' | '45' | 'lateral_esq' | 'lateral_dir' | 'ampla' | 'aerea'

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

export const MATERIALS = [
  { id:'carvalho', name:'Carvalho', cat:'madeira', c1:'#c8a87a', c2:'#8a5c2a', prompt:'light oak wood with natural grain, warm tone, photorealistic' },
  { id:'nogueira', name:'Nogueira', cat:'madeira', c1:'#7a5030', c2:'#4a2e18', prompt:'dark walnut wood with rich grain, photorealistic' },
  { id:'pinho', name:'Pinho', cat:'madeira', c1:'#e0c080', c2:'#b89050', prompt:'pine wood light yellow grain, photorealistic' },
  { id:'mdf-branco', name:'MDF Branco', cat:'mdf', c1:'#f0ece4', c2:'#d0ccc4', prompt:'white matte MDF panel, smooth surface, photorealistic' },
  { id:'mdf-preto', name:'MDF Preto', cat:'mdf', c1:'#252530', c2:'#101018', prompt:'black matte MDF panel, photorealistic' },
  { id:'marmore', name:'Mármore', cat:'pedra', c1:'#e8e4df', c2:'#b0a898', prompt:'white Carrara marble grey veining, polished, photorealistic' },
  { id:'granito', name:'Granito', cat:'pedra', c1:'#5a5a62', c2:'#303038', prompt:'dark grey granite crystal flecks, polished, photorealistic' },
  { id:'aco', name:'Aço', cat:'ferro', c1:'#8080a0', c2:'#404060', prompt:'brushed stainless steel metallic finish, photorealistic' },
  { id:'porcelana', name:'Porcelana', cat:'ceramica', c1:'#f4f0eb', c2:'#e0dcd6', prompt:'white matte porcelain tile, photorealistic' },
  { id:'concreto', name:'Concreto', cat:'concreto', c1:'#9090a0', c2:'#606070', prompt:'exposed concrete raw finish, photorealistic' },
]

export const ZONES = ['Parede','Piso','Armários sup.','Armários inf.','Bancada']
