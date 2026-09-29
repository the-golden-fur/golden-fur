import { BrowserRouter, useLocation } from 'react-router';
import { AuthProvider } from '../../shared/auth/providers/AuthProvider/AuthProvider';
import { useAuth } from '../../shared/auth/providers/AuthProvider/useAuth';
import { AppRoutes } from '../../routes';
import { ThemeProvider } from '../../shared/providers/ThemeProvider/ThemeProvider';
import { ToastProvider } from '../../shared/providers/ToastProvider/ToastProvider';
import { ErrorBoundary } from '../../shared/components/ErrorBoundary/ErrorBoundary';

function ThemedAppRoutes() {
  const location = useLocation();
  const { user, accessToken } = useAuth();
  const theme = location.pathname.startsWith('/staff') ? 'staff' : 'customer';

  return (
    <ThemeProvider theme={theme} userId={user?.id} accessToken={accessToken}>
      <ToastProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemedAppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
