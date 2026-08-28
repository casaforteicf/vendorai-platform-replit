import { useState } from "react";

interface PlannedMessage {
  id: string;
  from: "contact" | "me";
  text: string;
  time: string;
}

export default function PlannedConversations() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<PlannedMessage[]>([
    { id: "1", from: "contact", text: "Olá! Como posso ajudar?", time: "10:30" },
  ]);
  const contacts = [{ id: "1", name: "João Silva", avatar: "JS" }];

  function sendMessage() {
    const text = message.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), from: "me", text, time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) },
    ]);
    setMessage("");
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-96 bg-white border-r">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">Conversas</h1>
          <input type="text" placeholder="Buscar..." className="w-full mt-2 p-2 border rounded" />
        </div>
        <div>
          {contacts.map((contact) => (
            <div key={contact.id} className="flex items-center p-4 hover:bg-gray-100 cursor-pointer">
              <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold mr-3">
                {contact.avatar}
              </div>
              <div className="font-semibold">{contact.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="bg-white p-4 border-b"><div className="font-semibold">João Silva</div></div>
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {messages.map((item) => (
            <div key={item.id} className={`flex ${item.from === "me" ? "justify-end" : "justify-start"} mb-3`}>
              <div className={`max-w-xs p-3 rounded-lg ${item.from === "me" ? "bg-green-500 text-white" : "bg-white shadow"}`}>
                {item.text}
                <div className={`text-xs mt-1 ${item.from === "me" ? "text-green-100" : "text-gray-400"}`}>{item.time}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white p-4 border-t flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && sendMessage()}
            placeholder="Digite uma mensagem..."
            className="flex-1 border rounded-full px-4 py-2"
          />
          <button type="button" onClick={sendMessage} className="bg-green-500 text-white rounded-full px-4 py-2 hover:bg-green-600">Enviar</button>
        </div>
      </div>
    </div>
  );
}
