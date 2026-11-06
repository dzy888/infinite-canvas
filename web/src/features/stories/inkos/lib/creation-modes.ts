import type { SessionSummary } from "../store/chat/types";

const modes = {
  "book-create": {
    label: "nav.createNovel",
    guidance: ["描述小说题材、世界观、主角和核心冲突，一起完善设定与大纲，再开始章节创作。", "Describe the genre, world, protagonist and conflict to develop the premise, outline and chapters."],
    placeholder: ["例如：创作一部长篇悬疑小说，主角是一位失忆的法医……", "Describe your novel, protagonist and central conflict…"],
  },
  short: {
    label: "nav.createShort",
    guidance: ["提供一个故事灵感、人物处境或核心冲突，创作短篇正文、简介和封面。", "Share a story idea, character situation or conflict to create a short story, synopsis and cover."],
    placeholder: ["例如：写一个关于时间循环的短篇，结尾需要反转……", "Describe your short story idea and desired ending…"],
  },
  script: {
    label: "nav.createScript",
    guidance: ["描述剧本题材、主要人物、剧情和预计时长，逐步创作场景、动作与对白。", "Describe the genre, characters, plot and runtime to develop scenes, action and dialogue."],
    placeholder: ["例如：创作一个五分钟的悬疑短片剧本，发生在深夜便利店……", "Describe your script, characters and runtime…"],
  },
  storyboard: {
    label: "nav.createStoryboard",
    guidance: ["粘贴或上传剧本，说明要拆解的场景和画面风格，创作镜头、景别、运镜与画面描述。", "Paste or attach a script and describe the scene and visual style to develop shots, framing and camera movement."],
    placeholder: ["粘贴剧本或描述场景，例如：把雨夜追逐这一幕拆成分镜……", "Paste a script or describe the scene to storyboard…"],
  },
  "interactive-film": {
    label: "nav.createInteractiveFilm",
    guidance: ["描述故事背景、玩家角色和关键抉择，设计互动剧情、分支与结局。", "Describe the setting, player character and key decisions to design an interactive film with branches and endings."],
    placeholder: ["例如：制作一个密室逃脱互动短片，玩家的选择决定结局……", "Describe your interactive film and the choices players can make…"],
  },
  fanfic_init: {
    label: "nav.createFanfic",
    guidance: ["提供原作名称、世界观与人物设定，说明想创作的新剧情；也可以上传参考资料。", "Provide the original work, world and characters, plus your new plot. You can attach reference material."],
    placeholder: ["说明原作、要使用的人物，以及同人故事的方向……", "Describe the original work, characters and your fanfic premise…"],
  },
  spinoff_create: {
    label: "nav.createSpinoff",
    guidance: ["提供主线故事或相关章节，说明番外聚焦的人物、时间点和独立事件。", "Provide the main story or relevant chapters and describe the character, timeline and event for your side story."],
    placeholder: ["粘贴或上传原文，并说明要为哪个人物创作什么番外……", "Provide the source story and describe the side story you want…"],
  },
  style_imitation: {
    label: "nav.createImitation",
    guidance: ["粘贴或上传参考文本，说明希望学习的叙事节奏、语言风格和新故事方向。", "Paste or attach a reference text and describe the pacing, voice and new story you want to develop."],
    placeholder: ["提供参考文本，并描述新故事的题材与希望采用的风格……", "Provide a reference text and describe your new story and style…"],
  },
  continuation_import: {
    label: "nav.createContinuation",
    guidance: ["粘贴或上传已有正文，说明从哪里接续、需要保留的设定和后续剧情方向。", "Paste or attach existing chapters and describe where to continue, what to preserve and how the plot should develop."],
    placeholder: ["提供已有章节，并说明接下来想怎样发展剧情……", "Provide existing chapters and describe how to continue…"],
  },
  translation_create: {
    label: "nav.createTranslation",
    guidance: ["粘贴或上传待翻译文本，说明源语言、目标语言，以及术语和文风要求。", "Paste or attach the source text and specify the source and target languages, terminology and tone."],
    placeholder: ["提供原文，例如：把这篇中文故事翻译成英文，保留人物称谓……", "Provide the text, target language and translation requirements…"],
  },
  "play-guided": {
    label: "nav.createBranching",
    guidance: ["描述世界背景、玩家角色和开场事件，开始带有行动选项的分支故事；之后可以点选行动推进。", "Describe the world, player character and opening event to start a branching story with suggested actions."],
    placeholder: ["例如：我是一名刚踏入魔法学院的新生，开始一个分支冒险……", "Describe the world, your character and the opening event…"],
  },
  "play-open": {
    label: "nav.createFree",
    guidance: ["描述想探索的世界、角色和开场处境，启动开放世界；之后通过自由输入行动推进故事。", "Describe the world, character and opening situation, then explore by typing your own actions."],
    placeholder: ["例如：我是一名星际拾荒者，从一艘失联飞船开始自由探索……", "Describe the world and character you want to explore freely…"],
  },
} as const;

export function getCreationMode(session?: Pick<SessionSummary, "sessionKind" | "proposalAction" | "playMode">) {
  const id = session?.sessionKind === "chat"
    ? session.proposalAction
    : session?.sessionKind === "play"
      ? session.playMode && `play-${session.playMode}`
      : session?.sessionKind;
  return id && id in modes ? { id, ...modes[id as keyof typeof modes] } : undefined;
}
