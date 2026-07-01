import { BrowserRouter, useLocation } from 'react-router';
import { AuthProvider } from '../../features/auth/providers/AuthProvider/AuthProvider';
import { AppRoutes } from '../../routes';
import { ThemeProvider } from '../../shared/providers/ThemeProvider/ThemeProvider';

function ThemedAppRoutes() {
  const location = useLocation();
  const theme = location.pathname.startsWith('/staff') ? 'staff' : 'customer';

  return (
    <ThemeProvider theme={theme}>
      <AppRoutes />
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
