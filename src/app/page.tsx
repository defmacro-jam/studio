
"use client";

import { useState, useEffect, useMemo } from 'react';
import type { RetroItem, PollResponse, User } from '@/lib/types';
import { PollSection } from '@/components/retrospectify/PollSection';
import { PollResultsSection } from '@/components/retrospectify/PollResultsSection';
import { RetroSection } from '@/components/retrospectify/RetroSection';
import { categorizeJustification, type CategorizeJustificationOutput } from '@/ai/flows/categorize-justification';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';

// Mock current user - replace with actual auth later
const mockCurrentUser: User = {
  id: 'user-123',
  name: 'Alex Doe',
  avatarUrl: 'https://picsum.photos/id/1/100/100',
};

// Mock initial data - replace with API/DB calls later
const mockInitialItems: RetroItem[] = [
    { id: 'w1', author: { id: 'user-456', name: 'Bob Smith', avatarUrl: 'https://picsum.photos/id/2/100/100' }, content: 'Great collaboration on the login feature!', timestamp: new Date(Date.now() - 3600000 * 2), category: 'well' },
    { id: 'i1', author: { id: 'user-789', name: 'Charlie Brown', avatarUrl: 'https://picsum.photos/id/3/100/100' }, content: 'Deployment process was a bit slow this week.', timestamp: new Date(Date.now() - 3600000 * 3), category: 'improve' },
    { id: 'd1', author: { id: 'user-456', name: 'Bob Smith', avatarUrl: 'https://picsum.photos/id/2/100/100' }, content: 'Should we reconsider our testing strategy?', timestamp: new Date(Date.now() - 3600000 * 1), category: 'discuss' },
    { id: 'a1', author: { id: 'user-123', name: 'Alex Doe', avatarUrl: 'https://picsum.photos/id/1/100/100' }, content: 'Alex to update documentation by EOD Friday.', timestamp: new Date(Date.now() - 3600000 * 0.5), category: 'action' },
    { id: 'w2', author: { id: 'user-789', name: 'Charlie Brown', avatarUrl: 'https://picsum.photos/id/3/100/100' }, content: 'Code reviews were very thorough.', timestamp: new Date(Date.now() - 3600000 * 5), category: 'well', replies: [
        { id: 'r1', author: { id: 'user-123', name: 'Alex Doe', avatarUrl: 'https://picsum.photos/id/1/100/100' }, content: 'Agreed, learned a lot!', timestamp: new Date(Date.now() - 3600000 * 4) }
    ]},
];

const mockInitialPollResponses: PollResponse[] = [
     { id: 'p1', author: { id: 'user-456', name: 'Bob Smith', avatarUrl: 'https://picsum.photos/id/2/100/100' }, rating: 4, justification: 'Good progress overall, minor hiccup with API.', timestamp: new Date(Date.now() - 3600000 * 6) },
     { id: 'p2', author: { id: 'user-789', name: 'Charlie Brown', avatarUrl: 'https://picsum.photos/id/3/100/100' }, rating: 5, justification: "Loved the free cookies!", timestamp: new Date(Date.now() - 3600000 * 7) },
     { id: 'p3', author: { id: 'user-555', name: 'Dana Scully', avatarUrl: 'https://picsum.photos/id/4/100/100' }, rating: 2, justification: "Project X team was overly needy on the help channel.", timestamp: new Date(Date.now() - 3600000 * 8) },
];

export default function RetroSpectifyPage() {
  const [retroItems, setRetroItems] = useState<RetroItem[]>(mockInitialItems);
  const [pollResponses, setPollResponses] = useState<PollResponse[]>(mockInitialPollResponses);
  const [currentUser] = useState<User>(mockCurrentUser);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isEditingPoll, setIsEditingPoll] = useState(false); // State for poll editing mode
  const { toast } = useToast();

  // Check initial submission status and find existing response on mount
  useEffect(() => {
    let submittedLocally = false;
    if (typeof window !== 'undefined') {
      submittedLocally = !!localStorage.getItem(`pollSubmitted-${currentUser.id}`);
    }
    const userResponseExists = pollResponses.some(resp => resp.author.id === currentUser.id);
    setHasSubmitted(submittedLocally || userResponseExists);

    // Simulate loading data
    const timer = setTimeout(() => {
        setIsLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentUser.id, pollResponses]); // Added pollResponses dependency

  // Memoize the current user's response for editing
  const currentUserResponse = useMemo(() => {
    return pollResponses.find(resp => resp.author.id === currentUser.id);
  }, [pollResponses, currentUser.id]);


  // Derived state to determine if the poll should be shown or results
  const shouldShowResults = useMemo(() => {
    return hasSubmitted && !isEditingPoll; // Show results only if submitted and not editing
  }, [hasSubmitted, isEditingPoll]);

  const shouldShowPollForm = useMemo(() => {
      return !hasSubmitted || isEditingPoll; // Show form if not submitted OR editing
  }, [hasSubmitted, isEditingPoll]);


  // Function to remove existing AI-generated items for a specific poll response
  const removeExistingPollItems = (responseId: string) => {
      setRetroItems(prev => prev.filter(item => !(item.isFromPoll && item.pollResponseId === responseId)));
  };


  const processJustification = async (rating: number, justification: string, responseId: string) => {
       // Remove any previously generated items for this poll response BEFORE adding new ones
       removeExistingPollItems(responseId);

      if (!justification.trim()) {
          const category = rating >= 4 ? 'well' : rating <= 2 ? 'improve' : 'discuss';
          const newItem: RetroItem = {
              id: `poll-${responseId}-rating`,
              pollResponseId: responseId, // Link item to the poll response
              author: currentUser,
              content: `Rated ${rating} stars (No justification)`,
              timestamp: new Date(),
              category: category,
              isFromPoll: true,
          };
          setRetroItems(prev => [...prev, newItem]);
          toast({
              title: isEditingPoll ? "Feedback Updated" : "Feedback Added",
              description: `Your rating was added to "${category === 'well' ? 'What Went Well' : category === 'improve' ? 'What Could Be Improved' : 'Discussion Topics'}".`,
          });
          return;
      }

      try {
          const categorizedSentences = await categorizeJustification({ rating, justification });

          if (categorizedSentences && categorizedSentences.length > 0) {
            const newItems: RetroItem[] = categorizedSentences.map((categorizedSentence, index) => ({
                id: `poll-${responseId}-s${index}`,
                pollResponseId: responseId, // Link item to the poll response
                author: currentUser,
                content: categorizedSentence.sentence,
                timestamp: new Date(),
                category: categorizedSentence.category,
                isFromPoll: true,
            }));

            setRetroItems(prev => [...prev, ...newItems]);

            const wellCount = newItems.filter(item => item.category === 'well').length;
            const improveCount = newItems.filter(item => item.category === 'improve').length;
            let description = "Your feedback was processed.";
            if (wellCount > 0 && improveCount > 0) {
                description = `Added ${wellCount} item(s) to 'What Went Well' and ${improveCount} item(s) to 'What Could Be Improved'.`;
            } else if (wellCount > 0) {
                 description = `Added ${wellCount} item(s) to 'What Went Well'.`;
            } else if (improveCount > 0) {
                 description = `Added ${improveCount} item(s) to 'What Could Be Improved'.`;
            }

             toast({
                 title: isEditingPoll ? "Feedback Updated" : "Feedback Categorized",
                 description: description,
             });
          } else if (justification.trim()) {
             const newItem: RetroItem = {
               id: `poll-${responseId}-discuss`,
               pollResponseId: responseId, // Link item to the poll response
               author: currentUser,
               content: justification,
               timestamp: new Date(),
               category: 'discuss',
               isFromPoll: true,
             };
             setRetroItems(prev => [...prev, newItem]);
             toast({
               title: isEditingPoll ? "Feedback Updated" : "Feedback Added",
               description: "Your feedback was added to 'Discussion Topics' for review.",
               variant: "default",
             });
          }
      } catch (error) {
          console.error("Error processing justification:", error);
          toast({
            title: "Categorization Error",
            description: "Could not automatically categorize your feedback. Added to 'Discussion Topics'.",
            variant: "destructive",
          });
           const newItem: RetroItem = {
               id: `poll-${responseId}-error`,
               pollResponseId: responseId, // Link item to the poll response
               author: currentUser,
               content: justification,
               timestamp: new Date(),
               category: 'discuss',
               isFromPoll: true,
           };
           setRetroItems(prev => [...prev, newItem]);
      }
  };


  const handlePollSubmit = (rating: number, justification: string) => {
    let responseId: string;
    let isUpdate = false;

    if (isEditingPoll && currentUserResponse) {
        // --- Update existing response ---
        responseId = currentUserResponse.id;
        isUpdate = true;
        setPollResponses(prev =>
            prev.map(resp =>
                resp.id === responseId
                    ? { ...resp, rating, justification, timestamp: new Date() }
                    : resp
            )
        );
         toast({
             title: "Poll Response Updated",
             description: "Your sentiment feedback has been updated.",
         });

    } else {
         // --- Add new response ---
        responseId = `resp-${Date.now()}`;
        const newResponse: PollResponse = {
            id: responseId,
            author: currentUser,
            rating,
            justification,
            timestamp: new Date(),
        };
        setPollResponses(prev => [...prev, newResponse]);
        setHasSubmitted(true); // Update local submission state

        // Persist submission status locally
        if (typeof window !== 'undefined') {
            localStorage.setItem(`pollSubmitted-${currentUser.id}`, 'true');
        }
         toast({
             title: "Poll Response Submitted",
             description: "Thank you for your feedback!",
         });
    }

    // Process justification (will also remove old items if updating)
    processJustification(rating, justification, responseId);

    setIsEditingPoll(false); // Exit editing mode after submit/update
  };

  const handleEditPoll = () => {
    if (currentUserResponse) {
      setIsEditingPoll(true); // Enter editing mode
    }
  };


  const handleAddItem = (category: 'well' | 'improve' | 'discuss' | 'action') => (content: string) => {
    const newItem: RetroItem = {
      id: `${category}-${Date.now()}`,
      author: currentUser,
      content,
      timestamp: new Date(),
      category,
      isFromPoll: false,
    };
    setRetroItems(prev => [...prev, newItem]);
     toast({
        title: "Item Added",
        description: `Your item was added to "${category === 'discuss' ? 'Discussion Topics' : category === 'action' ? 'Action Items' : category === 'well' ? 'What Went Well' : 'What Could Be Improved'}".`,
      });
  };

  const handleAddReply = (itemId: string, replyContent: string) => {
    setRetroItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newReply: RetroItem = {
          id: `reply-${itemId}-${Date.now()}`,
          author: currentUser,
          content: replyContent,
          timestamp: new Date(),
          isFromPoll: false,
        };
        return {
          ...item,
          replies: [...(item.replies ?? []), newReply],
        };
      }
      return item;
    }));
     toast({
        title: "Reply Added",
     });
  };

   const handleDeleteItem = (itemId: string) => {
     // Prevent deleting items generated from the current user's *uneditable* poll response
     const itemToDelete = retroItems.find(item => item.id === itemId);
     if (itemToDelete?.isFromPoll && itemToDelete.author.id === currentUser.id && !isEditingPoll) {
         toast({
            title: "Cannot Delete Poll Item",
            description: "Edit your poll response to change items derived from it.",
            variant: "destructive"
         });
         return;
     }

    setRetroItems(prev => prev.filter(item => item.id !== itemId));
    toast({
        title: "Item Deleted",
        variant: "destructive"
    });
   };


  const filterItems = (category: 'well' | 'improve' | 'discuss' | 'action') => {
    const topLevelItems = retroItems.filter(item => !retroItems.some(parent => parent.replies?.some(reply => reply.id === item.id)));
    return topLevelItems.filter(item => item.category === category).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

   // Loading state UI
  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-8 max-w-screen-2xl">
        <h1 className="text-3xl font-bold mb-6 text-primary">RetroSpectify</h1>
         <div className="mb-6">
             <Skeleton className="h-48 w-full rounded-lg" />
         </div>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
           {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="shadow-md">
                    <CardHeader className="border-b">
                      <Skeleton className="h-6 w-3/4 rounded" />
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                      <Skeleton className="h-20 w-full rounded" />
                      <Skeleton className="h-20 w-full rounded" />
                    </CardContent>
                    <CardFooter className="border-t p-4">
                         <Skeleton className="h-10 w-full rounded" /> {/* Adjusted skeleton height */}
                    </CardFooter>
                </Card>
            ))}
         </div>
         <Toaster />
      </div>
    );
  }


  return (
    <div className="container mx-auto p-4 md:p-8 max-w-screen-2xl">
        <header className="mb-8 flex justify-between items-center">
            <h1 className="text-3xl font-bold text-primary">RetroSpectify</h1>
            <div className="flex items-center space-x-3">
                <span className="text-sm font-medium hidden sm:inline">{currentUser.name}</span>
                <Avatar>
                    <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} data-ai-hint="avatar profile picture"/>
                    <AvatarFallback>{currentUser.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
            </div>
        </header>


      {/* Poll Section or Results Section */}
      <div className="mb-6 md:mb-8">
        {shouldShowPollForm && (
             <PollSection
                currentUser={currentUser}
                onSubmitPoll={handlePollSubmit}
                initialRating={isEditingPoll ? currentUserResponse?.rating : undefined}
                initialJustification={isEditingPoll ? currentUserResponse?.justification : undefined}
                isEditing={isEditingPoll}
            />
        )}
         {shouldShowResults && (
            <PollResultsSection
                responses={pollResponses}
                onEdit={currentUserResponse ? handleEditPoll : undefined} // Pass edit handler only if user has response
            />
         )}
      </div>

      {/* Retro Board Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <RetroSection
          title="What Went Well"
          items={filterItems('well')}
          currentUser={currentUser}
          onAddItem={handleAddItem('well')}
          onAddReply={handleAddReply}
          onDeleteItem={handleDeleteItem}
          allowAddingItems={true}
          className="bg-teal-50/50 border-teal-200 dark:bg-teal-900/20 dark:border-teal-700/50"
        />
        <RetroSection
          title="What Could Be Improved"
          items={filterItems('improve')}
          currentUser={currentUser}
          onAddItem={handleAddItem('improve')}
          onAddReply={handleAddReply}
           onDeleteItem={handleDeleteItem}
          allowAddingItems={true}
          className="bg-amber-50/50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/50"
        />
        <RetroSection
          title="Discussion Topics"
          items={filterItems('discuss')}
          currentUser={currentUser}
          onAddItem={handleAddItem('discuss')}
          onAddReply={handleAddReply}
          onDeleteItem={handleDeleteItem}
          allowAddingItems={true}
           className="bg-blue-50/50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700/50"
        />
        <RetroSection
          title="Action Items"
          items={filterItems('action')}
          currentUser={currentUser}
          onAddItem={handleAddItem('action')}
          onAddReply={handleAddReply}
          onDeleteItem={handleDeleteItem}
          allowAddingItems={true}
           className="bg-purple-50/50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-700/50"
        />
      </div>
       <Toaster />
    </div>
  );
}
