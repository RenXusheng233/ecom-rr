import { Router } from 'express'
import {
  createProduct,
  deleteProduct,
  getAdminProducts,
  getProduct,
  getProducts,
  getProductDeletions,
  updateProduct,
} from '../controllers/product.controller'
import { shouldBeAdmin } from '../middleware/authMiddleware'

const router: Router = Router()

router.post('/', shouldBeAdmin, createProduct)
router.put('/:id', shouldBeAdmin, updateProduct)
router.delete('/:id', shouldBeAdmin, deleteProduct)
router.get('/admin', shouldBeAdmin, getAdminProducts)
router.get('/admin/deletions', shouldBeAdmin, getProductDeletions)
router.get('/', getProducts)
router.get('/:id', getProduct)

export default router
