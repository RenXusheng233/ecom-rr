import { CartStoreActionsType, CartStoreStateType } from '@/types'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const useCartStore = create<CartStoreStateType & CartStoreActionsType>()(
  persist(
    (set) => ({
      hasHydrated: false,
      cart: [],
      addToCart: (product) =>
        set((state) => {
          const existedIndex = state.cart.findIndex(
            ({ id, selectedSize, selectedColor }) =>
              id === product.id &&
              selectedSize === product.selectedSize &&
              selectedColor === product.selectedColor,
          )
          if (existedIndex !== -1) {
            const updatedCart = [...state.cart]
            updatedCart[existedIndex]!.quantity += product.quantity
            return { cart: updatedCart }
          }
          return {
            cart: [...state.cart, product],
          }
        }),
      removeFromCart: (product) =>
        set((state) => ({
          cart: state.cart.filter(
            ({ id, selectedSize, selectedColor }) =>
              !(
                id === product.id &&
                selectedSize === product.selectedSize &&
                selectedColor === product.selectedColor
              ),
          ),
        })),
      clearCart: () => set({ cart: [] }),
    }),
    {
      name: 'cart',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hasHydrated = true
        }
      },
    },
  ),
)

export default useCartStore
