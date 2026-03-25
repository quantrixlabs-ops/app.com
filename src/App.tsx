import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { useAuth } from './context/AuthContext';
import { CartProvider, useCart } from './context/CartContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import CustomerDashboard from './pages/CustomerDashboard';
import RWADashboard from './pages/RWADashboard';
import AdminDashboard from './pages/AdminDashboard';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import { LogOut, ShoppingBag, User } from 'lucide-react';
import BrandLogo from './components/BrandLogo';
import PageWrapper from './components/PageWrapper';

function Navbar() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const primaryLink = user?.role === 'admin' ? '/dashboard' : '/';
  const primaryLabel = user?.role === 'admin' ? 'Dashboard' : 'Home';

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center">
          <BrandLogo compact />
        </Link>

        <div className="flex items-center space-x-4 md:space-x-6">
          {user ? (
            <>
              <Link
                to={primaryLink}
                className="text-sm font-medium text-gray-700 transition-colors hover:text-rose-600"
              >
                {primaryLabel}
              </Link>
              {user.role !== 'admin' ? (
                <Link
                  to="/cart"
                  className="inline-flex items-center gap-2 rounded-full border border-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-rose-200 hover:text-rose-600"
                >
                  <ShoppingBag size={20} />
                  <span className="hidden sm:inline">Bag ({itemCount})</span>
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                    {itemCount}
                  </span>
                </Link>
              ) : null}
              <div className="hidden items-center space-x-2 text-sm font-medium text-gray-700 sm:flex">
                <User size={18} />
                <span>{user.name}</span>
              </div>
              <button
                onClick={() => void logout()}
                className="hidden items-center gap-1.5 rounded-full border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-rose-300 hover:text-rose-600 sm:flex"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-gray-700 transition-colors hover:text-rose-600">
                Login
              </Link>
              <Link to="/signup" className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function RoleLandingRoute() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin') {
    return <AdminDashboard />;
  }

  if (user.role === 'rwa') {
    return <RWADashboard />;
  }

  return <CustomerDashboard />;
}

export default function App() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const marketplaceRoutes = ['/', '/dashboard', '/customer-dashboard', '/rwa-dashboard'];
  const isMarketplaceRoute = user?.role !== 'admin' && marketplaceRoutes.includes(location.pathname);
  const isAuthRoute = ['/login', '/signup', '/forgot-password', '/reset-password'].includes(location.pathname);
  const fallbackRoute = !user ? '/login' : user.role === 'admin' ? '/dashboard' : '/';

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <CartProvider>
      <div className={isMarketplaceRoute ? 'min-h-screen bg-[#f4f5f7] font-sans' : isAuthRoute ? 'min-h-screen bg-[#fff8fa] font-sans' : 'min-h-screen bg-gray-50 font-sans'}>
        {!isMarketplaceRoute && !isAuthRoute ? <Navbar /> : null}
        {/* overflow-x-hidden prevents horizontal scrollbar during slide transition */}
        <main className={`overflow-x-hidden ${isMarketplaceRoute || isAuthRoute ? '' : 'mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'}`}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<PageWrapper><RoleLandingRoute /></PageWrapper>} />
              <Route path="/dashboard" element={<PageWrapper><RoleLandingRoute /></PageWrapper>} />
              <Route path="/login" element={<PageWrapper><Login /></PageWrapper>} />
              <Route path="/signup" element={<PageWrapper><Signup /></PageWrapper>} />
              <Route path="/forgot-password" element={<PageWrapper><ForgotPassword /></PageWrapper>} />
              <Route path="/reset-password" element={<PageWrapper><ResetPassword /></PageWrapper>} />
              <Route path="/customer-dashboard" element={<PageWrapper>{user?.role === 'customer' ? <CustomerDashboard /> : <RoleLandingRoute />}</PageWrapper>} />
              <Route path="/rwa-dashboard" element={<PageWrapper>{user?.role === 'rwa' ? <RWADashboard /> : <RoleLandingRoute />}</PageWrapper>} />
              <Route path="/admin-dashboard" element={<PageWrapper>{user?.role === 'admin' ? <AdminDashboard /> : <RoleLandingRoute />}</PageWrapper>} />
              <Route path="/product/:id" element={<PageWrapper><ProductDetail /></PageWrapper>} />
              <Route path="/cart" element={<PageWrapper><Cart /></PageWrapper>} />
              <Route path="*" element={<Navigate to={fallbackRoute} replace />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </CartProvider>
  );
}
