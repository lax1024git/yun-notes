import { describe, expect, it } from 'vitest'
import { computeTargetSize, extForMime, replaceExt } from './image-convert'

describe('image-convert helpers', () => {
  it('computeTargetSize max fits inside box', () => {
    expect(computeTargetSize({ width: 2000, height: 1000 }, { mode: 'max', width: 800 })).toEqual({
      width: 800,
      height: 400,
    })
  })

  it('computeTargetSize scale', () => {
    expect(
      computeTargetSize({ width: 100, height: 50 }, { mode: 'scale', scalePercent: 50 }),
    ).toEqual({ width: 50, height: 25 })
  })

  it('computeTargetSize exact stretch', () => {
    expect(
      computeTargetSize(
        { width: 100, height: 50 },
        { mode: 'exact', width: 200, height: 200, keepAspect: false },
      ),
    ).toEqual({ width: 200, height: 200 })
  })

  it('replaceExt and mime', () => {
    expect(replaceExt('photo.PNG', 'jpg')).toBe('photo.jpg')
    expect(extForMime('image/webp')).toBe('webp')
  })
})
