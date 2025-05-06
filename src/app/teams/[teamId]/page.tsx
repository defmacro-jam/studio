
'use client';

import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, writeBatch, FieldValue, deleteField } from 'firebase/firestore'; // Import FieldValue and deleteField
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Trash2, Mail, Crown, Users, UserCog, ShieldCheck, Star, UserX } from 'lucide-react'; // Added UserX for remove
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Added Select
import { getGravatarUrl } from '@/lib/utils'; // Import Gravatar utility
import type { Team as TeamData, TeamMemberDisplay, TeamRole } from '@/lib/types'; // Import updated types
import { TEAM_ROLES } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton component

// Keep local definition for internal use, mapping directly to TeamMemberDisplay
interface MemberDisplayInfo extends TeamMemberDisplay {}

function TeamPageContent() {
  const { teamId } = useParams<{ teamId: string }>();
  const { currentUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [teamMembers, setTeamMembers] = useState<MemberDisplayInfo[]>([]); // Use updated interface
  const [inviteEmail, setInviteEmail] = useState('');
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null); // Track which member is being removed
  const [isUpdatingRole, setIsUpdatingRole] = useState<string | null>(null); // Track role update
  const [isUpdatingScrumMaster, setIsUpdatingScrumMaster] = useState(false); // Track scrum master update
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null); // Specific error for invite form

  // Calculate if the current user is Owner or Manager based on fetched teamData
  const currentUserRole = teamData?.memberRoles?.[currentUser?.uid ?? ''] ?? null;
  const isOwner = currentUserRole === TEAM_ROLES.OWNER;
  const isManager = currentUserRole === TEAM_ROLES.MANAGER;
  const canManageTeam = isOwner || isManager; // Owner or Manager can manage


   const fetchTeamData = useCallback(async () => {
       if (!teamId || !currentUser) return;
       setLoadingTeam(true);
       setError(null);
       try {
           const teamDocRef = doc(db, 'teams', teamId);
           const teamDocSnap = await getDoc(teamDocRef);

           if (teamDocSnap.exists()) {
               const data = teamDocSnap.data() as Omit<TeamData, 'id'>;
                // Ensure memberRoles exists, default to empty object if not
               const memberRoles = data.memberRoles || {};
               const membersList = data.members || [];


                // Check if current user is a member before setting data
                if (!membersList.includes(currentUser.uid)) {
                     setError("You are not a member of this team or the team doesn't exist.");
                     toast({ title: 'Access Denied', description: 'You do not have permission to view this team.', variant: 'destructive' });
                     setLoadingTeam(false);
                     router.push('/'); // Consider redirecting to a more appropriate page like /teams or /dashboard
                     return;
                }
               setTeamData({ id: teamDocSnap.id, ...data, members: membersList, memberRoles }); // Include validated members and memberRoles
               setLoadingTeam(false);
           } else {
               setError('Team not found.');
               toast({ title: 'Error', description: 'Team not found.', variant: 'destructive' });
               setLoadingTeam(false);
               router.push('/'); // Redirect if team not found
           }
       } catch (err: any) {
            console.error('Error fetching team data:', err);
            setError('Failed to load team data.');
             if (err.code === 'permission-denied') {
                 setError("Permission denied. Check Firestore rules.");
                 toast({ title: 'Permission Denied', description: 'You lack permissions to view this team.', variant: 'destructive' });
             } else {
                 toast({ title: 'Error', description: 'Could not load team details.', variant: 'destructive' });
             }
            setLoadingTeam(false);
       }
   }, [teamId, currentUser, router, toast]);

   const fetchTeamMembers = useCallback(async () => {
       if (!teamData || teamData.members.length === 0) {
           setTeamMembers([]);
           setLoadingMembers(false);
           return;
       }
       setLoadingMembers(true);
       try {
            const memberUids = teamData.members;
            const membersData: MemberDisplayInfo[] = [];
            const chunkSize = 30; // Firestore 'in' query limit

            // Fetch user data in chunks
            for (let i = 0; i < memberUids.length; i += chunkSize) {
                const chunk = memberUids.slice(i, i + chunkSize);
                if (chunk.length === 0) continue;

                const membersQuery = query(collection(db, 'users'), where('uid', 'in', chunk));
                const querySnapshot = await getDocs(membersQuery);
                querySnapshot.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const uid = data.uid;
                     // Get role from teamData.memberRoles, default to MEMBER if somehow missing
                    const role = teamData.memberRoles[uid] || TEAM_ROLES.MEMBER;

                    membersData.push({
                        id: uid, // Use uid as the primary ID
                        uid: uid, // Keep uid for consistency if needed elsewhere
                        email: data.email || 'unknown@example.com', // Fallback email
                        name: data.displayName || data.email?.split('@')[0] || 'Unknown User', // Fallback name
                        avatarUrl: data.avatarUrl || getGravatarUrl(data.email, 96)!, // Use stored avatar or generate Gravatar
                        teamRole: role, // Assign the fetched role
                    });
                });
            }

           // Create a map for quick lookup
           const memberMap = new Map(membersData.map(m => [m.uid, m]));

           // Ensure all members listed in teamData.members are included, even if their user doc fetch failed
           const fullMemberList = teamData.members.map(uid => {
               const foundMember = memberMap.get(uid);
               if (foundMember) return foundMember;

                // Handle case where user document wasn't found (or fetch failed)
               console.warn(`User data not found for UID: ${uid}. This user might not exist or there was a fetch error.`);
               const fallbackEmail = `${uid}@unknown.invalid`; // Use a clearly invalid domain
               const role = teamData.memberRoles[uid] || TEAM_ROLES.MEMBER; // Still assign role

                // Avoid adding the 'Unknown User' placeholder if it represents the current user
                // This indicates the current user's document might be missing or incomplete
                if (uid === currentUser?.uid) {
                    console.error(`Critical: Current user's data (UID: ${uid}) not found in Firestore 'users' collection. Ensure the user document exists.`);
                     setError("Could not load your user details. Please check your account or contact support.");
                     // Return a slightly different placeholder or null/undefined if you want to filter it out later
                     return {
                         id: uid,
                         uid: uid,
                         email: currentUser?.email || fallbackEmail, // Try to use auth email
                         name: 'Your User Data Missing!',
                         avatarUrl: getGravatarUrl(currentUser?.email || fallbackEmail, 96)!,
                         teamRole: role,
                     };
                }

                // Return placeholder for other missing users
                return {
                    id: uid,
                    uid: uid,
                    email: fallbackEmail,
                    name: 'Unknown User (Data Missing)', // Make placeholder clearer
                    avatarUrl: getGravatarUrl(fallbackEmail, 96)!, // Gravatar for placeholder
                    teamRole: role, // Assign role
                };
           }).filter(member => member !== null) as MemberDisplayInfo[]; // Filter out nulls if you choose to return null for current user error


           // Sort members: Owner first, then Manager, then Scrum Master (if applicable), then alphabetically by name
           const scrumMasterUid = teamData.scrumMasterUid;
           fullMemberList.sort((a, b) => {
               const roleOrder = { [TEAM_ROLES.OWNER]: 1, [TEAM_ROLES.MANAGER]: 2, [TEAM_ROLES.MEMBER]: 4 }; // Leave space for Scrum Master

               const roleA = (a.uid === scrumMasterUid && a.teamRole !== TEAM_ROLES.OWNER && a.teamRole !== TEAM_ROLES.MANAGER) ? 3 : roleOrder[a.teamRole];
               const roleB = (b.uid === scrumMasterUid && b.teamRole !== TEAM_ROLES.OWNER && b.teamRole !== TEAM_ROLES.MANAGER) ? 3 : roleOrder[b.teamRole];


               const roleComparison = roleA - roleB;
               if (roleComparison !== 0) return roleComparison;

               // If roles are the same, sort alphabetically by name (case-insensitive)
               const nameA = (a.name || a.email).toLowerCase();
               const nameB = (b.name || b.email).toLowerCase();
               return nameA.localeCompare(nameB);
           });

           setTeamMembers(fullMemberList);
       } catch (err: any) {
           console.error('Error fetching team members:', err);
             if (err.code === 'permission-denied') {
                 toast({ title: 'Permission Denied', description: 'Could not load team members due to Firestore rules.', variant: 'destructive' });
             } else {
                toast({ title: 'Error', description: 'Could not load team members.', variant: 'destructive' });
             }
       } finally {
           setLoadingMembers(false);
       }
   }, [teamData, currentUser, toast, setError]); // Depend on teamData, currentUser, toast, setError

  useEffect(() => {
      if(currentUser && teamId) {
         fetchTeamData();
      } else if (!teamId) {
         setError("Team ID is missing.");
         setLoadingTeam(false);
          router.push('/'); // Redirect if no team ID
      } else if (!currentUser) {
         // AuthProvider handles redirect, but good to stop loading here too
         setLoadingTeam(false);
      }
  }, [teamId, currentUser, fetchTeamData, router]);

  useEffect(() => {
    // Fetch members only after teamData is loaded and there's no error
    if (teamData && !error) {
      fetchTeamMembers();
    }
  }, [teamData, fetchTeamMembers, error]);

  const handleInviteMember = async (e: FormEvent) => {
    e.preventDefault();
    // Only owner or manager can invite
    if (!canManageTeam || !teamData || !inviteEmail.trim()) return;

    setIsInviting(true);
    setInviteError(null);

    const emailToInvite = inviteEmail.trim().toLowerCase();

    // Prevent inviting self
    if (emailToInvite === currentUser?.email?.toLowerCase()) {
        setInviteError("You cannot invite yourself.");
        toast({ title: "Invite Failed", description: "You are already in the team.", variant: "default" });
        setIsInviting(false);
        return;
    }


    try {
        // Check if a user with this email exists in the 'users' collection
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', emailToInvite));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            // --- User Does Not Exist ---
            // Inform the inviter that the user needs to sign up first.
            // Sending emails directly from the client-side is generally not recommended
            // due to security risks and complexity (requires backend/functions).
            setInviteError(`User with email ${emailToInvite} not found. Please ask them to sign up for RetroSpectify first.`);
            toast({
                title: 'User Not Found',
                description: `Ask ${emailToInvite} to sign up before inviting them. Email invitations for non-users are not currently supported.`,
                variant: 'default',
                duration: 7000
            });

            setIsInviting(false);
            return;
        }

         // --- User Exists ---
        const userDoc = querySnapshot.docs[0];
        const userId = userDoc.id; // This is the UID
        const userData = userDoc.data();

        // Check if the found user is already in the team
        if (teamData.members.includes(userId)) {
             setInviteError('User is already a member of this team.');
             toast({ title: 'Already Member', description: `${userData.displayName || userData.email} is already in the team.`, variant: 'default' });
             setIsInviting(false);
             return;
        }

         // --- Add Existing User to Team ---
        const batch = writeBatch(db);
        const teamDocRef = doc(db, 'teams', teamData.id);
        const userDocRef = doc(db, 'users', userId);

        // Add user's UID to team's members array and set default role (MEMBER) in memberRoles map
        batch.update(teamDocRef, {
             members: arrayUnion(userId),
             [`memberRoles.${userId}`]: TEAM_ROLES.MEMBER // Set default role in the map
        });
        // Add team's ID to user's teams array
        batch.update(userDocRef, { teams: arrayUnion(teamData.id) });

        await batch.commit();


      // Log that user was added (email notification not implemented)
      console.log(`User ${userId} (${userData.email}) added to team ${teamData.id}. (Email notification not sent)`);

      toast({
        title: 'Member Added',
        description: `${userData.displayName || userData.email} has been added to the team as a Member.`,
      });
      setInviteEmail(''); // Clear input field
      // Re-fetch team data which will trigger re-fetching members
      await fetchTeamData();

    } catch (err: any) {
      console.error('Invite error:', err);
       if (err.code === 'permission-denied') {
           setInviteError('Permission denied. Check Firestore rules.');
           toast({ title: 'Invite Failed', description: 'Permission denied to update data.', variant: 'destructive' });
       } else {
           setInviteError('Failed to add member. Please try again.');
           toast({ title: 'Invite Failed', description: 'An error occurred.', variant: 'destructive' });
       }
    } finally {
      setIsInviting(false);
    }
  };

   const handleRemoveMember = async (memberUid: string) => {
       const memberToRemove = teamMembers.find(m => m.uid === memberUid);
        // Permissions: Owner or Manager can remove. Owner cannot be removed. Cannot remove self via UI.
       if (!canManageTeam || !teamData || !memberToRemove || memberToRemove.teamRole === TEAM_ROLES.OWNER || memberUid === currentUser?.uid) {
            let description = "Only Owners or Managers can remove members.";
            if (memberToRemove?.teamRole === TEAM_ROLES.OWNER) description = "The team owner cannot be removed.";
            if (memberUid === currentUser?.uid) description = "You cannot remove yourself using this button.";
            toast({ title: 'Cannot Remove', description: description, variant: 'destructive'});
            return;
       }


       setIsRemoving(memberUid);
       setError(null);

       try {
           const batch = writeBatch(db);
           const teamDocRef = doc(db, 'teams', teamData.id);
           const memberDocRef = doc(db, 'users', memberUid);

           // Remove from members array and memberRoles map using FieldValue.delete() for map field removal
           batch.update(teamDocRef, {
                members: arrayRemove(memberUid),
                [`memberRoles.${memberUid}`]: deleteField() // Correct way to remove map field
           });
           // Remove team ID from user's document
           batch.update(memberDocRef, { teams: arrayRemove(teamData.id) });

            // If the removed member was the scrum master, clear it
            if (teamData.scrumMasterUid === memberUid) {
                batch.update(teamDocRef, { scrumMasterUid: null });
            }

           await batch.commit();

           toast({
               title: 'Member Removed',
               description: `${memberToRemove.name || memberToRemove.email} has been removed from the team.`,
               variant: 'default' // Use default variant for removal confirmation
           });
            // Re-fetch team data which will trigger re-fetching members
           await fetchTeamData();

       } catch (err: any) {
           console.error('Remove member error:', err);
            if (err.code === 'permission-denied') {
                 setError('Permission denied. Check Firestore rules.');
                 toast({ title: 'Removal Failed', description: 'Permission denied to update data.', variant: 'destructive' });
            } else {
                 setError('Failed to remove member. Please try again.');
                 toast({ title: 'Removal Failed', description: 'An error occurred.', variant: 'destructive' });
            }
       } finally {
           setIsRemoving(null); // Clear loading state regardless of outcome
       }
   };

   // Function to update a member's role
   const handleUpdateRole = async (memberUid: string, newRole: TeamRole) => {
        // Permissions: Only Owner can change roles. Cannot change own role. Cannot change Owner role.
        if (!isOwner || !teamData || memberUid === currentUser?.uid) {
            toast({title: "Permission Denied", description: "Only the team owner can change member roles. You cannot change your own role here.", variant: "destructive"});
            return;
        }
        const memberToUpdate = teamMembers.find(m => m.uid === memberUid);
        if (!memberToUpdate || memberToUpdate.teamRole === newRole) return; // No change needed or member not found

        // Prevent changing the Owner's role via this UI
        if (memberToUpdate.teamRole === TEAM_ROLES.OWNER) {
             toast({title: "Action Not Allowed", description: "The team owner's role cannot be changed here.", variant: "destructive"});
             return;
        }
         // Prevent setting another user as Owner via this UI
         if (newRole === TEAM_ROLES.OWNER) {
             toast({title: "Action Not Allowed", description: "Team ownership transfer is not supported via this UI.", variant: "destructive"});
             return;
         }


        setIsUpdatingRole(memberUid);
        try {
            const teamDocRef = doc(db, 'teams', teamData.id);
            // Update only the specific member's role in the map
            await updateDoc(teamDocRef, {
                [`memberRoles.${memberUid}`]: newRole
            });

            toast({
                title: "Role Updated",
                description: `${memberToUpdate.name}'s role set to ${newRole.charAt(0).toUpperCase() + newRole.slice(1)}.`,
            });
            // Refresh data to show updated role - fetchTeamData updates local state
            await fetchTeamData();

        } catch (err: any) {
            console.error("Error updating role:", err);
            toast({ title: "Update Failed", description: "Could not update member role.", variant: "destructive"});
        } finally {
            setIsUpdatingRole(null);
        }
   };

   // Function to update the Scrum Master
   const handleUpdateScrumMaster = async (newScrumMasterUid: string | null) => {
        // Permissions: Only Owner or Manager can set scrum master.
       if (!canManageTeam || !teamData || teamData.scrumMasterUid === newScrumMasterUid) {
            if (!canManageTeam) toast({ title: "Permission Denied", description: "Only Owner or Manager can assign Scrum Master.", variant: "destructive" });
           return; // No permission or no change
       }

       setIsUpdatingScrumMaster(true);
       try {
           const teamDocRef = doc(db, 'teams', teamData.id);
           // Update the scrumMasterUid field
           await updateDoc(teamDocRef, {
               scrumMasterUid: newScrumMasterUid
           });

           const newScrumMaster = newScrumMasterUid ? teamMembers.find(m => m.uid === newScrumMasterUid) : null;
           toast({
               title: "Scrum Master Updated",
               description: newScrumMaster
                   ? `${newScrumMaster.name} is now the Scrum Master.`
                   : "Scrum Master assignment cleared.",
           });
            // Fetch team data again to ensure local state is consistent, which also triggers member refetch/resort
           await fetchTeamData();
       } catch (err: any) {
           console.error("Error updating Scrum Master:", err);
           toast({ title: "Update Failed", description: "Could not update Scrum Master.", variant: "destructive"});
       } finally {
           setIsUpdatingScrumMaster(false);
       }
   };


  // Display Loading state while fetching initial team data or if no currentUser
  if (loadingTeam || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

   // Display Error state if team fetch failed and no team data is available
   if (error && !teamData) {
       return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Card className="w-full max-w-md shadow-xl bg-destructive/10 border-destructive">
                    <CardHeader>
                        <CardTitle className="text-destructive flex items-center"><UserX className="mr-2 h-5 w-5"/> Access Denied or Error</CardTitle>
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

  // Fallback if somehow teamData is still null after loading and no error
  if (!teamData) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading team data...</p></div>;
  }

  // Get Scrum Master details *after* members have been fetched and sorted
  const scrumMaster = teamData.scrumMasterUid ? teamMembers.find(m => m.uid === teamData.scrumMasterUid) : null;

  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="mb-8 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-primary flex items-center">
            <Users className="mr-3 h-6 w-6" />
            Team: {teamData.name}
          </CardTitle>
          <CardDescription>Manage your team members and roles.</CardDescription>
        </CardHeader>
      </Card>

       {/* Scrum Master Section */}
       <Card className="mb-8">
          <CardHeader>
              <CardTitle className="text-xl flex items-center"><Star className="mr-2 h-5 w-5 text-yellow-500 fill-yellow-400"/> Current Scrum Master</CardTitle>
          </CardHeader>
          <CardContent>
                {loadingMembers ? (
                    <Skeleton className="h-8 w-48 rounded" />
                ) : scrumMaster ? (
                    <div className="flex items-center gap-3">
                         <Avatar className="h-9 w-9">
                             <AvatarImage src={scrumMaster.avatarUrl} alt={scrumMaster.name} data-ai-hint="avatar profile picture"/>
                             <AvatarFallback>{(scrumMaster.name || '?').charAt(0).toUpperCase()}</AvatarFallback>
                         </Avatar>
                         <span className="font-medium">{scrumMaster.name}</span>
                         <span className="text-xs text-muted-foreground">({scrumMaster.email})</span>
                    </div>
                ) : (
                    <p className="text-muted-foreground">No Scrum Master assigned.</p>
                )}
          </CardContent>
          {/* Scrum Master Assignment Dropdown (for Owner/Manager) */}
          {canManageTeam && (
                <CardFooter>
                    <Select
                        value={teamData.scrumMasterUid ?? 'none'} // Use 'none' for the unassigned option
                        onValueChange={(value) => handleUpdateScrumMaster(value === 'none' ? null : value)}
                        disabled={isUpdatingScrumMaster || loadingMembers || teamMembers.length === 0}
                    >
                        <SelectTrigger className="w-full sm:w-[280px]">
                            <SelectValue placeholder="Assign Scrum Master" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">-- Clear Assignment --</SelectItem>
                            {/* Populate dropdown only with valid members */}
                            {teamMembers
                                .filter(member => !member.name.includes('Missing')) // Exclude placeholder/error users
                                .map(member => (
                                    <SelectItem key={member.uid} value={member.uid}>
                                        {member.name} ({member.email})
                                    </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {isUpdatingScrumMaster && <Loader2 className="ml-2 h-4 w-4 animate-spin"/>}
                </CardFooter>
           )}
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
                          <li key={member.uid} className="flex items-center justify-between p-3 bg-card border rounded-md hover:bg-secondary/50 transition-colors gap-4 flex-wrap">
                              {/* Member Info */}
                              <div className="flex items-center gap-3 overflow-hidden flex-grow min-w-[200px]">
                                  <Avatar className="h-9 w-9 flex-shrink-0">
                                      <AvatarImage src={member.avatarUrl} alt={member.name} data-ai-hint="avatar profile picture" />
                                      <AvatarFallback>{(member.name || '?').charAt(0).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div className="overflow-hidden">
                                       <span className="font-medium block truncate">{member.name} {member.uid === currentUser.uid && '(You)'}</span>
                                       {/* Role Badge */}
                                       <div className="flex items-center text-xs font-semibold mt-0.5">
                                           {member.teamRole === TEAM_ROLES.OWNER && (
                                               <span className="text-amber-600 dark:text-amber-400 inline-flex items-center">
                                                    <Crown className="h-3 w-3 mr-1"/> Owner
                                               </span>
                                           )}
                                           {member.teamRole === TEAM_ROLES.MANAGER && (
                                               <span className="text-blue-600 dark:text-blue-400 inline-flex items-center">
                                                    <UserCog className="h-3 w-3 mr-1"/> Manager
                                               </span>
                                           )}
                                           {member.teamRole === TEAM_ROLES.MEMBER && (
                                                <span className="text-muted-foreground inline-flex items-center">
                                                    <Users className="h-3 w-3 mr-1"/> Member
                                                </span>
                                            )}
                                           {/* Scrum Master Indicator (if applicable and not Owner/Manager) */}
                                            {teamData.scrumMasterUid === member.uid && member.teamRole === TEAM_ROLES.MEMBER && (
                                                 <span className="text-yellow-600 dark:text-yellow-400 inline-flex items-center ml-2 pl-2 border-l border-border/50">
                                                     <Star className="h-3 w-3 mr-1 fill-current"/> Scrum Master
                                                 </span>
                                            )}
                                       </div>
                                       {/* Email */}
                                       <p className="text-xs text-muted-foreground truncate mt-0.5">{member.email}</p>
                                  </div>
                              </div>

                              {/* Actions: Change Role (Owner only, not self, not owner), Remove (Manager/Owner, not owner, not self) */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                  {/* Role Update Dropdown (Owner only) */}
                                  {isOwner && member.uid !== currentUser.uid && member.teamRole !== TEAM_ROLES.OWNER && (
                                       <Select
                                           value={member.teamRole}
                                           onValueChange={(newRole) => handleUpdateRole(member.uid, newRole as TeamRole)}
                                           disabled={isUpdatingRole === member.uid} // Disable only if this specific user's role is being updated
                                       >
                                          <SelectTrigger className="w-[120px] h-9 text-xs">
                                              <SelectValue placeholder="Change role" />
                                          </SelectTrigger>
                                          <SelectContent>
                                               {/* Filter out OWNER role from options */}
                                               {Object.values(TEAM_ROLES).filter(role => role !== TEAM_ROLES.OWNER).map(role => (
                                                   <SelectItem key={role} value={role} className="text-xs">
                                                       {role.charAt(0).toUpperCase() + role.slice(1)}
                                                   </SelectItem>
                                               ))}
                                          </SelectContent>
                                      </Select>
                                  )}

                                  {/* Remove Button (Manager/Owner only) */}
                                  {canManageTeam && member.teamRole !== TEAM_ROLES.OWNER && member.uid !== currentUser.uid && (
                                      <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                               <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 px-2"
                                                    disabled={isRemoving === member.uid} // Disable only if this specific user is being removed
                                                    aria-label={`Remove ${member.name}`}
                                                >
                                                    {isRemoving === member.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                                                    <span className="ml-1 hidden sm:inline">Remove</span>
                                               </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                              <AlertDialogHeader>
                                                  <AlertDialogTitle>Confirm Removal</AlertDialogTitle>
                                                  <AlertDialogDescription>
                                                      Are you sure you want to remove <span className="font-medium">{member.name || member.email}</span> from the team "{teamData.name}"? They will lose access immediately.
                                                  </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                  <AlertDialogAction
                                                      onClick={() => handleRemoveMember(member.uid)}
                                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                      disabled={isRemoving === member.uid} // Ensure button is disabled during operation
                                                   >
                                                      {isRemoving === member.uid ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Removing...</> : 'Yes, Remove Member'}
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

       {/* Invite Member Form (Only for Owner/Manager) */}
       {canManageTeam && (
           <Card>
             <CardHeader>
               <CardTitle className="text-xl flex items-center"><UserPlus className="mr-2 h-5 w-5"/> Invite New Member</CardTitle>
               <CardDescription>Enter the email address of the user you want to add. They must already have a RetroSpectify account.</CardDescription>
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
                        onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null); }} // Clear error on change
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

        {/* General Error Display */}
       {error && !loadingTeam && (
           <p className="text-sm text-destructive mt-4 text-center">{error}</p>
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
