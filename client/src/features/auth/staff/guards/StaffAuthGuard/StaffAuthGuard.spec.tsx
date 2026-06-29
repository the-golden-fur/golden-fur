import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../../../providers/AuthProvider/AuthProvider';
import { StaffAuthGuard } from './StaffAuthGuard';

describe('StaffAuthGuard', () => {
  it('redirects unauthenticated users to the staff login screen', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/staff/secure']}>
          <Routes>
            <Route path="/staff/login" element={<div>Login page</div>} />
            <Route
              path="/staff/secure"
              element={
                <StaffAuthGuard>
                  <div>Protected content</div>
                </StaffAuthGuard>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });
});
