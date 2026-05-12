import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-graffiti mb-4 text-foreground">
          Battle Skratch
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Where DJs battle for glory
        </p>
        <div className="flex gap-3 justify-center">
          <Button asChild size="lg" variant="default">
            <Link href="/battles">View Battles</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/battles/create">Create Battle</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

