

'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation'; // Added useSearchParams
import Link from 'next/link';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { LogIn } from 'lucide-react';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, writeBatch } from 'firebase/firestore'; // Added Firestore functions
import { TEAM_ROLES } from '@/lib/types'; // Added TEAM_ROLES

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams(); // Get search params
  const { toast } = useToast();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const loggedInUserEmail = user.email?.toLowerCase();

      if (loggedInUserEmail) {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          let currentTeamIds = userData.teamIds || [];
          const teamsToUpdateUserWith: string[] = []; // Store IDs of teams user is newly added to

          const batch = writeBatch(db);
          let batchHasWrites = false;
          const joinedTeamNames: string[] = [];

          // 1. Handle specific invite from query parameters
          const teamIdFromQuery = searchParams.get('teamId');
          const emailFromQuery = searchParams.get('email')?.toLowerCase();

          if (teamIdFromQuery && emailFromQuery === loggedInUserEmail) {
            const teamDocRef = doc(db, 'teams', teamIdFromQuery);
            const teamDocSnap = await getDoc(teamDocRef);

            if (teamDocSnap.exists()) {
              const teamData = teamDocSnap.data();
              if (!currentTeamIds.includes(teamIdFromQuery)) {
                batch.update(teamDocRef, {
                  members: arrayUnion(user.uid),
                  [`memberRoles.${user.uid}`]: TEAM_ROLES.MEMBER,
                  pendingMemberEmails: arrayRemove(loggedInUserEmail)
                });
                teamsToUpdateUserWith.push(teamIdFromQuery);
                batchHasWrites = true;
                if (teamData.name) joinedTeamNames.push(teamData.name);
              } else if (teamData.pendingMemberEmails?.includes(loggedInUserEmail)) {
                // Already a member, but still in pending list. Clean up pending list.
                batch.update(teamDocRef, { pendingMemberEmails: arrayRemove(loggedInUserEmail) });
                batchHasWrites = true;
              }
            } else {
              console.warn(`Team ${teamIdFromQuery} from invite link not found.`);
            }
          }

          // 2. General check for any other pending invitations
          const pendingTeamsQuery = query(collection(db, "teams"), where("pendingMemberEmails", "array-contains", loggedInUserEmail));
          const pendingTeamsSnapshot = await getDocs(pendingTeamsQuery);

          for (const teamDoc of pendingTeamsSnapshot.docs) {
            const teamId = teamDoc.id;
            const teamData = teamDoc.data();
            
            // Check if user is already considered a member (either from initial load or added via query param logic)
            const isAlreadyMemberOrJustAdded = currentTeamIds.includes(teamId) || teamsToUpdateUserWith.includes(teamId);

            if (!isAlreadyMemberOrJustAdded) {
              batch.update(teamDoc.ref, {
                members: arrayUnion(user.uid),
                [`memberRoles.${user.uid}`]: TEAM_ROLES.MEMBER,
                pendingMemberEmails: arrayRemove(loggedInUserEmail)
              });
              teamsToUpdateUserWith.push(teamId);
              batchHasWrites = true;
              if (teamData.name && !joinedTeamNames.includes(teamData.name)) joinedTeamNames.push(teamData.name);
            } else if (teamData.pendingMemberEmails?.includes(loggedInUserEmail)) {
              // If user is already a member but their email is still in the pending list for this team, remove it.
              batch.update(teamDoc.ref, {
                  pendingMemberEmails: arrayRemove(loggedInUserEmail)
              });
              batchHasWrites = true;
            }
          }

          // Update user's teamIds if they were added to any new teams
          if (teamsToUpdateUserWith.length > 0) {
            batch.update(userDocRef, {
              teamIds: arrayUnion(...teamsToUpdateUserWith)
            });
            batchHasWrites = true; // Ensure this flag is true if we update user doc
          }
          
          if (batchHasWrites) {
            await batch.commit();
            if (joinedTeamNames.length > 0) {
                 toast({ title: "Joined Team(s)!", description: `You've been added to: ${joinedTeamNames.join(', ')}.` });
            }
          }
        } else {
          // This case implies a new user who hasn't completed signup fully,
          // or an existing user whose Firestore document is missing.
          // Signup flow should create the user document.
          // For login, we expect the document to exist.
          console.warn("User document not found for UID:", user.uid, ". Some features like team invites might not work until signup is complete or document is restored.");
        }
      }

      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
      });
      router.push('/'); // Redirect to the main page after successful login
    } catch (err: any) {
      console.error('Login error:', err);
      // Provide more user-friendly error messages
      let message = 'Failed to log in. Please check your credentials.';
      if (err.code === 'auth/invalid-credential') {
         message = 'Invalid email or password.';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
         message = 'Invalid email or password.'; // Keep generic for security
      } else if (err.code === 'auth/invalid-email') {
         message = 'Please enter a valid email address.';
      }
      setError(message);
      toast({
        title: 'Login Failed',
        description: message,
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
          <CardTitle className="text-2xl font-bold text-primary">Log In to RetroSpectify</CardTitle>
          <CardDescription>Enter your email and password to access your retrospectives.</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Logging in...' : <> <LogIn className="mr-2 h-4 w-4"/> Log In </> }
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href={`/signup${searchParams.toString() ? `?${searchParams.toString()}` : ''}`} className="font-medium text-primary hover:underline">
                Sign Up
              </Link>
              {' or '}
               <Link href="/forgot-password" className="font-medium text-primary hover:underline">
                 Forgot Password?
               </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

