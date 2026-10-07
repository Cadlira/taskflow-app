import { onMounted, onBeforeUnmount, shallowRef } from 'vue'
import { CaptureReview } from '../../../../application/capture/capture-review.js'
import type { CaptureReviewOptions, CaptureOffer } from '../../../../application/capture/capture-review.js'
import type { DesktopEvent, DesktopSubscription } from '../../../../contracts/desktop.js'

export interface CaptureView { offer: CaptureOffer | undefined; busy: boolean; message: string }
export function useCaptureReview(options: Omit<CaptureReviewOptions, 'api' | 'changed'>, control?: (event: DesktopEvent) => void) {
  const state = shallowRef<CaptureView>({ offer: undefined, busy: false, message: '' })
  const review = new CaptureReview({ ...options, api: window.taskflowDesktop,
    changed: () => { state.value = { offer: review.offer, busy: review.busy, message: review.message } },
  })
  let subscription: DesktopSubscription | undefined
  let disposed = false
  onMounted(async () => {
    try {
      subscription = await window.taskflowDesktop.subscribeDesktopEvents({ version: 2 }, event => {
        control?.(event)
        if (event.kind === 'capture-available') review.reference({ id: event.id, sequence: event.captureSequence })
        else if (event.kind === 'surface-active') void review.refresh()
      })
      if (disposed) subscription.dispose()
      else await review.refresh()
    } catch { if (!disposed) state.value = { ...state.value, message: 'Controle de captura indisponível. Abra a janela novamente.' } }
  })
  onBeforeUnmount(() => { disposed = true; subscription?.dispose(); review.dispose() })
  return { state, review }
}
