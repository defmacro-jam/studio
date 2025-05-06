
"use client";

import { useState, type FormEvent, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { StarRating } from './StarRating';
import type { User } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Edit, X } from 'lucide-react'; // Import Edit and X icons
import { getGravatarUrl } from '@/lib/utils'; // Import Gravatar utility

interface PollSectionProps {
  currentUser: User;
  onSubmitPoll: (rating: number, justification: string) => void;
  initialRating?: number; // Optional initial rating for editing
  initialJustification?: string; // Optional initial justification for editing
  isEditing?: boolean; // Flag to indicate if editing mode is active
  onCancelEdit?: () => void; // Optional: Callback to cancel editing mode
}

export function PollSection({
  currentUser,
  onSubmitPoll,
  initialRating = 0,
  initialJustification = '', // This prop is no longer used to set the initial justification in edit mode
  isEditing = false,
  onCancelEdit, // Receive the cancel callback
}: PollSectionProps) {
  const [rating, setRating] = useState(initialRating);
  const [justification, setJustification] = useState(''); // Start with empty justification

  // Effect to update state if initial props change (e.g., starting an edit)
  useEffect(() => {
    setRating(initialRating);
    // Clear justification when entering edit mode, otherwise use initial (which is always '' now)
    setJustification(isEditing ? '' : '');
  }, [initialRating, isEditing]); // Removed initialJustification dependency


  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (rating > 0) {
      onSubmitPoll(rating, justification);
      // Parent component will handle hiding/swapping this component
    }
  };

  const handleCancel = () => {
    if (onCancelEdit) {
        onCancelEdit(); // Call the parent's cancel handler
    }
  };

  // Ensure avatar URL is valid, fallback to generating Gravatar if missing
  const avatarUrl = currentUser.avatarUrl || getGravatarUrl(currentUser.email, 100)!;

  return (
    <Card className="shadow-md border border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-primary">
          {isEditing ? 'Update Your Sentiment' : 'Weekly Sentiment Poll'}
        </CardTitle>
        <CardDescription>
          {isEditing ? 'You can change your rating and provide a new justification below.' : 'How did the past week go for you?'}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
          <div className="flex items-center space-x-3 mb-4">
              <Avatar className="h-10 w-10 border">
                  <AvatarImage src={avatarUrl} alt={currentUser.name} data-ai-hint="avatar profile picture"/>
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
              className="bg-background/80"
              />
          </div>
          </CardContent>
          <CardFooter className="flex justify-end space-x-2"> {/* Add space-x-2 for button spacing */}
          {isEditing && onCancelEdit && ( // Show cancel button only in editing mode if callback provided
                <Button type="button" variant="outline" onClick={handleCancel}>
                    <X className="mr-2 h-4 w-4" /> Cancel
                </Button>
            )}
          <Button type="submit" disabled={rating === 0}>
              {isEditing ? (
                <>
                    <Edit className="mr-2 h-4 w-4" /> Update Feedback
                </>
              ) : (
                 <>
                    <Send className="mr-2 h-4 w-4" /> Submit Feedback
                 </>
              )}
          </Button>
          </CardFooter>
      </form>
    </Card>
  );
}
