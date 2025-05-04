'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users } from 'lucide-react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

function CreateTeamPageContent() {
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleCreateTeam = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setError('You must be logged in to create a team.');
      toast({ title: 'Authentication Required', description: 'Please log in.', variant: 'destructive' });
      return;
    }
    if (!teamName.trim()) {
        setError('Team name cannot be empty.');
        toast({ title: 'Invalid Name', description: 'Please enter a team name.', variant: 'destructive' });
        return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Create the team document
      const teamDocRef = await addDoc(collection(db, 'teams'), {
        name: teamName,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
        members: [currentUser.uid], // Add creator as the first member
        owner: currentUser.uid, // Set creator as the owner
      });

      // 2. Update the user's document to include the new team ID
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        teams: arrayUnion(teamDocRef.id),
      });

      toast({
        title: 'Team Created!',
        description: `Team "${teamName}" has been successfully created.`,
      });
      router.push(`/teams/${teamDocRef.id}`); // Redirect to the new team page

    } catch (err: any) {
      console.error('Team creation error:', err);
      setError('Failed to create team. Please try again.');
      toast({
        title: 'Team Creation Failed',
        description: 'An unexpected error occurred.',
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
                onChange={(e) => setTeamName(e.target.value)}
                required
                disabled={loading}
                maxLength={50} // Optional: Limit team name length
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading || !teamName.trim()}>
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
