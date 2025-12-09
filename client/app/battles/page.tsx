'use client';

import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { GET_BATTLES } from '@/lib/graphql/queries';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function BattleCard({ battle }: { battle: any }) {
  const submissionCount = battle.submissions?.length || 0;
  const statusVariantMap: Record<string, 'upcoming' | 'active' | 'voting' | 'completed'> = {
    UPCOMING: 'upcoming',
    ACTIVE: 'active',
    VOTING: 'voting',
    COMPLETED: 'completed',
  };

  const statusVariant = statusVariantMap[battle.status] || 'upcoming';

  return (
    <Link href={`/battles/${battle.id}`} className="block h-full">
      <Card className="h-full hover:border-border transition-all cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-3">
            <CardTitle className="text-lg font-normal">{battle.title}</CardTitle>
            <Badge variant={statusVariant} className="shrink-0">{battle.status}</Badge>
          </div>
          {battle.description && (
            <CardDescription className="line-clamp-2 text-xs mt-2">
              {battle.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-2 text-xs text-muted-foreground">
            <div className="flex gap-4">
              <span>
                Start: {new Date(battle.startDate).toLocaleDateString()}
              </span>
              <span>End: {new Date(battle.endDate).toLocaleDateString()}</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-3">
          <span className="text-xs text-muted-foreground">
            {submissionCount} {submissionCount === 1 ? 'submission' : 'submissions'}
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}

export default function BattlesPage() {
  const { loading, error, data } = useQuery(GET_BATTLES);

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-full p-8">
        <p className="text-muted-foreground">Loading battles...</p>
      </div>
    );

  if (error)
    return (
      <div className="flex items-center justify-center min-h-full p-8">
        <p className="text-destructive">Error loading battles: {error.message}</p>
      </div>
    );

  const battles = data?.battles || [];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold mb-2 text-foreground tracking-tight">
          DJ Battles
        </h1>
        <p className="text-muted-foreground text-sm">
          Compete, submit your sets, and vote for the winners
        </p>
      </div>

      {battles.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-6">No battles yet</p>
          <Button asChild variant="default">
            <Link href="/battles/create">Create First Battle</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {battles.map((battle: any) => (
            <BattleCard key={battle.id} battle={battle} />
          ))}
        </div>
      )}
    </div>
  );
}

