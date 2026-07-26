import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CartProvider } from './features/cart/CartContext'
import { StorefrontShell, LocaleSynchronizer } from './components/StorefrontShell'
import { AccountPage, ResetPasswordPage, TrackOrderPage } from './pages/AccountPages'
import { CheckoutPage, OrderConfirmationPage } from './pages/CheckoutPages'
import { ContentPage, FaqPage, HowItWorksPage } from './pages/ContentPages'
import { HomePage, ShopPage } from './pages/DiscoveryPages'
import { ProductPage } from './pages/ProductPage'
import { AdminPage } from './pages/AdminPages'
import { useStoreLocale } from './lib/locale'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
    },
  },
})

function CartRedirect() {
  const { localizedPath } = useStoreLocale()
  return <Navigate to={localizedPath('/checkout')} replace />
}

function App() {
  return <QueryClientProvider client={queryClient}><CartProvider><BrowserRouter><Routes>
    <Route path="/" element={<StorefrontShell />}>
      <Route index element={<HomePage />} />
      <Route path="stories" element={<ShopPage />} />
      <Route path="stories/:slug" element={<ProductPage />} />
      <Route path="cart" element={<CartRedirect />} />
      <Route path="checkout" element={<CheckoutPage />} />
      <Route path="order-confirmation/:orderNumber" element={<OrderConfirmationPage />} />
      <Route path="track-order" element={<TrackOrderPage />} />
      <Route path="account" element={<AccountPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route path="how-it-works" element={<HowItWorksPage />} />
      <Route path="faq" element={<FaqPage />} />
      <Route path="terms" element={<ContentPage pageKey="terms" />} />
      <Route path="returns" element={<ContentPage pageKey="returns" />} />
      <Route path="privacy" element={<ContentPage pageKey="privacy" />} />
      <Route path="contact" element={<ContentPage pageKey="contact" />} />
    </Route>
    <Route path="/admin/*" element={<AdminPage />} />
    <Route path="/:locale" element={<LocaleSynchronizer />}>
      <Route element={<StorefrontShell />}>
        <Route index element={<HomePage />} />
        <Route path="stories" element={<ShopPage />} />
        <Route path="stories/:slug" element={<ProductPage />} />
        <Route path="cart" element={<CartRedirect />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="order-confirmation/:orderNumber" element={<OrderConfirmationPage />} />
        <Route path="track-order" element={<TrackOrderPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="how-it-works" element={<HowItWorksPage />} />
        <Route path="faq" element={<FaqPage />} />
        <Route path="terms" element={<ContentPage pageKey="terms" />} />
        <Route path="returns" element={<ContentPage pageKey="returns" />} />
        <Route path="privacy" element={<ContentPage pageKey="privacy" />} />
        <Route path="contact" element={<ContentPage pageKey="contact" />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter></CartProvider></QueryClientProvider>
}

export default App
