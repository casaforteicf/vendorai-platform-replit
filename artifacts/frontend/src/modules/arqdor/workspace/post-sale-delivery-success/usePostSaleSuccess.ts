import { useCallback, useEffect, useMemo, useState } from "react";
import {
  acceptDeliveryTerm,
  createChecklistItem,
  createDeliveryTerm,
  createFinalDocument,
  createFutureOpportunity,
  createPostSaleFromProduction,
  fetchPostSaleBundle,
  requestTestimonial,
  sendSatisfactionSurvey,
  updateChecklistItem,
  updateFutureOpportunity,
} from "./postSaleApi";
import type {
  DeliveryChecklistItem,
  DeliveryChecklistPayload,
  DeliveryProject,
  DeliveryTerm,
  FinalDocument,
  FinalDocumentPayload,
  FutureOpportunity,
  FutureOpportunityPayload,
  PostSaleEvent,
  SatisfactionSurvey,
  TestimonialRequest,
} from "./postSaleTypes";

export function usePostSaleSuccess(projectId: string, proposalId?: string, clientName?: string) {
  const [delivery, setDelivery] = useState<DeliveryProject | null>(null);
  const [checklist, setChecklist] = useState<DeliveryChecklistItem[]>([]);
  const [terms, setTerms] = useState<DeliveryTerm[]>([]);
  const [documents, setDocuments] = useState<FinalDocument[]>([]);
  const [surveys, setSurveys] = useState<SatisfactionSurvey[]>([]);
  const [testimonialRequests, setTestimonialRequests] = useState<TestimonialRequest[]>([]);
  const [opportunities, setOpportunities] = useState<FutureOpportunity[]>([]);
  const [events, setEvents] = useState<PostSaleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const done = checklist.filter((item) => item.done).length;
    const required = checklist.filter((item) => item.required).length;
    const requiredDone = checklist.filter((item) => item.required && item.done).length;
    const avgNps = surveys.length
      ? surveys.reduce((sum, item) => sum + Number(item.nps || 0), 0) / surveys.length
      : delivery?.nps || 0;

    return {
      checklistTotal: checklist.length,
      checklistDone: done,
      requiredTotal: required,
      requiredDone,
      documents: documents.length,
      opportunities: opportunities.length,
      nps: avgNps,
      canClose: required > 0 && required === requiredDone,
    };
  }, [checklist, delivery, documents.length, opportunities.length, surveys]);

  const load = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    const result = await fetchPostSaleBundle(projectId);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setDelivery(result.data?.delivery || null);
    setChecklist(result.data?.checklist || []);
    setTerms(result.data?.terms || []);
    setDocuments(result.data?.documents || []);
    setSurveys(result.data?.surveys || []);
    setTestimonialRequests(result.data?.testimonialRequests || []);
    setOpportunities(result.data?.opportunities || []);
    setEvents(result.data?.events || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createFromProduction = useCallback(async () => {
    if (!projectId) return null;

    setCreating(true);
    setError(null);

    const result = await createPostSaleFromProduction({
      projectId,
      proposalId,
      clientName,
    });

    if (result.error) {
      setError(result.error);
      setCreating(false);
      return null;
    }

    setDelivery(result.data?.delivery || null);
    setChecklist(result.data?.checklist || []);
    setTerms(result.data?.terms || []);
    setDocuments(result.data?.documents || []);
    setSurveys(result.data?.surveys || []);
    setTestimonialRequests(result.data?.testimonialRequests || []);
    setOpportunities(result.data?.opportunities || []);
    setEvents(result.data?.events || []);
    setCreating(false);
    await load();
    return result.data || null;
  }, [clientName, load, projectId, proposalId]);

  const addChecklist = useCallback(
    async (payload: DeliveryChecklistPayload) => {
      setSaving(true);
      setError(null);

      const result = await createChecklistItem(payload);

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      setSaving(false);
      await load();
      return result.data || null;
    },
    [load],
  );

  const toggleChecklist = useCallback(
    async (item: DeliveryChecklistItem, done: boolean) => {
      setSaving(true);
      setError(null);

      const result = await updateChecklistItem(item.id, { done });

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      setChecklist((list) => list.map((current) => (current.id === item.id ? { ...current, done } : current)));
      setSaving(false);
      await load();
      return result.data || null;
    },
    [load],
  );

  const generateTerm = useCallback(
    async (content: string) => {
      if (!delivery) return null;

      setSaving(true);
      setError(null);

      const result = await createDeliveryTerm({
        deliveryId: delivery.id,
        projectId,
        title: "Termo de entrega do projeto",
        clientName: delivery.clientName || clientName,
        content,
      });

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      setSaving(false);
      await load();
      return result.data || null;
    },
    [clientName, delivery, load, projectId],
  );

  const acceptTerm = useCallback(
    async (term: DeliveryTerm, acceptedBy?: string) => {
      setSaving(true);
      setError(null);

      const result = await acceptDeliveryTerm(term.id, { acceptedBy });

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      setSaving(false);
      await load();
      return result.data || null;
    },
    [load],
  );

  const addDocument = useCallback(
    async (payload: FinalDocumentPayload) => {
      setSaving(true);
      setError(null);

      const result = await createFinalDocument(payload);

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      setSaving(false);
      await load();
      return result.data || null;
    },
    [load],
  );

  const sendSurvey = useCallback(
    async (nps?: number, satisfactionScore?: number, comment?: string) => {
      if (!delivery) return null;

      setSaving(true);
      setError(null);

      const result = await sendSatisfactionSurvey({
        deliveryId: delivery.id,
        projectId,
        clientName: delivery.clientName || clientName,
        nps,
        satisfactionScore,
        comment,
      });

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      setSaving(false);
      await load();
      return result.data || null;
    },
    [clientName, delivery, load, projectId],
  );

  const requestClientTestimonial = useCallback(
    async (message: string, channel: "portal" | "email" | "whatsapp" | "manual") => {
      if (!delivery) return null;

      setSaving(true);
      setError(null);

      const result = await requestTestimonial({
        deliveryId: delivery.id,
        projectId,
        channel,
        message,
      });

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      setSaving(false);
      await load();
      return result.data || null;
    },
    [delivery, load, projectId],
  );

  const addOpportunity = useCallback(
    async (payload: FutureOpportunityPayload) => {
      setSaving(true);
      setError(null);

      const result = await createFutureOpportunity(payload);

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      setSaving(false);
      await load();
      return result.data || null;
    },
    [load],
  );

  const saveOpportunity = useCallback(
    async (id: string, payload: Partial<FutureOpportunityPayload>) => {
      setSaving(true);
      setError(null);

      const result = await updateFutureOpportunity(id, payload);

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      setSaving(false);
      await load();
      return result.data || null;
    },
    [load],
  );

  return {
    delivery,
    checklist,
    terms,
    documents,
    surveys,
    testimonialRequests,
    opportunities,
    events,
    stats,
    loading,
    creating,
    saving,
    error,
    reload: load,
    createFromProduction,
    addChecklist,
    toggleChecklist,
    generateTerm,
    acceptTerm,
    addDocument,
    sendSurvey,
    requestClientTestimonial,
    addOpportunity,
    saveOpportunity,
  };
}
