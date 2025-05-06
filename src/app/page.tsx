
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
import { Card, CardHeader, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; // Import Button
import { LogOut } from 'lucide-react'; // Import LogOut icon
import ProtectedRoute from '@/components/auth/ProtectedRoute'; // Import ProtectedRoute
import { useAuth } from '@/context/AuthContext'; // Import useAuth
import { getGravatarUrl } from '@/lib/utils'; // Import Gravatar utility


// Mock initial data - replace with API/DB calls later
// Helper function to generate mock users with Gravatar fallbacks
const generateMockUser = (id: string, name: string, emailSuffix: string, role: 'admin' | 'member' = 'member'): User => {
    const email = `${name.toLowerCase().replace(' ', '.')}${emailSuffix}@example.com`;
    return {
        id: id,
        name: name,
        email: email,
        avatarUrl: getGravatarUrl(email, 100)!, // Use Gravatar, assuming it won't be null
        role: role,
    };
};

// Make Alex Doe an admin for testing purposes
const mockUserAlex = generateMockUser('user-123', 'Alex Doe', '', 'admin');
const mockUserBob = generateMockUser('user-456', 'Bob Smith', '1');
const mockUserCharlie = generateMockUser('user-789', 'Charlie Brown', '2');
const mockUserDana = generateMockUser('user-555', 'Dana Scully', '3');

const mockInitialItems: RetroItem[] = [
    { id: 'w1', author: mockUserBob, content: 'Great collaboration on the login feature!', timestamp: new Date(Date.now() - 3600000 * 2), category: 'well' },
    { id: 'i1', author: mockUserCharlie, content: 'Deployment process was a bit slow this week.', timestamp: new Date(Date.now() - 3600000 * 3), category: 'improve' },
    { id: 'd1', author: mockUserBob, content: 'Should we reconsider our testing strategy?', timestamp: new Date(Date.now() - 3600000 * 1), category: 'discuss' },
    { id: 'a1', author: mockUserAlex, content: 'Alex to update documentation by EOD Friday.', timestamp: new Date(Date.now() - 3600000 * 0.5), category: 'action' },
    { id: 'w2', author: mockUserCharlie, content: 'Code reviews were very thorough.', timestamp: new Date(Date.now() - 3600000 * 5), category: 'well', replies: [
        { id: 'r1', author: mockUserAlex, content: 'Agreed, learned a lot!', timestamp: new Date(Date.now() - 3600000 * 4), category: 'well' } // Reply needs category
    ]},
    { id: 'd2', author: mockUserAlex, content: 'Need clarity on the Q3 roadmap priorities.', timestamp: new Date(Date.now() - 3600000 * 1.5), category: 'discuss' },
    { id: 'w3', author: mockUserAlex, content: 'Manual item: Test move well to improve', timestamp: new Date(Date.now() - 3600000 * 0.8), category: 'well' },
    { id: 'i2', author: mockUserAlex, content: 'Manual item: Test move improve to well', timestamp: new Date(Date.now() - 3600000 * 0.7), category: 'improve' },
];

const mockInitialPollResponses: PollResponse[] = [
     { id: 'p1', author: mockUserBob, rating: 4, justification: 'Good progress overall, minor hiccup with API.', timestamp: new Date(Date.now() - 3600000 * 6) },
     { id: 'p2', author: mockUserCharlie, rating: 5, justification: "Loved the free cookies!", timestamp: new Date(Date.now() - 3600000 * 7) },
     { id: 'p3', author: mockUserDana, rating: 2, justification: "Project X team was overly needy on the help channel.", timestamp: new Date(Date.now() - 3600000 * 8) },
     // Remove current user's mock response, will rely on actual auth
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

           let resolvedUser: User;
           if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                 // Construct the User object
                 resolvedUser = {
                    id: currentUser.uid,
                    name: currentUser.displayName || userData.displayName || currentUser.email?.split('@')[0] || 'User',
                    email: currentUser.email || userData.email || 'unknown@example.com', // Ensure email exists
                    // Use avatarUrl from Firestore first, then Auth, then generate Gravatar as fallback
                    avatarUrl: userData.avatarUrl || currentUser.photoURL || getGravatarUrl(currentUser.email, 100)!,
                    role: userData.role || 'member', // Include role if available
                 };
           } else {
               // Handle case where user exists in Auth but not Firestore (create basic user object)
               console.warn("User document not found in Firestore for UID:", currentUser.uid);
               const fallbackEmail = currentUser.email || `${currentUser.uid}@example.com`; // Create a fallback email
               resolvedUser = {
                  id: currentUser.uid,
                  name: currentUser.displayName || fallbackEmail.split('@')[0] || 'User',
                  email: fallbackEmail,
                  avatarUrl: currentUser.photoURL || getGravatarUrl(fallbackEmail, 100)!, // Use photoURL or generate Gravatar
                  role: 'member', // Default role
               };
           }
           setAppUser(resolvedUser);


         // --- Replace Mock Data Fetching with Real DB Calls ---
         // TODO: Fetch retroItems for the current team/user scope from Firestore
         // TODO: Fetch pollResponses for the current team/user scope from Firestore

          // Inject the admin user into mock data if it doesn't exist (for testing)
          let initialItems = mockInitialItems;
          let initialPolls = mockInitialPollResponses;

          if (resolvedUser.role === 'admin' && !initialItems.some(item => item.author.id === resolvedUser.id)) {
                // Add some items for the admin if they don't exist
                initialItems = [
                  ...initialItems,
                  { id: 'admin-w1', author: resolvedUser, content: 'Admin: Things look good!', timestamp: new Date(), category: 'well' },
                  { id: 'admin-d1', author: resolvedUser, content: 'Admin: Discuss project alpha status.', timestamp: new Date(), category: 'discuss' },
                ];
          }
          if (resolvedUser.role === 'admin' && !initialPolls.some(poll => poll.author.id === resolvedUser.id)) {
             // Add a poll response for the admin if they don't exist
             initialPolls = [
                ...initialPolls,
                { id: 'admin-p1', author: resolvedUser, rating: 4, justification: "Admin's perspective: Mostly positive.", timestamp: new Date() },
             ];
          }


         setRetroItems(initialItems); // Using updated mock
         setPollResponses(initialPolls); // Using updated mock

         // Check if current user has submitted a poll response based on fetched data
          const userResponseExists = initialPolls.some(resp => resp.author.id === currentUser.uid);
         setHasSubmitted(userResponseExists);


       } catch (error: any) {
         console.error("Error fetching initial data:", error);
          if (error.code === 'permission-denied') {
              toast({ title: "Permission Denied", description: "You don't have permission to access this data. Check Firestore rules.", variant: "destructive", duration: 10000 });
          } else {
              toast({ title: "Error", description: "Could not load initial data.", variant: "destructive" });
          }
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
    setHasSubmitted(userResponseExists); // Update state based on fetched poll responses
    // No need to persist submission status here, it's derived from pollResponses
  }, [pollResponses, currentUser]);


  // Memoize the current user's response for editing and rating adjustment
  const currentUserResponse = useMemo(() => {
     if (!currentUser) return undefined;
    return pollResponses.find(resp => resp.author.id === currentUser.uid);
  }, [pollResponses, currentUser]);


  // Derived state for showing poll/results
  const shouldShowResults = useMemo(() => {
    // Default to closed unless editing
     return !isEditingPoll && hasSubmitted; // Show results only if submitted and not editing
  }, [hasSubmitted, isEditingPoll]);

  const shouldShowPollForm = useMemo(() => {
      return !hasSubmitted || isEditingPoll; // Show form if not submitted OR editing
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
          // If no justification, add a single item based on rating
          const category = rating >= 4 ? 'well' : rating <= 2 ? 'improve' : 'discuss';
          const newItem: RetroItem = {
              id: `poll-${responseId}-ratingonly`, // TODO: Use DB generated ID
              pollResponseId: responseId,
              author: author,
              content: `Rated ${rating} stars.`, // Simple content for rating-only
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
          return; // Exit early as there's no text to categorize
      }


      // If justification exists, call the categorization AI
      try {
          const categorizedSentences = await categorizeJustification({ rating, justification });

          if (categorizedSentences && categorizedSentences.length > 0) {
            const newItems: RetroItem[] = categorizedSentences.map((categorizedSentence, index) => ({
                id: `poll-${responseId}-s${index}`, // TODO: Use DB generated ID
                pollResponseId: responseId,
                author: author,
                content: categorizedSentence.sentence,
                timestamp: new Date(), // Use serverTimestamp in DB
                category: categorizedSentence.category, // Use AI category ('well' or 'improve')
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
             // If AI returns empty but justification exists, treat the whole justification as 'discuss'
             const newItem: RetroItem = {
               id: `poll-${responseId}-discuss`, // TODO: Use DB generated ID
               pollResponseId: responseId,
               author: author,
               content: justification, // Use the full justification
               timestamp: new Date(), // Use serverTimestamp in DB
               category: 'discuss', // Default to discuss if no specific sentences categorized
               isFromPoll: true,
             };
              // TODO: Add newItem to DB
             setRetroItems(prev => [...prev, newItem]);
             toast({
               title: isEditingPoll ? "Feedback Updated" : "Feedback Added",
               description: "Your feedback couldn't be auto-categorized by sentence, added to 'Discussion Topics'.",
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
           // Fallback: Add the entire justification as a 'discuss' item on error
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
      isFromPoll: false, // Manually added items are not from the poll
    };
     // TODO: Add newItem to DB
    setRetroItems(prev => [...prev, newItem]);
     toast({
        title: "Item Added",
        description: `Your item was added to "${category === 'discuss' ? 'Discussion Topics' : category === 'action' ? 'Action Items' : category === 'well' ? 'What Went Well' : 'What Could Be Improved'}".`,
      });
  }, [appUser, toast]); // Depend on appUser

  // --- Edit Item Handler ---
  const handleEditItem = useCallback((itemId: string, newContent: string) => {
    if (!appUser) return; // Ensure appUser is loaded

    setRetroItems(prev =>
        prev.map(item => {
            if (item.id === itemId) {
                // Permission check: Author or Admin
                const canEdit = item.author.id === appUser.id || appUser.role === 'admin';
                if (!canEdit) {
                    toast({ title: "Cannot Edit", description: "You don't have permission to edit this item.", variant: "destructive" });
                    return { ...item, editing: false }; // Revert editing state if UI was toggled prematurely
                }
                 // TODO: Update item content in DB
                 toast({ title: "Item Updated", description: "Changes saved." });
                return { ...item, content: newContent, timestamp: new Date(), editing: false }; // Update content and timestamp, turn off editing state
            }
            return item;
        })
    );
  }, [appUser, toast]); // Depend on appUser

  // Handle generating a new action item from a discussion topic
  const handleGenerateActionItem = useCallback(async (discussionItemId: string) => {
      if (!appUser) return; // Ensure appUser is loaded

      const discussionItem = retroItems.find(item => item.id === discussionItemId);

      if (!discussionItem || discussionItem.category !== 'discuss') {
          toast({ title: "Error", description: "Could not find the discussion topic or it's not a discussion item.", variant: "destructive" });
          return;
      }

      // Permission check: Only author or admin can generate action from discussion
      const canGenerate = discussionItem.author.id === appUser.id || appUser.role === 'admin';
       if (!canGenerate) {
            toast({ title: "Permission Denied", description: "Only the author or an admin can generate an action item from this discussion.", variant: "destructive" });
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

    // Find the parent item to inherit its category
    const parentItem = retroItems.find(item => item.id === itemId);
    if (!parentItem) return; // Should not happen if UI is correct

    // TODO: Update replies in DB (potentially nested or separate collection)
    setRetroItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newReply: RetroItem = {
          id: `reply-${itemId}-${Date.now()}`, // TODO: Use DB generated ID
          author: appUser,
          content: replyContent,
          timestamp: new Date(), // Use serverTimestamp in DB
          isFromPoll: false, // Replies are not directly from poll submission
          category: parentItem.category, // Replies inherit category of parent item
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
  }, [appUser, retroItems, toast]); // Include retroItems in dependencies

   const handleDeleteItem = useCallback((itemId: string) => {
     if (!appUser) return; // Ensure appUser is loaded

     const itemToDelete = retroItems.find(item => item.id === itemId);
     if (!itemToDelete) return;

     // Permission check: Author or Admin
     const canDelete = itemToDelete.author.id === appUser.id || appUser.role === 'admin';

     if (!canDelete) {
          toast({
             title: "Cannot Delete",
             description: "You don't have permission to delete this item.",
             variant: "destructive"
          });
          return;
     }

     // Prevent deleting items generated from the current user's *uneditable* poll response
     // Allow deletion if the poll is currently being edited OR if user is admin
     if (itemToDelete.isFromPoll && itemToDelete.author.id === appUser.id && !isEditingPoll && appUser.role !== 'admin') {
         toast({
            title: "Cannot Delete Poll Item",
            description: "Edit your poll response to change items derived from it, or delete the entire response.",
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
     const item = retroItems.find(i => i.id === itemId);
      // Allow drag if user is admin OR is the author
      if (item && (item.author.id === appUser?.id || appUser?.role === 'admin')) {
         setDraggingItemId(itemId);
     } else {
          // Prevent dragging if not allowed
         setDraggingItemId(null);
         console.log("Drag prevented: Not owner or admin.");
     }
   }, [retroItems, appUser]); // Add dependencies


   const handleDragEnd = useCallback(() => {
      setDraggingItemId(null);
   }, []);

    const handleMoveItem = useCallback((itemId: string, targetCategory: Category) => {
        if (!appUser) {
             console.error("Cannot move item: User not loaded.");
             return;
         }

        const itemToMove = retroItems.find(item => item.id === itemId);

        if (!itemToMove) {
            console.error("Cannot move item: Item not found.");
            toast({ title: "Move Error", description: "Item not found.", variant: "destructive" });
            setDraggingItemId(null);
            return;
        }

         // Permission check: Author or Admin
         const canMove = itemToMove.author.id === appUser.id || appUser.role === 'admin';
         if (!canMove) {
             console.log("Prevented move: User does not have permission.");
             toast({
                 title: "Cannot Move Item",
                 description: "You don't have permission to move this item.",
                 variant: "destructive"
             });
             setDraggingItemId(null); // Clear dragging state
             return;
         }

        if (itemToMove.category === targetCategory) {
            console.log("Move cancelled: Same category.");
            setDraggingItemId(null);
            return;
        }

        // Special Case: Moving from 'discuss' to 'action' triggers generation
        if (itemToMove.category === 'discuss' && targetCategory === 'action') {
            console.log("Triggering action item generation for:", itemId);
            handleGenerateActionItem(itemId); // Trigger AI generation (includes permission check)
            setDraggingItemId(null);
            return;
        }

         // Restriction: Prevent moving *anything else* directly into 'action'
         if (targetCategory === 'action' && itemToMove.category !== 'discuss') {
             console.log("Prevented move: Cannot move non-discussion to action.");
             toast({
                 title: "Cannot Move to Action Items",
                 description: "Action Items can only be generated from Discussion Topics or added manually.",
                 variant: "destructive",
             });
             setDraggingItemId(null);
             return;
         }

         // Check for moving between 'well' and 'improve' AND if the item belongs to the current user
         const isWellToImprove = itemToMove.category === 'well' && targetCategory === 'improve';
         const isImproveToWell = itemToMove.category === 'improve' && targetCategory === 'well';
         const userIsAuthor = itemToMove.author.id === appUser.id;

         if ((isWellToImprove || isImproveToWell) && userIsAuthor && currentUserResponse) {
             // Prompt for rating adjustment ONLY if the current user is the author
             const suggestedRating = isWellToImprove
                 ? Math.max(1, currentUserResponse.rating - 1)
                 : Math.min(5, currentUserResponse.rating + 1);

             if (suggestedRating !== currentUserResponse.rating) {
                console.log("Prompting for rating adjustment (author move).");
                setRatingAdjustmentProps({
                    currentRating: currentUserResponse.rating,
                    suggestedRating: suggestedRating,
                });
                setIsAdjustRatingModalOpen(true);
                // Don't move immediately - wait for modal
             } else {
                 console.log("Rating adjustment not needed (author move), moving directly.");
                 // Proceed with move if no rating change needed
                 // TODO: Update item category in DB
                 setRetroItems(prev =>
                     prev.map(item =>
                         item.id === itemId
                             ? { ...item, category: targetCategory, timestamp: new Date() }
                             : item
                     )
                 );
                 toast({
                     title: "Item Moved",
                     description: `Item moved to "${targetCategory === 'discuss' ? 'Discussion Topics' : targetCategory === 'well' ? 'What Went Well' : 'What Could Be Improved'}".`
                 });
                 setDraggingItemId(null); // Clear drag state
             }
         } else {
             // Generic Move Logic (admin move, non-well/improve move, or no poll response)
             console.log("Moving item directly (admin, non-well/improve, or no poll response).");
             // TODO: Update item category in DB
             setRetroItems(prev =>
                 prev.map(item =>
                     item.id === itemId
                         ? { ...item, category: targetCategory, timestamp: new Date() }
                         : item
                 )
             );
             toast({
                 title: "Item Moved",
                 description: `Item moved to "${targetCategory === 'discuss' ? 'Discussion Topics' : targetCategory === 'well' ? 'What Went Well' : 'What Could Be Improved'}".`
             });
             setDraggingItemId(null); // Clear drag state
         }

         // Note: setDraggingItemId(null) is called within each branch now

    }, [appUser, retroItems, toast, handleGenerateActionItem, currentUserResponse]); // Depend on appUser


    // Handler for AdjustRatingModal confirmation
    const handleAdjustRatingConfirm = useCallback((newRating: number) => {
        try {
            if (!currentUserResponse || !appUser || !draggingItemId) {
                 console.error("Cannot confirm rating adjustment: Missing context.");
                 return;
            }

            const itemToMove = retroItems.find(item => item.id === draggingItemId);
            if (!itemToMove) {
                console.error("Error adjusting rating: Original item not found.");
                return;
            }

            // Determine the target category based on the direction of the move
            const targetCategory = itemToMove.category === 'well' ? 'improve' : 'well';

            // 1. Update poll response rating
            // TODO: Update poll response rating in DB
            setPollResponses(prev =>
                prev.map(resp =>
                    resp.id === currentUserResponse.id
                        ? { ...resp, rating: newRating, timestamp: new Date() }
                        : resp
                )
            );

            // 2. Move the retro item
            // TODO: Update item category in DB
            setRetroItems(prev =>
                prev.map(item =>
                    item.id === draggingItemId
                        ? { ...item, category: targetCategory, timestamp: new Date() }
                        : item
                )
            );

            toast({
                title: "Rating Adjusted & Item Moved",
                description: `Your sentiment rating updated to ${newRating} stars and item moved.`,
            });
        } catch (error) {
            console.error("Error in handleAdjustRatingConfirm:", error);
            toast({
                 title: "Error Adjusting Rating",
                 description: "Could not update rating and move item.",
                 variant: "destructive"
             });
        } finally {
            setIsAdjustRatingModalOpen(false);
            setRatingAdjustmentProps(null);
            setDraggingItemId(null);
        }
    }, [currentUserResponse, appUser, toast, draggingItemId, retroItems]);

    // Handler for AdjustRatingModal cancellation
    const handleAdjustRatingCancel = useCallback(() => {
         try {
             if (!draggingItemId) {
                  console.error("Cannot cancel rating adjustment: Missing item ID.");
                  return;
             }

             const itemToMove = retroItems.find(item => item.id === draggingItemId);
             if (!itemToMove) {
                 console.error("Error cancelling rating adjustment: Original item not found.");
                 return;
             }

             const targetCategory = itemToMove.category === 'well' ? 'improve' : 'well';

             // Move the retro item without changing the rating
             // TODO: Update item category in DB
             setRetroItems(prev =>
                 prev.map(item =>
                     item.id === draggingItemId
                         ? { ...item, category: targetCategory, timestamp: new Date() }
                         : item
                 )
             );

             toast({
                 title: "Item Moved",
                 description: `Item moved, but sentiment rating kept at ${ratingAdjustmentProps?.currentRating || 'previous'} stars.`,
             });
         } catch (error) {
             console.error("Error in handleAdjustRatingCancel:", error);
              toast({
                 title: "Error Moving Item",
                 description: "Could not move item after cancelling rating adjustment.",
                 variant: "destructive"
              });
         } finally {
            setIsAdjustRatingModalOpen(false);
            setRatingAdjustmentProps(null);
            setDraggingItemId(null);
         }
    }, [draggingItemId, retroItems, toast, ratingAdjustmentProps]);

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
    const topLevelItems = retroItems.filter(item =>
        !retroItems.some(parent => parent.replies && parent.replies.some(reply => reply.id === item.id))
    );
    return topLevelItems.filter(item => item.category === category).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

   // Loading state UI
  if (isLoading || !appUser) {
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
            <div className="flex items-center space-x-3">
                <span className="text-sm font-medium hidden sm:inline">{appUser.name} {appUser.role === 'admin' && '(Admin)'}</span>
                <Avatar>
                    <AvatarImage src={appUser.avatarUrl} alt={appUser.name} data-ai-hint="avatar profile picture"/>
                    <AvatarFallback>{appUser.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                 <Button variant="outline" size="sm" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                 </Button>
            </div>
        </header>

      <div className="mb-6 md:mb-8">
        {shouldShowPollForm && (
             <PollSection
                currentUser={appUser}
                onSubmitPoll={handlePollSubmit}
                initialRating={isEditingPoll ? currentUserResponse?.rating : 0}
                initialJustification={isEditingPoll ? currentUserResponse?.justification : ''}
                isEditing={isEditingPoll}
            />
        )}
         {shouldShowResults && ( // Show results container if user has submitted (or is admin?) - controlled by shouldShowResults
            <PollResultsSection
                responses={pollResponses}
                onEdit={handleEditPoll} // Only pass if user can edit (user has voted)
                currentUserHasVoted={!!currentUserResponse} // Let component know if current user voted
                initiallyOpen={false} // Always start closed, user clicks to open
            />
         )}
         {!shouldShowPollForm && !currentUserResponse && (
              <Card className="shadow-md border border-input bg-card text-center p-6">
                  <CardDescription>Submit your sentiment in the poll above to see the team results.</CardDescription>
              </Card>
         )}
      </div>

      {/* Retro Board Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <RetroSection
          title="What Went Well"
          category="well"
          items={filterItems('well')}
          currentUser={appUser}
          onAddItem={handleAddItem('well')}
          onAddReply={handleAddReply}
          onMoveItem={handleMoveItem}
          onEditItem={handleEditItem} // Pass handler
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
          currentUser={appUser}
          onAddItem={handleAddItem('improve')}
          onAddReply={handleAddReply}
          onMoveItem={handleMoveItem}
          onEditItem={handleEditItem} // Pass handler
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
          currentUser={appUser}
          onAddItem={handleAddItem('discuss')}
          onAddReply={handleAddReply}
          onMoveItem={handleMoveItem}
          onEditItem={handleEditItem} // Pass handler
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
          currentUser={appUser}
          onAddItem={handleAddItem('action')}
          onAddReply={handleAddReply}
          onMoveItem={handleMoveItem}
          onEditItem={handleEditItem} // Pass handler
          onDeleteItem={handleDeleteItem}
          allowAddingItems={true}
          draggingItemId={draggingItemId}
          onDragStartItem={handleDragStart}
          onDragEndItem={handleDragEnd}
          className="bg-purple-50/50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-700/50"
          isDropTargetForActionGeneration={true}
        />
      </div>

       {ratingAdjustmentProps && isAdjustRatingModalOpen && (
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

export default function RetroSpectifyPage() {
    return (
        <ProtectedRoute>
            <RetroSpectifyPageContent />
        </ProtectedRoute>
    );
}

