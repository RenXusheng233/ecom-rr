import assert from 'node:assert/strict'
import test from 'node:test'
import { getCategoryQueryParam } from './category.ts'

test('omits the category query for the all category', () => {
  assert.equal(getCategoryQueryParam('all'), '')
  assert.equal(getCategoryQueryParam('All'), '')
})

test('keeps a real category in the query', () => {
  assert.equal(getCategoryQueryParam('T-shirts'), '&category=T-shirts')
})
