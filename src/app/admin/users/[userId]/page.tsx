
'use client';

import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserCog, ArrowLeft, ShieldCheck, Users, Save } from 'lucide-react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getGravatarUrl } from '@/lib/utils';
import type { AdminUserDisplay, AppRole } from '@/lib/types';
import { APP_ROLES } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PROD_BASE_URL = 'https://retro.patchwork.ai';

function AdminUserDetailPageContent() {
  const { userId } = useParams<{ userId: string }>();
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [userData, setUserData] = useState<AdminUserDisplay | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null); // Current viewing user is admin
  const [selectedAppRole, setSelectedAppRole] = useState<AppRole | ''>(''); // Changed to selectedAppRole
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check current user's admin status
  useEffect(() => {
      const checkAdminStatus = async () => {
          if (!currentUser) {
              setIsAdmin(false);
              setLoadingUser(false);
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
                   router.push('/admin'); // Redirect non-admins back to admin list
              }
          } catch (err) {
              console.error("Error checking admin status:", err);
              setError("Failed to verify administrator status.");
              setIsAdmin(false);
              router.push('/admin'); // Redirect on error
          }
      };
      if (!authLoading) {
          checkAdminStatus();
      }
  }, [currentUser, authLoading, router, toast]);


  // Fetch the specific user's data if current user is admin
  const fetchUserData = useCallback(async () => {
      if (isAdmin !== true || !userId) {
         setLoadingUser(false);
         return;
      }
      setLoadingUser(true);
      setError(null);
      try {
         const userDocRef = doc(db, 'users', userId);
         const userDocSnap = await getDoc(userDocRef);

         if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            const resolvedUser: AdminUserDisplay = {
                id: data.uid,
                uid: data.uid,
                email: data.email,
                name: data.displayName || data.email.split('@')[0] || 'Unknown User',
                avatarUrl: data.avatarUrl || getGravatarUrl(data.email, 96)!,
                role: data.role as AppRole, // This is the AppRole
            };
            setUserData(resolvedUser);
            setSelectedAppRole(resolvedUser.role); // Initialize selected app role
         } else {
            setError('User not found.');
             toast({ title: 'Error', description: 'Could not find the specified user.', variant: 'destructive' });
             router.push('/admin'); // Redirect if user not found
         }
      } catch (err: any) {
         console.error('Error fetching user data:', err);
         setError('Failed to load user details.');
         toast({ title: 'Error', description: 'Could not load user details.', variant: 'destructive' });
      } finally {
         setLoadingUser(false);
      }
  }, [isAdmin, userId, router, toast]);

  useEffect(() => {
     if (isAdmin === true) {
        fetchUserData();
     }
  }, [isAdmin, fetchUserData]);

   // Handle saving the updated app role
   const handleSaveAppRole = async (e: FormEvent) => {
        e.preventDefault();
        if (!isAdmin || !userData || !selectedAppRole || userData.role === selectedAppRole || isSaving) {
            return; // No permission, no data, no change, or already saving
        }
        // Prevent admin from changing their own role on this page
        if (userData.id === currentUser?.uid) {
             toast({ title: "Action Not Allowed", description: "Administrators cannot change their own role from this page.", variant: "destructive" });
             return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const userDocRef = doc(db, 'users', userData.id);
            await updateDoc(userDocRef, {
                role: selectedAppRole // Update the 'role' field in Firestore (AppRole)
            });

            toast({
                title: "User App Role Updated",
                description: `${userData.name}'s app-wide role has been updated to ${selectedAppRole.charAt(0).toUpperCase() + selectedAppRole.slice(1)}.`,
            });
             // Update local state to reflect change immediately
            setUserData(prev => prev ? { ...prev, role: selectedAppRole } : null);
            // No need to redirect, stay on the page

        } catch (err: any) {
            console.error("Error updating user app role:", err);
            setError('Failed to update user app role.');
            toast({ title: "Update Failed", description: "Could not update user app role.", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
   };

  // Loading state
  if (authLoading || isAdmin === null || loadingUser) {
     return (
       <div className="flex items-center justify-center min-h-screen bg-secondary p-4">
         <Card className="w-full max-w-lg shadow-xl">
             <CardHeader className="items-center relative">
                  <Skeleton className="h-9 w-20 absolute left-4 top-4" /> {/* Back button placeholder */}
                  <Skeleton className="h-8 w-48 mb-2 mt-8" /> {/* Title placeholder */}
                  <Skeleton className="h-4 w-64" /> {/* Description placeholder */}
             </CardHeader>
             <CardContent className="space-y-6">
                  <div className="flex items-center space-x-4">
                     <Skeleton className="h-16 w-16 rounded-full" />
                     <div className="space-y-2">
                         <Skeleton className="h-5 w-40" />
                         <Skeleton className="h-4 w-52" />
                     </div>
                  </div>
                 <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-10 w-full" />
                 </div>
             </CardContent>
             <CardFooter className="flex justify-end">
                 <Skeleton className="h-10 w-28" /> {/* Save button placeholder */}
             </CardFooter>
         </Card>
       </div>
     );
  }

  // Error state or user not found
  if (error || !userData) {
     return (
        <div className="flex items-center justify-center min-h-screen p-4">
            <Card className="w-full max-w-md shadow-xl">
                <CardHeader>
                    <CardTitle className="text-destructive">Error</CardTitle>
                </CardHeader>
                <CardContent>
                     <p className="text-destructive-foreground">{error || "User data could not be loaded."}</p>
                </CardContent>
                <CardFooter>
                     <Button variant="outline" onClick={() => router.push('/admin')}>Back to User List</Button>
                </CardFooter>
            </Card>
        </div>
     );
  }

  // User Detail View
  return (
     <div className="flex items-center justify-center min-h-screen bg-secondary p-4">
       <Card className="w-full max-w-lg shadow-xl">
         <CardHeader className="relative text-center">
            {/* Back Button */}
            <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/admin')} // Go back to admin list
                className="absolute left-4 top-4"
                aria-label="Go back to user list"
            >
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-2xl font-bold text-primary flex items-center justify-center pt-8">
                <UserCog className="mr-2 h-6 w-6" /> Manage User
            </CardTitle>
            <CardDescription>View details and manage app-wide roles for this user.</CardDescription>
         </CardHeader>
         <form onSubmit={handleSaveAppRole}>
             <CardContent className="space-y-6 pt-6">
                <div className="flex items-center space-x-4">
                    <Avatar className="h-16 w-16 border-2 border-primary">
                        <AvatarImage src={userData.avatarUrl} alt={userData.name} data-ai-hint="avatar profile picture"/>
                        <AvatarFallback className="text-2xl">
                            {(userData.name || '?').charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="text-xl font-semibold">{userData.name}</p>
                        <p className="text-sm text-muted-foreground">{userData.email}</p>
                    </div>
                </div>

                {/* Display other user info - readonly */}
                <div className="space-y-2">
                    <Label htmlFor="userId">User ID</Label>
                    <Input id="userId" value={userData.uid} readOnly disabled className="cursor-not-allowed bg-muted/50"/>
                </div>

                 {/* App Role Selection */}
                 <div className="space-y-2">
                    <Label htmlFor="appRole">App Role</Label>
                    <Select
                        value={selectedAppRole}
                        onValueChange={(newRole) => setSelectedAppRole(newRole as AppRole)}
                        disabled={isSaving || userData.id === currentUser?.uid} // Disable if saving or if viewing own profile
                    >
                        <SelectTrigger id="appRole" className="w-full">
                            <SelectValue placeholder="Select app role" />
                        </SelectTrigger>
                        <SelectContent>
                             {/* Iterate over APP_ROLES */}
                             {Object.values(APP_ROLES).map(role => (
                                <SelectItem key={role} value={role} className="text-sm">
                                     {role === APP_ROLES.ADMIN && <ShieldCheck className="inline h-4 w-4 mr-2 text-red-500"/>}
                                     {role === APP_ROLES.MEMBER && <Users className="inline h-4 w-4 mr-2 text-muted-foreground"/>}
                                    {role.charAt(0).toUpperCase() + role.slice(1)}
                                </SelectItem>
                             ))}
                        </SelectContent>
                    </Select>
                     {userData.id === currentUser?.uid && (
                         <p className="text-xs text-muted-foreground">You cannot change your own app role here.</p>
                     )}
                 </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
             </CardContent>
             <CardFooter className="flex justify-end">
                <Button type="submit" disabled={isSaving || userData.role === selectedAppRole || userData.id === currentUser?.uid}>
                     {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                     {isSaving ? 'Saving...' : 'Save App Role'}
                </Button>
             </CardFooter>
         </form>
       </Card>
     </div>
  );
}

// Wrap the content with ProtectedRoute
export default function AdminUserDetailPage() {
  return (
    <ProtectedRoute>
      <AdminUserDetailPageContent />
    </ProtectedRoute>
  );
}
