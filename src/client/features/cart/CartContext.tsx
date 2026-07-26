import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react'
import type { CheckoutDraftItem } from '../../lib/api'

export type CartAddon = CheckoutDraftItem['addons'][number]
export type CartItem = CheckoutDraftItem

type CartContextValue = {
  items: CartItem[]
  itemCount: number
  estimatedSubtotalAmount: number
  replaceItems: (items: CartItem[]) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function itemPrice(item: CartItem) {
  const bookPrice = item.salePriceAmount ?? item.basePriceAmount
  return (bookPrice + item.addons.reduce((total, addon) => total + addon.priceAmount, 0)) * item.quantity
}

export function CartProvider({ children }: PropsWithChildren) {
  // The browser keeps only display metadata while the tab is open. The actual
  // personalization and child-photo references live in an encrypted,
  // short-lived server draft tied to an HTTP-only cookie.
  const [items, setItems] = useState<CartItem[]>([])
  // Consumers use these callbacks in effects while hydrating the encrypted
  // server draft. Keep their identities stable so a no-draft response cannot
  // cause a replaceItems([]) render loop.
  const replaceItems = useCallback((nextItems: CartItem[]) => setItems(nextItems), [])
  const clearCart = useCallback(() => setItems([]), [])
  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: items.reduce((count, item) => count + item.quantity, 0),
      estimatedSubtotalAmount: items.reduce((total, item) => total + itemPrice(item), 0),
      replaceItems,
      clearCart,
    }),
    [items, replaceItems, clearCart],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider.')
  return context
}
