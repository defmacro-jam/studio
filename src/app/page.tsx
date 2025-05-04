"use client";

import { useState, useEffect, useMemo } from 'react';
import type { RetroItem, PollResponse, User } from '@/lib/types';
import { PollSection } from '@/components/retrospectify/PollSection';
import { RetroSection } from '@/components/retrospectify/RetroSection';
import { categorizeJustificationFlow } from '@/ai/flows/categorize-justification';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton


// Mock current user - replace with actual auth later
const mockCurrentUser: User = {
  id: 'user-123',
  name: 'Alex Doe',
  avatarUrl: 'https://picsum.photos/id/1/100/100', // Placeholder avatar
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
     // Example poll responses (can be empty initially)
    // { id: 'p1', author: { id: 'user-456', name: 'Bob Smith', avatarUrl: '/avatars/bob.png' }, rating: 4, justification: 'Good progress overall, minor hiccup with API.', timestamp: new Date(Date.now() - 3600000 * 6) },
];

export default function RetroSpectifyPage() {
  const [retroItems, setRetroItems] = useState<RetroItem[]>(mockInitialItems);
  const [pollResponses, setPollResponses] = useState<PollResponse[]>(mockInitialPollResponses);
  const [currentUser, setCurrentUser] = useState<User>(mockCurrentUser);
  const [isLoading, setIsLoading] = useState(true); // Loading state
  const { toast } = useToast();

  // Simulate loading data
   useEffect(() => {
    // Replace with actual data fetching
    const timer = setTimeout(() => {
        // In a real app, fetch initialItems and pollResponses here
        // Process initial poll responses (if any)
        processInitialPollResponses(mockInitialPollResponses);
        setIsLoading(false);
    }, 1500); // Simulate 1.5 second load time
    return () => clearTimeout(timer);
  }, []);

  const hasUserSubmittedPoll = useMemo(() => {
    return pollResponses.some(resp => resp.author.id === currentUser.id);
  }, [pollResponses, currentUser.id]);

  const processJustification = async (rating: number, justification: string, responseId: string) => {
      if (!justification.trim()) return; // Don't process empty justifications

      try {
          const result = await categorizeJustificationFlow({ rating, justification });
          if (result?.category) {
            const newItem: RetroItem = {
                id: `poll-${responseId}`, // Link item to poll response
                author: currentUser,
                content: justification,
                timestamp: new Date(),
                category: result.category,
            };
            setRetroItems(prev => [...prev, newItem]);
             toast({
                 title: "Feedback Added",
                 description: `Your justification was added to "${result.category === 'well' ? 'What Went Well' : result.category === 'improve' ? 'What Could Be Improved' : 'Discussion Topics'}".`,
             });
          } else {
             throw new Error("Categorization failed.");
          }
      } catch (error) {
          console.error("Error categorizing justification:", error);
          toast({
            title: "Categorization Error",
            description: "Could not automatically categorize your feedback. It needs manual review.",
            variant: "destructive",
          });
          // Optionally add to a default 'discuss' category or handle error differently
           const newItem: RetroItem = {
               id: `poll-${responseId}-error`,
               author: currentUser,
               content: justification + " (Needs Categorization)",
               timestamp: new Date(),
               category: 'discuss',
           };
           setRetroItems(prev => [...prev, newItem]);
      }
  };

  // Process existing poll responses on load
  const processInitialPollResponses = (responses: PollResponse[]) => {
      responses.forEach(resp => {
          // Check if an item for this poll response already exists
          if (!retroItems.some(item => item.id === `poll-${resp.id}`)) {
              // Find the author details (assuming author is part of response object)
              const author = resp.author; // In real scenario, might need lookup
              if (author && resp.justification) {
                   // Use a simplified categorization for initial load or run the flow
                   // For simplicity here, basic rating logic:
                   const category = resp.rating >= 4 ? 'well' : resp.rating <= 2 ? 'improve' : 'discuss';
                   const newItem: RetroItem = {
                        id: `poll-${resp.id}`,
                        author: author,
                        content: resp.justification,
                        timestamp: resp.timestamp,
                        category: category,
                   };
                   setRetroItems(prev => [...prev, newItem]);
              }
          }
      });
  };


  const handlePollSubmit = (rating: number, justification: string) => {
    if (hasUserSubmittedPoll) return; // Prevent double submission

    const newResponse: PollResponse = {
      id: `resp-${Date.now()}`, // Simple unique ID
      author: currentUser,
      rating,
      justification,
      timestamp: new Date(),
    };
    setPollResponses(prev => [...prev, newResponse]);
    // Process the justification with AI after state update
    processJustification(rating, justification, newResponse.id);
  };

  const handleAddItem = (category: 'discuss' | 'action') => (content: string) => {
    const newItem: RetroItem = {
      id: `${category}-${Date.now()}`,
      author: currentUser,
      content,
      timestamp: new Date(),
      category,
    };
    setRetroItems(prev => [...prev, newItem]);
     toast({
        title: "Item Added",
        description: `Your item was added to "${category === 'discuss' ? 'Discussion Topics' : 'Action Items'}".`,
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
          // Replies don't have categories themselves
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
    setRetroItems(prev => prev.filter(item => item.id !== itemId && !(item.replies && item.replies.some(r => r.id === itemId))));
    // Also potentially delete replies if the parent is deleted (or handle orphan replies)
     toast({
        title: "Item Deleted",
        variant: "destructive"
     });
   };


  const filterItems = (category: 'well' | 'improve' | 'discuss' | 'action') => {
    return retroItems.filter(item => item.category === category).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

   // Loading state UI
  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-8">
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
                         <Skeleton className="h-16 w-full rounded" />
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


      {/* Poll Section spanning full width initially */}
      <div className="mb-6 md:mb-8">
        <PollSection
          currentUser={currentUser}
          onSubmitPoll={handlePollSubmit}
          hasSubmitted={hasUserSubmittedPoll}
        />
      </div>

      {/* Retro Board Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <RetroSection
          title="What Went Well"
          items={filterItems('well')}
          currentUser={currentUser}
          onAddItem={() => {}} // No direct adding
          onAddReply={handleAddReply}
          allowAddingItems={false} // Items come from Poll
          className="bg-teal-50/50 border-teal-200"
        />
        <RetroSection
          title="What Could Be Improved"
          items={filterItems('improve')}
          currentUser={currentUser}
          onAddItem={() => {}} // No direct adding
          onAddReply={handleAddReply}
          allowAddingItems={false} // Items come from Poll
          className="bg-amber-50/50 border-amber-200"
        />
        <RetroSection
          title="Discussion Topics"
          items={filterItems('discuss')}
          currentUser={currentUser}
          onAddItem={handleAddItem('discuss')}
          onAddReply={handleAddReply}
          onDeleteItem={handleDeleteItem}
          allowAddingItems={true}
          className="bg-blue-50/50 border-blue-200"
        />
        <RetroSection
          title="Action Items"
          items={filterItems('action')}
          currentUser={currentUser}
          onAddItem={handleAddItem('action')}
          onAddReply={handleAddReply}
          onDeleteItem={handleDeleteItem}
          allowAddingItems={true}
          className="bg-purple-50/50 border-purple-200"
        />
      </div>
       <Toaster />
    </div>
  );
}
