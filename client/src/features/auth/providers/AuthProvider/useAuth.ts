import { useContext } from 'react';
import { AuthContext } from './AuthContext';

export function useAuth() {
<<<<<<< HEAD
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
=======
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
>>>>>>> origin/dev
}
