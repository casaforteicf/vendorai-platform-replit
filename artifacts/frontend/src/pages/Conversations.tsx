import { useAuth } from "@/contexts/AuthContext";
import { useListTenantConversations, getListTenantConversationsQueryKey, useMarkConversationRead } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Check, Phone, Mail, Instagram, Facebook } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Conversations() {
  const { user } = useAuth();
  const tenantId = user?.tenantId || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: conversations, isLoading } = useListTenantConversations(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListTenantConversationsQueryKey(tenantId)
    }
  });

  const markAsRead = useMarkConversationRead();

  const handleMarkAsRead = (id: string) => {
    markAsRead.mutate({ conversationId: id } as any, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTenantConversationsQueryKey(tenantId) });
      }
    });
  };

  const getChannelIcon = (channel: string) => {
    switch(channel) {
      case 'whatsapp': return <Phone className="h-4 w-4 text-emerald-500" />;
      case 'email': return <Mail className="h-4 w-4 text-blue-500" />;
      case 'instagram': return <Instagram className="h-4 w-4 text-pink-500" />;
      case 'facebook': return <Facebook className="h-4 w-4 text-blue-600" />;
      default: return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Conversas</h1>
        <p className="text-muted-foreground">Caixa de entrada unificada de todos os canais.</p>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 min-h-0">
        <Card className="md:col-span-1 overflow-hidden flex flex-col">
          <div className="p-4 border-b font-medium">Caixa de Entrada</div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground text-sm">Carregando...</div>
            ) : conversations?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma conversa encontrada.</div>
            ) : (
              <div className="divide-y">
                {conversations?.map((conv: any) => (
                  <div key={conv.id} className="p-4 hover:bg-muted/50 cursor-pointer transition-colors relative">
                    {conv.unreadCount > 0 && (
                      <div className="absolute right-4 top-4 h-2 w-2 rounded-full bg-primary"></div>
                    )}
                    <div className="flex items-center gap-3 mb-1">
                      {getChannelIcon(conv.channel)}
                      <span className="text-sm font-medium">Lead {conv.leadId.substring(0,6)}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate pr-6">
                      Status: {conv.status}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="md:col-span-2 hidden md:flex flex-col bg-muted/10 items-center justify-center text-center p-8">
          <MessageSquare className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
          <h3 className="text-lg font-medium text-muted-foreground">Selecione uma conversa</h3>
          <p className="text-sm text-muted-foreground/60 max-w-sm mt-1">
            Escolha uma conversa na lista ao lado para visualizar o histórico de mensagens e responder.
          </p>
        </Card>
      </div>
    </div>
  );
}
