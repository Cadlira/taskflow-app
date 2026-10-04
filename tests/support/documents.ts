import type { ContentsLike, FrameLike, InvocationLike } from '../../src/main/ipc/document-sessions.js'

export const PACKAGED_ORIGIN = 'taskflow://app'
export const PACKAGED_URL = 'taskflow://app/'

export interface FakeFrame extends FrameLike {
  url: string
  origin: string
  detached: boolean
  destroyed: boolean
  sent: Array<{ channel: string; payload: unknown }>
}

export interface FakeContents extends ContentsLike {
  mainFrame: FakeFrame
  destroyed: boolean
}

export function fakeFrame(url: string = PACKAGED_URL, origin: string = PACKAGED_ORIGIN): FakeFrame {
  return {
    url,
    origin,
    detached: false,
    destroyed: false,
    sent: [],
    isDestroyed() {
      return this.destroyed
    },
    send(channel: string, ...args: unknown[]) {
      this.sent.push({ channel, payload: args[0] })
    },
  }
}

export function fakeContents(id: number, frame: FakeFrame = fakeFrame()): FakeContents {
  return {
    id,
    mainFrame: frame,
    destroyed: false,
    isDestroyed() {
      return this.destroyed
    },
  }
}

/** Invocação vinda do main frame da superfície. */
export function invocation(contents: ContentsLike, frame: FrameLike | null = contents.mainFrame): InvocationLike {
  return { sender: contents, senderFrame: frame }
}
