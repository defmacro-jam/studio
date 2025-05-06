
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

  const [isDemoMode, setIsDemoMode] = useState(false);
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

  // Fetch current demo mode setting
  useEffect(() => {
    if (isAdmin !== true) return; // Only fetch if confirmed admin

    const fetchSettings = async () => {
      setIsLoadingSettings(true);
      setError(null);
      try {
        const configDocRef = doc(db, CONFIG_COLLECTION, GLOBAL_CONFIG_DOC_ID);
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
          const configData = docSnap.data() as GlobalConfig;
          setIsDemoMode(configData.isDemoModeEnabled);
        } else {
          // If config doc doesn't exist, assume demo mode is off and create it
          await setDoc(configDocRef, { isDemoModeEnabled: false });
          setIsDemoMode(false);
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
        isDemoModeEnabled: isDemoMode,
      });
      toast({
        title: "Settings Saved",
        description: `Demo mode is now ${isDemoMode ? 'ENABLED' : 'DISABLED'}.`,
      });
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
            <div className="flex items-center justify-between space-x-2 p-4 border rounded-lg">
              <Label htmlFor="demo-mode" className="flex flex-col space-y-1">
                <span className="font-medium">Enable Demo Mode</span>
                <span className="text-xs font-normal leading-snug text-muted-foreground">
                  When enabled, mock users and data will be shown for demonstration purposes.
                </span>
              </Label>
              <Switch
                id="demo-mode"
                checked={isDemoMode}
                onCheckedChange={setIsDemoMode}
                disabled={isSaving}
                aria-label="Toggle demo mode"
              />
            </div>
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
