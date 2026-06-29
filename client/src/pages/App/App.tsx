import { BrowserRouter, Route, Routes } from 'react-router';
import { ThemeProvider } from '../../shared/providers/ThemeProvider/ThemeProvider';
import { AuthProvider } from '../../features/auth/providers/AuthProvider/AuthProvider';
import { StaffLoginPage } from '../../features/auth/staff/pages/StaffLoginPage/StaffLoginPage';
import { MfaEnrollPage } from '../../features/auth/staff/pages/MfaEnrollPage/MfaEnrollPage';
import { MfaChallengePage } from '../../features/auth/staff/pages/MfaChallengePage/MfaChallengePage';

function App() {
  const isStaffRoute = window.location.pathname.startsWith('/staff');

  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider theme={isStaffRoute ? 'staff' : 'customer'}>
          <Routes>
            <Route path="/staff/login" element={<StaffLoginPage />} />
            <Route path="/staff/mfa/enroll" element={<MfaEnrollPage />} />
            <Route path="/staff/mfa/verify" element={<MfaChallengePage />} />
          </Routes>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
