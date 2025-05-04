
"use client";

import { useState, useEffect, useMemo, useCallback, type DragEvent } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter
import { signOut } from 'firebase/auth'; // Import signOut
import { auth, db } from '@/lib/firebase'; // Import auth and db
import { doc, getDoc } from 'firebase/firestore'; // Import Firestore functions
import type { RetroItem, PollResponse, User, Category } from '@/lib/types';
import { PollSection } from '@/components/retrospectify/PollSection';
import { PollResultsSection } from '@/components/retrospectify/PollResultsSection';
import { RetroSection } from '@/components/retrospectify/RetroSection';
import { AdjustRatingModal } from '@/components/retrospectify/AdjustRatingModal';
import { categorizeJustification } from '@/ai/flows/categorize-justification';
import { generateActionItem } from '@/ai/flows/generate-action-item';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; // Import Button
import { LogOut } from 'lucide-react'; // Import LogOut icon
import ProtectedRoute from '@/components/auth/ProtectedRoute'; // Import ProtectedRoute
import { useAuth } from '@/context/AuthContext'; // Import useAuth

// Remove Mock current user
// const mockCurrentUser: User = {
//   id: 'user-123',
//   name: 'Alex Doe',
//   avatarUrl: 'https://picsum.photos/id/1/100/100',
// };

// Mock initial data - replace with API/DB calls later
const mockInitialItems: RetroItem[] = [
    { id: 'w1', author: { id: 'user-456', name: 'Bob Smith', avatarUrl: 'https://picsum.photos/id/2/100/100' }, content: 'Great collaboration on the login feature!', timestamp: new Date(Date.now() - 3600000 * 2), category: 'well' },
    { id: 'i1', author: { id: 'user-789', name: 'Charlie Brown', avatarUrl: 'https://picsum.photos/id/3/100/100' }, content: 'Deployment process was a bit slow this week.', timestamp: new Date(Date.now() - 3600000 * 3), category: 'improve' },
    { id: 'd1', author: { id: 'user-456', name: 'Bob Smith', avatarUrl: 'https://picsum.photos/id/2/100/100' }, content: 'Should we reconsider our testing strategy?', timestamp: new Date(Date.now() - 3600000 * 1), category: 'discuss' },
    { id: 'a1', author: { id: 'user-123', name: 'Alex Doe', avatarUrl: 'https://picsum.photos/id/1/100/100' }, content: 'Alex to update documentation by EOD Friday.', timestamp: new Date(Date.now() - 3600000 * 0.5), category: 'action' },
    { id: 'w2', author: { id: 'user-789', name: 'Charlie Brown', avatarUrl: 'https://picsum.photos/id/3/100/100' }, content: 'Code reviews were very thorough.', timestamp: new Date(Date.now() - 3600000 * 5), category: 'well', replies: [
        { id: 'r1', author: { id: 'user-123', name: 'Alex Doe', avatarUrl: 'https://picsum.photos/id/1/100/100' }, content: 'Agreed, learned a lot!', timestamp: new Date(Date.now() - 3600000 * 4) }
    ]},
    { id: 'd2', author: { id: 'user-123', name: 'Alex Doe', avatarUrl: 'https://picsum.photos/id/1/100/100' }, content: 'Need clarity on the Q3 roadmap priorities.', timestamp: new Date(Date.now() - 3600000 * 1.5), category: 'discuss' },
    { id: 'w3', author: { id: 'user-123', name: 'Alex Doe', avatarUrl: 'https://picsum.photos/id/1/100/100' }, content: 'Manual item: Test move well to improve', timestamp: new Date(Date.now() - 3600000 * 0.8), category: 'well' },
    { id: 'i2', author: { id: 'user-123', name: 'Alex Doe', avatarUrl: 'https://picsum.photos/id/1/100/100' }, content: 'Manual item: Test move improve to well', timestamp: new Date(Date.now() - 3600000 * 0.7), category: 'improve' },
];

const mockInitialPollResponses: PollResponse[] = [
     { id: 'p1', author: { id: 'user-456', name: 'Bob Smith', avatarUrl: 'https://picsum.photos/id/2/100/100' }, rating: 4, justification: 'Good progress overall, minor hiccup with API.', timestamp: new Date(Date.now() - 3600000 * 6) },
     { id: 'p2', author: { id: 'user-789', name: 'Charlie Brown', avatarUrl: 'https://picsum.photos/id/3/100/100' }, rating: 5, justification: "Loved the free cookies!", timestamp: new Date(Date.now() - 3600000 * 7) },
     { id: 'p3', author: { id: 'user-555', name: 'Dana Scully', avatarUrl: 'https://picsum.photos/id/4/100/100' }, rating: 2, justification: "Project X team was overly needy on the help channel.", timestamp: new Date(Date.now() - 3600000 * 8) },
     // Remove current user's mock response, will rely on actual auth
     // { id: 'p4', author: { id: 'user-123', name: 'Alex Doe', avatarUrl: 'https://picsum.photos/id/1/100/100' }, rating: 3, justification: "Initial test justification.", timestamp: new Date(Date.now() - 3600000 * 9) },
];

// Main component content refactored
function RetroSpectifyPageContent() {
  const { currentUser } = useAuth(); // Get user from AuthContext
  const router = useRouter(); // Get router instance
  const [retroItems, setRetroItems] = useState<RetroItem[]>([]); // Initialize empty, load from DB
  const [pollResponses, setPollResponses] = useState<PollResponse[]>([]); // Initialize empty, load from DB
  const [appUser, setAppUser] = useState<User | null>(null); // State for richer user data from Firestore
  const [isLoading, setIsLoading] = useState(true);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isEditingPoll, setIsEditingPoll] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [isAdjustRatingModalOpen, setIsAdjustRatingModalOpen] = useState(false);
  const [ratingAdjustmentProps, setRatingAdjustmentProps] = useState<{ currentRating: number; suggestedRating: number } | null>(null);

  const { toast } = useToast();


  // Fetch user data from Firestore and initial retro/poll data
  useEffect(() => {
     const fetchData = async () => {
       if (!currentUser) {
         setIsLoading(false); // Stop loading if no user
         return;
       }

       setIsLoading(true);
       try {
           // Fetch Firestore user data
           const userDocRef = doc(db, 'users', currentUser.uid);
           const userDocSnap = await getDoc(userDocRef);
           if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                // Map FirebaseUser + Firestore data to your User type
                setAppUser({
                   id: currentUser.uid,
                   name: currentUser.displayName || userData.displayName || 'User',
                   // Use photoURL from Firebase Auth if available, else from Firestore
                   avatarUrl: currentUser.photoURL || userData.avatarUrl || `https://picsum.photos/seed/${currentUser.uid}/100/100` // Fallback placeholder
                });
           } else {
               // Handle case where user exists in Auth but not Firestore (optional)
               console.warn("User document not found in Firestore for UID:", currentUser.uid);
               setAppUser({ // Create a basic user object
                  id: currentUser.uid,
                  name: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
                  avatarUrl: currentUser.photoURL || `https://picsum.photos/seed/${currentUser.uid}/100/100`
               });
           }

         // --- Replace Mock Data Fetching with Real DB Calls ---
         // TODO: Fetch retroItems for the current team from Firestore
         // TODO: Fetch pollResponses for the current team from Firestore
         // Example placeholder using mock data for now:
         setRetroItems(mockInitialItems);
         setPollResponses(mockInitialPollResponses);

         // Check if current user has submitted a poll response
          const userResponseExists = mockInitialPollResponses.some(resp => resp.author.id === currentUser.uid);
         setHasSubmitted(userResponseExists);
         // You might also store submission status in user doc or team-specific subcollection

       } catch (error) {
         console.error("Error fetching initial data:", error);
         toast({ title: "Error", description: "Could not load initial data.", variant: "destructive" });
       } finally {
         setIsLoading(false);
       }
     };

     fetchData();
  }, [currentUser, toast]); // Depend on currentUser


  // Recalculate hasSubmitted if pollResponses change
  useEffect(() => {
     if (!currentUser) return;
    const userResponseExists = pollResponses.some(resp => resp.author.id === currentUser.uid);
    if (userResponseExists) {
      setHasSubmitted(true);
      // TODO: Persist submission status to DB if needed
    }
  }, [pollResponses, currentUser]);


  // Memoize the current user's response for editing and rating adjustment
  const currentUserResponse = useMemo(() => {
     if (!currentUser) return undefined;
    return pollResponses.find(resp => resp.author.id === currentUser.uid);
  }, [pollResponses, currentUser]);


  // Derived state for showing poll/results
  const shouldShowResults = useMemo(() => {
    return hasSubmitted && !isEditingPoll;
  }, [hasSubmitted, isEditingPoll]);

  const shouldShowPollForm = useMemo(() => {
      return !hasSubmitted || isEditingPoll;
  }, [hasSubmitted, isEditingPoll]);


  // Function to remove existing AI-generated items for a specific poll response
  const removeExistingPollItems = useCallback((responseId: string) => {
       // TODO: Implement logic to remove items from DB if persisting
      setRetroItems(prev => prev.filter(item => !(item.isFromPoll && item.pollResponseId === responseId)));
  }, []);


  const processJustification = useCallback(async (rating: number, justification: string, responseId: string) => {
      if (!appUser) return; // Ensure appUser is loaded

       // Remove any previously generated items for this poll response BEFORE adding new ones
       removeExistingPollItems(responseId);

      const author = appUser; // Use the appUser state

      if (!justification.trim()) {
          const category = rating >= 4 ? 'well' : rating <= 2 ? 'improve' : 'discuss';
          const newItem: RetroItem = {
              id: `poll-${responseId}-rating`, // TODO: Use DB generated ID
              pollResponseId: responseId,
              author: author,
              content: `Rated ${rating} stars (No justification)`,
              timestamp: new Date(), // Use serverTimestamp in DB
              category: category,
              isFromPoll: true,
          };
           // TODO: Add newItem to DB
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
                id: `poll-${responseId}-s${index}`, // TODO: Use DB generated ID
                pollResponseId: responseId,
                author: author,
                content: categorizedSentence.sentence,
                timestamp: new Date(), // Use serverTimestamp in DB
                category: categorizedSentence.category,
                isFromPoll: true,
            }));

             // TODO: Add newItems to DB
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
             // If AI returns empty but justification exists, treat as discussion
             const newItem: RetroItem = {
               id: `poll-${responseId}-discuss`, // TODO: Use DB generated ID
               pollResponseId: responseId,
               author: author,
               content: justification, // Use the full justification
               timestamp: new Date(), // Use serverTimestamp in DB
               category: 'discuss', // Default to discuss if no categories found
               isFromPoll: true,
             };
              // TODO: Add newItem to DB
             setRetroItems(prev => [...prev, newItem]);
             toast({
               title: isEditingPoll ? "Feedback Updated" : "Feedback Added",
               description: "Your feedback couldn't be auto-categorized, added to 'Discussion Topics'.",
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
               id: `poll-${responseId}-error`, // TODO: Use DB generated ID
               pollResponseId: responseId,
               author: author,
               content: justification, // Use full justification on error
               timestamp: new Date(), // Use serverTimestamp in DB
               category: 'discuss', // Fallback to discuss on error
               isFromPoll: true,
           };
            // TODO: Add newItem to DB
           setRetroItems(prev => [...prev, newItem]);
      }
  }, [appUser, removeExistingPollItems, toast, isEditingPoll]); // Depend on appUser


  const handlePollSubmit = useCallback((rating: number, justification: string) => {
     if (!appUser) return; // Ensure appUser is loaded

    let responseId: string;
    let isUpdate = false;

    const existingResponse = pollResponses.find(resp => resp.author.id === appUser.id);

    if (isEditingPoll && existingResponse) {
        // --- Update existing response ---
        responseId = existingResponse.id;
        isUpdate = true;
         // TODO: Update response in DB
        setPollResponses(prev =>
            prev.map(resp =>
                resp.id === responseId
                    ? { ...resp, rating, justification, timestamp: new Date() } // Use serverTimestamp in DB
                    : resp
            )
        );
         toast({
             title: "Poll Response Updated",
             description: "Your sentiment feedback has been updated.",
         });

    } else {
         // --- Add new response ---
        responseId = `resp-${Date.now()}`; // TODO: Use DB generated ID
        const newResponse: PollResponse = {
            id: responseId,
            author: appUser,
            rating,
            justification,
            timestamp: new Date(), // Use serverTimestamp in DB
        };
         // TODO: Add newResponse to DB
        setPollResponses(prev => [...prev, newResponse]);
        setHasSubmitted(true); // Update local submission state

        // TODO: Persist submission status locally/DB if needed
         toast({
             title: "Poll Response Submitted",
             description: "Thank you for your feedback!",
         });
    }

    // Process justification (will also remove old items if updating)
    processJustification(rating, justification, responseId);

    setIsEditingPoll(false); // Exit editing mode after submit/update
  }, [appUser, isEditingPoll, pollResponses, processJustification, toast]); // Depend on appUser

  const handleEditPoll = useCallback(() => {
    setIsEditingPoll(true);
  }, []);


  const handleAddItem = useCallback((category: Category) => (content: string) => {
     if (!appUser) return; // Ensure appUser is loaded
    const newItem: RetroItem = {
      id: `${category}-${Date.now()}`, // TODO: Use DB generated ID
      author: appUser,
      content,
      timestamp: new Date(), // Use serverTimestamp in DB
      category,
      isFromPoll: false,
    };
     // TODO: Add newItem to DB
    setRetroItems(prev => [...prev, newItem]);
     toast({
        title: "Item Added",
        description: `Your item was added to "${category === 'discuss' ? 'Discussion Topics' : category === 'action' ? 'Action Items' : category === 'well' ? 'What Went Well' : 'What Could Be Improved'}".`,
      });
  }, [appUser, toast]); // Depend on appUser

  // Handle generating a new action item from a discussion topic
  const handleGenerateActionItem = useCallback(async (discussionItemId: string) => {
      if (!appUser) return; // Ensure appUser is loaded

      const discussionItem = retroItems.find(item => item.id === discussionItemId);

      if (!discussionItem || discussionItem.category !== 'discuss') {
          toast({ title: "Error", description: "Could not find the discussion topic.", variant: "destructive" });
          return;
      }

      toast({ title: "Generating Action Item...", description: "Please wait.", variant: "default" });

      try {
          const { actionItem: generatedContent } = await generateActionItem({ discussionTopic: discussionItem.content });

          // Create the new action item using the generated content
          const newActionItem: RetroItem = {
              id: `action-${Date.now()}`, // TODO: Use DB generated ID
              author: appUser, // Current user generates the action item
              content: generatedContent,
              timestamp: new Date(), // Use serverTimestamp in DB
              category: 'action',
              isFromPoll: false,
              // Optional: Link back to the original discussion item?
              // linkedDiscussionId: discussionItem.id,
          };

          // TODO: Add newActionItem to DB
          setRetroItems(prev => [...prev, newActionItem]);

          toast({
              title: "Action Item Created",
              description: `Generated action item: "${generatedContent}"`,
          });

      } catch (error) {
          console.error("Error generating action item:", error);
          toast({
              title: "Action Item Generation Failed",
              description: "Could not generate an action item from the discussion topic.",
              variant: "destructive",
          });
      }

  }, [retroItems, appUser, toast]); // Depend on appUser


  const handleAddReply = useCallback((itemId: string, replyContent: string) => {
     if (!appUser) return; // Ensure appUser is loaded

    // TODO: Update replies in DB (potentially nested or separate collection)
    setRetroItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newReply: RetroItem = {
          id: `reply-${itemId}-${Date.now()}`, // TODO: Use DB generated ID
          author: appUser,
          content: replyContent,
          timestamp: new Date(), // Use serverTimestamp in DB
          isFromPoll: false,
          category: item.category, // Replies inherit category
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
  }, [appUser, toast]); // Depend on appUser

   const handleDeleteItem = useCallback((itemId: string) => {
     if (!appUser) return; // Ensure appUser is loaded

     const itemToDelete = retroItems.find(item => item.id === itemId);
     if (!itemToDelete) return;

     // Basic permission check: Can only delete own items, unless maybe admin/owner later
     if (itemToDelete.author.id !== appUser.id) {
          toast({
             title: "Cannot Delete",
             description: "You can only delete your own items.",
             variant: "destructive"
          });
          return;
     }

     // Prevent deleting items generated from the current user's *uneditable* poll response
     if (itemToDelete.isFromPoll && itemToDelete.author.id === appUser.id && !isEditingPoll) {
         toast({
            title: "Cannot Delete Poll Item",
            description: "Edit your poll response to change items derived from it.",
            variant: "destructive"
         });
         return;
     }

     // TODO: Delete item from DB
    setRetroItems(prev => prev.filter(item => item.id !== itemId));
    toast({
        title: "Item Deleted",
        variant: "destructive"
    });
   }, [appUser, isEditingPoll, retroItems, toast]); // Depend on appUser


   // --- Drag and Drop Handlers ---
   const handleDragStart = useCallback((itemId: string) => {
     setDraggingItemId(itemId);
   }, []);


   const handleDragEnd = useCallback(() => {
      setDraggingItemId(null);
   }, []);

    const handleMoveItem = useCallback((itemId: string, targetCategory: Category) => {
        if (!appUser) return; // Ensure appUser is loaded

        const itemToMove = retroItems.find(item => item.id === itemId);

        // Check if item exists and belongs to the current user
        if (!itemToMove || itemToMove.author.id !== appUser.id) {
             toast({
                title: "Cannot Move Item",
                description: "You can only move your own items.",
                variant: "destructive"
            });
            setDraggingItemId(null); // Clear dragging state
            return;
        }

        // Check if the category is actually changing
        if (itemToMove.category === targetCategory) {
            setDraggingItemId(null); // No change, clear dragging state
            return;
        }

        // *** Special Case: Moving from 'discuss' to 'action' ***
        if (itemToMove.category === 'discuss' && targetCategory === 'action') {
            handleGenerateActionItem(itemId); // Trigger AI generation
            // Don't move the original item, just generate a new one
            setDraggingItemId(null);
            return;
        }

         // *** Restriction: Prevent moving *anything else* directly into 'action' ***
         if (targetCategory === 'action' && itemToMove.category !== 'discuss') {
             toast({
                 title: "Cannot Move to Action Items",
                 description: "Action Items are generated from Discussion Topics or added manually.",
                 variant: "destructive",
             });
             setDraggingItemId(null);
             return;
         }

         // *** Check for moving between 'well' and 'improve' ***
         const isWellToImprove = itemToMove.category === 'well' && targetCategory === 'improve';
         const isImproveToWell = itemToMove.category === 'improve' && targetCategory === 'well';

         if ((isWellToImprove || isImproveToWell) && currentUserResponse) {
             const suggestedRating = isWellToImprove
                 ? Math.max(1, currentUserResponse.rating - 1) // Decrease rating, min 1
                 : Math.min(5, currentUserResponse.rating + 1); // Increase rating, max 5

             if (suggestedRating !== currentUserResponse.rating) {
                setRatingAdjustmentProps({
                    currentRating: currentUserResponse.rating,
                    suggestedRating: suggestedRating,
                });
                setIsAdjustRatingModalOpen(true);
             }
         }

        // --- Generic Move Logic (commit the move visually first) ---
        // TODO: Update item category in DB
        setRetroItems(prev =>
            prev.map(item =>
                item.id === itemId
                    ? { ...item, category: targetCategory, timestamp: new Date() } // Use serverTimestamp in DB
                    : item
            )
        );
        toast({
            title: "Item Moved",
            description: `Item moved to "${targetCategory === 'discuss' ? 'Discussion Topics' : targetCategory === 'well' ? 'What Went Well' : 'What Could Be Improved'}".`
        });

        setDraggingItemId(null); // Clear dragging state after a successful move

    }, [appUser, retroItems, toast, handleGenerateActionItem, currentUserResponse]); // Depend on appUser

    // Handler for AdjustRatingModal confirmation
    const handleAdjustRatingConfirm = useCallback((newRating: number) => {
        if (!currentUserResponse || !appUser) return;

        // TODO: Update poll response rating in DB
        setPollResponses(prev =>
            prev.map(resp =>
                resp.id === currentUserResponse.id
                    ? { ...resp, rating: newRating, timestamp: new Date() } // Use serverTimestamp in DB
                    : resp
            )
        );

        toast({
            title: "Rating Adjusted",
            description: `Your sentiment poll rating was updated to ${newRating} stars.`,
        });

        setIsAdjustRatingModalOpen(false); // Close modal
        setRatingAdjustmentProps(null); // Clear props
    }, [currentUserResponse, appUser, toast]); // Depend on appUser

    // Handler for AdjustRatingModal cancellation
    const handleAdjustRatingCancel = useCallback(() => {
        setIsAdjustRatingModalOpen(false); // Close modal
        setRatingAdjustmentProps(null); // Clear props
    }, []);

    // --- Logout Handler ---
    const handleLogout = async () => {
        try {
            await signOut(auth);
            toast({ title: "Logged Out", description: "You have been successfully logged out." });
            router.push('/login'); // Redirect to login page after logout
        } catch (error) {
            console.error("Logout error:", error);
            toast({ title: "Logout Failed", description: "Could not log you out. Please try again.", variant: "destructive" });
        }
    };



  const filterItems = (category: Category) => {
    // Filter top-level items (not replies) by category and sort by timestamp
    const topLevelItems = retroItems.filter(item => !retroItems.some(parent => parent.replies?.some(reply => reply.id === item.id)));
    return topLevelItems.filter(item => item.category === category).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

   // Loading state UI
  if (isLoading || !appUser) { // Show loading if appUser isn't loaded yet
    return (
      <div className="container mx-auto p-4 md:p-8 max-w-screen-2xl">
        <header className="mb-8 flex justify-between items-center">
             <h1 className="text-3xl font-bold text-primary">RetroSpectify</h1>
             <Skeleton className="h-10 w-24 rounded-md" /> {/* Skeleton for user/logout */}
        </header>
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
                         <Skeleton className="h-10 w-full rounded" />
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
            {/* User Info and Logout Button */}
            <div className="flex items-center space-x-3">
                <span className="text-sm font-medium hidden sm:inline">{appUser.name}</span>
                <Avatar>
                    <AvatarImage src={appUser.avatarUrl} alt={appUser.name} data-ai-hint="avatar profile picture"/>
                    <AvatarFallback>{appUser.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                 <Button variant="outline" size="sm" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                 </Button>
            </div>
        </header>


      {/* Poll Section or Results Section */}
      <div className="mb-6 md:mb-8">
        {shouldShowPollForm && (
             <PollSection
                currentUser={appUser} // Use appUser
                onSubmitPoll={handlePollSubmit}
                initialRating={isEditingPoll ? currentUserResponse?.rating : undefined}
                initialJustification={isEditingPoll ? currentUserResponse?.justification : undefined}
                isEditing={isEditingPoll}
            />
        )}
         {shouldShowResults && (
            <PollResultsSection
                responses={pollResponses}
                onEdit={handleEditPoll}
                currentUserHasVoted={!!currentUserResponse}
            />
         )}
      </div>

      {/* Retro Board Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <RetroSection
          title="What Went Well"
          category="well"
          items={filterItems('well')}
          currentUser={appUser} // Use appUser
          onAddItem={handleAddItem('well')}
          onAddReply={handleAddReply}
          onMoveItem={handleMoveItem}
          onDeleteItem={handleDeleteItem}
          allowAddingItems={true}
          draggingItemId={draggingItemId}
          onDragStartItem={handleDragStart}
          onDragEndItem={handleDragEnd}
          className="bg-teal-50/50 border-teal-200 dark:bg-teal-900/20 dark:border-teal-700/50"
        />
        <RetroSection
          title="What Could Be Improved"
          category="improve"
          items={filterItems('improve')}
          currentUser={appUser} // Use appUser
          onAddItem={handleAddItem('improve')}
          onAddReply={handleAddReply}
          onMoveItem={handleMoveItem}
          onDeleteItem={handleDeleteItem}
          allowAddingItems={true}
          draggingItemId={draggingItemId}
          onDragStartItem={handleDragStart}
          onDragEndItem={handleDragEnd}
          className="bg-amber-50/50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/50"
        />
        <RetroSection
          title="Discussion Topics"
          category="discuss"
          items={filterItems('discuss')}
          currentUser={appUser} // Use appUser
          onAddItem={handleAddItem('discuss')}
          onAddReply={handleAddReply}
          onMoveItem={handleMoveItem}
          onDeleteItem={handleDeleteItem}
          allowAddingItems={true}
          draggingItemId={draggingItemId}
          onDragStartItem={handleDragStart}
          onDragEndItem={handleDragEnd}
          className="bg-blue-50/50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700/50"
        />
        <RetroSection
          title="Action Items"
          category="action"
          items={filterItems('action')}
          currentUser={appUser} // Use appUser
          onAddItem={handleAddItem('action')}
          onAddReply={handleAddReply}
          onMoveItem={handleMoveItem}
          onDeleteItem={handleDeleteItem}
          allowAddingItems={true}
          draggingItemId={draggingItemId}
          onDragStartItem={handleDragStart}
          onDragEndItem={handleDragEnd}
          className="bg-purple-50/50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-700/50"
          isDropTargetForActionGeneration={true}
        />
      </div>

       {/* Rating Adjustment Modal */}
       {ratingAdjustmentProps && (
         <AdjustRatingModal
           isOpen={isAdjustRatingModalOpen}
           currentRating={ratingAdjustmentProps.currentRating}
           suggestedRating={ratingAdjustmentProps.suggestedRating}
           onConfirm={handleAdjustRatingConfirm}
           onCancel={handleAdjustRatingCancel}
         />
       )}
       <Toaster />
    </div>
  );
}

// Wrap the main content with ProtectedRoute
export default function RetroSpectifyPage() {
    return (
        <ProtectedRoute>
            <RetroSpectifyPageContent />
        </ProtectedRoute>
    );
}
