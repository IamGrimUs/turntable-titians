'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Swords, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const navigation = [
  {
    name: 'Home',
    href: '/',
    icon: Home,
  },
  {
    name: 'Battles',
    href: '/battles',
    icon: Swords,
  },
  {
    name: 'Create Battle',
    href: '/battles/create',
    icon: Plus,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full w-16 flex-col border-r border-border/60 bg-background">
        <div className="flex h-16 items-center justify-center border-b border-border/60">
          <Link href="/" className="flex items-center justify-center">
            <Swords className="h-6 w-6 text-foreground" />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <Tooltip key={item.name}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center justify-center rounded-md p-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{item.name}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </div>
    </TooltipProvider>
  );
}

