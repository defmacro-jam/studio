
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
// Switch removed as demo mode is removed
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, ArrowLeft, Settings as SettingsIcon, ShieldAlert } from 'lucide-react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { APP_ROLES, type GlobalConfig } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

const CONFIG_COLLECTION = 'config';
const GLOBAL_CONFIG_DOC_ID = 'global';

function AdminSettingsPageContent() {
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // isDemoMode state removed
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Check current user's admin status
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!currentUser) {
        setIsAdmin(false);
        setIsLoadingSettings(false);
        return;
      }
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists() && userDocSnap.data().role === APP_ROLES.ADMIN) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          setError("Access Denied: You do not have permission to view this page.");
          toast({ title: "Access Denied", description: "Only administrators can access this page.", variant: "destructive" });
          router.push('/admin');
        }
      } catch (err) {
        console.error("Error checking admin status:", err);
        setError("Failed to verify administrator status.");
        setIsAdmin(false);
        router.push('/admin');
      }
    };
    if (!authLoading) {
      checkAdminStatus();
    }
  }, [currentUser, authLoading, router, toast]);

  // Fetch current settings (if any remain)
  useEffect(() => {
    if (isAdmin !== true) return; // Only fetch if confirmed admin

    const fetchSettings = async () => {
      setIsLoadingSettings(true);
      setError(null);
      try {
        const configDocRef = doc(db, CONFIG_COLLECTION, GLOBAL_CONFIG_DOC_ID);
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
          // const configData = docSnap.data() as GlobalConfig;
          // Removed isDemoMode logic
        } else {
          // If config doc doesn't exist, create it with default values if any
           await setDoc(configDocRef, { /* other default settings if any */ });
        }
      } catch (err) {
        console.error("Error fetching app settings:", err);
        setError("Failed to load app settings.");
        toast({ title: "Error", description: "Could not load settings.", variant: "destructive" });
      } finally {
        setIsLoadingSettings(false);
      }
    };
    fetchSettings();
  }, [isAdmin, toast]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (isAdmin !== true) {
      toast({ title: "Permission Denied", description: "Only administrators can save settings.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const configDocRef = doc(db, CONFIG_COLLECTION, GLOBAL_CONFIG_DOC_ID);
      await updateDoc(configDocRef, {
        // Removed isDemoMode update
        // Add other settings to update here if any
      });
      toast({
        title: "Settings Saved",
        description: "Application settings have been updated.", // Generic message
      });
      router.push('/'); // Redirect to home page after successful save
    } catch (err) {
      console.error("Error saving app settings:", err);
      setError("Failed to save settings.");
      toast({ title: "Save Failed", description: "Could not save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || isAdmin === null || (isAdmin === true && isLoadingSettings)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-secondary p-4">
        <Card className="w-full max-w-lg shadow-xl">
          <CardHeader className="items-center relative">
            <Skeleton className="h-9 w-20 absolute left-4 top-4" /> {/* Back button placeholder */}
            <Skeleton className="h-8 w-48 mb-2 mt-8" /> {/* Title placeholder */}
            <Skeleton className="h-4 w-64" /> {/* Description placeholder */}
          </CardHeader>
          <CardContent className="space-y-6 pt-8">
            {/* Placeholder for any remaining settings */}
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
          </CardContent>
          <CardFooter className="flex justify-end">
            <Skeleton className="h-10 w-28" /> {/* Save button placeholder */}
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!isAdmin || error && !isLoadingSettings) { // Show error if not admin or error loading settings
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md shadow-xl bg-destructive/10 border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center"><ShieldAlert className="mr-2 h-5 w-5" /> Access Denied or Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive-foreground">{error || "You do not have permission to access this page."}</p>
          </CardContent>
          <CardFooter>
            <Button variant="secondary" onClick={() => router.push('/admin')}>Back to Admin</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-secondary p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/admin')}
            className="absolute left-4 top-4"
            aria-label="Back to admin dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-2xl font-bold text-primary flex items-center justify-center pt-8">
            <SettingsIcon className="mr-2 h-6 w-6" /> App Settings
          </CardTitle>
          <CardDescription>Manage global application settings.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSaveSettings}>
          <CardContent className="space-y-6 pt-8">
            {/* Demo mode switch and label removed */}
             <p className="text-muted-foreground text-center">No application-wide settings are currently available to configure.</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <ProtectedRoute>
      <AdminSettingsPageContent />
    </ProtectedRoute>
  );
}
