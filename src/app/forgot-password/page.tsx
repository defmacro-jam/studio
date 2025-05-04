'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MailQuestion } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent! Please check your inbox (and spam folder).');
      toast({
        title: 'Password Reset Email Sent',
        description: 'Check your inbox to reset your password.',
      });
      setEmail(''); // Clear email field on success
    } catch (err: any) {
      console.error('Password reset error:', err);
       let userMessage = 'Failed to send password reset email. Please try again.';
       if (err.code === 'auth/invalid-email') {
          userMessage = 'Please enter a valid email address.';
       } else if (err.code === 'auth/user-not-found') {
           // Don't reveal if user exists for security, but show success message
           setMessage('If an account exists for this email, a password reset link has been sent.');
            toast({
               title: 'Password Reset Email Sent (if account exists)',
               description: 'Check your inbox to reset your password.',
           });
           setLoading(false);
           return; // Exit early
       }
       setError(userMessage);
       toast({
         title: 'Password Reset Failed',
         description: userMessage,
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
          <CardTitle className="text-2xl font-bold text-primary">Forgot Your Password?</CardTitle>
          <CardDescription>Enter your email address and we&apos;ll send you a link to reset it.</CardDescription>
        </CardHeader>
        <form onSubmit={handleResetPassword}>
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
            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-primary">{message}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
               {loading ? 'Sending...' : <> <MailQuestion className="mr-2 h-4 w-4" /> Send Reset Link </>}
            </Button>
             <p className="text-sm text-center text-muted-foreground">
              Remembered your password?{' '}
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
