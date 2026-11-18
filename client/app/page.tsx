import Link from 'next/link';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';

export default async function Home() {
  // Signed-out visitors get a link to the sign-in page; signed-in users don't need it.
  const session = await auth();
  const signedIn = !!session?.user;

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
        <p className="mt-6 text-base text-muted-foreground">
          New here?{' '}
          <Link href="/how-it-works" className="text-amber-500 font-semibold hover:underline">
            See how battles work
          </Link>
        </p>
      </div>

      {!signedIn && (
        <p className="mt-10 text-center text-base">
          <Link href="/auth/signin" className="text-amber-500 font-semibold hover:underline">
            Sign in to enter battles and vote
          </Link>
        </p>
      )}
    </div>
  );
}
