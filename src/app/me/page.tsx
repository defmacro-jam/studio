
'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfile, updateEmail, sendEmailVerification, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, UserCog, LogOut, ArrowLeft } from 'lucide-react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { getGravatarUrl } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PROD_BASE_URL = 'https://retro.patchwork.ai';

function MePageContent() {
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user data from Firestore
  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser) {
        setLoadingData(false);
        return;
      }
      setLoadingData(true);
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setDisplayName(userData.displayName || currentUser.displayName || '');
          setEmail(userData.email || currentUser.email || '');
          // Prioritize Firestore avatar, then Auth, then generate Gravatar
          setAvatarUrl(userData.avatarUrl || currentUser.photoURL || getGravatarUrl(userData.email || currentUser.email, 100)!);
        } else {
          // Fallback if Firestore doc missing (should ideally not happen after signup)
          setDisplayName(currentUser.displayName || '');
          setEmail(currentUser.email || '');
          setAvatarUrl(currentUser.photoURL || getGravatarUrl(currentUser.email, 100)!);
          setError("Could not load full profile data. Some information might be missing.");
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
        setError("Failed to load profile data.");
        toast({ title: "Error", description: "Could not load profile details.", variant: "destructive" });
      } finally {
        setLoadingData(false);
      }
    };

    if (!authLoading) {
        fetchUserData();
    }
  }, [currentUser, authLoading, toast]);

  const handleProfileUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setIsSaving(true);
    setError(null);

    const userDisplayName = displayName.trim();
    const userEmail = email.trim().toLowerCase();
    const currentEmail = currentUser.email?.toLowerCase();

    // Regenerate Gravatar URL based on the potentially updated email
    const newGravatarUrl = getGravatarUrl(userEmail, 100)!;

    try {
      // --- Update Firebase Auth Profile ---
      const authUpdates: { displayName?: string | null, photoURL?: string | null } = {};
      if (userDisplayName !== (currentUser.displayName || '')) {
        authUpdates.displayName = userDisplayName;
      }
      // Always update photoURL in Auth to the latest Gravatar based on the email field
      authUpdates.photoURL = newGravatarUrl;

      if (Object.keys(authUpdates).length > 0) {
        await updateProfile(currentUser, authUpdates);
      }

      // --- Update Email in Firebase Auth (if changed) ---
      // This requires recent login or re-authentication, handle carefully
      if (userEmail !== currentEmail) {
        try {
            await updateEmail(currentUser, userEmail);
            // Send verification email to the new address
            await sendEmailVerification(currentUser);
            toast({
                title: "Email Updated & Verification Sent",
                description: `Your email has been updated to ${userEmail}. Please check your new inbox to verify it.`,
                variant: "default",
                duration: 10000,
            });
        } catch (emailError: any) {
             console.error("Email update error:", emailError);
             let message = "Failed to update email. Please try logging out and back in, then try again.";
             if (emailError.code === 'auth/requires-recent-login') {
                 message = "Updating your email requires you to log in again for security. Please log out and back in.";
             } else if (emailError.code === 'auth/email-already-in-use') {
                 message = "This email address is already in use by another account.";
             } else if (emailError.code === 'auth/invalid-email') {
                 message = "The new email address is invalid.";
             }
             setError(message);
             toast({ title: "Email Update Failed", description: message, variant: "destructive" });
             setIsSaving(false); // Stop saving process if email update fails critically
             return; // Prevent further Firestore updates if email failed
        }
      }

      // --- Update Firestore User Document ---
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        displayName: userDisplayName,
        email: userEmail, // Store the potentially updated email
        avatarUrl: newGravatarUrl, // Store the updated Gravatar URL
      });

      setAvatarUrl(newGravatarUrl); // Update local state for avatar

      toast({
        title: "Profile Updated",
        description: "Your profile details have been saved.",
      });

    } catch (err: any) {
      console.error('Profile update error:', err);
      let message = 'Failed to update profile. Please try again.';
       if (err.code === 'permission-denied') {
           message = 'Permission denied. Check Firestore rules.';
       }
      setError(message);
      toast({ title: "Update Failed", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

   // --- Logout Handler ---
    const handleLogout = async () => {
        try {
            await signOut(auth);
            toast({ title: "Logged Out", description: "You have been successfully logged out." });
            const appBaseUrl = IS_PRODUCTION ? PROD_BASE_URL : '';
            router.push(`${appBaseUrl}/login`); // Redirect to login page after logout
        } catch (error) {
            console.error("Logout error:", error);
            toast({ title: "Logout Failed", description: "Could not log you out. Please try again.", variant: "destructive" });
        }
    };


  if (authLoading || loadingData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-secondary">
         <Card className="w-full max-w-lg shadow-xl">
             <CardHeader className="items-center">
                 <Skeleton className="h-8 w-48 mb-2" />
                 <Skeleton className="h-4 w-64" />
             </CardHeader>
             <CardContent className="space-y-6">
                  <div className="flex justify-center">
                     <Skeleton className="h-24 w-24 rounded-full" />
                  </div>
                 <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-10 w-full" />
                 </div>
                 <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-10 w-full" />
                 </div>
             </CardContent>
             <CardFooter className="flex justify-between">
                 <Skeleton className="h-10 w-24" />
                 <Skeleton className="h-10 w-28" />
             </CardFooter>
         </Card>
      </div>
    );
  }

  if (!currentUser) {
      // Should be handled by ProtectedRoute, but as a fallback:
      return (
          <div className="flex items-center justify-center min-h-screen">
              <p>Please log in to view your profile.</p>
          </div>
      );
  }


  return (
    <div className="flex items-center justify-center min-h-screen bg-secondary p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center relative">
           {/* Back Button */}
            <Button
                variant="outline"
                size="sm"
                onClick={() => router.back()}
                className="absolute left-4 top-4"
                aria-label="Go back"
            >
                <ArrowLeft className="h-4 w-4" />
            </Button>
          <CardTitle className="text-2xl font-bold text-primary flex items-center justify-center pt-8">
            <UserCog className="mr-2 h-6 w-6" /> Your Profile
          </CardTitle>
          <CardDescription>View and update your account details.</CardDescription>
        </CardHeader>
        <form onSubmit={handleProfileUpdate}>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center space-y-2">
              <Avatar className="h-24 w-24 border-2 border-primary">
                <AvatarImage src={avatarUrl} alt={displayName} data-ai-hint="avatar profile picture"/>
                <AvatarFallback className="text-3xl">
                    {displayName ? displayName.charAt(0).toUpperCase() : email.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
               <p className="text-xs text-muted-foreground">Avatar generated via Gravatar</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Your Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isSaving}
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSaving}
              />
               <p className="text-xs text-muted-foreground">Changing your email requires verification.</p>
            </div>
            {/* Optional: Add fields for password change or other settings */}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-between gap-3 pt-4">
             <Button variant="outline" onClick={handleLogout} disabled={isSaving}>
                <LogOut className="mr-2 h-4 w-4" /> Logout
             </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

// Wrap the content with ProtectedRoute
export default function MePage() {
  return (
    <ProtectedRoute>
      <MePageContent />
    </ProtectedRoute>
  );
}
