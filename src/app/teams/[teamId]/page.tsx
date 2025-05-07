
'use client';

import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link'; // Import Link for navigation
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, writeBatch, FieldValue, deleteField } from 'firebase/firestore'; // Import FieldValue and deleteField
import { sendPasswordResetEmail } from 'firebase/auth'; // Import for password reset (invitation flow)
import { db, auth } from '@/lib/firebase'; // Correctly import auth
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Trash2, Mail, Crown, Users, UserCog, ShieldCheck, Star, UserX, ArrowLeft, Pencil, Save, X as CancelIcon, Send } from 'lucide-react'; // Added Send for complete retro
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Added Select
import { getGravatarUrl } from '@/lib/utils'; // Import Gravatar utility
import type { Team as TeamData, TeamMemberDisplay, TeamRole, User as AppUserType, RetroItem, PollResponse } from '@/lib/types'; // Import updated types
import { TEAM_ROLES, APP_ROLES } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton component
// generateRetroReport is no longer needed here, handled on main page.

// Keep local definition for internal use, mapping directly to TeamMemberDisplay
interface MemberDisplayInfo extends TeamMemberDisplay {}

function TeamPageContent() {
  const { teamId } = useParams<{ teamId: string }>();
  const { currentUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [teamMembers, setTeamMembers] = useState<MemberDisplayInfo[]>([]); // Use updated interface
  const [appUser, setAppUser] = useState<AppUserType | null>(null); // For current user's app role
  const [inviteEmail, setInviteEmail] = useState('');
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null); // Track which member is being removed
  const [isUpdatingRole, setIsUpdatingRole] = useState<string | null>(null); // Track role update
  const [isUpdatingScrumMaster, setIsUpdatingScrumMaster] = useState(false); // Track scrum master update
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null); // Specific error for invite form
  // isCompletingRetro state removed, handled on main page


  // State for editing team name
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedTeamName, setEditedTeamName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  // Fetch current user's app-wide role
  useEffect(() => {
    const fetchAppUser = async () => {
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setAppUser(userDocSnap.data() as AppUserType);
        }
      }
    };
    fetchAppUser();
  }, [currentUser]);


  // Calculate if the current user is Owner or Manager based on fetched teamData and appUser
  const currentUserTeamRole = teamData?.memberRoles?.[currentUser?.uid ?? ''] ?? null;
  const isOwner = currentUserTeamRole === TEAM_ROLES.OWNER;
  const isManager = currentUserTeamRole === TEAM_ROLES.MANAGER;
  // isScrumMaster no longer directly used for "Complete Retro" on this page
  const isAdmin = appUser?.role === APP_ROLES.ADMIN; // Use appUser for app-wide admin check
  const canManageTeamSettings = isOwner || isManager; // Owner or Manager can edit team name, assign scrum master
  const canManageMembers = isOwner || isManager; // Owner or Manager can invite/remove members
  const canChangeRoles = isOwner; // Only Owner can change roles
  // canCompleteRetro removed, handled on main page


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
               const membersList = Object.keys(memberRoles); // Get members from memberRoles keys


                // Check if current user is a member before setting data
                if (!membersList.includes(currentUser.uid)) {
                     setError("You are not a member of this team or the team doesn't exist.");
                     toast({ title: 'Access Denied', description: 'You do not have permission to view this team.', variant: 'destructive' });
                     setLoadingTeam(false);
                     router.push('/'); // Consider redirecting to a more appropriate page like /teams or /dashboard
                     return;
                }
                const teamResult = { id: teamDocSnap.id, ...data, members: membersList, memberRoles, pendingMemberEmails: data.pendingMemberEmails || [] };
                setTeamData(teamResult);
                setEditedTeamName(teamResult.name); // Initialize edited name
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

            for (let i = 0; i < memberUids.length; i += chunkSize) {
                const chunk = memberUids.slice(i, i + chunkSize);
                if (chunk.length === 0) continue;

                const membersQuery = query(collection(db, 'users'), where('uid', 'in', chunk));
                const querySnapshot = await getDocs(membersQuery);
                querySnapshot.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const uid = data.uid;
                    const teamRole = teamData.memberRoles[uid] || TEAM_ROLES.MEMBER;
                    const appRole = data.role || APP_ROLES.MEMBER; 

                    membersData.push({
                        id: uid, 
                        uid: uid, 
                        email: data.email || 'unknown@example.com', 
                        name: data.displayName || data.email?.split('@')[0] || 'Unknown User', 
                        avatarUrl: data.avatarUrl || getGravatarUrl(data.email, 96)!, 
                        teamRole: teamRole, 
                        role: appRole, 
                    });
                });
            }

           const memberMap = new Map(membersData.map(m => [m.uid, m]));

           const fullMemberList = teamData.members.map(uid => {
               const foundMember = memberMap.get(uid);
               if (foundMember) return foundMember;

               console.warn(`User data not found for UID: ${uid}. This user might not exist or there was a fetch error.`);
               const fallbackEmail = `${uid}@unknown.invalid`; 
               const teamRole = teamData.memberRoles[uid] || TEAM_ROLES.MEMBER; 
               const appRole = APP_ROLES.MEMBER; 


                if (uid === currentUser?.uid) {
                    console.error(`Critical: Current user's data (UID: ${uid}) not found in Firestore 'users' collection. Ensure the user document exists.`);
                     setError("Could not load your user details. Please check your account or contact support.");
                     return {
                         id: uid,
                         uid: uid,
                         email: currentUser?.email || fallbackEmail,
                         name: 'Your User Data Missing!',
                         avatarUrl: getGravatarUrl(currentUser?.email || fallbackEmail, 96)!,
                         teamRole: teamRole,
                         role: appRole, 
                     };
                }
                return {
                    id: uid,
                    uid: uid,
                    email: fallbackEmail,
                    name: 'Unknown User (Data Missing)',
                    avatarUrl: getGravatarUrl(fallbackEmail, 96)!,
                    teamRole: teamRole,
                    role: appRole, 
                };
           }).filter(member => member !== null) as MemberDisplayInfo[];


           const scrumMasterUid = teamData.scrumMasterUid;
           fullMemberList.sort((a, b) => {
               const roleOrder = { [TEAM_ROLES.OWNER]: 1, [TEAM_ROLES.MANAGER]: 2, [TEAM_ROLES.MEMBER]: 4 };

               const isScrumMasterA = a.uid === scrumMasterUid;
               const isScrumMasterB = b.uid === scrumMasterUid;

               let roleValA = roleOrder[a.teamRole];
               let roleValB = roleOrder[b.teamRole];

               if (isScrumMasterA && a.teamRole === TEAM_ROLES.MEMBER) roleValA = 3;
               if (isScrumMasterB && b.teamRole === TEAM_ROLES.MEMBER) roleValB = 3;


               const roleComparison = roleValA - roleValB;
               if (roleComparison !== 0) return roleComparison;

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
   }, [teamData, currentUser, toast, setError]);

  useEffect(() => {
      if(currentUser && teamId) {
         fetchTeamData();
      } else if (!teamId) {
         setError("Team ID is missing.");
         setLoadingTeam(false);
          router.push('/');
      } else if (!currentUser) {
         setLoadingTeam(false);
         setLoadingMembers(false);
      }
  }, [teamId, currentUser, fetchTeamData, router]);

  useEffect(() => {
    if (teamData && !error) {
      fetchTeamMembers();
    }
  }, [teamData, fetchTeamMembers, error]);

  const handleSaveTeamName = async () => {
    if (!canManageTeamSettings || !teamData || !editedTeamName.trim() || editedTeamName.trim() === teamData.name) {
        if (!canManageTeamSettings) toast({ title: "Permission Denied", description: "Only Owner or Manager can edit the team name.", variant: "destructive" });
        if (editedTeamName.trim() === teamData?.name) setIsEditingName(false);
        return;
    }

    setIsSavingName(true);
    try {
        const teamDocRef = doc(db, 'teams', teamData.id);
        await updateDoc(teamDocRef, {
            name: editedTeamName.trim()
        });
        toast({ title: "Team Name Updated", description: `Team name changed to "${editedTeamName.trim()}".` });
        setIsEditingName(false);
        await fetchTeamData();
    } catch (err: any) {
        console.error('Error updating team name:', err);
        toast({ title: "Update Failed", description: "Could not update team name.", variant: "destructive" });
    } finally {
        setIsSavingName(false);
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    if (teamData) {
        setEditedTeamName(teamData.name);
    }
  };


  const handleInviteMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManageMembers || !teamData || !inviteEmail.trim()) return;

    setIsInviting(true);
    setInviteError(null);

    const emailToInvite = inviteEmail.trim().toLowerCase();

    if (emailToInvite === currentUser?.email?.toLowerCase()) {
        setInviteError("You cannot invite yourself.");
        toast({ title: "Invite Failed", description: "You are already in the team.", variant: "default" });
        setIsInviting(false);
        return;
    }


    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', emailToInvite));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            const teamDocRef = doc(db, 'teams', teamData.id);
            await updateDoc(teamDocRef, {
                pendingMemberEmails: arrayUnion(emailToInvite)
            });

            try {
                const signupUrl = `${window.location.origin}/signup?teamId=${teamData.id}&email=${encodeURIComponent(emailToInvite)}`;
                await sendPasswordResetEmail(auth, emailToInvite, {
                   url: signupUrl, 
                   handleCodeInApp: false,
                });
                 toast({
                     title: 'Invitation Sent',
                     description: `An invitation email has been sent to ${emailToInvite}. They need to set up their account via the link to join.`,
                     variant: 'default',
                     duration: 7000
                 });
                 setInviteEmail('');
                 await fetchTeamData(); 

            } catch (emailError: any) {
                 console.error('Error sending invitation/password reset email:', emailError);
                 let description = 'Could not send invitation email. Please check the address and try again.';
                 if (emailError.code === 'auth/invalid-email') {
                     description = 'Invalid email address format.';
                 } else if (emailError.code === 'auth/user-not-found'){
                     // This is expected if user doesn't exist, proceed with pending invite.
                 } else {
                    setInviteError(description);
                    toast({ title: 'Invite Failed', description: description, variant: 'destructive' });
                 }
            }

            setIsInviting(false);
            return;
        }

        const userDoc = querySnapshot.docs[0];
        const userId = userDoc.id;
        const userData = userDoc.data();

        if (teamData.members.includes(userId)) {
             setInviteError('User is already a member of this team.');
             toast({ title: 'Already Member', description: `${userData.displayName || userData.email} is already in the team.`, variant: 'default' });
             setIsInviting(false);
             return;
        }

        const batch = writeBatch(db);
        const teamDocRef = doc(db, 'teams', teamData.id);
        const userDocRef = doc(db, 'users', userId);

        batch.update(teamDocRef, {
             members: arrayUnion(userId),
             [`memberRoles.${userId}`]: TEAM_ROLES.MEMBER, 
             pendingMemberEmails: arrayRemove(emailToInvite) 
        });
        batch.update(userDocRef, { teamIds: arrayUnion(teamData.id) });

        await batch.commit();

      console.log(`User ${userId} (${userData.email}) added to team ${teamData.id}. (Email notification not sent for existing user)`);

      toast({
        title: 'Member Added',
        description: `${userData.displayName || userData.email} has been added to the team as a Member.`,
      });
      setInviteEmail('');
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
       if (!canManageMembers || !teamData || !memberToRemove || memberToRemove.teamRole === TEAM_ROLES.OWNER || memberUid === currentUser?.uid) {
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

           batch.update(teamDocRef, {
                members: arrayRemove(memberUid),
                [`memberRoles.${memberUid}`]: deleteField()
           });
           batch.update(memberDocRef, { teamIds: arrayRemove(teamData.id) });

            if (teamData.scrumMasterUid === memberUid) {
                batch.update(teamDocRef, { scrumMasterUid: null });
            }

           await batch.commit();

           toast({
               title: 'Member Removed',
               description: `${memberToRemove.name || memberToRemove.email} has been removed from the team.`,
               variant: 'default'
           });
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
           setIsRemoving(null);
       }
   };

   const handleUpdateRole = async (memberUid: string, newRole: TeamRole) => {
        if (!canChangeRoles || !teamData || memberUid === currentUser?.uid) {
            toast({title: "Permission Denied", description: "Only the team owner can change member roles. You cannot change your own role here.", variant: "destructive"});
            return;
        }
        const memberToUpdate = teamMembers.find(m => m.uid === memberUid);
        if (!memberToUpdate || memberToUpdate.teamRole === newRole) return;

        if (memberToUpdate.teamRole === TEAM_ROLES.OWNER) {
             toast({title: "Action Not Allowed", description: "The team owner's role cannot be changed here.", variant: "destructive"});
             return;
        }
         if (newRole === TEAM_ROLES.OWNER) {
             toast({title: "Action Not Allowed", description: "Team ownership transfer is not supported via this UI. Promote to Manager first if needed.", variant: "destructive"});
             return;
         }


        setIsUpdatingRole(memberUid);
        try {
            const teamDocRef = doc(db, 'teams', teamData.id);
            await updateDoc(teamDocRef, {
                [`memberRoles.${memberUid}`]: newRole
            });

            toast({
                title: "Role Updated",
                description: `${memberToUpdate.name}'s role set to ${newRole.charAt(0).toUpperCase() + newRole.slice(1)}.`,
            });
            await fetchTeamData();

        } catch (err: any) {
            console.error("Error updating role:", err);
            toast({ title: "Update Failed", description: "Could not update member role.", variant: "destructive"});
        } finally {
            setIsUpdatingRole(null);
        }
   };

   const handleUpdateScrumMaster = async (newScrumMasterUid: string | null) => {
       if (!canManageTeamSettings || !teamData || teamData.scrumMasterUid === newScrumMasterUid) {
            if (!canManageTeamSettings) toast({ title: "Permission Denied", description: "Only Owner or Manager can assign Scrum Master.", variant: "destructive" });
           return;
       }

       setIsUpdatingScrumMaster(true);
       try {
           const teamDocRef = doc(db, 'teams', teamData.id);
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
           await fetchTeamData();
       } catch (err: any) {
           console.error("Error updating Scrum Master:", err);
           toast({ title: "Update Failed", description: "Could not update Scrum Master.", variant: "destructive"});
       } finally {
           setIsUpdatingScrumMaster(false);
       }
   };

    // Removed handleCompleteRetrospective - this is now on the main page

  if (loadingTeam || !currentUser || !appUser) { 
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

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

  if (!teamData) {
    return <div className="flex items-center justify-center min-h-screen"><p>No team data available. You may not be a member of this team.</p></div>;
  }

  const scrumMaster = teamData.scrumMasterUid ? teamMembers.find(m => m.uid === teamData.scrumMasterUid) : null;

  return (
    <div className="container mx-auto p-4 md:p-8">
        <header className="mb-8 flex justify-between items-center">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Link href="/teams" passHref>
                 <Button variant="ghost" size="sm">My Teams</Button>
            </Link>
        </header>

      <Card className="mb-8 shadow-lg">
        <CardHeader>
           <div className="flex justify-between items-start gap-4">
               <div>
                    {isEditingName ? (
                        <div className="flex items-center gap-2">
                            <Input
                                value={editedTeamName}
                                onChange={(e) => setEditedTeamName(e.target.value)}
                                className="text-2xl font-bold h-10"
                                disabled={isSavingName}
                                maxLength={50}
                                autoFocus
                            />
                            <Button size="sm" onClick={handleSaveTeamName} disabled={isSavingName || !editedTeamName.trim() || editedTeamName.trim() === teamData.name}>
                                {isSavingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                <span className="sr-only">Save</span>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleCancelEditName} disabled={isSavingName}>
                                <CancelIcon className="h-4 w-4" />
                                <span className="sr-only">Cancel</span>
                            </Button>
                        </div>
                    ) : (
                        <CardTitle className="text-2xl font-bold text-primary flex items-center">
                            <Users className="mr-3 h-6 w-6 flex-shrink-0" />
                            <span className="flex-grow">{teamData.name}</span>
                            {canManageTeamSettings && (
                                <Button variant="ghost" size="icon" className="ml-2 h-7 w-7" onClick={() => setIsEditingName(true)}>
                                    <Pencil className="h-4 w-4" />
                                    <span className="sr-only">Edit team name</span>
                                </Button>
                            )}
                        </CardTitle>
                    )}
                   <CardDescription>Manage your team members and roles.</CardDescription>
               </div>
           </div>
        </CardHeader>
        {/* "Complete Retrospective" button removed from here */}
      </Card>

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
          {canManageTeamSettings && (
                <CardFooter>
                    <Select
                        value={teamData.scrumMasterUid ?? 'none'}
                        onValueChange={(value) => handleUpdateScrumMaster(value === 'none' ? null : value)}
                        disabled={isUpdatingScrumMaster || loadingMembers || teamMembers.length === 0}
                    >
                        <SelectTrigger className="w-full sm:w-[280px]">
                            <SelectValue placeholder="Assign Scrum Master" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">-- Clear Assignment --</SelectItem>
                            {teamMembers
                                .filter(member => !member.name.includes('Missing'))
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
                              <div className="flex items-center gap-3 overflow-hidden flex-grow min-w-[200px]">
                                  <Avatar className="h-9 w-9 flex-shrink-0">
                                      <AvatarImage src={member.avatarUrl} alt={member.name} data-ai-hint="avatar profile picture" />
                                      <AvatarFallback>{(member.name || '?').charAt(0).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div className="overflow-hidden">
                                       <span className="font-medium block truncate">{member.name} {member.uid === currentUser.uid && '(You)'}</span>
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
                                            {member.role === APP_ROLES.ADMIN && member.teamRole !== TEAM_ROLES.OWNER && member.teamRole !== TEAM_ROLES.MANAGER && (
                                                 <span className="text-red-600 dark:text-red-400 inline-flex items-center ml-2 pl-2 border-l border-border/50">
                                                     <ShieldCheck className="h-3 w-3 mr-1"/> Admin (App)
                                                 </span>
                                            )}
                                            {teamData.scrumMasterUid === member.uid && member.teamRole !== TEAM_ROLES.OWNER && member.teamRole !== TEAM_ROLES.MANAGER && (
                                                 <span className="text-yellow-600 dark:text-yellow-400 inline-flex items-center ml-2 pl-2 border-l border-border/50">
                                                     <Star className="h-3 w-3 mr-1 fill-current"/> Scrum Master
                                                 </span>
                                            )}
                                       </div>
                                       <p className="text-xs text-muted-foreground truncate mt-0.5">{member.email}</p>
                                  </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                  {canChangeRoles && member.uid !== currentUser.uid && member.teamRole !== TEAM_ROLES.OWNER && (
                                       <Select
                                           value={member.teamRole}
                                           onValueChange={(newRole) => handleUpdateRole(member.uid, newRole as TeamRole)}
                                           disabled={isUpdatingRole === member.uid}
                                       >
                                          <SelectTrigger className="w-[120px] h-9 text-xs">
                                              <SelectValue placeholder="Change role" />
                                          </SelectTrigger>
                                          <SelectContent>
                                               {[TEAM_ROLES.MANAGER, TEAM_ROLES.MEMBER].map(role => (
                                                   <SelectItem key={role} value={role} className="text-xs">
                                                       {role.charAt(0).toUpperCase() + role.slice(1)}
                                                   </SelectItem>
                                               ))}
                                          </SelectContent>
                                      </Select>
                                  )}

                                  {canManageMembers && member.teamRole !== TEAM_ROLES.OWNER && member.uid !== currentUser.uid && (
                                      <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                               <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 px-2"
                                                    disabled={isRemoving === member.uid}
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
                                                      disabled={isRemoving === member.uid}
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

       {canManageMembers && (
           <Card>
             <CardHeader>
               <CardTitle className="text-xl flex items-center"><UserPlus className="mr-2 h-5 w-5"/> Invite New Member</CardTitle>
               <CardDescription>Enter the email address of the user you want to add. If they don't have an account, an invite will be sent.</CardDescription>
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
                        onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null); }}
                        required
                        disabled={isInviting}
                        className="flex-grow"
                     />
                    <Button type="submit" disabled={isInviting || !inviteEmail.trim()} className="w-full sm:w-auto flex-shrink-0">
                        {isInviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                        {isInviting ? 'Adding/Inviting...' : 'Add / Invite Member'}
                    </Button>
                 </div>
                 {inviteError && <p className="text-sm text-destructive pt-1">{inviteError}</p>}
               </CardContent>
             </form>
           </Card>
       )}

        {teamData.pendingMemberEmails && teamData.pendingMemberEmails.length > 0 && (
            <Card className="mt-8">
                <CardHeader>
                    <CardTitle className="text-xl">Pending Invitations</CardTitle>
                    <CardDescription>These users have been invited but haven't signed up or joined yet.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-2">
                        {teamData.pendingMemberEmails.map(email => (
                            <li key={email} className="text-sm text-muted-foreground p-2 border-b border-dashed">
                                {email}
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        )}

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

