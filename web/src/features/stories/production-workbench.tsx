import { App, Button, Select } from "antd";
import { Link } from "react-router-dom";
import { openProductionDraft, useStoryProductionStore } from "@/stores/use-story-production-store";
import { sourceLabel, sourceRoute, type StoryProductionLink } from "@/types/story-production";
import { ProductionLauncher } from "./production-launcher";

export function ProductionWorkbench({ kind, source, running, onClear }: { kind: "image" | "video"; source?: StoryProductionLink; running: boolean; onClear: () => void }) {
    const { message } = App.useApp();
    const queue = useStoryProductionStore((state) => state.queues[kind]);
    const current = queue.find((item) => item.storySource.planId === source?.planId && item.storySource.entity.id === source?.entity.id);
    return (
        <div className="mt-4 space-y-2 border-b border-border pb-3">
            <ProductionLauncher target={kind} disabled={running} />
            {queue.length > 0 && (
                <div className="flex items-center gap-2">
                    <Select
                        className="min-w-0 flex-1"
                        aria-label="剧本生成清单"
                        placeholder="选择待生成对象"
                        disabled={running}
                        value={current?.id}
                        options={queue.map((draft) => ({ value: draft.id, label: draft.storySource.entity.name }))}
                        onChange={(id) => {
                            const draft = queue.find((item) => item.id === id);
                            if (draft) void openProductionDraft(kind, draft).catch((err) => message.error(err instanceof Error ? err.message : "导入失败"));
                        }}
                    />
                    <Button type="text" disabled={running} onClick={() => useStoryProductionStore.getState().setQueue(kind, [])}>
                        清空清单
                    </Button>
                </div>
            )}
            {source && (
                <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="break-words">
                        来源：{sourceLabel(source.source)} · {source.entity.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Link className="text-primary" to={sourceRoute(source.source)}>
                            返回剧本查看素材
                        </Link>
                        <button type="button" disabled={running} onClick={onClear} className="hover:text-foreground disabled:opacity-40">
                            取消来源关联
                        </button>
                    </div>
                    <div>生成成功后自动保存到“我的素材”，并关联此章节。</div>
                </div>
            )}
        </div>
    );
}
