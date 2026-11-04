import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { fetchCategories } from './categories'

afterEach(() => mock.restoreAll())

test('loads newly created categories without caching the old list', async () => {
  mock.method(
    globalThis,
    'fetch',
    async (url: string, options?: RequestInit) => {
      assert.equal(url, 'https://products.example.test/categories')
      assert.equal(options?.cache, 'no-store')
      return Response.json([
        { id: 1, name: 'Custom shirt name', slug: 'T-shirts' },
        { id: 8, name: 'Summer Hats', slug: 'summer-hats' },
        { id: 9, name: '女装与配饰', slug: '女装-配饰' },
      ])
    },
  )

  assert.deepEqual(await fetchCategories('https://products.example.test'), [
    { id: 1, name: 'Custom shirt name', slug: 'T-shirts' },
    { id: 8, name: 'Summer Hats', slug: 'summer-hats' },
    { id: 9, name: '女装与配饰', slug: '女装-配饰' },
  ])
})

test('reports a failed category request instead of treating it as an empty list', async () => {
  mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 503 }),
  )

  await assert.rejects(fetchCategories('https://products.example.test'))
})
