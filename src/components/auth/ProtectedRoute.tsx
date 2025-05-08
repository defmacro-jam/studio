
'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PROD_BASE_URL = 'https://retro.patchwork.ai';

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If loading is finished and there's no user, redirect to login
    if (!loading && !currentUser) {
      const appBaseUrl = IS_PRODUCTION ? PROD_BASE_URL : '';
      router.push(`${appBaseUrl}/login`);
    }
  }, [currentUser, loading, router]);

  // While loading, show a loading indicator
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  // If user is authenticated, render the children
  if (currentUser) {
    return <>{children}</>;
  }

  // If not loading and no user (should be redirected, but acts as fallback)
  return null; // Or return a loading indicator/message
}
