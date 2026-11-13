import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useNavigate } from "../../app/NavigationContext";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { requestThread, totalUnread } from "../../demo/chat/service";
import { ChatWorkspace } from "../../features/chat/ChatWorkspace";

/** Balão de conversas em todas as telas: abre um painel rápido; "Ampliar" leva para a tela Conversas. */
export function ChatLauncher() {
  const tables = useDemoTables();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = totalUnread(tables);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div className="chat-pop" role="dialog" aria-label="Conversas">
          <button type="button" className="chat-pop-close" onClick={() => setOpen(false)} aria-label="Fechar conversas"><X size={16} aria-hidden="true" /></button>
          <ChatWorkspace compact onExpand={(threadId) => { if (threadId) requestThread(threadId); setOpen(false); navigate("chat"); }} />
        </div>
      )}
      <button type="button" className={`chat-fab${open ? " is-open" : ""}`} onClick={() => setOpen((value) => !value)} aria-label={unread ? `Conversas, ${unread} não lidas` : "Conversas"} aria-expanded={open}>
        {open ? <X size={22} aria-hidden="true" /> : <MessageCircle size={22} aria-hidden="true" />}
        {!open && unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
      </button>
    </>
  );
}
