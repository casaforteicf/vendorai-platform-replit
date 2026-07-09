import { useCallback, useEffect, useState } from "react";
import {
  fetchPublicProposal,
  submitClientDecision,
  submitClientItemDecision,
} from "./portalApi";
import type { Proposal, ProposalEvent, ProposalItem } from "./portalTypes";

export function usePublicProposalPortal(token: string) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [events, setEvents] = useState<ProposalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    const result = await fetchPublicProposal(token);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setProposal(result.data?.proposal || null);
    setItems(result.data?.items || []);
    setEvents(result.data?.events || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const decideProposal = useCallback(
    async (decision: "approve" | "reject" | "revision", comment?: string, clientName?: string) => {
      setSubmitting(true);
      setError(null);

      const result = await submitClientDecision({
        token,
        decision,
        comment,
        clientName,
      });

      if (result.error) {
        setError(result.error);
        setSubmitting(false);
        return null;
      }

      setProposal(result.data?.proposal || null);
      setItems(result.data?.items || []);
      setEvents(result.data?.events || []);
      setSubmitting(false);
      return result.data || null;
    },
    [token],
  );

  const decideItem = useCallback(
    async (itemId: string, decision: "approve" | "reject" | "comment", comment?: string) => {
      setSubmitting(true);
      setError(null);

      const result = await submitClientItemDecision({
        token,
        itemId,
        decision,
        comment,
      });

      if (result.error) {
        setError(result.error);
        setSubmitting(false);
        return null;
      }

      setProposal(result.data?.proposal || null);
      setItems(result.data?.items || []);
      setEvents(result.data?.events || []);
      setSubmitting(false);
      return result.data || null;
    },
    [token],
  );

  return {
    proposal,
    items,
    events,
    loading,
    submitting,
    error,
    reload: load,
    decideProposal,
    decideItem,
  };
}
