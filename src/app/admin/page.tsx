
'use client';

import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link'; // Import Link
import { collection, getDocs, doc, updateDoc, writeBatch, getDoc, deleteDoc, FieldValue } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
// Input and Label removed as inline editing is removed
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
// Dialog components removed as modal is removed
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserCog, UserX, ArrowLeft, ShieldCheck, Users, ShieldAlert, Trash2, Eye, Home, Settings } from 'lucide-react'; // Added Settings icon
import ProtectedRoute from '@/components/auth/ProtectedRoute';
// Select components removed as role editing moved
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getGravatarUrl } from '@/lib/utils';
import type { AdminUserDisplay, AppRole } from '@/lib/types'; // Import AdminUserDisplay type
import { APP_ROLES } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

// EditUserDialog removed as editing moved to detail page

function AdminPageContent() {
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [users, setUsers] = useState<AdminUserDisplay[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  // isUpdatingRole state removed
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null); // Track user deletion UID
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null); // State to track if current user is admin

  // State for edit modal removed

  // Check current user's role
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!currentUser) {
        setIsAdmin(false);
        setLoadingUsers(false); // Don't load users if not logged in
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
          router.push('/'); // Redirect non-admins
        }
      } catch (err) {
        console.error("Error checking admin status:", err);
        setError("Failed to verify administrator status.");
        setIsAdmin(false);
        router.push('/'); // Redirect on error
      }
    };

    if (!authLoading) {
        checkAdminStatus();
    }
  }, [currentUser, authLoading, router, toast]);


  // Fetch all users if the current user is an admin
  const fetchAllUsers = useCallback(async () => {
    // Only proceed if isAdmin is confirmed true
    if (isAdmin !== true) {
        setLoadingUsers(false);
        return;
    }

    setLoadingUsers(true);
    setError(null);
    try {
      const usersQuery = collection(db, 'users');
      const querySnapshot = await getDocs(usersQuery);
      const usersData: AdminUserDisplay[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Basic validation for essential fields
        if (data.uid && data.email && data.role) {
            usersData.push({
                id: data.uid, // Use uid as the primary ID
                uid: data.uid,
                email: data.email,
                name: data.displayName || data.email.split('@')[0] || 'Unknown User',
                avatarUrl: data.avatarUrl || getGravatarUrl(data.email, 96)!,
                role: data.role as AppRole, // Cast role to AppRole
            });
        } else {
            console.warn(`Skipping user document ${docSnap.id} due to missing essential fields (uid, email, or role).`);
        }
      });

      // Sort users alphabetically by name
      usersData.sort((a, b) => a.name.localeCompare(b.name));
      setUsers(usersData);

    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError('Failed to load user list.');
       if (err.code === 'permission-denied') {
           setError('Permission denied. Check Firestore rules for accessing the users collection.');
           toast({ title: 'Permission Denied', description: 'Could not load users due to Firestore permissions.', variant: 'destructive' });
       } else {
          toast({ title: 'Error', description: 'Could not load users.', variant: 'destructive' });
       }
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin, toast]); // Depend on isAdmin status

  // Trigger user fetch when admin status is confirmed
  useEffect(() => {
      if (isAdmin === true) { // Explicitly check for true
          fetchAllUsers();
      }
  }, [isAdmin, fetchAllUsers]);

  // handleUpdateRole function removed - role update moved to detail page
  // handleUpdateDisplayName function removed - display name editing moved elsewhere (e.g., /me or detail page)
  // openEditModal and closeEditModal removed

   // Function to delete a user (use with extreme caution!)
   const handleDeleteUser = async (userId: string, userName: string) => {
        if (isAdmin !== true || userId === currentUser?.uid) {
            toast({ title: "Action Not Allowed", description: "You cannot delete yourself or lack admin privileges.", variant: "destructive" });
            return;
        }

        setIsDeletingUser(userId);
        try {
            const userDocRef = doc(db, 'users', userId);

            // --- Complexities ---
            // 1. Removing user from teams: Requires iterating teams or having team IDs on user doc.
            // 2. Deleting user from Firebase Auth: Requires Admin SDK (backend function).
            // 3. Handling owned teams: Requires logic to transfer ownership or delete team.

            // --- Simplified Deletion (Firestore Document Only) ---
            await deleteDoc(userDocRef);

            // TODO: Implement backend function (Cloud Function) to:
            //      - Delete user from Firebase Authentication using Admin SDK.
            //      - Clean up user's data across the database (posts, replies, poll responses).
            //      - Remove user from all teams' member lists/roles.
            //      - Handle team ownership transfer or deletion if the user was an owner.

            toast({
                title: "User Document Deleted",
                description: `${userName}'s data removed from Firestore 'users' collection. Authentication & other data require backend cleanup.`,
                variant: "default" // Use default variant for delete confirmation
            });
            // Refresh user list
            setUsers(prevUsers => prevUsers.filter(u => u.id !== userId));

        } catch (err: any) {
            console.error("Error deleting user document:", err);
            let description = "Could not delete user document.";
            if (err.code === 'permission-denied') {
                description = "Permission denied. Check Firestore rules for deleting user documents.";
            }
            toast({ title: "Deletion Failed", description: description, variant: "destructive" });
        } finally {
            setIsDeletingUser(null);
        }
   };

  // Loading state while checking admin status or loading users
  if (authLoading || isAdmin === null || (isAdmin === true && loadingUsers)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-secondary p-4">
        <Card className="w-full max-w-2xl shadow-xl">
          <CardHeader>
             <div className="flex justify-between items-center">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-9 w-20" />
             </div>
             <Skeleton className="h-4 w-64 mt-1" />
          </CardHeader>
          <CardContent className="space-y-4">
             {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-md">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-40" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-9 w-24" /> {/* View Details Button Placeholder */}
                        <Skeleton className="h-9 w-9" /> {/* Delete Button Placeholder */}
                    </div>
                </div>
             ))}
          </CardContent>
        </Card>
      </div>
    );
  }

   // Display Error/Access Denied state if not admin or error occurred
   if (!isAdmin || error) {
       return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Card className="w-full max-w-md shadow-xl bg-destructive/10 border-destructive">
                    <CardHeader>
                        <CardTitle className="text-destructive flex items-center"><ShieldAlert className="mr-2 h-5 w-5"/> Access Denied</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <p className="text-destructive-foreground">{error || "You do not have permission to access this page."}</p>
                    </CardContent>
                    <CardFooter>
                         <Button variant="secondary" onClick={() => router.push('/')}>Go Home</Button>
                    </CardFooter>
                </Card>
            </div>
       );
   }

  // Main content for Admins
  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 flex flex-wrap justify-between items-center gap-4">
        {/* Home Button */}
        <Button variant="outline" size="sm" onClick={() => router.push('/')}>
          <Home className="mr-2 h-4 w-4" /> Home
        </Button>
        <h1 className="text-2xl font-bold text-primary flex items-center">
            <UserCog className="mr-3 h-6 w-6" /> User Management
        </h1>
         {/* Link to App Settings */}
         <div>
            <Link href="/admin/settings" passHref>
                <Button variant="outline" size="sm">
                    <Settings className="mr-2 h-4 w-4" /> App Settings
                </Button>
            </Link>
         </div>
      </header>

      <Card>
          <CardHeader>
              <CardTitle>All Users ({users.length})</CardTitle>
              <CardDescription>View user details or remove users.</CardDescription>
          </CardHeader>
          <CardContent>
               {users.length === 0 && !loadingUsers ? (
                   <p className="text-muted-foreground p-4 text-center">No users found.</p>
               ) : (
                  <ul className="space-y-3">
                      {users.map((user) => (
                          <li key={user.id} className="flex items-center justify-between p-3 bg-card border rounded-md hover:bg-secondary/50 transition-colors gap-4 flex-wrap">
                              {/* User Info */}
                               <Link href={`/admin/users/${user.id}`} className="flex items-center gap-3 overflow-hidden flex-grow min-w-[200px] cursor-pointer group">
                                  <Avatar className="h-10 w-10 flex-shrink-0">
                                      <AvatarImage src={user.avatarUrl} alt={user.name} data-ai-hint="avatar profile picture" />
                                      <AvatarFallback>{(user.name || '?').charAt(0).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div className="overflow-hidden">
                                       <span className="font-medium block truncate group-hover:text-primary">{user.name} {user.id === currentUser?.uid && '(You)'}</span>
                                       {/* App Role Badge */}
                                       <div className="flex items-center text-xs font-semibold mt-0.5">
                                           {user.role === APP_ROLES.ADMIN && (
                                               <span className="text-red-600 dark:text-red-400 inline-flex items-center">
                                                    <ShieldCheck className="h-3 w-3 mr-1"/> Admin
                                               </span>
                                           )}
                                           {user.role === APP_ROLES.MEMBER && (
                                                <span className="text-muted-foreground inline-flex items-center">
                                                    <Users className="h-3 w-3 mr-1"/> Member
                                                </span>
                                            )}
                                       </div>
                                       <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                                  </div>
                              </Link>

                              {/* Actions: View Details (Implicit via Link), Delete User */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                    {/* View Details Button (Alternative/Redundant to Link) */}
                                    <Link href={`/admin/users/${user.id}`} passHref>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-9 px-2"
                                            disabled={isDeletingUser === user.id}
                                            aria-label={`View details for ${user.name}`}
                                        >
                                            <Eye className="h-4 w-4" />
                                            <span className="ml-1 hidden sm:inline">Details</span>
                                        </Button>
                                    </Link>


                                  {/* Delete Button (Cannot delete self) */}
                                  {user.id !== currentUser?.uid && (
                                      <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                               <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 px-2"
                                                    disabled={isDeletingUser === user.id}
                                                    aria-label={`Delete ${user.name}`}
                                                >
                                                    {isDeletingUser === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                    <span className="ml-1 hidden sm:inline">Delete</span>
                                               </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                              <AlertDialogHeader>
                                                  <AlertDialogTitle>Confirm User Deletion</AlertDialogTitle>
                                                  <AlertDialogDescription>
                                                      <span className="font-bold text-destructive">Warning:</span> This action is potentially destructive and irreversible. Are you sure you want to delete user <span className="font-medium">{user.name || user.email}</span>?
                                                      <br/><br/>
                                                      This will only remove their document from the 'users' collection. For complete removal, ensure backend functions handle Auth deletion and data cleanup.
                                                  </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                  <AlertDialogCancel disabled={isDeletingUser === user.id}>Cancel</AlertDialogCancel>
                                                  <AlertDialogAction
                                                      onClick={(e) => {
                                                            // Prevent link navigation when clicking delete action within the link area
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleDeleteUser(user.id, user.name);
                                                        }}
                                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                      disabled={isDeletingUser === user.id}
                                                   >
                                                      {isDeletingUser === user.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Deleting...</> : 'Yes, Delete User Document'}
                                                  </AlertDialogAction>
                                              </AlertDialogFooter>
                                          </AlertDialogContent>
                                      </AlertDialog>
                                  )}
                              </div>
                          </li>
                      ))}
                  </ul>
              )}
          </CardContent>
      </Card>

       {/* General Error Display */}
       {error && !loadingUsers && isAdmin === true && ( // Only show main error if admin check passed but user fetch failed
           <p className="text-sm text-destructive mt-4 text-center">{error}</p>
       )}

        {/* Edit User Dialog Removed */}
    </div>
  );
}

// Wrap the content with ProtectedRoute
export default function AdminPage() {
    return (
        <ProtectedRoute>
            <AdminPageContent />
        </ProtectedRoute>
    );
}

