import { useEffect, useRef, useState } from "react";
import { Download, Upload, HardDrive, Loader2 } from "lucide-react";
import { saveAs } from "file-saver";
import {
  exportLocalChats,
  importLocalChats,
  readLocalDraft,
  flushLocalChats,
} from "./local-chat-storage";
import { migrateServerChats } from "./migrate-local-chats";
import { useChatStore } from "./inkos/store/chat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./inkos/components/ui/dialog";

export function ChatBackup() {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const streaming = useChatStore((state) =>
    Object.values(state.sessions).some(
      (session) => session.isStreaming || session.isChatStreaming,
    ),
  );
  const reload = async () => {
    const store = useChatStore.getState();
    for (const key of new Set([
      null,
      ...Object.values(store.sessions).map((session) => session.bookId),
    ]))
      await store.loadSessionList(key);
    if (store.activeSessionId)
      await store.loadSessionDetail(store.activeSessionId, true);
  };
  useEffect(() => {
    const error = (event: Event) => {
      setNotice((event as CustomEvent<string>).detail);
      setOpen(true);
    };
    const changed = () => {
      void reload();
    };
    window.addEventListener("dmx:chat-storage-error", error);
    window.addEventListener("dmx:local-chats-changed", changed);
    void readLocalDraft()
      .then((value) => {
        if (value && !useChatStore.getState().input)
          useChatStore.setState({ input: value });
      })
      .catch((error) => {
        setNotice(error.message);
        setOpen(true);
      });
    void migrateServerChats().catch((error) => {
      setNotice(error.message);
      setOpen(true);
    });
    return () => {
      window.removeEventListener("dmx:chat-storage-error", error);
      window.removeEventListener("dmx:local-chats-changed", changed);
    };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 rounded-md"
      >
        <HardDrive size={15} />
        聊天备份
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>本机聊天记录</DialogTitle>
            <DialogDescription>
              聊天保存在当前浏览器。换电脑或清理浏览器前，请先导出备份。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await flushLocalChats();
                    saveAs(
                      new Blob([await exportLocalChats()], {
                        type: "application/json",
                      }),
                      `DmxVideo-聊天备份-${new Date().toISOString().slice(0, 10)}.json`,
                    );
                    setNotice("聊天记录已导出。");
                  })
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
              >
                <Download size={16} />
                导出聊天记录
              </button>
              <button
                type="button"
                disabled={busy || streaming}
                onClick={() => input.current?.click()}
                className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
              >
                <Upload size={16} />
                导入聊天记录
              </button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              导入会先备份现有记录；同一会话内容有冲突时保留两份。备份包含聊天、工具记录和草稿，不包含云端故事正文。
            </p>
            {streaming && (
              <p className="text-xs text-muted-foreground">
                请等待当前创作完成或停止任务后再导入。
              </p>
            )}
            {busy && (
              <div
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 size={14} className="animate-spin" />
                正在处理，请稍候…
              </div>
            )}
            {notice && (
              <p role="status" className="text-sm leading-6">
                {notice}
              </p>
            )}
          </div>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="选择聊天备份文件"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void run(async () => {
                if (
                  Object.values(useChatStore.getState().sessions).some(
                    (session) => session.isStreaming || session.isChatStreaming,
                  )
                )
                  throw new Error(
                    "请先等待当前创作完成或停止任务，再导入聊天记录。",
                  );
                const result = await importLocalChats(await file.text());
                await reload();
                setNotice(
                  `已导入 ${result.imported} 个会话${result.copies ? `，其中 ${result.copies} 个冲突会话已另存副本` : ""}。`,
                );
              });
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
