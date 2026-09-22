export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

export type ResizeMode = 'none' | 'max' | 'exact' | 'scale'

export interface ResizeOptions {
  mode: ResizeMode
  /** Used by max / exact */
  width?: number
  /** Used by max / exact */
  height?: number
  /** Percent, e.g. 50 = half size (scale mode) */
  scalePercent?: number
  /** When exact: if true, fit inside box keeping aspect (letterbox not added — just fit) */
  keepAspect?: boolean
}

export interface ConvertOptions {
  format: ImageMime
  /** 0–1, for jpeg/webp */
  quality: number
  resize: ResizeOptions
}

export interface Size {
  width: number
  height: number
}

export function extForMime(mime: ImageMime): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
  }
}

export function replaceExt(filename: string, ext: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  return `${base || filename}.${ext}`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

/** Compute output size from source size and resize options. */
export function computeTargetSize(src: Size, opt: ResizeOptions): Size {
  const sw = Math.max(1, Math.round(src.width))
  const sh = Math.max(1, Math.round(src.height))

  if (opt.mode === 'none') return { width: sw, height: sh }

  if (opt.mode === 'scale') {
    const p = Math.max(1, Math.min(1000, opt.scalePercent ?? 100)) / 100
    return {
      width: Math.max(1, Math.round(sw * p)),
      height: Math.max(1, Math.round(sh * p)),
    }
  }

  const tw = opt.width && opt.width > 0 ? Math.round(opt.width) : null
  const th = opt.height && opt.height > 0 ? Math.round(opt.height) : null

  if (opt.mode === 'max') {
    if (!tw && !th) return { width: sw, height: sh }
    const maxW = tw ?? Number.POSITIVE_INFINITY
    const maxH = th ?? Number.POSITIVE_INFINITY
    const ratio = Math.min(maxW / sw, maxH / sh, 1)
    return {
      width: Math.max(1, Math.round(sw * ratio)),
      height: Math.max(1, Math.round(sh * ratio)),
    }
  }

  // exact
  if (tw && th) {
    if (opt.keepAspect !== false) {
      const ratio = Math.min(tw / sw, th / sh)
      return {
        width: Math.max(1, Math.round(sw * ratio)),
        height: Math.max(1, Math.round(sh * ratio)),
      }
    }
    return { width: tw, height: th }
  }
  if (tw) {
    const ratio = tw / sw
    return { width: tw, height: Math.max(1, Math.round(sh * ratio)) }
  }
  if (th) {
    const ratio = th / sh
    return { width: Math.max(1, Math.round(sw * ratio)), height: th }
  }
  return { width: sw, height: sh }
}

export function loadImageFromFile(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取图片'))
    }
    img.src = url
  })
}

export async function convertImage(
  file: Blob,
  options: ConvertOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImageFromFile(file)
  const target = computeTargetSize(
    { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height },
    options.resize,
  )

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 不可用')

  // JPEG has no alpha — fill white background
  if (options.format === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, target.width, target.height)
  }

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, target.width, target.height)

  const quality = Math.min(1, Math.max(0.01, options.quality))
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('导出失败'))),
      options.format,
      options.format === 'image/png' ? undefined : quality,
    )
  })

  return { blob, width: target.width, height: target.height }
}

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}
