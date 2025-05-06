'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { UserPlus } from 'lucide-react';
import { getGravatarUrl } from '@/lib/utils'; // Import Gravatar utility
import { APP_ROLES } from '@/lib/types'; // Import APP_ROLES

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
       toast({
          title: 'Signup Failed',
          description: 'Passwords do not match.',
          variant: 'destructive',
       });
      return;
    }

     if (password.length < 6) {
       setError('Password must be at least 6 characters long.');
       setLoading(false);
       toast({
         title: 'Signup Failed',
         description: 'Password must be at least 6 characters long.',
         variant: 'destructive',
       });
       return;
     }

    const userDisplayName = displayName.trim() || email.split('@')[0]; // Default display name from email prefix if none provided
    const userEmail = email.trim().toLowerCase(); // Normalize email
    const gravatarUrl = getGravatarUrl(userEmail, 100)!; // Generate Gravatar URL


    try {
      const userCredential = await createUserWithEmailAndPassword(auth, userEmail, password);
      const user = userCredential.user;

      // Update profile with display name and Gravatar URL in Firebase Auth
      await updateProfile(user, {
        displayName: userDisplayName,
        photoURL: gravatarUrl, // Set photoURL to Gravatar
      });

       // Send email verification
      await sendEmailVerification(user);
      toast({
          title: 'Verification Email Sent',
          description: 'Please check your inbox to verify your email address.',
          variant: 'default',
          duration: 10000, // Keep toast longer
      });


      // Create user document in Firestore
      // Store basic info needed for team management etc.
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: userEmail, // Store normalized email
        displayName: userDisplayName,
        createdAt: serverTimestamp(),
        teams: [], // Initialize empty teams array (user might join/create later)
        avatarUrl: gravatarUrl, // Store Gravatar URL in Firestore as well
        role: APP_ROLES.MEMBER, // Set default app-wide role to 'member'
      });


      toast({
        title: 'Signup Successful',
        description: `Welcome, ${userDisplayName}! Please verify your email.`,
      });
      router.push('/'); // Redirect to home or a 'please verify' page

    } catch (err: any) {
      console.error('Signup error:', err);
       // Provide more user-friendly error messages
       let message = 'Failed to sign up. Please try again.';
       if (err.code === 'auth/email-already-in-use') {
          message = 'This email address is already registered. Please log in or use a different email.';
       } else if (err.code === 'auth/invalid-email') {
          message = 'Please enter a valid email address.';
       } else if (err.code === 'auth/weak-password') {
          message = 'Password is too weak. Please choose a stronger password.';
       }
       setError(message);
       toast({
         title: 'Signup Failed',
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
          <CardTitle className="text-2xl font-bold text-primary">Create Your Account</CardTitle>
          <CardDescription>Join RetroSpectify to improve your team's retrospectives.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4">
             <div className="space-y-2">
               <Label htmlFor="displayName">Display Name</Label>
               <Input
                 id="displayName"
                 type="text"
                 placeholder="Your Name (optional, uses email prefix if blank)"
                 value={displayName}
                 onChange={(e) => setDisplayName(e.target.value)}
                 disabled={loading}
               />
             </div>
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
                placeholder="•••••••• (min. 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
             <div className="space-y-2">
               <Label htmlFor="confirmPassword">Confirm Password</Label>
               <Input
                 id="confirmPassword"
                 type="password"
                 placeholder="••••••••"
                 value={confirmPassword}
                 onChange={(e) => setConfirmPassword(e.target.value)}
                 required
                 disabled={loading}
               />
             </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading || !email}>
              {loading ? 'Signing Up...' : <> <UserPlus className="mr-2 h-4 w-4"/> Sign Up </> }
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Log In
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
