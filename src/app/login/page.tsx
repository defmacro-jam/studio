
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
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'; // Added Firestore functions
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

    const teamIdToJoin = searchParams.get('teamId'); // Get teamId from query, if present
    const userEmailToJoin = searchParams.get('email')?.toLowerCase(); // Get email from query for pending list removal

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // If joining a team via invite link after logging in
      if (teamIdToJoin && user) {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const userTeamIds = userData.teamIds || [];

          // Check if user is already part of the team
          if (!userTeamIds.includes(teamIdToJoin)) {
            const teamDocRef = doc(db, 'teams', teamIdToJoin);
            // Add user to team members and roles, remove from pending
            await updateDoc(teamDocRef, {
              members: arrayUnion(user.uid),
              [`memberRoles.${user.uid}`]: TEAM_ROLES.MEMBER, // Default role on join
              pendingMemberEmails: userEmailToJoin ? arrayRemove(userEmailToJoin) : arrayRemove(email.toLowerCase()) // Remove by pre-filled or typed email
            });
            // Add teamId to user's document
            await updateDoc(userDocRef, {
              teamIds: arrayUnion(teamIdToJoin)
            });
            toast({
              title: 'Joined Team!',
              description: "You've been successfully added to the team.",
            });
          }
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
