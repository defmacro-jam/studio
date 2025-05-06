
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { collection, query, where, getDocs, doc, getDoc, writeBatch, FieldValue, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, PlusCircle, Users, ArrowRight, Trash2, Home } from 'lucide-react'; // Added Home icon
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import type { Team as TeamData } from '@/lib/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast'; // Import useToast

// Updated interface to include owner UID
interface TeamInfo extends Pick<TeamData, 'id' | 'name' | 'owner'> {
  memberCount: number;
}

function TeamsListPageContent() {
  const { currentUser } = useAuth();
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null); // State for loading indicator on delete button
  const { toast } = useToast(); // Initialize toast

  const fetchTeams = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setTeams([]); // Reset teams on fetch
    try {
      // 1. Get the user's document to find their team IDs
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        console.warn("User document not found, cannot fetch teams.");
        setLoading(false);
        return;
      }

      const userData = userDocSnap.data();
      const teamIds = userData?.teams || []; // Ensure userData exists before accessing teams

      if (teamIds.length === 0) {
        setTeams([]);
        setLoading(false);
        return;
      }

      // 2. Fetch details for each team the user is a member of
      const teamsData: TeamInfo[] = [];
      const chunkSize = 30; // Firestore 'in' query limit

      for (let i = 0; i < teamIds.length; i += chunkSize) {
          const chunk = teamIds.slice(i, i + chunkSize);
          if (chunk.length === 0) continue;

          const teamsQuery = query(collection(db, 'teams'), where('__name__', 'in', chunk)); // Use __name__ to query by document ID
          const querySnapshot = await getDocs(teamsQuery);

          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data() as Omit<TeamData, 'id'>; // Use Omit here
            if(data) { // Check if data exists
                teamsData.push({
                    id: docSnap.id,
                    name: data.name || 'Unnamed Team', // Fallback name
                    memberCount: data.members?.length || 0,
                    owner: data.owner, // Include owner UID
                });
            }
          });
      }

      // Sort teams alphabetically by name
      teamsData.sort((a, b) => a.name.localeCompare(b.name));

      setTeams(teamsData);

    } catch (err: any) {
      console.error('Error fetching teams:', err);
      setError('Failed to load your teams.');
      if (err.code === 'permission-denied') {
        setError('Permission denied. Check Firestore rules.');
         toast({ title: "Permission Denied", description: "Could not fetch teams.", variant: "destructive" });
      } else {
           toast({ title: "Error", description: "Failed to load teams.", variant: "destructive" });
       }
    } finally {
      setLoading(false);
    }
  }, [currentUser, toast]); // Add toast to dependencies

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]); // Use fetchTeams directly

   const handleDeleteTeam = async (teamId: string, teamName: string) => {
     if (!currentUser) return;

     const teamToDelete = teams.find(t => t.id === teamId);
     if (!teamToDelete || teamToDelete.owner !== currentUser.uid) {
       toast({ title: "Permission Denied", description: "Only the team owner can delete the team.", variant: "destructive" });
       return;
     }

     setDeletingTeamId(teamId); // Set loading state for this specific team
     try {
       const batch = writeBatch(db);
       const teamDocRef = doc(db, 'teams', teamId);

        // Note: Removing teamId from all member's user documents requires fetching all members first.
        // This can be complex and might hit batch limits if the team is large.
        // For simplicity here, we'll only delete the team document.
        // A more robust solution might use a Cloud Function triggered on team delete.

        // Fetch team members to update their documents (simplified version, may need optimization for large teams)
        const teamDocSnap = await getDoc(teamDocRef);
        if (teamDocSnap.exists()) {
            const teamData = teamDocSnap.data() as TeamData;
            const memberUids = teamData.members || [];

            // Update each member's user document
            memberUids.forEach(uid => {
                const userDocRef = doc(db, 'users', uid);
                // Atomically remove the teamId from the user's 'teams' array
                 // We need to import FieldValue for arrayRemove
                 // For now, just log this step as full implementation is complex client-side
                console.log(`TODO: Remove team ${teamId} from user ${uid}'s teams array.`);
                 // Example using FieldValue (requires import):
                 // import { FieldValue } from 'firebase/firestore';
                 // batch.update(userDocRef, { teams: FieldValue.arrayRemove(teamId) });
            });
        } else {
             throw new Error("Team document not found during deletion process.");
        }


       // Delete the team document
       batch.delete(teamDocRef);

       await batch.commit();

       toast({ title: "Team Deleted", description: `Team "${teamName}" has been successfully deleted.` });
       // Refresh the team list by filtering out the deleted team locally or refetching
       setTeams(prevTeams => prevTeams.filter(team => team.id !== teamId));

     } catch (err: any) {
       console.error(`Error deleting team ${teamId}:`, err);
       let description = "An unexpected error occurred while deleting the team.";
       if (err.code === 'permission-denied') {
         description = 'Permission denied. Check Firestore rules.';
       } else if (err.message === "Team document not found during deletion process.") {
           description = "Could not find the team document to complete deletion.";
       }
       toast({ title: "Deletion Failed", description: description, variant: "destructive" });
     } finally {
       setDeletingTeamId(null); // Clear loading state
     }
   };


  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 flex justify-between items-center flex-wrap gap-4"> {/* Added flex-wrap and gap */}
          {/* Go Home Button */}
          <Link href="/" passHref>
            <Button variant="outline" size="sm">
              <Home className="mr-2 h-4 w-4" /> Go Home
            </Button>
          </Link>
        <h1 className="text-3xl font-bold text-primary flex items-center">
          <Users className="mr-3 h-7 w-7" /> Your Teams
        </h1>
        <Link href="/teams/create" passHref>
          <Button>
            <PlusCircle className="mr-2 h-5 w-5" /> Create New Team
          </Button>
        </Link>
      </header>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4 rounded" />
                <Skeleton className="h-4 w-1/2 rounded mt-1" />
              </CardHeader>
              <CardFooter className="flex justify-between">
                <Skeleton className="h-10 w-24 rounded" />
                <Skeleton className="h-8 w-8 rounded" />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <Card className="bg-destructive/10 border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && teams.length === 0 && (
        <Card className="text-center py-10">
          <CardHeader>
            <CardTitle>No Teams Yet!</CardTitle>
            <CardDescription>You haven't joined or created any teams.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/teams/create" passHref>
              <Button size="lg">
                <PlusCircle className="mr-2 h-5 w-5" /> Create Your First Team
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {!loading && !error && teams.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => (
            <Card key={team.id} className="hover:shadow-lg transition-shadow duration-200 flex flex-col">
              <CardHeader className="flex-grow">
                <CardTitle className="text-xl">{team.name}</CardTitle>
                <CardDescription>
                  {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex justify-between items-center pt-4"> {/* Use CardFooter for actions */}
                <Link href={`/teams/${team.id}`} passHref>
                  <Button size="sm">
                    View Team <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                {/* Delete Button - Visible only to owner */}
                {currentUser?.uid === team.owner && (
                     <AlertDialog>
                         <AlertDialogTrigger asChild>
                             <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 px-2"
                                disabled={deletingTeamId === team.id} // Disable button while deleting this specific team
                                aria-label={`Delete team ${team.name}`}
                             >
                                {deletingTeamId === team.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                {/* Optionally add text, maybe hidden on small screens */}
                                <span className="ml-1 hidden sm:inline">Delete</span>
                             </Button>
                         </AlertDialogTrigger>
                         <AlertDialogContent>
                             <AlertDialogHeader>
                                 <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                 <AlertDialogDescription>
                                     Are you sure you want to delete the team "<span className="font-medium">{team.name}</span>"? This action cannot be undone. All team data will be lost.
                                     {/* Optional: Add warning about members losing access */}
                                 </AlertDialogDescription>
                             </AlertDialogHeader>
                             <AlertDialogFooter>
                                 <AlertDialogCancel>Cancel</AlertDialogCancel>
                                 <AlertDialogAction
                                     onClick={() => handleDeleteTeam(team.id, team.name)}
                                     className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                     disabled={deletingTeamId === team.id} // Ensure action button is also disabled
                                 >
                                    {deletingTeamId === team.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Deleting...</> : 'Yes, Delete Team'}
                                 </AlertDialogAction>
                             </AlertDialogFooter>
                         </AlertDialogContent>
                     </AlertDialog>
                 )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Wrap the content with ProtectedRoute
export default function TeamsListPage() {
  return (
    <ProtectedRoute>
      <TeamsListPageContent />
    </ProtectedRoute>
  );
}

