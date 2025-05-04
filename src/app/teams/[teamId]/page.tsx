'use client';

import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Trash2, Mail, Crown, Users } from 'lucide-react'; // Added Users icon
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface TeamMember {
  uid: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

interface TeamData {
  id: string;
  name: string;
  owner: string;
  members: string[]; // Array of user UIDs
}

function TeamPageContent() {
  const { teamId } = useParams<{ teamId: string }>();
  const { currentUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null); // Track which member is being removed
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null); // Specific error for invite form

  const isOwner = currentUser && teamData && currentUser.uid === teamData.owner;

   const fetchTeamData = useCallback(async () => {
       if (!teamId || !currentUser) return; // Ensure currentUser is available
       setLoadingTeam(true);
       setError(null);
       try {
           const teamDocRef = doc(db, 'teams', teamId);
           const teamDocSnap = await getDoc(teamDocRef);

           if (teamDocSnap.exists()) {
               const data = teamDocSnap.data() as Omit<TeamData, 'id'>;
                // Check if current user is a member before setting data
                if (!data.members.includes(currentUser.uid)) {
                     setError("You are not a member of this team or the team doesn't exist.");
                     toast({ title: 'Access Denied', description: 'You do not have permission to view this team.', variant: 'destructive' });
                     setLoadingTeam(false); // Stop loading
                     router.push('/'); // Redirect if not a member
                     return;
                }
               setTeamData({ id: teamDocSnap.id, ...data });
           } else {
               setError('Team not found.');
               toast({ title: 'Error', description: 'Team not found.', variant: 'destructive' });
               setLoadingTeam(false); // Stop loading
               router.push('/'); // Redirect if team doesn't exist
           }
       } catch (err) {
           console.error('Error fetching team data:', err);
           setError('Failed to load team data.');
           toast({ title: 'Error', description: 'Could not load team details.', variant: 'destructive' });
           setLoadingTeam(false); // Stop loading
       } finally {
            // Moved setLoading(false) inside conditional blocks to avoid setting it prematurely on error/redirect
       }
   }, [teamId, currentUser, router, toast]); // Add dependencies

   const fetchTeamMembers = useCallback(async () => {
       if (!teamData || teamData.members.length === 0) {
           setTeamMembers([]);
           setLoadingMembers(false);
           return;
       }
       setLoadingMembers(true);
       try {
            // Firestore allows querying up to 30 elements in 'in' array query in a single request
            // If team members exceed this, pagination or multiple queries are needed.
            // For simplicity, assuming teams are smaller than 30 for now.
           const membersQuery = query(collection(db, 'users'), where('uid', 'in', teamData.members));
           const querySnapshot = await getDocs(membersQuery);
           const membersData = querySnapshot.docs.map(doc => doc.data() as TeamMember);

           // Create a map for quick lookup
            const memberMap = new Map(membersData.map(m => [m.uid, m]));

            // Ensure all members from teamData.members are included, even if missing in users collection (though unlikely)
            const fullMemberList = teamData.members.map(uid => memberMap.get(uid) || { uid, email: 'Unknown User', displayName: 'Unknown User' });


           // Sort members: Owner first, then alphabetically by display name or email
           fullMemberList.sort((a, b) => {
               if (a.uid === teamData.owner) return -1;
               if (b.uid === teamData.owner) return 1;
               const nameA = a.displayName || a.email;
               const nameB = b.displayName || b.email;
               return nameA.localeCompare(nameB);
           });

           setTeamMembers(fullMemberList);
       } catch (err) {
           console.error('Error fetching team members:', err);
           toast({ title: 'Error', description: 'Could not load team members.', variant: 'destructive' });
       } finally {
           setLoadingMembers(false);
       }
   }, [teamData, toast]); // Add dependencies

  useEffect(() => {
      if(currentUser && teamId) { // Only fetch if user and teamId are available
         fetchTeamData();
      } else if (!teamId) {
         setError("Team ID is missing.");
         setLoadingTeam(false);
      } else if (!currentUser) {
         // Still loading auth or user not logged in - ProtectedRoute handles redirect
         setLoadingTeam(false);
      }
  }, [teamId, currentUser, fetchTeamData]); // Run when teamId or currentUser changes

  useEffect(() => {
    // Fetch members only if teamData is loaded successfully
    if (teamData && !error) {
      fetchTeamMembers();
    }
  }, [teamData, fetchTeamMembers, error]); // Run when teamData or error changes

  const handleInviteMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOwner || !teamData || !inviteEmail.trim()) return;

    setIsInviting(true);
    setInviteError(null); // Clear previous invite errors

    const emailToInvite = inviteEmail.trim().toLowerCase();

    try {
        // 1. Find the user by email
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', emailToInvite));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            setInviteError('User with this email not found.');
            toast({ title: 'Invite Failed', description: 'User not found.', variant: 'destructive' });
            setIsInviting(false);
            return;
        }

        const userDoc = querySnapshot.docs[0];
        const userId = userDoc.id;
        const userData = userDoc.data() as TeamMember; // Cast to TeamMember

        // 2. Check if user is already a member
        if (teamData.members.includes(userId)) {
             setInviteError('User is already a member of this team.');
             toast({ title: 'Invite Failed', description: 'User is already in the team.', variant: 'default' });
             setIsInviting(false);
             return;
        }

        // 3. Add user to team's member list and team to user's team list (atomic batch write)
        const batch = writeBatch(db);
        const teamDocRef = doc(db, 'teams', teamData.id);
        const userDocRef = doc(db, 'users', userId);

        batch.update(teamDocRef, { members: arrayUnion(userId) });
        batch.update(userDocRef, { teams: arrayUnion(teamData.id) });

        await batch.commit();


      // TODO: Implement sending an actual email invitation (e.g., using Firebase Functions + SendGrid/Nodemailer)
      // This requires backend setup. For now, we just add them directly.
      console.log(`SIMULATED: Email invitation would be sent to ${emailToInvite}. User added directly.`);

      toast({
        title: 'Member Added',
        description: `${userData.displayName || userData.email} has been added to the team.`,
      });
      setInviteEmail('');
      // Refresh team data and members after adding
      fetchTeamData(); // This will trigger fetchTeamMembers subsequently

    } catch (err: any) {
      console.error('Invite error:', err);
      setInviteError('Failed to add member. Please try again.');
      toast({ title: 'Invite Failed', description: 'An error occurred.', variant: 'destructive' });
    } finally {
      setIsInviting(false);
    }
  };

   const handleRemoveMember = async (memberUid: string) => {
       if (!isOwner || !teamData || memberUid === currentUser?.uid) return; // Owner cannot remove themselves

       setIsRemoving(memberUid); // Set loading state for this specific member
       setError(null);

       try {
            const memberToRemove = teamMembers.find(m => m.uid === memberUid);
            if (!memberToRemove) {
                throw new Error("Member data not found locally.");
            }

           // Atomically remove member from team and team from member's list
           const batch = writeBatch(db);
           const teamDocRef = doc(db, 'teams', teamData.id);
           const memberDocRef = doc(db, 'users', memberUid);

           batch.update(teamDocRef, { members: arrayRemove(memberUid) });
           batch.update(memberDocRef, { teams: arrayRemove(teamData.id) });

           await batch.commit();

           toast({
               title: 'Member Removed',
               description: `${memberToRemove.displayName || memberToRemove.email} has been removed from the team.`,
               variant: 'destructive'
           });
           // Refresh team data and members
           fetchTeamData(); // This will trigger fetchTeamMembers

       } catch (err: any) {
           console.error('Remove member error:', err);
           setError('Failed to remove member. Please try again.');
           toast({ title: 'Removal Failed', description: 'An error occurred.', variant: 'destructive' });
       } finally {
           setIsRemoving(null); // Reset loading state
       }
   };


  // Display loading indicator while fetching initial team data or auth state is loading
  if (loadingTeam || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

   // Display error message if team fetching failed or access denied
   if (error && !teamData) { // Show error only if teamData is null (i.e., initial fetch failed or access denied)
       return (
            <div className="flex items-center justify-center min-h-screen">
                <Card className="w-full max-w-md shadow-xl bg-destructive/10 border-destructive">
                    <CardHeader>
                        <CardTitle className="text-destructive">Access Denied or Error</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <p className="text-destructive-foreground">{error}</p>
                    </CardContent>
                    <CardFooter>
                         <Button variant="secondary" onClick={() => router.push('/')}>Go Home</Button>
                    </CardFooter>
                </Card>
            </div>
       );
   }


  // This state should ideally not be reached if logic above is correct, but as a safeguard:
  if (!teamData) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading team data...</p></div>;
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="mb-8 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-primary flex items-center">
            <Users className="mr-3 h-6 w-6" />
            Team: {teamData.name}
          </CardTitle>
          <CardDescription>Manage your team members and settings.</CardDescription>
        </CardHeader>
      </Card>

      {/* Member List */}
      <Card className="mb-8">
          <CardHeader>
              <CardTitle className="text-xl">Members ({teamMembers.length})</CardTitle>
          </CardHeader>
          <CardContent>
               {loadingMembers ? (
                    <div className="space-y-4 p-4">
                        {[1, 2, 3].map(i =>
                           <div key={i} className="flex items-center space-x-4">
                             <Skeleton className="h-10 w-10 rounded-full" />
                             <div className="space-y-2">
                               <Skeleton className="h-4 w-[150px]" />
                               <Skeleton className="h-3 w-[100px]" />
                             </div>
                           </div>
                         )}
                    </div>
               ) : teamMembers.length === 0 ? (
                   <p className="text-muted-foreground px-4 py-2">This team has no members yet.</p>
               ) : (
                  <ul className="space-y-3">
                      {teamMembers.map((member) => (
                          <li key={member.uid} className="flex items-center justify-between p-3 bg-card border rounded-md hover:bg-secondary/50 transition-colors">
                              <div className="flex items-center gap-3 overflow-hidden">
                                  <Avatar className="h-9 w-9 flex-shrink-0">
                                      <AvatarImage src={member.avatarUrl || undefined} alt={member.displayName || member.email} data-ai-hint="avatar profile picture" />
                                      <AvatarFallback>{(member.displayName || member.email || '?').charAt(0).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div className="overflow-hidden">
                                       <span className="font-medium block truncate">{member.displayName || member.email}</span>
                                       {member.uid === teamData.owner && (
                                           <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center">
                                                <Crown className="h-3 w-3 mr-1"/> Owner
                                           </span>
                                       )}
                                       <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                                  </div>

                              </div>
                              {/* Remove Button (for Owner, not self) */}
                              {isOwner && member.uid !== currentUser.uid && (
                                  <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                           <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive flex-shrink-0 ml-2" disabled={isRemoving === member.uid}>
                                                {isRemoving === member.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                <span className="ml-1 hidden sm:inline">Remove</span>
                                           </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                          <AlertDialogHeader>
                                              <AlertDialogTitle>Remove Member?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                  Are you sure you want to remove <span className="font-medium">{member.displayName || member.email}</span> from the team? They will lose access to all team retrospectives.
                                              </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction
                                                  onClick={() => handleRemoveMember(member.uid)}
                                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                  disabled={isRemoving === member.uid}
                                               >
                                                  {isRemoving === member.uid ? 'Removing...' : 'Yes, Remove'}
                                              </AlertDialogAction>
                                          </AlertDialogFooter>
                                      </AlertDialogContent>
                                  </AlertDialog>

                              )}
                          </li>
                      ))}
                  </ul>
              )}
          </CardContent>
      </Card>

       {/* Invite Member Form (Only for Owner) */}
       {isOwner && (
           <Card>
             <CardHeader>
               <CardTitle className="text-xl">Invite New Member</CardTitle>
               <CardDescription>Enter the email address of the user you want to add to the team. They must already have a RetroSpectify account.</CardDescription>
             </CardHeader>
             <form onSubmit={handleInviteMember}>
               <CardContent className="space-y-4">
                 <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <Label htmlFor="inviteEmail" className="sr-only">Email Address</Label>
                    <Input
                        id="inviteEmail"
                        type="email"
                        placeholder="member@example.com"
                        value={inviteEmail}
                        onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null); }} // Clear error on input change
                        required
                        disabled={isInviting}
                        className="flex-grow"
                     />
                    <Button type="submit" disabled={isInviting || !inviteEmail.trim()} className="w-full sm:w-auto flex-shrink-0">
                        {isInviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                        {isInviting ? 'Adding...' : 'Add Member'}
                    </Button>
                 </div>
                 {inviteError && <p className="text-sm text-destructive pt-1">{inviteError}</p>}
               </CardContent>
             </form>
           </Card>
       )}
        {/* General Error Display (for non-invite related errors) */}
       {error && <p className="text-sm text-destructive mt-4">{error}</p>}
    </div>
  );
}


// Wrap the content with ProtectedRoute
export default function TeamPage() {
    return (
        <ProtectedRoute>
            <TeamPageContent />
        </ProtectedRoute>
    );
}
