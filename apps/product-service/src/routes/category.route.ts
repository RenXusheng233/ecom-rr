import { Router } from 'express'
import {
  createCategory,
  deleteCategory,
  getAdminCategories,
  getCategories,
  updateCategory,
} from '../controllers/category.controller'
import { shouldBeAdmin } from '../middleware/authMiddleware'

const router: Router = Router()

router.post('/', shouldBeAdmin, createCategory)
router.put('/:id', shouldBeAdmin, updateCategory)
router.delete('/:id', shouldBeAdmin, deleteCategory)
router.get('/admin', shouldBeAdmin, getAdminCategories)
router.get('/', getCategories)

export default router
