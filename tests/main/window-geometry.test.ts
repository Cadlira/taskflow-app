import { describe, expect, it } from 'vitest'
import { calcularBoundsIniciais } from '../../src/main/desktop/window-geometry.js'

const LARGURA_MINIMA = 360

describe('TFA-013 geometria inicial da janela (função pura)', () => {
  it('âncora à direita com um terço da largura útil e altura útil integral', () => {
    // Display autorizado: 1920×1080 com taskbar inferior de 48 px (workArea 1920×1032).
    expect(calcularBoundsIniciais({ x: 0, y: 0, width: 1920, height: 1032 }, LARGURA_MINIMA)).toEqual({
      x: 1280,
      y: 0,
      width: 640,
      height: 1032,
    })
  })

  it('taskbar à esquerda desloca a borda direita pelo offset x da workArea', () => {
    expect(calcularBoundsIniciais({ x: 60, y: 0, width: 1860, height: 1080 }, LARGURA_MINIMA)).toEqual({
      x: 1300,
      y: 0,
      width: 620,
      height: 1080,
    })
  })

  it('taskbar no topo inicia o topo em workArea.y e preserva a altura útil', () => {
    expect(calcularBoundsIniciais({ x: 0, y: 40, width: 1920, height: 1040 }, LARGURA_MINIMA)).toEqual({
      x: 1280,
      y: 40,
      width: 640,
      height: 1040,
    })
  })

  it('taskbar superior e esquerda combinadas mantêm os dois offsets', () => {
    expect(calcularBoundsIniciais({ x: 60, y: 40, width: 1860, height: 1040 }, LARGURA_MINIMA)).toEqual({
      x: 1300,
      y: 40,
      width: 620,
      height: 1040,
    })
  })

  it('display à esquerda do primário (x negativo) preserva coordenadas negativas', () => {
    expect(calcularBoundsIniciais({ x: -1920, y: 0, width: 1920, height: 1032 }, LARGURA_MINIMA)).toEqual({
      x: -640,
      y: 0,
      width: 640,
      height: 1032,
    })
  })

  it('display acima do primário (y negativo) preserva o topo negativo', () => {
    expect(calcularBoundsIniciais({ x: 0, y: -1080, width: 1920, height: 1032 }, LARGURA_MINIMA)).toEqual({
      x: 1280,
      y: -1080,
      width: 640,
      height: 1032,
    })
  })

  it('clamp inferior: terço abaixo do mínimo usa a largura mínima (360)', () => {
    // 1024/3 = 341,33 → 341 < 360.
    expect(calcularBoundsIniciais({ x: 0, y: 0, width: 1024, height: 768 }, LARGURA_MINIMA)).toEqual({
      x: 664,
      y: 0,
      width: 360,
      height: 768,
    })
  })

  it('clamp inferior não cria coordenada fora da área útil em tela muito estreita', () => {
    // 600/3 = 200 → 360; a janela nasce inteira dentro da workArea (x = 240).
    expect(calcularBoundsIniciais({ x: 0, y: 0, width: 600, height: 900 }, LARGURA_MINIMA)).toEqual({
      x: 240,
      y: 0,
      width: 360,
      height: 900,
    })
  })

  it('clamp superior: terço acima da largura útil usa a própria workArea', () => {
    // 500/3 = 166,67 → 167 < 360 → 360 < 500, mas uma workArea de 300 fica abaixo do mínimo.
    expect(calcularBoundsIniciais({ x: 0, y: 0, width: 300, height: 700 }, LARGURA_MINIMA)).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 700,
    })
  })

  it('clamp superior com largura útil entre o mínimo e o terço', () => {
    // 400 é menor que a largura mínima 360? Não: 400 > 360, mas 400/3 = 133,33 → 133 < 360 → 360 ≤ 400.
    expect(calcularBoundsIniciais({ x: 10, y: 20, width: 400, height: 700 }, LARGURA_MINIMA)).toEqual({
      x: 50,
      y: 20,
      width: 360,
      height: 700,
    })
  })

  it('arredonda o terço para o inteiro mais próximo', () => {
    // 3841/3 = 1280,33 → 1280; borda direita = 3841 → x = 2561.
    expect(calcularBoundsIniciais({ x: 0, y: 0, width: 3841, height: 1032 }, LARGURA_MINIMA)).toEqual({
      x: 2561,
      y: 0,
      width: 1280,
      height: 1032,
    })
    // 3830/3 = 1276,66 → 1277; borda direita = 3830 → x = 2553.
    expect(calcularBoundsIniciais({ x: 0, y: 0, width: 3830, height: 1032 }, LARGURA_MINIMA)).toEqual({
      x: 2553,
      y: 0,
      width: 1277,
      height: 1032,
    })
  })

  it('é determinística: mesmas entradas produzem os mesmos bounds', () => {
    const workArea = { x: 60, y: 40, width: 1860, height: 1040 }
    const first = calcularBoundsIniciais(workArea, LARGURA_MINIMA)
    const second = calcularBoundsIniciais(workArea, LARGURA_MINIMA)
    expect(first).toEqual(second)
    expect(calcularBoundsIniciais(workArea, LARGURA_MINIMA)).toEqual(first)
  })

  it('respeita borda direita e topo da área útil em todos os casos', () => {
    const cases = [
      { x: 0, y: 0, width: 1920, height: 1032 },
      { x: 60, y: 0, width: 1860, height: 1080 },
      { x: 0, y: 40, width: 1920, height: 1040 },
      { x: -1920, y: -1080, width: 1920, height: 1032 },
      { x: 0, y: 0, width: 1024, height: 768 },
    ]
    for (const workArea of cases) {
      const bounds = calcularBoundsIniciais(workArea, LARGURA_MINIMA)
      expect(bounds.x + bounds.width).toBe(workArea.x + workArea.width)
      expect(bounds.y).toBe(workArea.y)
      expect(bounds.height).toBe(workArea.height)
      expect(bounds.width).toBeGreaterThanOrEqual(Math.min(LARGURA_MINIMA, workArea.width))
      expect(bounds.width).toBeLessThanOrEqual(workArea.width)
    }
  })
})
