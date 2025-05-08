
"use client";

import { useState, useEffect, useMemo, useCallback, type DragEvent } from 'react';
import { useRouter } from 'next/navigation'; 
import Link from 'next/link'; 
import { signOut } from 'firebase/auth'; 
import { Timestamp as FBTimestamp, doc, getDoc, onSnapshot, collection, query, where, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, getDocs as getFirestoreDocs, arrayUnion } from 'firebase/firestore'; 
import type { RetroItem, PollResponse, User, Category, AppRole, PlainPollResponse, PlainRetroItem, Team } from '@/lib/types'; 
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
import { Card, CardHeader, CardContent, CardFooter, CardDescription, CardTitle } from '@/components/ui/card'; 
import { Button } from '@/components/ui/button'; 
import { Users, LogOut, ShieldCheck, Info, Settings, PackageSearch, Loader2, Send, Star } from 'lucide-react'; 
import ProtectedRoute from '@/components/auth/ProtectedRoute'; 
import { useAuth } from '@/context/AuthContext'; 
import { auth, db } from '@/lib/firebase'; 
import { getGravatarUrl, cn } from '@/lib/utils'; 
import { APP_ROLES, TEAM_ROLES } from '@/lib/types'; 
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateRetroReport } from '@/ai/flows/generate-retro-report';
import { Label } from '@/components/ui/label'; 
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";


function RetroSpectifyPageContent() {
  const { currentUser, loading: authLoading } = useAuth(); 
  const router = useRouter(); 
  const [retroItems, setRetroItems] = useState<RetroItem[]>([]);
  const [pollResponses, setPollResponses] = useState<PollResponse[]>([]);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isEditingPoll, setIsEditingPoll] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [isAdjustRatingModalOpen, setIsAdjustRatingModalOpen] = useState(false);
  const [ratingAdjustmentProps, setRatingAdjustmentProps] = useState<{ itemIdToAdjust: string, currentRating: number; suggestedRating: number } | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [activeTeamName, setActiveTeamName] = useState<string | null>(null);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [showTeamSelector, setShowTeamSelector] = useState(false);

  const [teamDetails, setTeamDetails] = useState<Team | null>(null); 
  const [teamMembersForScrumMasterSelection, setTeamMembersForScrumMasterSelection] = useState<User[]>([]);
  const [selectedNextScrumMasterUid, setSelectedNextScrumMasterUid] = useState<string | null>(null);
  const [isEndingRetro, setIsEndingRetro] = useState(false);
  const [reportHtmlForDisplay, setReportHtmlForDisplay] = useState<string | null>(null);
  const [showReportDisplay, setShowReportDisplay] = useState<boolean>(false);


  const { toast } = useToast();
  console.log("[Page Lifecycle] RetroSpectifyPageContent rendering. Auth loading:", authLoading, "Current user:", currentUser ? currentUser.uid : 'none', "Active Team ID:", activeTeamId);


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
          const userTeamIds = userData.teamIds || []; 
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
          } else { 
            console.log("[Effect] User has no teams.");
            setActiveTeamId(null);
            setActiveTeamName(null);
            setShowTeamSelector(false);
             // Attempt to create or join "Everybody" team if no teams exist
            const everybodyTeamName = "Everybody";
            const teamsRef = collection(db, 'teams');
            const q = query(teamsRef, where("name", "==", everybodyTeamName));
            const querySnapshot = await getFirestoreDocs(q);
            let everybodyTeamId: string;

            if (querySnapshot.empty) {
                console.log("[Effect] 'Everybody' team does not exist, creating it.");
                const newTeamDocRef = doc(teamsRef); // Generate new ID
                everybodyTeamId = newTeamDocRef.id;
                await writeBatch(db)
                    .set(newTeamDocRef, {
                        name: everybodyTeamName,
                        createdAt: serverTimestamp(),
                        createdBy: currentUser.uid,
                        owner: currentUser.uid,
                        members: [currentUser.uid],
                        memberRoles: { [currentUser.uid]: TEAM_ROLES.OWNER },
                        pendingMemberEmails: [],
                        scrumMasterUid: null,
                    })
                    .update(userDocRef, { teamIds: arrayUnion(everybodyTeamId) })
                    .commit();
                console.log(`[Effect] 'Everybody' team created with ID: ${everybodyTeamId} and user added.`);
                setActiveTeamId(everybodyTeamId);
                setActiveTeamName(everybodyTeamName);
                setUserTeams([{ id: everybodyTeamId, name: everybodyTeamName, owner: currentUser.uid, members:[currentUser.uid], memberRoles: { [currentUser.uid]: TEAM_ROLES.OWNER }, createdAt: FBTimestamp.now(), createdBy: currentUser.uid }]);
            } else {
                const everybodyTeamDoc = querySnapshot.docs[0];
                everybodyTeamId = everybodyTeamDoc.id;
                console.log(`[Effect] 'Everybody' team exists with ID: ${everybodyTeamId}.`);
                const everybodyTeamData = everybodyTeamDoc.data() as Team;
                if (!everybodyTeamData.members.includes(currentUser.uid)) {
                    console.log(`[Effect] User not in 'Everybody' team, adding them.`);
                    await writeBatch(db)
                        .update(everybodyTeamDoc.ref, {
                             members: arrayUnion(currentUser.uid),
                             [`memberRoles.${currentUser.uid}`]: TEAM_ROLES.MEMBER // Default to member if joining existing
                        })
                        .update(userDocRef, { teamIds: arrayUnion(everybodyTeamId) })
                        .commit();
                     console.log(`[Effect] User added to 'Everybody' team.`);
                }
                setActiveTeamId(everybodyTeamId);
                setActiveTeamName(everybodyTeamName);
                setUserTeams([ { id: everybodyTeamId, ...everybodyTeamData} ]);
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
          setActiveTeamId(null);
          setActiveTeamName(null);
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

  }, [currentUser, authLoading, router, toast]);


  useEffect(() => {
    if (!activeTeamId) {
      setTeamDetails(null);
      setTeamMembersForScrumMasterSelection([]);
      return;
    }

    const fetchTeamAndMembers = async () => {
      try {
        const teamDocRef = doc(db, 'teams', activeTeamId);
        const teamDocSnap = await getDoc(teamDocRef);
        if (teamDocSnap.exists()) {
          const teamData = { id: teamDocSnap.id, ...teamDocSnap.data() } as Team;
          setTeamDetails(teamData);

          if (teamData.members && teamData.members.length > 0) {
            const memberDetails: User[] = [];
            const memberUIDs = Object.keys(teamData.memberRoles); 
            
            const userChunks: string[][] = [];
            for (let i = 0; i < memberUIDs.length; i += 30) {
                userChunks.push(memberUIDs.slice(i, i + 30));
            }

            for (const chunk of userChunks) {
              if(chunk.length > 0) {
                const usersQuery = query(collection(db, 'users'), where('uid', 'in', chunk));
                const usersSnapshot = await getFirestoreDocs(usersQuery);
                usersSnapshot.forEach(userDoc => {
                  const uData = userDoc.data();
                  memberDetails.push({
                    id: userDoc.id,
                    name: uData.displayName || uData.email?.split('@')[0] || 'User',
                    email: uData.email || 'unknown@example.com',
                    avatarUrl: uData.avatarUrl || getGravatarUrl(uData.email, 100)!,
                    role: uData.role || APP_ROLES.MEMBER, 
                    teamIds: uData.teamIds || [],
                  });
                });
              }
            }
            setTeamMembersForScrumMasterSelection(memberDetails.sort((a, b) => a.name.localeCompare(b.name)));
          } else {
            setTeamMembersForScrumMasterSelection([]);
          }
        } else {
          setTeamDetails(null);
          setTeamMembersForScrumMasterSelection([]);
        }
      } catch (error) {
        console.error("Error fetching team details or members for SM selection:", error);
        toast({ title: "Error", description: "Could not load team information for Scrum Master tools.", variant: "destructive" });
        setTeamDetails(null);
        setTeamMembersForScrumMasterSelection([]);
      }
    };

    fetchTeamAndMembers();
  }, [activeTeamId, toast]);


 useEffect(() => {
    console.log(`[Effect] Dependency change for listeners. activeTeamId: ${activeTeamId}, appUser: ${appUser ? appUser.id : 'null'}`);
    
    if (!activeTeamId || !appUser) {
      console.log("[Effect] No active REAL team or appUser, clearing retro/poll data. Active Team ID:", activeTeamId, "App User:", appUser ? appUser.id : 'none');
      setRetroItems([]);
      setPollResponses([]);
      setHasSubmitted(false);
      return; 
    }
    
    console.log(`[Effect] Active team ID: ${activeTeamId}. Setting up listeners for retro items and poll responses.`);

    const retroItemsCollectionRef = collection(db, `teams/${activeTeamId}/retroItems`);
    const retroItemsQueryRef = query(retroItemsCollectionRef); 

    const unsubscribeRetroItems = onSnapshot(retroItemsQueryRef, (snapshot) => {
        const items: RetroItem[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            items.push({
                id: doc.id,
                ...data,
                timestamp: (data.timestamp as FBTimestamp)?.toDate ? (data.timestamp as FBTimestamp).toDate() : new Date(data.timestamp || Date.now()), 
                replies: (data.replies || []).map((reply: any) => ({
                    ...reply,
                    id: reply.id || Math.random().toString(36).substring(2,9), 
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

    const pollResponsesCollectionRef = collection(db, `teams/${activeTeamId}/pollResponses`);
    const pollResponsesQueryRef = query(pollResponsesCollectionRef); 

    const unsubscribePollResponses = onSnapshot(pollResponsesQueryRef, (snapshot) => {
        const responses: PollResponse[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            responses.push({
                id: doc.id,
                ...data,
                 timestamp: (data.timestamp as FBTimestamp)?.toDate ? (data.timestamp as FBTimestamp).toDate() : new Date(data.timestamp || Date.now()) 
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
}, [activeTeamId, appUser, toast]);


  useEffect(() => {
     if (!appUser || !activeTeamId ) return;
    const userResponseExists = pollResponses.some(resp => resp.author.id === appUser.id);
    setHasSubmitted(userResponseExists);
    console.log(`[Effect] Poll responses changed. User ${appUser.id} has submitted for team ${activeTeamId}:`, userResponseExists);
  }, [pollResponses, appUser, activeTeamId]);


  const currentUserResponse = useMemo(() => {
     if (!appUser || !activeTeamId) return undefined;
    const response = pollResponses.find(resp => resp.author.id === appUser.id);
    console.log(`[Memo] currentUserResponse for user ${appUser.id} in team ${activeTeamId}:`, response ? response.id : 'none');
    return response;
  }, [pollResponses, appUser, activeTeamId]);


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


  const removeExistingPollItems = useCallback(async (responseId: string) => {
       if (!activeTeamId ) {
           return;
        }
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
  }, [activeTeamId, toast]);


  const processJustification = useCallback(async (rating: number, justification: string, responseId: string) => {
      if (!appUser || !activeTeamId) {
        console.warn("[Callback] processJustification: appUser or activeTeamId missing.");
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
            const discussCount = categorizedSentences.filter(item => item.category === 'discuss').length;
            
            let description = "Your feedback was processed.";
            const parts = [];
            if (wellCount > 0) parts.push(`${wellCount} to 'Well'`);
            if (improveCount > 0) parts.push(`${improveCount} to 'Improve'`);
            if (discussCount > 0) parts.push(`${discussCount} to 'Discuss'`);

            if (parts.length > 0) {
                description = `Added ${parts.join(', ')}.`;
            }
             toast({ title: isEditingPoll ? "Feedback Updated" : "Feedback Categorized", description });
          } else if (justification.trim()) {
             const newItemRef = await addDoc(collection(db, `teams/${activeTeamId}/retroItems`), {
               pollResponseId: responseId,
               author: { id: author.id, name: author.name, email: author.email, avatarUrl: author.avatarUrl, role: author.role },
               content: justification,
               timestamp: serverTimestamp(),
               category: 'discuss', // Default to discuss if AI returns nothing but there is justification
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
  }, [appUser, activeTeamId, removeExistingPollItems, toast, isEditingPoll, currentUserResponse]);


  const handlePollSubmit = useCallback(async (rating: number, justification: string) => {
     if (!appUser || !activeTeamId) {
        console.warn("[Callback] handlePollSubmit: appUser or activeTeamId missing.");
        return;
     }
     console.log(`[Callback] handlePollSubmit for team ${activeTeamId}. Rating: ${rating}, Editing: ${isEditingPoll}`);

    let responseId: string;

    if (isEditingPoll && currentUserResponse) { 
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
    setHasSubmitted(true); 
    processJustification(rating, justification, responseId);
    setIsEditingPoll(false);
  }, [appUser, activeTeamId, isEditingPoll, processJustification, toast, currentUserResponse]);

  const handleEditPoll = useCallback(() => {
    console.log("[Callback] handleEditPoll triggered.");
    setIsEditingPoll(true);
  }, []);

  const handleCancelEditPoll = useCallback(() => {
    console.log("[Callback] handleCancelEditPoll triggered.");
    setIsEditingPoll(false);
    toast({ title: "Edit Cancelled", description: "Your vote remains unchanged." });
  }, [toast]);


  const handleAddItem = useCallback(async (category: Category, content: string) => {
     if (!appUser || !activeTeamId) {
        console.warn("[Callback] handleAddItem: appUser or activeTeamId missing.");
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
  }, [appUser, activeTeamId, toast]);

  const handleEditItem = useCallback(async (itemId: string, newContent: string) => {
    if (!appUser || !activeTeamId) {
        console.warn("[Callback] handleEditItem: appUser or activeTeamId missing.");
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
        timestamp: serverTimestamp(), 
    });
    console.log(`[Callback] Updated retro item ${itemId} in Firestore.`);
    toast({ title: "Item Updated", description: "Changes saved." });
  }, [appUser, activeTeamId, toast]);

  const handleGenerateActionItem = useCallback(async (discussionItemId: string) => {
      if (!appUser || !activeTeamId) {
        console.warn("[Callback] handleGenerateActionItem: appUser or activeTeamId missing.");
        return;
      }
      console.log(`[Callback] handleGenerateActionItem for discussion item ${discussionItemId} in team ${activeTeamId}`);
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
  }, [retroItems, appUser, activeTeamId, toast]);


  const handleAddReply = useCallback(async (itemId: string, replyContent: string) => {
     if (!appUser || !activeTeamId) {
        console.warn("[Callback] handleAddReply: appUser or activeTeamId missing.");
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
    const newReplyId = doc(collection(db, `teams/${activeTeamId}/retroItems`)).id; 

    const newReplyObjectForArray: RetroItem = { 
      id: newReplyId, 
      author: { id: appUser.id, name: appUser.name, email: appUser.email, avatarUrl: appUser.avatarUrl, role: appUser.role },
      content: replyContent,
      timestamp: new Date().toISOString(), 
      isFromPoll: false, 
      category: parentItemData.category,
    };
    await updateDoc(itemRef, {
        replies: arrayUnion(newReplyObjectForArray) 
    });
    console.log(`[Callback] Added reply to item ${itemId} in Firestore.`);
    toast({ title: "Reply Added" });
  }, [appUser, activeTeamId, toast]);

  const handleEditReply = useCallback(async (itemId: string, replyId: string, newContent: string) => {
    if (!appUser || !activeTeamId ) {
        toast({ title: "Error", description: "Cannot edit reply in this state.", variant: "destructive" });
        return;
    }
    console.log(`[Callback] handleEditReply for item ${itemId}, reply ${replyId}`);
    const itemRef = doc(db, `teams/${activeTeamId}/retroItems`, itemId);
    const itemDoc = await getDoc(itemRef);

    if (!itemDoc.exists()) {
        toast({ title: "Error", description: "Parent item not found.", variant: "destructive" });
        return;
    }
    const currentItemData = itemDoc.data() as RetroItem;
    const currentReplies = currentItemData.replies || [];
    const replyIndex = currentReplies.findIndex(reply => reply.id === replyId);

    if (replyIndex === -1) {
        toast({ title: "Error", description: "Reply not found.", variant: "destructive" });
        return;
    }

    if (currentReplies[replyIndex].author.id !== appUser.id) {
        toast({ title: "Permission Denied", description: "You can only edit your own replies.", variant: "destructive" });
        return;
    }
     if (replyIndex !== currentReplies.length -1) {
        toast({ title: "Cannot Edit", description: "You can only edit the last reply on an item.", variant: "destructive" });
        return;
    }


    const updatedReplies = currentReplies.map((reply, index) =>
        index === replyIndex ? { ...reply, content: newContent, timestamp: new Date().toISOString() } : reply
    );

    await updateDoc(itemRef, { replies: updatedReplies });
    toast({ title: "Reply Updated" });
}, [appUser, activeTeamId, toast]);

const handleDeleteReply = useCallback(async (itemId: string, replyId: string) => {
    if (!appUser || !activeTeamId ) {
        toast({ title: "Error", description: "Cannot delete reply in this state.", variant: "destructive" });
        return;
    }
    console.log(`[Callback] handleDeleteReply for item ${itemId}, reply ${replyId}`);
    const itemRef = doc(db, `teams/${activeTeamId}/retroItems`, itemId);
    const itemDoc = await getDoc(itemRef);

    if (!itemDoc.exists()) {
        toast({ title: "Error", description: "Parent item not found.", variant: "destructive" });
        return;
    }
    const currentItemData = itemDoc.data() as RetroItem;
    const currentReplies = currentItemData.replies || [];
    const replyIndex = currentReplies.findIndex(reply => reply.id === replyId);

    if (replyIndex === -1) {
        toast({ title: "Error", description: "Reply not found.", variant: "destructive" });
        return;
    }
     if (currentReplies[replyIndex].author.id !== appUser.id) {
        toast({ title: "Permission Denied", description: "You can only delete your own replies.", variant: "destructive" });
        return;
    }
     if (replyIndex !== currentReplies.length -1) {
        toast({ title: "Cannot Delete", description: "You can only delete the last reply on an item.", variant: "destructive" });
        return;
    }

    const updatedReplies = currentReplies.filter(reply => reply.id !== replyId);
    await updateDoc(itemRef, { replies: updatedReplies });
    toast({ title: "Reply Deleted" });
}, [appUser, activeTeamId, toast]);


   const handleDeleteItem = useCallback(async (itemId: string) => {
     if (!appUser || !activeTeamId) {
        console.warn("[Callback] handleDeleteItem: appUser or activeTeamId missing.");
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
    toast({ title: "Item Deleted", variant: "default" }); 
   }, [appUser, activeTeamId, isEditingPoll, toast]);


   const handleDragStart = useCallback((itemId: string) => {
    console.log(`[Callback] handleDragStart for item ${itemId}`);
    const item = retroItems.find(i => i.id === itemId);
      if (item && (item.author.id === appUser?.id || appUser?.role === APP_ROLES.ADMIN)) {
         setDraggingItemId(itemId);
     } else {
         setDraggingItemId(null);
         console.log("[Callback] Drag prevented: Not owner or admin.");
     }
   }, [retroItems, appUser]); 


   const handleDragEnd = useCallback(() => {
      console.log("[Callback] handleDragEnd.");
      setDraggingItemId(null);
   }, []);

    const handleMoveItem = useCallback(async (itemId: string, targetCategory: Category) => {
        if (!appUser || !activeTeamId) {
             console.warn("[Callback] handleMoveItem: appUser or activeTeamId missing.");
             return;
        }
        console.log(`[Callback] handleMoveItem ${itemId} to category ${targetCategory} in team ${activeTeamId}`);
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
                await handleGenerateActionItem(itemId); 
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
    }, [appUser, activeTeamId, retroItems, pollResponses, toast, handleGenerateActionItem]);


    const handleAdjustRatingConfirm = useCallback(async (newRating: number) => {
        if (!currentUserResponse || !appUser || !activeTeamId) {
             console.warn("[Callback] handleAdjustRatingConfirm: Missing context (currentUserResponse, appUser, or activeTeamId).");
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
    }, [currentUserResponse, appUser, activeTeamId, toast]);

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
                                 const tsA = a.timestamp instanceof Date ? a.timestamp.getTime() : (a.timestamp as FBTimestamp)?.toMillis() || 0;
                                 const tsB = b.timestamp instanceof Date ? b.timestamp.getTime() : (b.timestamp as FBTimestamp)?.toMillis() || 0;
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

    const convertTimestampToString = (timestamp: Date | FBTimestamp | string): string => {
        if (timestamp instanceof Date) {
            return timestamp.toISOString();
        }
        if (typeof timestamp === 'string') {
            try {
                return new Date(timestamp).toISOString();
            } catch {
                console.warn("Could not parse timestamp string to Date:", timestamp);
                return new Date().toISOString(); // fallback
            }
        }
        if (timestamp && typeof (timestamp as FBTimestamp).toDate === 'function') {
            return (timestamp as FBTimestamp).toDate().toISOString();
        }
        console.warn("Unexpected timestamp type:", typeof timestamp, timestamp);
        return new Date().toISOString(); // fallback
    };
    
    const convertRetroItemToPlain = (item: RetroItem): PlainRetroItem => {
        return {
            ...item,
            timestamp: convertTimestampToString(item.timestamp),
            replies: item.replies ? item.replies.map(convertRetroItemToPlain) : undefined,
        };
    };

    const convertPollResponseToPlain = (response: PollResponse): PlainPollResponse => {
        return {
            ...response,
            timestamp: convertTimestampToString(response.timestamp),
        };
    };


    const handleEndRetrospectiveOnHomePage = async () => {
        if (!activeTeamId || !teamDetails || !appUser || !selectedNextScrumMasterUid) return;
        if (!(appUser.role === APP_ROLES.ADMIN || teamDetails.scrumMasterUid === appUser.id || teamDetails.owner === appUser.id)) {
            toast({ title: "Permission Denied", description: "Only the Scrum Master, team owner, or an admin can end the retrospective.", variant: "destructive" });
            return;
        }

        setIsEndingRetro(true);
        toast({ title: "Processing Retrospective...", description: "Generating report and preparing data." });

        try {
            const pollResponsesColRef = collection(db, `teams/${activeTeamId}/pollResponses`);
            const retroItemsColRef = collection(db, `teams/${activeTeamId}/retroItems`);

            const pollResponsesSnapshot = await getFirestoreDocs(pollResponsesColRef);
            const pollResponsesData: PollResponse[] = pollResponsesSnapshot.docs.map(d => ({ id: d.id, ...d.data(), teamId: activeTeamId } as PollResponse));

            const retroItemsSnapshot = await getFirestoreDocs(retroItemsColRef);
            const retroItemsData: RetroItem[] = retroItemsSnapshot.docs.map(d => ({ id: d.id, ...d.data(), teamId: activeTeamId } as RetroItem));
            
            const plainPollResponsesData = pollResponsesData.map(convertPollResponseToPlain);
            const plainRetroItemsData = retroItemsData.map(convertRetroItemToPlain);


            const reportInput: Parameters<typeof generateRetroReport>[0] = {
                teamId: teamDetails.id,
                teamName: teamDetails.name,
                pollResponses: plainPollResponsesData,
                retroItems: plainRetroItemsData,
                currentScrumMaster: teamMembersForScrumMasterSelection.find(m => m.id === teamDetails.scrumMasterUid) || null,
                nextScrumMaster: teamMembersForScrumMasterSelection.find(m => m.id === selectedNextScrumMasterUid) || undefined,
            };
            const reportOutput = await generateRetroReport(reportInput);
            
            // Display report on screen instead of emailing
            setReportHtmlForDisplay(reportOutput.reportSummaryHtml);
            setShowReportDisplay(true);
            toast({ title: "Report Generated", description: "Retrospective summary is ready to view.", duration: 7000 });


            const batch = writeBatch(db);
            pollResponsesSnapshot.forEach(doc => batch.delete(doc.ref));
            retroItemsSnapshot.forEach(doc => batch.delete(doc.ref));
            
            if (selectedNextScrumMasterUid && selectedNextScrumMasterUid !== teamDetails.scrumMasterUid) {
                 batch.update(doc(db, 'teams', teamDetails.id), { scrumMasterUid: selectedNextScrumMasterUid });
                 const smUser = teamMembersForScrumMasterSelection.find(m => m.id === selectedNextScrumMasterUid);
                 toast({ title: "Next Scrum Master Set", description: `${smUser ? smUser.name : 'Selected user'} is now the Scrum Master.` });
            } else if (!selectedNextScrumMasterUid && teamDetails.scrumMasterUid) {
                batch.update(doc(db, 'teams', teamDetails.id), { scrumMasterUid: null });
                toast({ title: "Scrum Master Cleared" });
            }


            await batch.commit();
            toast({ title: "Retrospective Data Cleared", description: "Items and votes for this team have been cleared."});

            setSelectedNextScrumMasterUid(null);
            const updatedTeamDocSnap = await getDoc(doc(db, 'teams', activeTeamId));
            if (updatedTeamDocSnap.exists()) {
                setTeamDetails({ id: updatedTeamDocSnap.id, ...updatedTeamDocSnap.data() } as Team);
            }


        } catch (error: any) {
            console.error("Error ending retrospective from home page:", error);
            toast({ title: "Completion Failed", description: error.message || "Could not complete the retrospective.", variant: "destructive" });
        } finally {
            setIsEndingRetro(false);
        }
    };


  if (isLoading || authLoading || !appUser) {
    console.log("[Render] Showing loading screen. isLoading:", isLoading, "authLoading:", authLoading, "appUser:", appUser ? appUser.id : 'none', "Active Team ID:", activeTeamId);
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

  if (showTeamSelector && userTeams.length > 0) {
    console.log("[Render] Showing TeamSelector. User teams:", userTeams.length, "Active Team ID:", activeTeamId);
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
                     {userTeams.length === 0 && ( 
                        <p className="text-muted-foreground text-center py-4">You are not part of any teams yet. Contact an admin to be added.</p>
                    )}
                </CardContent>
            </Card>
            <Toaster />
        </div>
    );
  }


  const canInteractWithCurrentTeam = !!activeTeamId && ((appUser.teamIds || []).includes(activeTeamId));
  console.log(`[Render] Can interact with current team (${activeTeamId}):`, canInteractWithCurrentTeam);
  console.log(`[Render] Current appUser teamIds:`, appUser.teamIds, "Active Team ID:", activeTeamId);

  const isCurrentUserScrumMaster = teamDetails?.scrumMasterUid === appUser.id;


  return (
    <div className="container mx-auto p-4 md:p-8 max-w-screen-2xl">
        <header className="mb-8 flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-4">
                <h1 className="text-3xl font-bold text-primary">RetroSpectify</h1>
                {activeTeamName && <span className="text-xl text-muted-foreground">({activeTeamName})</span>}
            </div>
            <div className="flex items-center space-x-3">
                 {userTeams.length > 1 && activeTeamId && (
                     <Button variant="outline" size="sm" onClick={handleChangeTeam}>
                         <PackageSearch className="mr-2 h-4 w-4" /> Change Team
                     </Button>
                 )}
                  {(appUser.role === APP_ROLES.ADMIN || (userTeams.length > 0 && appUser.teamIds && appUser.teamIds.length > 0 )) ? (
                     <Link href="/teams" passHref>
                         <Button variant="outline" size="sm">
                             <Users className="mr-2 h-4 w-4" /> My Teams
                         </Button>
                     </Link>
                  ) : null}
                 {appUser.role === APP_ROLES.ADMIN && (
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


        {!activeTeamId && !isLoading && userTeams.length === 0 && (
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

        {activeTeamId && teamDetails && (appUser.role === APP_ROLES.ADMIN || teamDetails.scrumMasterUid === appUser.id || teamDetails.owner === appUser.id) && (
            <Accordion type="single" collapsible className="w-full mb-6" defaultValue=''>
                <AccordionItem value="scrum-master-tools" className="border-b-0">
                    <Card className="shadow-md border-accent/30 bg-accent/5">
                         <CardHeader className="pb-2 pt-4 px-6">
                             <AccordionTrigger className="flex-grow p-0 hover:no-underline justify-start w-full">
                                <CardTitle className="text-lg font-semibold text-accent-foreground flex items-center">
                                    <Star className="mr-2 h-5 w-5 text-accent fill-current" /> Scrum Master Tools
                                </CardTitle>
                             </AccordionTrigger>
                             <CardDescription>
                                {teamDetails.scrumMasterUid === appUser.id ? "You are the current Scrum Master." : teamDetails.owner === appUser.id ? "As team owner, you can manage the retrospective." : "As an admin, you can manage the retrospective."}
                             </CardDescription>
                         </CardHeader>
                         <AccordionContent>
                             <CardContent className="space-y-4 pt-2">
                                <div>
                                    <Label htmlFor="nextScrumMaster" className="font-medium">Select Next Scrum Master</Label>
                                    <Select
                                        value={selectedNextScrumMasterUid || "none"}
                                        onValueChange={(value) => setSelectedNextScrumMasterUid(value === "none" ? null : value)}
                                        disabled={isEndingRetro || teamMembersForScrumMasterSelection.length === 0}
                                    >
                                        <SelectTrigger id="nextScrumMaster" className="w-full sm:w-[300px] mt-1">
                                            <SelectValue placeholder="Choose next Scrum Master..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">-- No specific selection (team decides/random) --</SelectItem>
                                            {teamMembersForScrumMasterSelection.map(member => (
                                                <SelectItem key={member.id} value={member.id} disabled={member.id === teamDetails.scrumMasterUid}>
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-6 w-6">
                                                            <AvatarImage src={member.avatarUrl} alt={member.name} data-ai-hint="avatar profile picture"/>
                                                            <AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback>
                                                        </Avatar>
                                                        <span>{member.name} {member.id === teamDetails.scrumMasterUid && "(Current SM)"}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground mt-1">The selected user will be assigned as Scrum Master when the retrospective ends.</p>
                                </div>
                            </CardContent>
                            {selectedNextScrumMasterUid && (
                                <CardFooter className="flex justify-end">
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" disabled={isEndingRetro}>
                                                {isEndingRetro ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                                {isEndingRetro ? "Ending Retro..." : "End Retrospective & Assign SM"}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Confirm End Retrospective</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will generate a report, clear current data, and assign
                                                    <span className="font-semibold"> {teamMembersForScrumMasterSelection.find(m=>m.id === selectedNextScrumMasterUid)?.name || 'the selected user'} </span>
                                                    as the new Scrum Master. Are you sure?
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel onClick={() => setSelectedNextScrumMasterUid(null)} disabled={isEndingRetro}>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleEndRetrospectiveOnHomePage} disabled={isEndingRetro} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                    Yes, End Retrospective
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </CardFooter>
                            )}
                        </AccordionContent>
                    </Card>
                </AccordionItem>
            </Accordion>
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
                    {!shouldShowPollForm && !shouldShowResults && ( 
                        <Card className="shadow-md border border-input bg-card text-center p-6">
                            <CardDescription>Submit your sentiment in the poll above to see the team results.</CardDescription>
                        </Card>
                    )}
                </div>
                
                {pollResponses.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                      <RetroSection
                          title="What Went Well"
                          category="well"
                          items={filterItems('well')}
                          currentUser={appUser}
                          onAddItem={(content) => handleAddItem('well', content)}
                          onAddReply={handleAddReply}
                          onEditReply={handleEditReply}
                          onDeleteReply={handleDeleteReply}
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
                          onAddItem={(content) => handleAddItem('improve', content)}
                          onAddReply={handleAddReply}
                          onEditReply={handleEditReply}
                          onDeleteReply={handleDeleteReply}
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
                          onAddItem={(content) => handleAddItem('discuss', content)}
                          onAddReply={handleAddReply}
                          onEditReply={handleEditReply}
                          onDeleteReply={handleDeleteReply}
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
                          onAddItem={(content) => handleAddItem('action', content)}
                          onAddReply={handleAddReply}
                          onEditReply={handleEditReply}
                          onDeleteReply={handleDeleteReply}
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
                )}
            </>
        ) : null }

         {showReportDisplay && reportHtmlForDisplay && (
            <Dialog open={showReportDisplay} onOpenChange={setShowReportDisplay}>
                <DialogContent className="sm:max-w-[800px]">
                    <DialogHeader>
                        <DialogTitle>Retrospective Report - {activeTeamName || 'Team'}</DialogTitle>
                        <DialogDescription>
                            This is the summary of the completed retrospective.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
                         <div dangerouslySetInnerHTML={{ __html: reportHtmlForDisplay }} className="prose dark:prose-invert max-w-none"/>
                    </ScrollArea>
                    <DialogFooter>
                        <Button onClick={() => setShowReportDisplay(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}


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
