import { useState } from "react";
import { assertAccountOwner } from "@/lib/account-storage";
import { useUserStore } from "@/stores/use-user-store";
import { App } from "antd";
import { uploadImage } from "@/services/image-storage";
import { useNavigate } from "react-router-dom";
import { Maximize2 } from "lucide-react";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { createCanvasNode, imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { CanvasNodeType } from "@/types/canvas";
import type { StoryGraph } from "@actalk/inkos-core/interactive-film/graph-schema";
import { layoutStoryGraph } from "./inkos/lib/story-flow-layout";
import { tr } from "./inkos/lib/app-language";

export function SendToCanvas({ title, content, graph, image }: { title: string; content?: string; graph?: StoryGraph; image?: string }) {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const [busy, setBusy] = useState(false);
    const hydrated = useCanvasStore((s) => s.hydrated);
    async function send() {
        const owner = useUserStore.getState().user?.id;
        assertAccountOwner(owner);
        setBusy(true);
        try {
            const layout = graph && layoutStoryGraph(graph);
            const mapped = new Map<string, string>();
            const nodes = graph
                ? graph.nodes.map((scene) => {
                      const position = layout!.nodes.find((n) => n.id === scene.id)!.position;
                      const text = [scene.title, scene.sceneDesc, ...scene.choices.map((c) => `→ ${c.text}`)].filter(Boolean).join("\n\n");
                      const node = createCanvasNode(CanvasNodeType.Text, { x: position.x * 2 + 300, y: position.y * 3 + 240 }, { content: text, prompt: scene.sceneDesc });
                      mapped.set(scene.id, node.id);
                      return { ...node, title: scene.title || title };
                  })
                : [{ ...createCanvasNode(CanvasNodeType.Text, { x: 400, y: 300 }, { content }), title }];
            if (image) {
                const uploaded = await uploadImage(image);
                nodes.push({ ...createCanvasNode(CanvasNodeType.Image, { x: 400, y: 300 }, imageMetadata(uploaded)), title });
                if (!content && !graph) nodes.shift();
            }
            assertAccountOwner(useUserStore.getState().user?.id);
            const connections = layout ? layout.edges.map((edge) => ({ id: edge.id, fromNodeId: mapped.get(edge.source)!, toNodeId: mapped.get(edge.target)! })) : [];
            const id = useCanvasStore.getState().importProject({ title, nodes, connections });
            navigate(`/canvas/${id}`);
        } catch {
            message.error(tr("送到画布失败，请重试。", "Could not send to canvas. Please retry."));
        } finally {
            setBusy(false);
        }
    }
    return (
        <button
            type="button"
            onClick={send}
            disabled={busy || !hydrated || (!content && !graph?.nodes.length && !image)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
            <Maximize2 size={15} />
            {tr("送到画布", "Send to canvas")}
        </button>
    );
}
