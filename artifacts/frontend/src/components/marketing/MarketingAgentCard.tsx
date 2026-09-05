import { Sparkles } from 'lucide-react';
import { buildMarketingAgentUiCard } from '@workspace/vendor-brain/marketing-agent-ui';
import type { MarketingAgentPlan } from '@workspace/vendor-brain/marketing-agent';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function MarketingAgentCard({
  pathname,
  plan,
  onPrimaryAction,
}: {
  pathname: string;
  plan?: MarketingAgentPlan;
  onPrimaryAction?: () => void;
}) {
  const card = buildMarketingAgentUiCard(pathname, plan);

  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>{card.title}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.description}</p>
          {card.secondaryActions.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {card.secondaryActions.join(' · ')}
            </p>
          )}
        </div>
        <Button type="button" size="sm" onClick={onPrimaryAction} disabled={!onPrimaryAction}>
          {card.primaryAction}
        </Button>
      </CardContent>
    </Card>
  );
}
