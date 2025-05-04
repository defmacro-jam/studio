"use client";

import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { StarRating } from './StarRating';
import type { User } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send } from 'lucide-react';

interface PollSectionProps {
  currentUser: User;
  onSubmitPoll: (rating: number, justification: string) => void;
  // hasSubmitted prop is removed
}

export function PollSection({ currentUser, onSubmitPoll }: PollSectionProps) {
  const [rating, setRating] = useState(0);
  const [justification, setJustification] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (rating > 0) {
      onSubmitPoll(rating, justification);
      // No need to reset here, parent will swap component
    }
  };

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Weekly Sentiment Poll</CardTitle>
        <CardDescription>How did the past week go for you?</CardDescription>
      </CardHeader>
      {/* Conditional rendering based on hasSubmitted is removed */}
      <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
          <div className="flex items-center space-x-3 mb-4">
              <Avatar className="h-10 w-10">
                  <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} data-ai-hint="avatar profile picture"/>
                  <AvatarFallback>{currentUser.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <p className="font-medium">{currentUser.name}</p>
          </div>
          <div className="space-y-2">
              <Label htmlFor="rating">Your Rating (1-5 stars)</Label>
              <StarRating value={rating} onChange={setRating} />
          </div>
          <div className="space-y-2">
              <Label htmlFor="justification">Justification (Optional)</Label>
              <Textarea
              id="justification"
              placeholder="Explain your rating... What went well? What could be improved?"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              />
          </div>
          </CardContent>
          <CardFooter className="flex justify-end">
          <Button type="submit" disabled={rating === 0}>
              <Send className="mr-2 h-4 w-4" /> Submit Feedback
          </Button>
          </CardFooter>
      </form>
    </Card>
  );
}
