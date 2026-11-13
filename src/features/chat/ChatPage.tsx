import { useEffect, useState } from "react";
import { clearRequestedThread, lastOpenThread, peekRequestedThread } from "../../demo/chat/service";
import { ChatWorkspace } from "./ChatWorkspace";

/** Tela Conversas: canais por setor, conversas por cliente e por assunto. */
export function ChatPage() {
  const [initial] = useState(() => peekRequestedThread() ?? lastOpenThread());
  useEffect(() => { clearRequestedThread(); }, []);
  return <ChatWorkspace initialThread={initial} />;
}
