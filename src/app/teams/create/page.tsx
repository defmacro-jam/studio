
'use client';

import { useState, type FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // Import Link
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, writeBatch, query, where, getDocs, documentId } from 'firebase/firestore'; // Import query, where, getDocs, documentId
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, X as CancelIcon } from 'lucide-react'; // Added CancelIcon
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { TEAM_ROLES } from '@/lib/types'; // Import roles

function CreateTeamPageContent() {
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingTeamNames, setExistingTeamNames] = useState<string[]>([]); // State for existing team names
  const { currentUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

    // Fetch existing team names for the current user
    useEffect(() => {
        const fetchExistingTeams = async () => {
            if (!currentUser) return;
            setLoading(true); // Indicate loading while fetching existing names
            try {
                 const userDocRef = doc(db, 'users', currentUser.uid);
                 const userDocSnap = await getDoc(userDocRef);
                 if (userDocSnap.exists()) {
                     const userData = userDocSnap.data();
                     const teamIds = userData.teams || [];
                     if (teamIds.length > 0) {
                         // Fetch names of teams user is already in
                         const teamsQuery = query(collection(db, 'teams'), where(documentId(), 'in', teamIds));
                         const querySnapshot = await getDocs(teamsQuery);
                         const names = querySnapshot.docs.map(doc => (doc.data().name as string).toLowerCase());
                         setExistingTeamNames(names);
                     }
                 }
            } catch (err) {
                 console.error("Error fetching existing team names:", err);
                 // Optionally show a toast if fetching names fails
                 // toast({ title: "Warning", description: "Could not check for existing team names.", variant: "default" });
            } finally {
                 setLoading(false); // Done loading existing names
            }
        };
        fetchExistingTeams();
    }, [currentUser]);


  const handleCreateTeam = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setError('You must be logged in to create a team.');
      toast({ title: 'Authentication Required', description: 'Please log in.', variant: 'destructive' });
      return;
    }
    const trimmedTeamName = teamName.trim();
    if (!trimmedTeamName) {
        setError('Team name cannot be empty.');
        toast({ title: 'Invalid Name', description: 'Please enter a team name.', variant: 'destructive' });
        return;
    }

     // Check for duplicate team name (case-insensitive)
     if (existingTeamNames.includes(trimmedTeamName.toLowerCase())) {
         setError(`You are already in a team named "${trimmedTeamName}".`);
         toast({ title: 'Duplicate Name', description: `A team with this name already exists in your list.`, variant: 'destructive' });
         return;
     }


    setLoading(true);
    setError(null);

    try {
        const batch = writeBatch(db);

        // 1. Generate the team document reference first to get its ID
        const teamDocRef = doc(collection(db, 'teams'));

        // 2. Set the team document data within the batch
        batch.set(teamDocRef, {
            name: trimmedTeamName,
            createdAt: serverTimestamp(),
            createdBy: currentUser.uid, // UID of the creator
            owner: currentUser.uid, // Set creator as the owner
            members: [currentUser.uid], // Add creator's UID as the first member
            memberRoles: { // Initialize roles map with the creator as Owner
                [currentUser.uid]: TEAM_ROLES.OWNER,
            },
            scrumMasterUid: null, // Initialize scrum master as null
        });

        // 3. Update the creator's user document to include the new team ID within the batch
        const userDocRef = doc(db, 'users', currentUser.uid);
        batch.update(userDocRef, {
            teams: arrayUnion(teamDocRef.id), // Add the new team's ID to the user's list of teams
        });

        // 4. Commit the batch transaction
        await batch.commit();


      toast({
        title: 'Team Created!',
        description: `Team "${trimmedTeamName}" has been successfully created.`,
      });
      router.push(`/teams/${teamDocRef.id}`); // Redirect to the new team page using the generated ID

    } catch (err: any) {
      console.error('Team creation error:', err);
       let description = 'An unexpected error occurred.';
       if (err.code === 'permission-denied') {
         description = 'Permission denied. Check Firestore security rules.';
       }
      setError('Failed to create team. Please try again.');
      toast({
        title: 'Team Creation Failed',
        description: description,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-secondary">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Create a New Team</CardTitle>
          <CardDescription>Give your team a name to get started.</CardDescription>
        </CardHeader>
        <form onSubmit={handleCreateTeam}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teamName">Team Name</Label>
              <Input
                id="teamName"
                type="text"
                placeholder="e.g., The A-Team"
                value={teamName}
                onChange={(e) => {
                    setTeamName(e.target.value);
                    // Clear error when user types
                    if (error) setError(null);
                    // Check for duplicates dynamically (optional, can be noisy)
                    // if (existingTeamNames.includes(e.target.value.trim().toLowerCase())) {
                    //     setError(`You are already in a team named "${e.target.value.trim()}".`);
                    // } else {
                    //     setError(null);
                    // }
                }}
                required
                disabled={loading}
                maxLength={50} // Optional: Limit team name length
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-2"> {/* Adjust flex direction and add gap */}
            {/* Cancel Button */}
            <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/teams')} // Navigate to the teams list page
                disabled={loading}
                className="w-full sm:w-auto" // Adjust width for responsiveness
            >
                <CancelIcon className="mr-2 h-4 w-4" /> Cancel
            </Button>
             {/* Create Button */}
            <Button
                type="submit"
                className="w-full sm:w-auto flex-grow" // Adjust width and allow growth
                disabled={loading || !teamName.trim() || existingTeamNames.includes(teamName.trim().toLowerCase())} // Disable if name exists
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4"/>}
              {loading ? 'Creating Team...' : 'Create Team'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}


// Wrap the content with ProtectedRoute
export default function CreateTeamPage() {
    return (
        <ProtectedRoute>
            <CreateTeamPageContent />
        </ProtectedRoute>
    );
}
