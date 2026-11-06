import { tr } from "./app-language";
export function workProfileLabel(profile: string) {
  const names: Record<string, [string, string]> = { "short-fiction": ["短篇小说", "Short fiction"], "longform-novel": ["长篇小说", "Novel"], script: ["剧本", "Script"], storyboard: ["分镜", "Storyboard"], "interactive-film": ["互动影游", "Interactive film"], "interactive-world": ["互动世界", "Interactive world"], translation: ["翻译", "Translation"], "visual-asset": ["视觉素材", "Visual asset"] };
  const name = names[profile]; return name ? tr(...name) : profile;
}
