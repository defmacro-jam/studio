
"use client";

import { useState, useEffect, useMemo, useCallback, type DragEvent } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter
import Link from 'next/link'; // Import Link
import { signOut } from 'firebase/auth'; // Import signOut
import { Timestamp as FBTimestamp, doc, getDoc, onSnapshot, collection, query, where, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, getDocs as getFirestoreDocs } from 'firebase/firestore'; // Renamed getDocs to getFirestoreDocs, added FBTimestamp
import type { RetroItem, PollResponse, User, Category, AppRole, GlobalConfig, Team } from '@/lib/types'; // Added AppRole, GlobalConfig
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
import { Card, CardHeader, CardContent, CardFooter, CardDescription, CardTitle } from '@/components/ui/card'; // Added CardTitle
import { Button } from '@/components/ui/button'; // Import Button
import { Users, LogOut, ShieldCheck, Info, Settings, PackageSearch, Loader2 } from 'lucide-react'; // Import Users, LogOut, ShieldCheck, Info, Settings icons
import ProtectedRoute from '@/components/auth/ProtectedRoute'; // Import ProtectedRoute
import { useAuth } from '@/context/AuthContext'; // Import useAuth
import { auth, db } from '@/lib/firebase'; // Import auth and db
import { getGravatarUrl } from '@/lib/utils'; // Import Gravatar utility
import { APP_ROLES, TEAM_ROLES } from '@/lib/types'; // Import APP_ROLES


const mockTeamId = "mock-team-123"; // Define a mock team ID for demo data

// Main component content refactored
function RetroSpectifyPageContent() {
  const { currentUser, loading: authLoading } = useAuth(); // Get user from AuthContext
  const router = useRouter(); // Get router instance
  const [retroItems, setRetroItems] = useState<RetroItem[]>([]);
  const [pollResponses, setPollResponses] = useState<PollResponse[]>([]);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isEditingPoll, setIsEditingPoll] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [isAdjustRatingModalOpen, setIsAdjustRatingModalOpen] = useState(false);
  const [ratingAdjustmentProps, setRatingAdjustmentProps] = useState<{ itemIdToAdjust: string, currentRating: number; suggestedRating: number } | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [activeTeamName, setActiveTeamName] = useState<string | null>(null);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [showTeamSelector, setShowTeamSelector] = useState(false);

  const { toast } = useToast();
  console.log("[Page Lifecycle] RetroSpectifyPageContent rendering. Auth loading:", authLoading, "Current user:", currentUser ? currentUser.uid : 'none');


  // Listen for demo mode changes
  useEffect(() => {
    console.log("[Effect] Setting up demo mode listener.");
    const configDocRef = doc(db, 'config', 'global');
    const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const configData = docSnap.data() as GlobalConfig;
        console.log("[Effect] Demo mode config changed. Enabled:", configData.isDemoModeEnabled);
        setIsDemoMode(configData.isDemoModeEnabled);
      } else {
        console.log("[Effect] Demo mode config not found, defaulting to false.");
        setIsDemoMode(false); // Default to false if doc doesn't exist
      }
    }, (error) => {
      console.error("[Effect] Error listening to demo mode config:", error);
      setIsDemoMode(false); // Fallback on error
    });
    return () => {
      console.log("[Effect Cleanup] Demo mode listener unsubscribing.");
      unsubscribe();
    }
  }, []);


  // Fetch user data, teams, and set active team
  useEffect(() => {
    console.log("[Effect] Auth state or currentUser changed. Current user UID:", currentUser?.uid);
    if (authLoading) {
      console.log("[Effect] Auth is loading, returning early.");
      setIsLoading(true);
      return;
    }
    if (!currentUser) {
      console.log("[Effect] No current user, redirecting to login.");
      router.push('/login');
      return;
    }

    const fetchInitialUserData = async () => {
      console.log("[Effect] Fetching initial user data for UID:", currentUser.uid);
      setIsLoading(true);
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const userTeamIds = userData.teamIds || []; // Ensure teamIds is always an array
          console.log(`[Effect] User ${currentUser.uid} data from Firestore:`, userData, "User Team IDs:", userTeamIds);

          const resolvedUser: User = {
            id: currentUser.uid,
            name: userData.displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
            email: userData.email || currentUser.email || 'unknown@example.com',
            avatarUrl: userData.avatarUrl || currentUser.photoURL || getGravatarUrl(userData.email || currentUser.email, 100)!,
            role: userData.role || APP_ROLES.MEMBER,
            teamIds: userTeamIds,
          };
          setAppUser(resolvedUser);
          console.log("[Effect] AppUser set:", resolvedUser);


          // Fetch user's teams
          const fetchedTeams: Team[] = [];
          if (resolvedUser.teamIds && resolvedUser.teamIds.length > 0) {
            console.log("[Effect] User has teamIds:", resolvedUser.teamIds);
            const teamChunks: string[][] = [];
             for (let i = 0; i < resolvedUser.teamIds.length; i += 30) {
                 teamChunks.push(resolvedUser.teamIds.slice(i, i + 30));
             }

            for (const chunk of teamChunks) {
                if (chunk.length > 0) {
                    const teamsQuery = query(collection(db, 'teams'), where('__name__', 'in', chunk));
                    const teamsSnapshot = await getFirestoreDocs(teamsQuery);
                    teamsSnapshot.forEach(teamDoc => {
                        fetchedTeams.push({ id: teamDoc.id, ...teamDoc.data() } as Team);
                    });
                }
            }
            console.log("[Effect] Fetched teams:", fetchedTeams);
          } else {
            console.log(`[Effect] User ${currentUser.uid} has no teamIds in their user document.`);
          }
          setUserTeams(fetchedTeams);
          console.log(`[Effect] User teams state updated. Number of teams: ${fetchedTeams.length}`);


          if (fetchedTeams.length === 1) {
            console.log("[Effect] User has 1 team, setting as active:", fetchedTeams[0].id, fetchedTeams[0].name);
            setActiveTeamId(fetchedTeams[0].id);
            setActiveTeamName(fetchedTeams[0].name);
            setShowTeamSelector(false);
          } else if (fetchedTeams.length > 1) {
            console.log("[Effect] User has multiple teams, showing selector.");
            const storedTeamId = localStorage.getItem('activeTeamId');
            const storedTeamName = localStorage.getItem('activeTeamName');
            if (storedTeamId && storedTeamName && fetchedTeams.some(t => t.id === storedTeamId)) {
                setActiveTeamId(storedTeamId);
                setActiveTeamName(storedTeamName);
                setShowTeamSelector(false);
            } else {
                setShowTeamSelector(true);
            }
          } else { // No teams
            console.log("[Effect] User has no teams.");
             if (!isDemoMode) {
                setActiveTeamId(null);
                setActiveTeamName(null);
                setShowTeamSelector(false);
             } else {
                 setActiveTeamId(mockTeamId);
                 setActiveTeamName("Mock Demo Team");
                 // For demo mode, if no real teams, we MIGHT load mock data here, but listeners handle it better if activeTeamId is mockTeamId
                 setShowTeamSelector(false);
             }
          }
        } else {
          console.warn("[Effect] User document not found in Firestore for UID:", currentUser.uid, ". This may cause issues.");
          const fallbackEmail = currentUser.email || `${currentUser.uid}@example.com`;
          setAppUser({
            id: currentUser.uid,
            name: currentUser.displayName || fallbackEmail.split('@')[0] || 'User',
            email: fallbackEmail,
            avatarUrl: currentUser.photoURL || getGravatarUrl(fallbackEmail, 100)!,
            role: APP_ROLES.MEMBER,
            teamIds: [],
          });
          setUserTeams([]);
          setShowTeamSelector(false);
           if (isDemoMode) {
                setActiveTeamId(mockTeamId);
                setActiveTeamName("Mock Demo Team");
                // Again, listener for mockTeamId handles mock data loading.
           } else {
                setActiveTeamId(null);
                setActiveTeamName(null);
           }
        }
      } catch (error) {
        console.error("[Effect] Error fetching user data or teams:", error);
        toast({ title: "Error Loading Profile", description: "Could not load your profile or team data.", variant: "destructive" });
      } finally {
        console.log("[Effect] Finished fetching initial user data. setIsLoading to false");
        setIsLoading(false);
      }
    };

    fetchInitialUserData();

  }, [currentUser, authLoading, router, toast, isDemoMode]);


  // Subscribe to active team's retro items and poll responses
 useEffect(() => {
    console.log(`[Effect] Dependency change for listeners. isDemoMode: ${isDemoMode}, activeTeamId: ${activeTeamId}, appUser: ${appUser ? appUser.id : 'null'}`);
    if (isDemoMode && activeTeamId === mockTeamId) {
        console.log("[Effect] Demo mode active, using mock data. Clearing listeners if any.");
        // In demo mode, we no longer set mock items here.
        // If you want mock items, they should be added to Firestore under mockTeamId
        // or handled purely in UI state *if* activeTeamId is mockTeamId and NO Firestore listeners are set up.
        // For simplicity and to test persistence, it's often better to populate Firestore for demo.
        // setRetroItems(mockInitialItems);
        // setPollResponses(mockInitialPollResponses);
        // if (appUser) {
        //     const userResponseExists = mockInitialPollResponses.some(resp => resp.author.id === appUser.id);
        //     setHasSubmitted(userResponseExists);
        // } else {
        //     setHasSubmitted(false);
        // }
        // If mockTeamId is a real Firestore ID, let listeners below handle it.
        // If it's purely for UI mock data, then the Firestore listeners should NOT run.
        // Assuming mockTeamId is NOT a real Firestore ID if demo mode is on, we would return.
        // However, if mockTeamId IS a real Firestore path, we let the listeners run.
        // Current setup assumes mockTeamId is for demo UI state only if we return here.
        // Let's assume for now if isDemoMode AND activeTeamId is mockTeamId, we DO NOT set up listeners.
        // This part needs careful consideration based on how demo mode data is managed.
        // For this iteration, we'll let listeners try to run if activeTeamId is set, even in demo mode.
        // A more robust demo mode would have its own Firestore data or completely separate logic.
    }

    if (!activeTeamId || !appUser) {
      console.log("[Effect] No active REAL team or appUser, clearing retro/poll data. Active Team ID:", activeTeamId, "App User:", appUser ? appUser.id : 'none');
      setRetroItems([]);
      setPollResponses([]);
      setHasSubmitted(false);
      return; // Exit if no active team or user
    }
    console.log(`[Effect] Active team ID: ${activeTeamId}. Setting up listeners for retro items and poll responses.`);

    // Listener for Retro Items
    const retroItemsQuery = query(collection(db, `teams/${activeTeamId}/retroItems`));
    const unsubscribeRetroItems = onSnapshot(retroItemsQuery, (snapshot) => {
        const items: RetroItem[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            items.push({
                id: doc.id,
                ...data,
                timestamp: (data.timestamp as FBTimestamp)?.toDate ? (data.timestamp as FBTimestamp).toDate() : new Date(data.timestamp || Date.now()), // Ensure timestamp is Date
                replies: (data.replies || []).map((reply: any) => ({
                    ...reply,
                    id: reply.id || Math.random().toString(36).substring(2,9), // Ensure reply has an ID for key prop
                    timestamp: (reply.timestamp as FBTimestamp)?.toDate ? (reply.timestamp as FBTimestamp).toDate() : new Date(reply.timestamp || Date.now()),
                }))
            } as RetroItem);
        });
        console.log(`[Effect] Retro items updated for team ${activeTeamId}:`, items.length, "items");
        setRetroItems(items);
    }, (error) => {
        console.error(`[Effect] Error fetching retro items for team ${activeTeamId}:`, error);
        toast({ title: "Error", description: "Could not load retrospective items.", variant: "destructive" });
    });

    // Listener for Poll Responses
    const pollResponsesQuery = query(collection(db, `teams/${activeTeamId}/pollResponses`));
    const unsubscribePollResponses = onSnapshot(pollResponsesQuery, (snapshot) => {
        const responses: PollResponse[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            responses.push({
                id: doc.id,
                ...data,
                 timestamp: (data.timestamp as FBTimestamp)?.toDate ? (data.timestamp as FBTimestamp).toDate() : new Date(data.timestamp || Date.now()) // Ensure timestamp is Date
            } as PollResponse);
        });
        console.log(`[Effect] Poll responses updated for team ${activeTeamId}:`, responses.length, "responses");
        setPollResponses(responses);
        const userResponseExists = responses.some(resp => resp.author.id === appUser.id);
        console.log(`[Effect] User ${appUser.id} has submitted poll for team ${activeTeamId}:`, userResponseExists);
        setHasSubmitted(userResponseExists);
    }, (error) => {
        console.error(`[Effect] Error fetching poll responses for team ${activeTeamId}:`, error);
        toast({ title: "Error", description: "Could not load poll responses.", variant: "destructive" });
    });

    return () => {
        console.log(`[Effect Cleanup] Unsubscribing from retro items and poll responses for team ${activeTeamId}.`);
        unsubscribeRetroItems();
        unsubscribePollResponses();
    };
}, [activeTeamId, appUser, toast, isDemoMode]); // Added isDemoMode to dependencies


  // Recalculate hasSubmitted if pollResponses change
  useEffect(() => {
     if (!appUser || !activeTeamId || (isDemoMode && activeTeamId === mockTeamId)) return;
    const userResponseExists = pollResponses.some(resp => resp.author.id === appUser.id);
    setHasSubmitted(userResponseExists);
    console.log(`[Effect] Poll responses changed. User ${appUser.id} has submitted for team ${activeTeamId}:`, userResponseExists);
  }, [pollResponses, appUser, activeTeamId, isDemoMode]);


  // Memoize the current user's response for editing and rating adjustment
  const currentUserResponse = useMemo(() => {
     if (!appUser || !activeTeamId) return undefined;
    const response = pollResponses.find(resp => resp.author.id === appUser.id);
    console.log(`[Memo] currentUserResponse for user ${appUser.id} in team ${activeTeamId}:`, response ? response.id : 'none');
    return response;
  }, [pollResponses, appUser, activeTeamId]);


  // Derived state for showing poll/results
  const shouldShowResults = useMemo(() => {
    const show = !isEditingPoll && hasSubmitted;
    console.log(`[Memo] shouldShowResults: ${show} (isEditingPoll: ${isEditingPoll}, hasSubmitted: ${hasSubmitted})`);
    return show;
  }, [hasSubmitted, isEditingPoll]);

  const shouldShowPollForm = useMemo(() => {
      const show = !hasSubmitted || isEditingPoll;
      console.log(`[Memo] shouldShowPollForm: ${show} (hasSubmitted: ${hasSubmitted}, isEditingPoll: ${isEditingPoll})`);
      return show;
  }, [hasSubmitted, isEditingPoll]);


  // Function to remove existing AI-generated items for a specific poll response
  const removeExistingPollItems = useCallback(async (responseId: string) => {
       if (!activeTeamId || (isDemoMode && activeTeamId === mockTeamId)) return; // Don't modify Firestore in demo mode
       console.log(`[Callback] removeExistingPollItems for responseId ${responseId} in team ${activeTeamId}`);
      try {
        const itemsToRemoveQuery = query(
            collection(db, `teams/${activeTeamId}/retroItems`),
            where("pollResponseId", "==", responseId)
        );
        const itemsSnapshot = await getFirestoreDocs(itemsToRemoveQuery);
        const batch = writeBatch(db);
        itemsSnapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`[Callback] Successfully removed ${itemsSnapshot.size} existing poll items from Firestore for responseId ${responseId}.`);
      } catch (error) {
        console.error(`[Callback] Error removing existing poll items from Firestore for responseId ${responseId}:`, error);
        toast({ title: "Error", description: "Could not clean up previous feedback items.", variant: "destructive" });
      }
  }, [activeTeamId, toast, isDemoMode]);


  const processJustification = useCallback(async (rating: number, justification: string, responseId: string) => {
      if (!appUser || !activeTeamId) {
        console.warn("[Callback] processJustification: appUser or activeTeamId missing.");
        return;
      }
      if (isDemoMode && activeTeamId === mockTeamId) {
          console.log("[Callback] Demo mode: Skipping Firestore for processJustification.");
          // If demo mode means pure UI state, you'd manipulate local `retroItems` here.
          // But for persistence test, this path should ideally not be hit if demo mode uses Firestore.
          return;
      }

       console.log(`[Callback] processJustification for responseId ${responseId}, rating ${rating}, team ${activeTeamId}`);
       await removeExistingPollItems(responseId);
       const author = appUser;

      if (!justification.trim()) {
           if (!isEditingPoll || (isEditingPoll && !currentUserResponse?.justification)) {
             const category = rating >= 4 ? 'well' : rating <= 2 ? 'improve' : 'discuss';
             const newItemContent = `Rated ${rating} stars.`;
             const newItemRef = await addDoc(collection(db, `teams/${activeTeamId}/retroItems`), {
                 pollResponseId: responseId,
                 author: { id: author.id, name: author.name, email: author.email, avatarUrl: author.avatarUrl, role: author.role },
                 content: newItemContent,
                 timestamp: serverTimestamp(),
                 category: category,
                 isFromPoll: true,
                 teamId: activeTeamId,
             });
              console.log(`[Callback] Added rating-only item to Firestore with ID: ${newItemRef.id}`);
             toast({
                 title: isEditingPoll ? "Feedback Updated" : "Feedback Added",
                 description: `Your rating was added to "${category === 'well' ? 'What Went Well' : category === 'improve' ? 'What Could Be Improved' : 'Discussion Topics'}".`,
             });
           } else {
                console.log("[Callback] Justification cleared during edit. No new 'Rated X stars' item added.");
                toast({
                    title: "Justification Cleared",
                    description: "Your previous justification text has been removed.",
                });
           }
          return;
      }

      try {
          const categorizedSentences = await categorizeJustification({ rating, justification });
          console.log("[Callback] Categorized sentences from AI:", categorizedSentences);

          if (categorizedSentences && categorizedSentences.length > 0) {
            const batch = writeBatch(db);
            categorizedSentences.forEach((categorizedSentence) => {
                const newItemDocRef = doc(collection(db, `teams/${activeTeamId}/retroItems`));
                batch.set(newItemDocRef, {
                    pollResponseId: responseId,
                    author: { id: author.id, name: author.name, email: author.email, avatarUrl: author.avatarUrl, role: author.role },
                    content: categorizedSentence.sentence,
                    timestamp: serverTimestamp(),
                    category: categorizedSentence.category,
                    isFromPoll: true,
                    teamId: activeTeamId,
                });
            });
            await batch.commit();
            console.log(`[Callback] Added ${categorizedSentences.length} categorized items to Firestore.`);

            const wellCount = categorizedSentences.filter(item => item.category === 'well').length;
            const improveCount = categorizedSentences.filter(item => item.category === 'improve').length;
            let description = "Your feedback was processed.";
            if (wellCount > 0 && improveCount > 0) {
                description = `Added ${wellCount} item(s) to 'What Went Well' and ${improveCount} item(s) to 'What Could Be Improved'.`;
            } else if (wellCount > 0) {
                 description = `Added ${wellCount} item(s) to 'What Went Well'.`;
            } else if (improveCount > 0) {
                 description = `Added ${improveCount} item(s) to 'What Could Be Improved'.`;
            }
             toast({ title: isEditingPoll ? "Feedback Updated" : "Feedback Categorized", description });
          } else if (justification.trim()) {
             const newItemRef = await addDoc(collection(db, `teams/${activeTeamId}/retroItems`), {
               pollResponseId: responseId,
               author: { id: author.id, name: author.name, email: author.email, avatarUrl: author.avatarUrl, role: author.role },
               content: justification,
               timestamp: serverTimestamp(),
               category: 'discuss',
               isFromPoll: true,
               teamId: activeTeamId,
             });
             console.log(`[Callback] Added full justification as 'discuss' item to Firestore with ID: ${newItemRef.id}`);
             toast({ title: isEditingPoll ? "Feedback Updated" : "Feedback Added", description: "Your feedback couldn't be auto-categorized by sentence, added to 'Discussion Topics'." });
          }
      } catch (error) {
          console.error("[Callback] Error processing justification with AI:", error);
          toast({ title: "Categorization Error", description: "Could not automatically categorize your feedback. Added to 'Discussion Topics'.", variant: "destructive" });
           const newItemRef = await addDoc(collection(db, `teams/${activeTeamId}/retroItems`), {
               pollResponseId: responseId,
               author: { id: author.id, name: author.name, email: author.email, avatarUrl: author.avatarUrl, role: author.role },
               content: justification,
               timestamp: serverTimestamp(),
               category: 'discuss',
               isFromPoll: true,
               teamId: activeTeamId,
           });
           console.log(`[Callback] Added fallback 'discuss' item to Firestore due to AI error. ID: ${newItemRef.id}`);
      }
  }, [appUser, activeTeamId, removeExistingPollItems, toast, isEditingPoll, isDemoMode, currentUserResponse]); // Removed retroItems dependency


  const handlePollSubmit = useCallback(async (rating: number, justification: string) => {
     if (!appUser || !activeTeamId) {
        console.warn("[Callback] handlePollSubmit: appUser or activeTeamId missing.");
        return;
     }
     console.log(`[Callback] handlePollSubmit for team ${activeTeamId}. Rating: ${rating}, Editing: ${isEditingPoll}`);

      if (isDemoMode && activeTeamId === mockTeamId) {
          console.log("[Callback] Demo mode: Simulating poll submit.");
          // No Firestore interaction in pure UI demo mode
          // Logic to update local state (pollResponses, retroItems) would go here if needed for demo.
          // For now, assuming demo mode might use a "real" mockTeamId in Firestore.
          return;
      }

    let responseId: string;

    if (isEditingPoll && currentUserResponse) { // Check currentUserResponse for existing ID
        responseId = currentUserResponse.id;
        const responseDocRef = doc(db, `teams/${activeTeamId}/pollResponses`, responseId);
        await updateDoc(responseDocRef, {
            rating,
            justification,
            timestamp: serverTimestamp(),
        });
        console.log(`[Callback] Updated poll response ${responseId} in Firestore.`);
        toast({ title: "Poll Response Updated", description: "Your sentiment feedback has been updated." });
    } else {
        const newResponseRef = await addDoc(collection(db, `teams/${activeTeamId}/pollResponses`), {
            author: { id: appUser.id, name: appUser.name, email: appUser.email, avatarUrl: appUser.avatarUrl, role: appUser.role },
            rating,
            justification,
            timestamp: serverTimestamp(),
            teamId: activeTeamId,
        });
        responseId = newResponseRef.id;
        console.log(`[Callback] Added new poll response ${responseId} to Firestore.`);
        toast({ title: "Poll Response Submitted", description: "Thank you for your feedback!" });
    }
    setHasSubmitted(true); // This will be updated by the listener, but good to set optimistically
    processJustification(rating, justification, responseId);
    setIsEditingPoll(false);
  }, [appUser, activeTeamId, isEditingPoll, processJustification, toast, isDemoMode, currentUserResponse]); // Removed pollResponses dependency

  const handleEditPoll = useCallback(() => {
    console.log("[Callback] handleEditPoll triggered.");
    setIsEditingPoll(true);
  }, []);

  const handleCancelEditPoll = useCallback(() => {
    console.log("[Callback] handleCancelEditPoll triggered.");
    setIsEditingPoll(false);
    toast({ title: "Edit Cancelled", description: "Your vote remains unchanged." });
  }, [toast]);


  const handleAddItem = useCallback(async (category: Category) => async (content: string) => {
     if (!appUser || !activeTeamId) {
        console.warn("[Callback] handleAddItem: appUser or activeTeamId missing.");
        return;
     }
     if (isDemoMode && activeTeamId === mockTeamId) {
         console.log(`[Callback] Demo mode: Simulating add item to ${category}.`);
         // No Firestore interaction
         return;
     }

     console.log(`[Callback] handleAddItem to category ${category} for team ${activeTeamId}. Content: ${content.substring(0,20)}...`);
    const newItemRef = await addDoc(collection(db, `teams/${activeTeamId}/retroItems`), {
      author: { id: appUser.id, name: appUser.name, email: appUser.email, avatarUrl: appUser.avatarUrl, role: appUser.role },
      content,
      timestamp: serverTimestamp(),
      category,
      isFromPoll: false,
      teamId: activeTeamId,
    });
    console.log(`[Callback] Added new retro item ${newItemRef.id} to Firestore.`);
     toast({
        title: "Item Added",
        description: `Your item was added to "${category === 'discuss' ? 'Discussion Topics' : category === 'action' ? 'Action Items' : category === 'well' ? 'What Went Well' : 'What Could Be Improved'}".`,
      });
  }, [appUser, activeTeamId, toast, isDemoMode]);

  const handleEditItem = useCallback(async (itemId: string, newContent: string) => {
    if (!appUser || !activeTeamId) {
        console.warn("[Callback] handleEditItem: appUser or activeTeamId missing.");
        return;
    }
    if (isDemoMode && activeTeamId === mockTeamId) {
        console.log(`[Callback] Demo mode: Simulating edit item ${itemId}.`);
        // No Firestore interaction
        return;
    }

    console.log(`[Callback] handleEditItem for item ${itemId}, new content: ${newContent.substring(0,20)}...`);
    const itemRef = doc(db, `teams/${activeTeamId}/retroItems`, itemId);
    const itemDoc = await getDoc(itemRef);

    if (!itemDoc.exists()) {
        toast({ title: "Error", description: "Item not found.", variant: "destructive" });
        return;
    }
    const itemData = itemDoc.data();
    const canEdit = itemData.author.id === appUser.id || appUser.role === APP_ROLES.ADMIN;

    if (!canEdit) {
        toast({ title: "Cannot Edit", description: "You don't have permission to edit this item.", variant: "destructive" });
        return;
    }
    await updateDoc(itemRef, {
        content: newContent,
        timestamp: serverTimestamp(), // Update timestamp on edit
    });
    console.log(`[Callback] Updated retro item ${itemId} in Firestore.`);
    toast({ title: "Item Updated", description: "Changes saved." });
  }, [appUser, activeTeamId, toast, isDemoMode]);

  const handleGenerateActionItem = useCallback(async (discussionItemId: string) => {
      if (!appUser || !activeTeamId) {
        console.warn("[Callback] handleGenerateActionItem: appUser or activeTeamId missing.");
        return;
      }
      if (isDemoMode && activeTeamId === mockTeamId) {
          console.log(`[Callback] Demo mode: Simulating generate action item from ${discussionItemId}.`);
          // No Firestore interaction
          return;
      }
      console.log(`[Callback] handleGenerateActionItem for discussion item ${discussionItemId} in team ${activeTeamId}`);
      // Find item from Firestore-synced retroItems state
      const discussionItem = retroItems.find(item => item.id === discussionItemId);
      if (!discussionItem || discussionItem.category !== 'discuss') {
          toast({ title: "Error", description: "Could not find the discussion topic or it's not a discussion item.", variant: "destructive" });
          return;
      }
      const canGenerate = discussionItem.author.id === appUser.id || appUser.role === APP_ROLES.ADMIN;
       if (!canGenerate) {
            toast({ title: "Permission Denied", description: "Only the author or an admin can generate an action item from this discussion.", variant: "destructive" });
            return;
        }
      toast({ title: "Generating Action Item...", description: "Please wait." });
      try {
          const { actionItem: generatedContent } = await generateActionItem({ discussionTopic: discussionItem.content });
          const newActionItemRef = await addDoc(collection(db, `teams/${activeTeamId}/retroItems`), {
              author: { id: appUser.id, name: appUser.name, email: appUser.email, avatarUrl: appUser.avatarUrl, role: appUser.role },
              content: generatedContent,
              timestamp: serverTimestamp(),
              category: 'action',
              isFromPoll: false,
              teamId: activeTeamId,
          });
          console.log(`[Callback] Generated action item ${newActionItemRef.id} in Firestore.`);
          toast({ title: "Action Item Created", description: `Generated action item: "${generatedContent}"` });
      } catch (error) {
          console.error("[Callback] Error generating action item with AI:", error);
          toast({ title: "Action Item Generation Failed", description: "Could not generate an action item.", variant: "destructive" });
      }
  }, [retroItems, appUser, activeTeamId, toast, isDemoMode]); // Depend on Firestore-synced retroItems


  const handleAddReply = useCallback(async (itemId: string, replyContent: string) => {
     if (!appUser || !activeTeamId) {
        console.warn("[Callback] handleAddReply: appUser or activeTeamId missing.");
        return;
     }
     if (isDemoMode && activeTeamId === mockTeamId) {
         console.log(`[Callback] Demo mode: Simulating add reply to ${itemId}.`);
         // No Firestore interaction
         return;
     }
     console.log(`[Callback] handleAddReply to item ${itemId} in team ${activeTeamId}. Reply: ${replyContent.substring(0,20)}...`);
    const itemRef = doc(db, `teams/${activeTeamId}/retroItems`, itemId);
    const itemDoc = await getDoc(itemRef);
    if (!itemDoc.exists()) {
        toast({ title: "Error", description: "Parent item not found.", variant: "destructive" });
        return;
    }
    const parentItemData = itemDoc.data();
    const newReplyId = doc(collection(db, `teams/${activeTeamId}/retroItems`)).id; // This creates a new ID, but doesn't write a doc.

    const newReply: Omit<RetroItem, 'teamId' | 'id'> & { id: string; timestamp: any} = { // reply is not a full RetroItem, simpler structure
      id: newReplyId, // Use a generated ID for key purposes
      author: { id: appUser.id, name: appUser.name, email: appUser.email, avatarUrl: appUser.avatarUrl, role: appUser.role },
      content: replyContent,
      timestamp: serverTimestamp(), // Use serverTimestamp for consistency
      isFromPoll: false, // Replies are not from polls
      category: parentItemData.category, // Replies inherit category
    };
    await updateDoc(itemRef, {
        replies: [...(parentItemData.replies || []), newReply] // Append to existing replies array
    });
    console.log(`[Callback] Added reply to item ${itemId} in Firestore.`);
    toast({ title: "Reply Added" });
  }, [appUser, activeTeamId, toast, isDemoMode]);

   const handleDeleteItem = useCallback(async (itemId: string) => {
     if (!appUser || !activeTeamId) {
        console.warn("[Callback] handleDeleteItem: appUser or activeTeamId missing.");
        return;
     }
     if (isDemoMode && activeTeamId === mockTeamId) {
         console.log(`[Callback] Demo mode: Simulating delete item ${itemId}.`);
         // No Firestore interaction
         return;
     }
     console.log(`[Callback] handleDeleteItem ${itemId} in team ${activeTeamId}`);
     const itemRef = doc(db, `teams/${activeTeamId}/retroItems`, itemId);
     const itemDoc = await getDoc(itemRef);
     if (!itemDoc.exists()) {
        toast({ title: "Error", description: "Item not found.", variant: "destructive" });
        return;
     }
     const itemData = itemDoc.data();
     const canDelete = itemData.author.id === appUser.id || appUser.role === APP_ROLES.ADMIN;
     if (!canDelete) {
          toast({ title: "Cannot Delete", description: "You don't have permission to delete this item.", variant: "destructive" });
          return;
     }
     if (itemData.isFromPoll && itemData.author.id === appUser.id && !isEditingPoll && appUser.role !== APP_ROLES.ADMIN) {
         toast({ title: "Cannot Delete Poll Item", description: "Edit your poll response to change items derived from it, or delete the entire response.", variant: "destructive" });
         return;
     }
     await deleteDoc(itemRef);
     console.log(`[Callback] Deleted retro item ${itemId} from Firestore.`);
    toast({ title: "Item Deleted", variant: "default" }); // Changed to default variant
   }, [appUser, activeTeamId, isEditingPoll, toast, isDemoMode]);


   const handleDragStart = useCallback((itemId: string) => {
    console.log(`[Callback] handleDragStart for item ${itemId}`);
    // Find item from Firestore-synced retroItems state
    const item = retroItems.find(i => i.id === itemId);
      if (item && (item.author.id === appUser?.id || appUser?.role === APP_ROLES.ADMIN)) {
         setDraggingItemId(itemId);
     } else {
         setDraggingItemId(null);
         console.log("[Callback] Drag prevented: Not owner or admin.");
     }
   }, [retroItems, appUser]); // Depend on Firestore-synced retroItems


   const handleDragEnd = useCallback(() => {
      console.log("[Callback] handleDragEnd.");
      setDraggingItemId(null);
   }, []);

    const handleMoveItem = useCallback(async (itemId: string, targetCategory: Category) => {
        if (!appUser || !activeTeamId) {
             console.warn("[Callback] handleMoveItem: appUser or activeTeamId missing.");
             return;
        }
         if (isDemoMode && activeTeamId === mockTeamId) {
            console.log(`[Callback] Demo mode: Simulating move item ${itemId} to ${targetCategory}.`);
             // No Firestore interaction
             setDraggingItemId(null);
             return;
        }
        console.log(`[Callback] handleMoveItem ${itemId} to category ${targetCategory} in team ${activeTeamId}`);
        // Find item from Firestore-synced retroItems state
        const itemToMove = retroItems.find(item => item.id === itemId);
        if (!itemToMove) {
            toast({ title: "Move Error", description: "Item not found.", variant: "destructive" });
            setDraggingItemId(null);
            return;
        }
         const canMove = itemToMove.author.id === appUser.id || appUser.role === APP_ROLES.ADMIN;
         if (!canMove) {
             toast({ title: "Cannot Move Item", description: "You don't have permission to move this item.", variant: "destructive" });
             setDraggingItemId(null);
             return;
         }

        if (itemToMove.category === targetCategory) {
            setDraggingItemId(null);
            return;
        }

        if (targetCategory === 'action') {
            if (itemToMove.category === 'discuss') {
                handleGenerateActionItem(itemId); // This will create a new item in Firestore
            } else {
                 toast({ title: "Cannot Move to Action Items", description: "Action Items can only be generated from Discussion Topics or added manually.", variant: "destructive" });
            }
            setDraggingItemId(null);
            return;
        }

        const itemRef = doc(db, `teams/${activeTeamId}/retroItems`, itemId);
        await updateDoc(itemRef, {
            category: targetCategory,
            timestamp: serverTimestamp(),
        });
        console.log(`[Callback] Moved retro item ${itemId} to category ${targetCategory} in Firestore.`);

         toast({ title: "Item Moved", description: `Item moved to "${targetCategory === 'discuss' ? 'Discussion Topics' : targetCategory === 'well' ? 'What Went Well' : 'What Could Be Improved'}".` });

         const isWellToImprove = itemToMove.category === 'well' && targetCategory === 'improve';
         const isImproveToWell = itemToMove.category === 'improve' && targetCategory === 'well';
         const userIsAuthor = itemToMove.author.id === appUser.id;
         // Find current user's response from Firestore-synced pollResponses state
         const userCurrentResponseFromState = pollResponses.find(resp => resp.author.id === appUser.id);


         if ((isWellToImprove || isImproveToWell) && userIsAuthor && userCurrentResponseFromState) {
             const suggestedRating = isWellToImprove
                 ? Math.max(1, userCurrentResponseFromState.rating - 1)
                 : Math.min(5, userCurrentResponseFromState.rating + 1);
             if (suggestedRating !== userCurrentResponseFromState.rating) {
                setRatingAdjustmentProps({ itemIdToAdjust: itemId, currentRating: userCurrentResponseFromState.rating, suggestedRating });
                setIsAdjustRatingModalOpen(true);
             }
         }
         setDraggingItemId(null);
    }, [appUser, activeTeamId, retroItems, pollResponses, toast, handleGenerateActionItem, isDemoMode]); // Depend on Firestore-synced states


    const handleAdjustRatingConfirm = useCallback(async (newRating: number) => {
        if (!currentUserResponse || !appUser || !activeTeamId) {
             console.warn("[Callback] handleAdjustRatingConfirm: Missing context (currentUserResponse, appUser, or activeTeamId).");
             setIsAdjustRatingModalOpen(false);
             setRatingAdjustmentProps(null);
             return;
        }
        if (isDemoMode && activeTeamId === mockTeamId) {
            console.log(`[Callback] Demo mode: Simulating adjust rating to ${newRating}.`);
            // No Firestore interaction
            setIsAdjustRatingModalOpen(false);
            setRatingAdjustmentProps(null);
            return;
        }
        console.log(`[Callback] handleAdjustRatingConfirm for team ${activeTeamId}. New rating: ${newRating}`);
        const responseDocRef = doc(db, `teams/${activeTeamId}/pollResponses`, currentUserResponse.id);
        await updateDoc(responseDocRef, {
            rating: newRating,
            timestamp: serverTimestamp(),
        });
        console.log(`[Callback] Updated poll response rating to ${newRating} in Firestore.`);
        toast({ title: "Rating Adjusted", description: `Your sentiment rating updated to ${newRating} stars.` });
        setIsAdjustRatingModalOpen(false);
        setRatingAdjustmentProps(null);
    }, [currentUserResponse, appUser, activeTeamId, toast, isDemoMode]);

    const handleAdjustRatingCancel = useCallback(() => {
         console.log("[Callback] handleAdjustRatingCancel.");
         if (ratingAdjustmentProps) {
             toast({ title: "Item Moved, Rating Unchanged", description: `Item moved, but sentiment rating kept at ${ratingAdjustmentProps.currentRating} stars.` });
         }
        setIsAdjustRatingModalOpen(false);
        setRatingAdjustmentProps(null);
    }, [toast, ratingAdjustmentProps]);


  const filterItems = (category: Category) => {
    const filtered = retroItems.filter(item => item.category === category)
                               .sort((a, b) => {
                                 const tsA = a.timestamp instanceof FBTimestamp ? a.timestamp.toMillis() : new Date(a.timestamp).getTime();
                                 const tsB = b.timestamp instanceof FBTimestamp ? b.timestamp.toMillis() : new Date(b.timestamp).getTime();
                                 return tsB - tsA;
                               });
    return filtered;
  };

    const handleLogout = async () => {
        console.log("[Callback] handleLogout triggered.");
        try {
            await signOut(auth);
            toast({ title: "Logged Out", description: "You have been successfully logged out." });
            setActiveTeamId(null);
            setActiveTeamName(null);
            setAppUser(null);
            setUserTeams([]);
            localStorage.removeItem('activeTeamId');
            localStorage.removeItem('activeTeamName');
            router.push('/login');
        } catch (error) {
            console.error("[Callback] Logout error:", error);
            toast({ title: "Logout Failed", description: "Could not log you out. Please try again.", variant: "destructive" });
        }
    };

    const handleSelectTeam = (teamId: string) => {
        console.log(`[Callback] handleSelectTeam: ${teamId}`);
        const selectedTeam = userTeams.find(t => t.id === teamId);
        if (selectedTeam) {
            setActiveTeamId(selectedTeam.id);
            setActiveTeamName(selectedTeam.name);
            setShowTeamSelector(false);
            localStorage.setItem('activeTeamId', selectedTeam.id);
            localStorage.setItem('activeTeamName', selectedTeam.name);
        }
    };

    const handleChangeTeam = () => {
        console.log("[Callback] handleChangeTeam triggered.");
        setShowTeamSelector(true);
        setActiveTeamId(null);
        setActiveTeamName(null);
        setRetroItems([]);
        setPollResponses([]);
        localStorage.removeItem('activeTeamId');
        localStorage.removeItem('activeTeamName');
    };


  if (isLoading || authLoading || !appUser) {
    console.log("[Render] Showing loading screen. isLoading:", isLoading, "authLoading:", authLoading, "appUser:", appUser ? appUser.id : 'none');
    return (
      <div className="container mx-auto p-4 md:p-8 max-w-screen-2xl">
        <header className="mb-8 flex justify-between items-center">
             <h1 className="text-3xl font-bold text-primary">RetroSpectify</h1>
             <div className="flex items-center space-x-3">
                  <Skeleton className="h-10 w-24 rounded-md" />
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-10 w-24 rounded-md" />
             </div>
        </header>
         <div className="flex justify-center items-center h-[calc(100vh-200px)]">
             <Loader2 className="h-16 w-16 animate-spin text-primary" />
         </div>
         <Toaster />
      </div>
    );
  }

  if (showTeamSelector && !isDemoMode && userTeams.length > 0) {
    console.log("[Render] Showing TeamSelector. User teams:", userTeams.length);
    return (
        <div className="container mx-auto p-4 md:p-8 max-w-screen-2xl">
             <header className="mb-8 flex justify-between items-center flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold text-primary">RetroSpectify</h1>
                </div>
                <div className="flex items-center space-x-3">
                     <Link href="/me" passHref>
                        <div className="flex items-center space-x-2 cursor-pointer hover:bg-secondary p-1 rounded-md transition-colors">
                            <span className="text-sm font-medium hidden sm:inline">{appUser.name}</span>
                            <Avatar>
                                <AvatarImage src={appUser.avatarUrl} alt={appUser.name} data-ai-hint="avatar profile picture"/>
                                <AvatarFallback>{appUser.name.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                        </div>
                     </Link>
                     <Button variant="outline" size="sm" onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" /> Logout
                     </Button>
                </div>
            </header>
            <Card className="mt-8 shadow-lg border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold text-primary flex items-center">
                    <PackageSearch className="mr-3 h-6 w-6" /> Select a Team
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-muted-foreground">You are a member of multiple teams. Please choose one to proceed:</p>
                    {userTeams.map(team => (
                        <Button key={team.id} variant="outline" className="w-full justify-start" onClick={() => handleSelectTeam(team.id)}>
                            {team.name}
                        </Button>
                    ))}
                     {userTeams.length === 0 && ( // This case should ideally not be hit if showTeamSelector is true based on userTeams.length > 0
                        <p className="text-muted-foreground text-center py-4">You are not part of any teams yet. Contact an admin to be added.</p>
                    )}
                </CardContent>
            </Card>
            <Toaster />
        </div>
    );
  }


  const canInteractWithCurrentTeam = !!activeTeamId && (isDemoMode || (appUser.teamIds || []).includes(activeTeamId));
  console.log(`[Render] Can interact with current team (${activeTeamId}):`, canInteractWithCurrentTeam);
  console.log(`[Render] Current appUser teamIds:`, appUser.teamIds);

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-screen-2xl">
        <header className="mb-8 flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-4">
                <h1 className="text-3xl font-bold text-primary">RetroSpectify</h1>
                {activeTeamName && <span className="text-xl text-muted-foreground">({activeTeamName})</span>}
            </div>
            <div className="flex items-center space-x-3">
                 {userTeams.length > 1 && activeTeamId && !isDemoMode && (
                     <Button variant="outline" size="sm" onClick={handleChangeTeam}>
                         <PackageSearch className="mr-2 h-4 w-4" /> Change Team
                     </Button>
                 )}
                  {/* Show "My Teams" if user has any teams OR is admin (admin can create teams) */}
                  {(userTeams.length > 0 || appUser.role === APP_ROLES.ADMIN) && !isDemoMode && (
                     <Link href="/teams" passHref>
                         <Button variant="outline" size="sm">
                             <Users className="mr-2 h-4 w-4" /> My Teams
                         </Button>
                     </Link>
                 )}
                 {appUser.role === APP_ROLES.ADMIN && !isDemoMode && (
                     <Link href="/admin" passHref>
                         <Button variant="outline" size="sm">
                             <ShieldCheck className="mr-2 h-4 w-4" /> Admin
                         </Button>
                     </Link>
                 )}
                 <Link href="/me" passHref>
                    <div className="flex items-center space-x-2 cursor-pointer hover:bg-secondary p-1 rounded-md transition-colors">
                        <span className="text-sm font-medium hidden sm:inline">{appUser.name}</span>
                        <Avatar>
                            <AvatarImage src={appUser.avatarUrl} alt={appUser.name} data-ai-hint="avatar profile picture"/>
                            <AvatarFallback>{appUser.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                    </div>
                 </Link>
                 <Button variant="outline" size="sm" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                 </Button>
            </div>
        </header>

        {isDemoMode && (
          <Card className="mb-6 bg-yellow-50 border-yellow-300">
            <CardHeader>
              <CardTitle className="text-yellow-700 flex items-center">
                <Info className="mr-2 h-5 w-5" /> Demo Mode Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-yellow-600">
                You are currently in Demo Mode. Data shown is for demonstration purposes and may not reflect real team activity.
                Features related to real-time data persistence are disabled.
              </p>
            </CardContent>
          </Card>
        )}

        {!activeTeamId && !isLoading && !isDemoMode && userTeams.length === 0 && (
             <Card className="mt-8 shadow-lg border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold text-primary flex items-center">
                    <Info className="mr-3 h-6 w-6" /> Welcome to RetroSpectify!
                  </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                       It looks like you&apos;re not part of any team yet.
                    </p>
                    <p className="text-muted-foreground mt-2">
                       Please contact an administrator or a team owner to be added to a team.
                       Once you&apos;re on a team, you&apos;ll be able to participate in retrospectives.
                    </p>
                  {appUser.role === APP_ROLES.ADMIN && (
                    <p className="text-muted-foreground mt-4">
                      As an administrator, you can <Link href="/teams/create" className="text-primary hover:underline">create a new team</Link> or manage existing teams and users.
                    </p>
                  )}
                </CardContent>
              </Card>
        )}


        {activeTeamId && canInteractWithCurrentTeam ? (
            <>
                <div className="mb-6 md:mb-8">
                    {shouldShowPollForm && (
                        <PollSection
                            currentUser={appUser}
                            onSubmitPoll={handlePollSubmit}
                            initialRating={isEditingPoll && currentUserResponse ? currentUserResponse.rating : 0}
                            initialJustification={isEditingPoll && currentUserResponse ? currentUserResponse.justification : ''}
                            isEditing={isEditingPoll}
                            onCancelEdit={handleCancelEditPoll}
                        />
                    )}
                    {shouldShowResults && (
                        <PollResultsSection
                            responses={pollResponses}
                            onEdit={handleEditPoll}
                            currentUserHasVoted={!!currentUserResponse}
                        />
                    )}
                    {!shouldShowPollForm && !shouldShowResults && ( // Case when poll form is hidden (voted) but results also hidden (e.g. not enough votes yet)
                        <Card className="shadow-md border border-input bg-card text-center p-6">
                            <CardDescription>Submit your sentiment in the poll above to see the team results.</CardDescription>
                        </Card>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                    <RetroSection
                        title="What Went Well"
                        category="well"
                        items={filterItems('well')}
                        currentUser={appUser}
                        onAddItem={handleAddItem('well')}
                        onAddReply={handleAddReply}
                        onMoveItem={handleMoveItem}
                        onEditItem={handleEditItem}
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
                        onEditItem={handleEditItem}
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
                        onEditItem={handleEditItem}
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
                        onEditItem={handleEditItem}
                        onDeleteItem={handleDeleteItem}
                        allowAddingItems={true}
                        draggingItemId={draggingItemId}
                        onDragStartItem={handleDragStart}
                        onDragEndItem={handleDragEnd}
                        className="bg-purple-50/50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-700/50"
                        isDropTargetForActionGeneration={true}
                    />
                </div>
            </>
        ) : null }


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
