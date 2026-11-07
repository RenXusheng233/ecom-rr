import assert from 'node:assert/strict'
import test from 'node:test'
import { createCategorySlug } from './category'

for (const { name, slug } of [
  { name: ' Summer Hats ', slug: 'summer-hats' },
  { name: 'T-shirts', slug: 't-shirts' },
  { name: 'Café & Bags', slug: 'cafe-bags' },
  { name: '女装 / 配饰', slug: '女装-配饰' },
  { name: '___New___Shoes! ', slug: 'new-shoes' },
  { name: '!!!', slug: '' },
]) {
  test(`generates a category slug for ${JSON.stringify(name)}`, () => {
    assert.equal(createCategorySlug(name), slug)
  })
}
