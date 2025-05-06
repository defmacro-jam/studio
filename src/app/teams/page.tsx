
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, PlusCircle, Users, ArrowRight } from 'lucide-react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import type { Team as TeamData } from '@/lib/types';

interface TeamInfo extends Pick<TeamData, 'id' | 'name'> {
  memberCount: number;
  // Add other info you might want to display, e.g., createdAt
}

function TeamsListPageContent() {
  const { currentUser } = useAuth();
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTeams = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        // 1. Get the user's document to find their team IDs
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          console.warn("User document not found, cannot fetch teams.");
          setLoading(false);
          return;
        }

        const userData = userDocSnap.data();
        const teamIds = userData.teams || [];

        if (teamIds.length === 0) {
          setTeams([]);
          setLoading(false);
          return;
        }

        // 2. Fetch details for each team the user is a member of
        const teamsData: TeamInfo[] = [];
        const chunkSize = 30; // Firestore 'in' query limit

        for (let i = 0; i < teamIds.length; i += chunkSize) {
            const chunk = teamIds.slice(i, i + chunkSize);
            if (chunk.length === 0) continue;

            const teamsQuery = query(collection(db, 'teams'), where('__name__', 'in', chunk)); // Use __name__ to query by document ID
            const querySnapshot = await getDocs(teamsQuery);

            querySnapshot.forEach((docSnap) => {
              const data = docSnap.data() as TeamData;
              teamsData.push({
                id: docSnap.id,
                name: data.name,
                memberCount: data.members?.length || 0,
              });
            });
        }

        // Sort teams alphabetically by name
        teamsData.sort((a, b) => a.name.localeCompare(b.name));

        setTeams(teamsData);

      } catch (err: any) {
        console.error('Error fetching teams:', err);
        setError('Failed to load your teams.');
        if (err.code === 'permission-denied') {
          setError('Permission denied. Check Firestore rules.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, [currentUser]);

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-primary flex items-center">
          <Users className="mr-3 h-7 w-7" /> Your Teams
        </h1>
        <Link href="/teams/create" passHref>
          <Button>
            <PlusCircle className="mr-2 h-5 w-5" /> Create New Team
          </Button>
        </Link>
      </header>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4 rounded" />
                <Skeleton className="h-4 w-1/2 rounded mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <Card className="bg-destructive/10 border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && teams.length === 0 && (
        <Card className="text-center py-10">
          <CardHeader>
            <CardTitle>No Teams Yet!</CardTitle>
            <CardDescription>You haven't joined or created any teams.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/teams/create" passHref>
              <Button size="lg">
                <PlusCircle className="mr-2 h-5 w-5" /> Create Your First Team
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {!loading && !error && teams.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => (
            <Card key={team.id} className="hover:shadow-lg transition-shadow duration-200 flex flex-col">
              <CardHeader className="flex-grow">
                <CardTitle className="text-xl">{team.name}</CardTitle>
                <CardDescription>
                  {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={`/teams/${team.id}`} passHref>
                  <Button className="w-full">
                    View Team <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Wrap the content with ProtectedRoute
export default function TeamsListPage() {
  return (
    <ProtectedRoute>
      <TeamsListPageContent />
    </ProtectedRoute>
  );
}
