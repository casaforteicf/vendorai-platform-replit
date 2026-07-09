import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activatePortal,
  createProposalFromBudget,
  fetchProposalByProject,
  sendProposal,
} from "./portalApi";
import type { DeliveryChannel, Proposal, ProposalEvent, ProposalItem } from "./portalTypes";

export function useClientPortalApproval(projectId: string, projectTitle: string, clientName: string, budgetId?: string) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [events, setEvents] = useState<ProposalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const approved = items.filter((item) => item.approvalStatus === "approved").length;
    const rejected = items.filter((item) => item.approvalStatus === "rejected").length;
    const commented = items.filter((item) => item.approvalStatus === "commented" || item.clientComment).length;
    const pending = items.filter((item) => item.approvalStatus === "pending").length;

    return {
      total: items.length,
      approved,
      rejected,
      commented,
      pending,
    };
  }, [items]);

  const loadProposal = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    const result = await fetchProposalByProject(projectId);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setProposal(result.data?.proposal || null);
    setItems(result.data?.items || []);
    setEvents(result.data?.events || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void loadProposal();
  }, [loadProposal]);

  const createFromBudget = useCallback(async () => {
    if (!projectId || !budgetId) {
      setError("budgetId é obrigatório para criar proposta a partir do orçamento.");
      return null;
    }

    setCreating(true);
    setError(null);

    const result = await createProposalFromBudget({
      projectId,
      budgetId,
      title: `Proposta — ${projectTitle}`,
      clientName,
    });

    if (result.error) {
      setError(result.error);
      setCreating(false);
      return null;
    }

    setProposal(result.data?.proposal || null);
    setItems(result.data?.items || []);
    setEvents(result.data?.events || []);
    setCreating(false);
    await loadProposal();
    return result.data || null;
  }, [budgetId, clientName, loadProposal, projectId, projectTitle]);

  const activate = useCallback(async () => {
    if (!proposal) return null;

    setActivating(true);
    setError(null);

    const result = await activatePortal({
      proposalId: proposal.id,
      regenerateToken: !proposal.portalToken,
      expiresAt: proposal.expiresAt,
    });

    if (result.error) {
      setError(result.error);
      setActivating(false);
      return null;
    }

    if (result.data) setProposal(result.data);
    setActivating(false);
    await loadProposal();
    return result.data || null;
  }, [loadProposal, proposal]);

  const send = useCallback(
    async (payload: { channels: DeliveryChannel[]; email?: string; phone?: string; message?: string }) => {
      if (!proposal) return null;

      setSending(true);
      setError(null);

      const result = await sendProposal({
        proposalId: proposal.id,
        channels: payload.channels,
        email: payload.email,
        phone: payload.phone,
        message: payload.message,
      });

      if (result.error) {
        setError(result.error);
        setSending(false);
        return null;
      }

      setProposal(result.data?.proposal || null);
      setItems(result.data?.items || []);
      setEvents(result.data?.events || []);
      setSending(false);
      await loadProposal();
      return result.data || null;
    },
    [loadProposal, proposal],
  );

  return {
    proposal,
    items,
    events,
    stats,
    loading,
    creating,
    activating,
    sending,
    error,
    reload: loadProposal,
    createFromBudget,
    activate,
    send,
  };
}
