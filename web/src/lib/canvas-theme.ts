export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f8f8f5",
            dot: "rgba(10,10,10,.20)",
            line: "rgba(10,10,10,.08)",
            selectionStroke: "#22c55e",
            selectionFill: "rgba(34,197,94,.07)",
        },
        node: {
            label: "#57534e",
            fill: "#eeeee9",
            panel: "#fdfdfb",
            stroke: "#deded8",
            activeStroke: "#22c55e",
            placeholder: "#8a8479",
            text: "#242424",
            muted: "#78716c",
            faint: "#a8a29e",
        },
        toolbar: {
            panel: "rgba(253,253,251,.96)",
            border: "#deded8",
            item: "#57534e",
            itemHover: "#eeeee9",
            activeBg: "#eeeee9",
            activeText: "#242424",
        },
    },
    dark: {
        canvas: {
            background: "#0a0a0a",
            dot: "rgba(245,245,244,.24)",
            line: "rgba(245,245,244,.10)",
            selectionStroke: "#22c55e",
            selectionFill: "rgba(250,250,249,.10)",
        },
        node: {
            label: "#d6d3d1",
            fill: "#242424",
            panel: "#151515",
            stroke: "#333333",
            activeStroke: "#22c55e",
            placeholder: "#a8a29e",
            text: "#f5f5f4",
            muted: "#d6d3d1",
            faint: "#78716c",
        },
        toolbar: {
            panel: "rgba(21,21,21,.96)",
            border: "#333333",
            item: "#d6d3d1",
            itemHover: "#242424",
            activeBg: "#2a2a2a",
            activeText: "#f5f5f4",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
