import { useState, useCallback } from 'react'
import { RenderConfig, AppliedMaterial } from './render-types'

export function useRenderState() {
  const [imageUrl, setImageUrl] = useState('')
  const [applied, setApplied] = useState<Record<string, AppliedMaterial>>({})
  const [config, setConfig] = useState<RenderConfig>({
    mode: 'hd', light: 'manha', angle: 'aerea', materials: [], prompt: ''
  })
  const [renderResult, setRenderResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<1|2|3|4|5>(1)

  const loadImage = useCallback((file: File) => {
    setImageUrl(URL.createObjectURL(file))
    setStep(2)
  }, [])

  const applyMaterial = useCallback((zone: string, mat: AppliedMaterial) => {
    setApplied(prev => ({ ...prev, [zone]: mat }))
  }, [])

  const removeMaterial = useCallback((zone: string) => {
    setApplied(prev => { const n = {...prev}; delete n[zone]; return n })
  }, [])

  const clearAll = useCallback(() => setApplied({}), [])

  return {
    imageUrl, applied, config, renderResult, loading, step,
    loadImage, applyMaterial, removeMaterial, clearAll,
    setConfig, setRenderResult, setLoading, setStep
  }
}
