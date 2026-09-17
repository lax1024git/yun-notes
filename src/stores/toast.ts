import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  type: ToastType
  message: string
}

let seq = 1

export const useToastStore = defineStore('toast', () => {
  const items = ref<ToastItem[]>([])

  function push(type: ToastType, message: string) {
    const id = seq++
    items.value.push({ id, type, message })
    setTimeout(() => dismiss(id), 3000)
  }

  function dismiss(id: number) {
    items.value = items.value.filter((t) => t.id !== id)
  }

  return {
    items,
    info: (m: string) => push('info', m),
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    dismiss,
  }
})
