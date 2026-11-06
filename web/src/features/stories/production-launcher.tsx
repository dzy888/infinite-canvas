import { lazy, Suspense, useState } from "react";
import { Clapperboard } from "lucide-react";
import type { ScriptSource } from "@/types/story-production";

const ScriptProduction = lazy(() => import("./script-production"));
export type ProductionLauncherProps = { source?: ScriptSource; content?: string; target?: "image" | "video"; disabled?: boolean };
export function ProductionLauncher(props: ProductionLauncherProps) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                disabled={props.disabled}
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
                <Clapperboard size={15} />
                {props.source ? "生成图片 / 视频" : "从剧本导入"}
            </button>
            {open && (
                <Suspense fallback={<span className="text-sm text-muted-foreground">正在打开剧本…</span>}>
                    <ScriptProduction {...props} onClose={() => setOpen(false)} />
                </Suspense>
            )}
        </>
    );
}
