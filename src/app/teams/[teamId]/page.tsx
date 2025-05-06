
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
import { Loader2, UserPlus, Trash2, Mail, Crown, Users, UserCog, ShieldCheck, Star } from 'lucide-react'; // Added icons
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Added Select
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group" // Added RadioGroup
import { getGravatarUrl } from '@/lib/utils'; // Import Gravatar utility
import type { Team as TeamData, TeamMemberDisplay, TeamRole } from '@/lib/types'; // Import updated types
import { TEAM_ROLES } from '@/lib/types';

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

  // Calculate if the current user is Owner or Manager
  const currentUserRole = teamData?.memberRoles[currentUser?.uid ?? ''] ?? null;
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

                // Check if current user is a member before setting data
                if (!data.members.includes(currentUser.uid)) {
                     setError("You are not a member of this team or the team doesn't exist.");
                     toast({ title: 'Access Denied', description: 'You do not have permission to view this team.', variant: 'destructive' });
                     setLoadingTeam(false);
                     router.push('/');
                     return;
                }
               setTeamData({ id: teamDocSnap.id, ...data, memberRoles }); // Include memberRoles
               setLoadingTeam(false);
           } else {
               setError('Team not found.');
               toast({ title: 'Error', description: 'Team not found.', variant: 'destructive' });
               setLoadingTeam(false);
               router.push('/');
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
            const chunkSize = 30;

            for (let i = 0; i < memberUids.length; i += chunkSize) {
                const chunk = memberUids.slice(i, i + chunkSize);
                if (chunk.length === 0) continue;

                const membersQuery = query(collection(db, 'users'), where('uid', 'in', chunk));
                const querySnapshot = await getDocs(membersQuery);
                querySnapshot.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const uid = data.uid;
                    const role = teamData.memberRoles[uid] || TEAM_ROLES.MEMBER; // Get role from teamData

                    membersData.push({
                        id: uid, // Use id from User type
                        uid: uid, // Keep uid for internal logic consistency for now
                        email: data.email || 'unknown@example.com',
                        name: data.displayName || data.email?.split('@')[0] || 'Unknown User',
                        avatarUrl: data.avatarUrl || getGravatarUrl(data.email, 96)!,
                        teamRole: role, // Add team role
                    });
                });
            }

           const memberMap = new Map(membersData.map(m => [m.uid, m]));

           const fullMemberList = teamData.members.map(uid => {
               const foundMember = memberMap.get(uid);
               if (foundMember) return foundMember;

               console.warn(`User data not found for UID: ${uid}. Using placeholder.`);
               const fallbackEmail = `${uid}@unknown.com`;
                return {
                    id: uid,
                    uid: uid,
                    email: fallbackEmail,
                    name: 'Unknown User',
                    avatarUrl: getGravatarUrl(fallbackEmail, 96)!,
                    teamRole: teamData.memberRoles[uid] || TEAM_ROLES.MEMBER, // Assign role even for placeholders
                };
           });

           // Sort members: Owner first, then Manager, then alphabetically
           fullMemberList.sort((a, b) => {
               const roleOrder = { [TEAM_ROLES.OWNER]: 1, [TEAM_ROLES.MANAGER]: 2, [TEAM_ROLES.MEMBER]: 3 };
               const roleComparison = roleOrder[a.teamRole] - roleOrder[b.teamRole];
               if (roleComparison !== 0) return roleComparison;

               const nameA = a.name || a.email;
               const nameB = b.name || b.email;
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
   }, [teamData, toast]);

  useEffect(() => {
      if(currentUser && teamId) {
         fetchTeamData();
      } else if (!teamId) {
         setError("Team ID is missing.");
         setLoadingTeam(false);
      } else if (!currentUser) {
         setLoadingTeam(false);
      }
  }, [teamId, currentUser, fetchTeamData]);

  useEffect(() => {
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

    try {
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
        const userData = userDoc.data();

        if (teamData.members.includes(userId)) {
             setInviteError('User is already a member of this team.');
             toast({ title: 'Invite Failed', description: 'User is already in the team.', variant: 'default' });
             setIsInviting(false);
             return;
        }

        const batch = writeBatch(db);
        const teamDocRef = doc(db, 'teams', teamData.id);
        const userDocRef = doc(db, 'users', userId);

        // Add to team members and set default role (MEMBER)
        batch.update(teamDocRef, {
             members: arrayUnion(userId),
             [`memberRoles.${userId}`]: TEAM_ROLES.MEMBER // Set default role in the map
        });
        batch.update(userDocRef, { teams: arrayUnion(teamData.id) });

        await batch.commit();

      // TODO: Implement sending an actual email invitation
      console.log(`SIMULATED: Email invitation would be sent to ${emailToInvite}. User added directly.`);

      toast({
        title: 'Member Added',
        description: `${userData.displayName || userData.email} has been added to the team as a Member.`,
      });
      setInviteEmail('');
      fetchTeamData();

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
       // Only owner or manager can remove, and cannot remove owner
       const memberToRemove = teamMembers.find(m => m.uid === memberUid);
       if (!canManageTeam || !teamData || !memberToRemove || memberToRemove.teamRole === TEAM_ROLES.OWNER) {
            toast({ title: 'Cannot Remove', description: 'Owners cannot be removed. Only Owners or Managers can remove other members.', variant: 'destructive'});
            return;
       }

       setIsRemoving(memberUid);
       setError(null);

       try {
           const batch = writeBatch(db);
           const teamDocRef = doc(db, 'teams', teamData.id);
           const memberDocRef = doc(db, 'users', memberUid);

           // Remove from members array and memberRoles map
           batch.update(teamDocRef, {
                members: arrayRemove(memberUid),
                [`memberRoles.${memberUid}`]: undefined // Firestore way to remove map field
           });
           batch.update(memberDocRef, { teams: arrayRemove(teamData.id) });

           await batch.commit();

           toast({
               title: 'Member Removed',
               description: `${memberToRemove.name || memberToRemove.email} has been removed from the team.`,
               variant: 'destructive'
           });
           fetchTeamData();

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

   // Function to update a member's role
   const handleUpdateRole = async (memberUid: string, newRole: TeamRole) => {
        // Only owner can change roles, and cannot change own role via this method
        if (!isOwner || !teamData || memberUid === currentUser?.uid) {
            toast({title: "Permission Denied", description: "Only the team owner can change member roles.", variant: "destructive"});
            return;
        }
        const memberToUpdate = teamMembers.find(m => m.uid === memberUid);
        if (!memberToUpdate || memberToUpdate.teamRole === newRole) return; // No change needed

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
            fetchTeamData(); // Refresh data
        } catch (err: any) {
            console.error("Error updating role:", err);
            toast({ title: "Update Failed", description: "Could not update member role.", variant: "destructive"});
        } finally {
            setIsUpdatingRole(null);
        }
   };

   // Function to update the Scrum Master
   const handleUpdateScrumMaster = async (newScrumMasterUid: string | null) => {
        // Only owner or manager can set scrum master
       if (!canManageTeam || !teamData || teamData.scrumMasterUid === newScrumMasterUid) {
           return; // No permission or no change
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
                   : "Scrum Master cleared.",
           });
           // No need to fetchTeamData if only scrumMasterUid changed, update local state directly
           setTeamData(prev => prev ? { ...prev, scrumMasterUid: newScrumMasterUid } : null);
       } catch (err: any) {
           console.error("Error updating Scrum Master:", err);
           toast({ title: "Update Failed", description: "Could not update Scrum Master.", variant: "destructive"});
       } finally {
           setIsUpdatingScrumMaster(false);
       }
   };


  if (loadingTeam || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

   if (error && !teamData) {
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
    return <div className="flex items-center justify-center min-h-screen"><p>Loading team data...</p></div>;
  }

  // Get Scrum Master details
  const scrumMaster = teamData.scrumMasterUid ? teamMembers.find(m => m.uid === teamData.scrumMasterUid) : null;

  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="mb-8 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-primary flex items-center">
            <Users className="mr-3 h-6 w-6" />
            Team: {teamData.name}
          </CardTitle>
          <CardDescription>Manage your team members and designate the Scrum Master.</CardDescription>
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
                             <AvatarFallback>{scrumMaster.name.charAt(0).toUpperCase()}</AvatarFallback>
                         </Avatar>
                         <span className="font-medium">{scrumMaster.name}</span>
                    </div>
                ) : (
                    <p className="text-muted-foreground">No Scrum Master assigned.</p>
                )}
          </CardContent>
          {canManageTeam && (
                <CardFooter>
                    <Select
                        value={teamData.scrumMasterUid ?? 'none'}
                        onValueChange={(value) => handleUpdateScrumMaster(value === 'none' ? null : value)}
                        disabled={isUpdatingScrumMaster || loadingMembers}
                    >
                        <SelectTrigger className="w-[280px]">
                            <SelectValue placeholder="Assign Scrum Master" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">-- Clear Scrum Master --</SelectItem>
                            {teamMembers.map(member => (
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
                              <div className="flex items-center gap-3 overflow-hidden flex-grow">
                                  <Avatar className="h-9 w-9 flex-shrink-0">
                                      <AvatarImage src={member.avatarUrl} alt={member.name} data-ai-hint="avatar profile picture" />
                                      <AvatarFallback>{(member.name || member.email || '?').charAt(0).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div className="overflow-hidden">
                                       <span className="font-medium block truncate">{member.name || member.email}</span>
                                       {member.teamRole === TEAM_ROLES.OWNER && (
                                           <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center">
                                                <Crown className="h-3 w-3 mr-1"/> Owner
                                           </span>
                                       )}
                                       {member.teamRole === TEAM_ROLES.MANAGER && (
                                           <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold inline-flex items-center">
                                                <UserCog className="h-3 w-3 mr-1"/> Manager
                                           </span>
                                       )}
                                       {member.teamRole === TEAM_ROLES.MEMBER && (
                                            <span className="text-xs text-muted-foreground font-medium inline-flex items-center">
                                                <Users className="h-3 w-3 mr-1"/> Member
                                            </span>
                                        )}
                                       <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                                  </div>
                              </div>
                              {/* Actions: Change Role (Owner only, not self), Remove (Manager/Owner, not owner) */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                  {isOwner && member.uid !== currentUser.uid && (
                                       <Select
                                           value={member.teamRole}
                                           onValueChange={(newRole) => handleUpdateRole(member.uid, newRole as TeamRole)}
                                           disabled={isUpdatingRole === member.uid}
                                       >
                                          <SelectTrigger className="w-[120px] h-9 text-xs">
                                              <SelectValue placeholder="Change role" />
                                          </SelectTrigger>
                                          <SelectContent>
                                               {Object.values(TEAM_ROLES).filter(role => role !== TEAM_ROLES.OWNER).map(role => ( // Cannot manually set owner
                                                   <SelectItem key={role} value={role} className="text-xs">
                                                       {role.charAt(0).toUpperCase() + role.slice(1)}
                                                   </SelectItem>
                                               ))}
                                          </SelectContent>
                                      </Select>
                                  )}
                                  {canManageTeam && member.teamRole !== TEAM_ROLES.OWNER && (
                                      <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                               <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 px-2" disabled={isRemoving === member.uid}>
                                                    {isRemoving === member.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                    <span className="ml-1 hidden sm:inline">Remove</span>
                                               </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                              <AlertDialogHeader>
                                                  <AlertDialogTitle>Remove Member?</AlertDialogTitle>
                                                  <AlertDialogDescription>
                                                      Are you sure you want to remove <span className="font-medium">{member.name || member.email}</span> from the team? They will lose access to all team data.
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
                        onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null); }}
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
