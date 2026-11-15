import Link from 'next/link';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { SignInForm } from '@/components/SignInForm';

export default async function Home() {
  // Signed-out visitors get a sign-in section right here; signed-in users don't need it.
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
        <section aria-labelledby="home-signin" className="mt-10 w-full max-w-sm">
          <div className="mb-4 text-center">
            <h2 id="home-signin" className="text-2xl font-graffiti text-foreground">
              Sign In
            </h2>
            <p className="mt-1 text-base text-muted-foreground">
              Sign in to enter battles and vote for your favourites.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <SignInForm />
          </div>
        </section>
      )}
    </div>
  );
}
