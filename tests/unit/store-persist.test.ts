import { describe, it, expect } from 'vitest'
import { mergePersisted, migratePersisted, useAppStore, PERSIST_VERSION } from '@/lib/store'

/*
 * BUG-15: the persisted store had no version and merged saved values with a plain spread, so a
 * stale `localStorage` blob could overwrite live state (including the old `view`/`stack`) and a
 * malformed value survived forever.
 */

const current = useAppStore.getState()

describe('mergePersisted', () => {
  it('keeps defaults when nothing is stored', () => {
    const merged = mergePersisted(undefined, current)
    expect(merged.browseFilters).toEqual(current.browseFilters)
    expect(merged.favorites).toEqual([])
    expect(merged.premium).toBe(false)
    expect(merged.tvMode).toBe(false)
  })

  it('restores the values that are persisted', () => {
    const merged = mergePersisted(
      {
        favorites: ['ch_1'],
        recents: ['ch_2'],
        recentMovies: ['mv_1'],
        progress: { ch_1: 42 },
        premium: true,
        tvMode: true,
        browseFilters: { search: 'news' },
      },
      current,
    )
    expect(merged.favorites).toEqual(['ch_1'])
    expect(merged.recents).toEqual(['ch_2'])
    expect(merged.recentMovies).toEqual(['mv_1'])
    expect(merged.progress).toEqual({ ch_1: 42 })
    expect(merged.premium).toBe(true)
    expect(merged.tvMode).toBe(true)
    expect(merged.browseFilters.search).toBe('news')
    // Defaults still fill the fields the saved object did not carry.
    expect(merged.browseFilters.country).toBe(current.browseFilters.country)
    expect(merged.browseFilters.collection).toBe(current.browseFilters.collection)
    expect(merged.browseFilters.page).toBe(current.browseFilters.page)
  })

  it('ignores keys that are not persisted (a stale view/stack must not win over the URL)', () => {
    const merged = mergePersisted(
      { view: { name: 'admin' }, stack: [{ view: { name: 'admin' } }], searchQuery: 'leaked' },
      current,
    )
    expect(merged.view).toEqual(current.view)
    expect(merged.stack).toEqual(current.stack)
    expect(merged.searchQuery).toBe(current.searchQuery)
  })

  it('repairs malformed values instead of crashing', () => {
    const merged = mergePersisted(
      { favorites: 'not-an-array', progress: [1, 2, 3], premium: 'yes', tvMode: 1, browseFilters: null },
      current,
    )
    expect(merged.favorites).toEqual([])
    expect(merged.progress).toEqual({})
    expect(merged.premium).toBe(false) // only a real boolean counts
    expect(merged.tvMode).toBe(false)
    expect(merged.browseFilters).toEqual(current.browseFilters)
  })
})

describe('migratePersisted', () => {
  it('drops navigation state written by an older build', () => {
    const migrated = migratePersisted(
      { view: { name: 'watch' }, stack: [{ view: { name: 'watch' } }], favorites: ['ch_1'] },
      1,
    ) as Record<string, unknown>
    expect(migrated.view).toBeUndefined()
    expect(migrated.stack).toBeUndefined()
    expect(migrated.favorites).toEqual(['ch_1'])
  })

  it('never throws on garbage input', () => {
    expect(migratePersisted(null, 0)).toEqual({})
    expect(migratePersisted('oops', 0)).toEqual({})
    expect(migratePersisted(42, 1)).toEqual({})
  })

  it('is at a version that reflects the current persisted shape', () => {
    expect(PERSIST_VERSION).toBeGreaterThanOrEqual(2)
  })
})
