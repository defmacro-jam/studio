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
import { Loader2, UserPlus, Trash2, Mail, Crown } from 'lucide-react';
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

  const isOwner = currentUser && teamData && currentUser.uid === teamData.owner;

   const fetchTeamData = useCallback(async () => {
       if (!teamId) return;
       setLoadingTeam(true);
       setError(null);
       try {
           const teamDocRef = doc(db, 'teams', teamId);
           const teamDocSnap = await getDoc(teamDocRef);

           if (teamDocSnap.exists()) {
               const data = teamDocSnap.data() as Omit<TeamData, 'id'>;
                // Basic check if current user is a member before setting data
                if (!currentUser || !data.members.includes(currentUser.uid)) {
                     setError("You are not a member of this team or the team doesn't exist.");
                     toast({ title: 'Access Denied', description: 'You do not have permission to view this team.', variant: 'destructive' });
                     router.push('/'); // Redirect if not a member
                     return;
                }
               setTeamData({ id: teamDocSnap.id, ...data });
           } else {
               setError('Team not found.');
               toast({ title: 'Error', description: 'Team not found.', variant: 'destructive' });
               router.push('/'); // Redirect if team doesn't exist
           }
       } catch (err) {
           console.error('Error fetching team data:', err);
           setError('Failed to load team data.');
           toast({ title: 'Error', description: 'Could not load team details.', variant: 'destructive' });
       } finally {
           setLoadingTeam(false);
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
           const membersQuery = query(collection(db, 'users'), where('uid', 'in', teamData.members));
           const querySnapshot = await getDocs(membersQuery);
           const membersData = querySnapshot.docs.map(doc => doc.data() as TeamMember);
           // Sort members: Owner first, then alphabetically by display name or email
           membersData.sort((a, b) => {
               if (a.uid === teamData.owner) return -1;
               if (b.uid === teamData.owner) return 1;
               const nameA = a.displayName || a.email;
               const nameB = b.displayName || b.email;
               return nameA.localeCompare(nameB);
           });

           setTeamMembers(membersData);
       } catch (err) {
           console.error('Error fetching team members:', err);
           toast({ title: 'Error', description: 'Could not load team members.', variant: 'destructive' });
       } finally {
           setLoadingMembers(false);
       }
   }, [teamData, toast]); // Add dependencies

  useEffect(() => {
      if(currentUser) { // Only fetch if user is loaded
         fetchTeamData();
      }
  }, [teamId, currentUser, fetchTeamData]); // Run when teamId or currentUser changes

  useEffect(() => {
    if (teamData) {
      fetchTeamMembers();
    }
  }, [teamData, fetchTeamMembers]); // Run when teamData changes

  const handleInviteMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOwner || !teamData || !inviteEmail.trim()) return;

    setIsInviting(true);
    setError(null);

    try {
        // 1. Find the user by email
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', inviteEmail.trim().toLowerCase()));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            setError('User with this email not found.');
            toast({ title: 'Invite Failed', description: 'User not found.', variant: 'destructive' });
            setIsInviting(false);
            return;
        }

        const userDoc = querySnapshot.docs[0];
        const userId = userDoc.id;
        const userData = userDoc.data();

        // 2. Check if user is already a member
        if (teamData.members.includes(userId)) {
             setError('User is already a member of this team.');
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
      console.log(`TODO: Send email invitation to ${inviteEmail}`);

      toast({
        title: 'Member Added',
        description: `${userData.displayName || userData.email} has been added to the team.`,
      });
      setInviteEmail('');
      // Refresh team data and members after adding
      fetchTeamData();

    } catch (err: any) {
      console.error('Invite error:', err);
      setError('Failed to add member. Please try again.');
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
           // Atomically remove member from team and team from member's list
           const batch = writeBatch(db);
           const teamDocRef = doc(db, 'teams', teamData.id);
           const memberDocRef = doc(db, 'users', memberUid);

           batch.update(teamDocRef, { members: arrayRemove(memberUid) });
           batch.update(memberDocRef, { teams: arrayRemove(teamData.id) });

           await batch.commit();

           const removedMember = teamMembers.find(m => m.uid === memberUid);
           toast({
               title: 'Member Removed',
               description: `${removedMember?.displayName || removedMember?.email || 'User'} has been removed from the team.`,
               variant: 'destructive'
           });
           // Refresh team data and members
           fetchTeamData();

       } catch (err: any) {
           console.error('Remove member error:', err);
           setError('Failed to remove member. Please try again.');
           toast({ title: 'Removal Failed', description: 'An error occurred.', variant: 'destructive' });
       } finally {
           setIsRemoving(null); // Reset loading state
       }
   };


  if (loadingTeam || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

   if (error) {
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


  if (!teamData) {
    // This case should ideally be covered by the error state, but adding for robustness
    return <div className="flex items-center justify-center min-h-screen"><p>Team data not available.</p></div>;
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
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => <Loader2 key={i} className="h-5 w-5 animate-spin text-muted-foreground"/>)}
                    </div>
               ) : teamMembers.length === 0 ? (
                   <p className="text-muted-foreground">No members found.</p>
               ) : (
                  <ul className="space-y-3">
                      {teamMembers.map((member) => (
                          <li key={member.uid} className="flex items-center justify-between p-3 bg-card border rounded-md">
                              <div className="flex items-center gap-3">
                                  <Avatar className="h-9 w-9">
                                      <AvatarImage src={member.avatarUrl} alt={member.displayName || member.email} data-ai-hint="avatar profile picture" />
                                      <AvatarFallback>{(member.displayName || member.email || 'U').charAt(0).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div>
                                       <span className="font-medium">{member.displayName || member.email}</span>
                                       {member.uid === teamData.owner && (
                                           <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center">
                                                <Crown className="h-3 w-3 mr-1"/> Owner
                                           </span>
                                       )}
                                       <p className="text-xs text-muted-foreground">{member.email}</p>
                                  </div>

                              </div>
                              {isOwner && member.uid !== currentUser.uid && (
                                  <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                           <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={isRemoving === member.uid}>
                                                {isRemoving === member.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                <span className="ml-2 hidden sm:inline">Remove</span>
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
               <CardDescription>Enter the email address of the user you want to add to the team.</CardDescription>
             </CardHeader>
             <form onSubmit={handleInviteMember}>
               <CardContent className="space-y-4">
                 <div className="flex flex-col sm:flex-row gap-2">
                    <Label htmlFor="inviteEmail" className="sr-only">Email Address</Label>
                    <Input
                        id="inviteEmail"
                        type="email"
                        placeholder="member@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        required
                        disabled={isInviting}
                        className="flex-grow"
                     />
                    <Button type="submit" disabled={isInviting || !inviteEmail.trim()} className="w-full sm:w-auto">
                        {isInviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                        {isInviting ? 'Adding...' : 'Add Member'}
                    </Button>
                 </div>
                 {error && <p className="text-sm text-destructive pt-2">{error}</p>}
               </CardContent>
               {/* <CardFooter> - Button moved inside content for better layout */}
               {/* </CardFooter> */}
             </form>
           </Card>
       )}
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
