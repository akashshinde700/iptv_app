import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/lib/store'

const initial = useAppStore.getState()

function names() {
  return useAppStore.getState().stack.map((entry) => entry.view.name)
}

describe('navigation stack', () => {
  beforeEach(() => {
    useAppStore.setState({ ...initial, stack: [{ view: { name: 'home' }, scrollY: 0, focusKey: null }], view: { name: 'home' }, restore: null })
  })

  it('climbs back through every level instead of jumping home', () => {
    const { navigate, goBack } = useAppStore.getState()
    navigate({ name: 'favorites' })
    navigate({ name: 'watch', channelId: 'a' })
    navigate({ name: 'watch', channelId: 'b' })
    expect(names()).toEqual(['home', 'favorites', 'watch', 'watch'])

    expect(goBack()).toBe(true)
    expect(useAppStore.getState().view).toEqual({ name: 'watch', channelId: 'a' })
    expect(goBack()).toBe(true)
    expect(useAppStore.getState().view).toEqual({ name: 'favorites' })
    expect(goBack()).toBe(true)
    expect(useAppStore.getState().view).toEqual({ name: 'home' })
  })

  it('reports the root so the shell can ask before exiting', () => {
    expect(useAppStore.getState().goBack()).toBe(false)
    expect(names()).toEqual(['home'])
  })

  it('resets to Home → destination when a top-level section is opened', () => {
    const { navigate } = useAppStore.getState()
    navigate({ name: 'browse' })
    navigate({ name: 'watch', channelId: 'a' })
    navigate({ name: 'search' })
    expect(names()).toEqual(['home', 'search'])
  })

  it('replace swaps the channel without growing the stack', () => {
    const { navigate, replace, goBack } = useAppStore.getState()
    navigate({ name: 'browse' })
    navigate({ name: 'watch', channelId: 'a' })
    replace({ name: 'watch', channelId: 'b' })
    expect(names()).toEqual(['home', 'browse', 'watch'])
    goBack()
    expect(useAppStore.getState().view).toEqual({ name: 'browse' })
  })

  it('saves where the user was when leaving a list and hands it back on Back', () => {
    const { navigate } = useAppStore.getState()
    navigate({ name: 'browse' })
    // the user scrolled the list and focused channel 27
    vi.stubGlobal('window', { scrollY: 640 })
    vi.stubGlobal('document', { activeElement: { closest: () => ({ dataset: { focusKey: 'ch-27' } }) } })
    try {
      navigate({ name: 'watch', channelId: '27' })
    } finally {
      vi.unstubAllGlobals()
    }
    useAppStore.getState().goBack()
    expect(useAppStore.getState().consumeRestore()).toEqual({ scrollY: 640, focusKey: 'ch-27' })
    expect(useAppStore.getState().consumeRestore()).toBeNull()
  })

  it('ignores opening the screen that is already on top', () => {
    const { navigate } = useAppStore.getState()
    navigate({ name: 'browse' })
    navigate({ name: 'browse' })
    expect(names()).toEqual(['home', 'browse'])
  })
})
