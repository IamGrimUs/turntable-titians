import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Navigation() {
  return (
    <nav className="border-b border-border/60 bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xl font-light text-foreground tracking-tight">
            Turntable Titans
          </Link>
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/battles">Battles</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/battles/create">Create Battle</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}

