import { ManagedModels } from "../managed-models";
import { Menu, Settings2, X } from "lucide-react";
import { useState, useEffect, lazy, Suspense } from "react";
import { useHashRoute } from "./hooks/use-hash-route";
import type { HashRoute } from "./hooks/use-hash-route";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
const WorkInspector = lazy(() => import("./pages/WorkInspector").then(module => ({ default: module.WorkInspector })));
const ChatPage = lazy(() => import("./pages/ChatPage").then(module => ({ default: module.ChatPage })));
const BookDetail = lazy(() => import("./pages/BookDetail").then(module => ({ default: module.BookDetail })));
const ChapterReader = lazy(() => import("./pages/ChapterReader").then(module => ({ default: module.ChapterReader })));
const Analytics = lazy(() => import("./pages/Analytics").then(module => ({ default: module.Analytics })));
const TruthFiles = lazy(() => import("./pages/TruthFiles").then(module => ({ default: module.TruthFiles })));
const LogViewer = lazy(() => import("./pages/LogViewer").then(module => ({ default: module.LogViewer })));
const StyleManager = lazy(() => import("./pages/StyleManager").then(module => ({ default: module.StyleManager })));
const TranslationManager = lazy(() => import("./pages/TranslationManager").then(module => ({ default: module.TranslationManager })));
const ImportManager = lazy(() => import("./pages/ImportManager").then(module => ({ default: module.ImportManager })));
const RadarView = lazy(() => import("./pages/RadarView").then(module => ({ default: module.RadarView })));
const StoryPlayer = lazy(() => import("./pages/StoryPlayer").then(module => ({ default: module.StoryPlayer })));
const StoryGraphTree = lazy(() => import("./pages/StoryGraphTree").then(module => ({ default: module.StoryGraphTree })));
const FlowView = lazy(() => import("./pages/FlowView"));
const FilmWizard = lazy(() => import("./pages/FilmWizard"));
const LanguageSelector = lazy(() => import("./pages/LanguageSelector").then(module => ({ default: module.LanguageSelector })));
const BookSidebar = lazy(() => import("./components/chat/BookSidebar").then(module => ({ default: module.BookSidebar })));
const BookSidebarToggle = lazy(() => import("./components/chat/BookSidebar").then(module => ({ default: module.BookSidebarToggle })));
import { useSSE } from "./hooks/use-sse";
import { useSessionEvents } from "./hooks/use-session-events";
import { useTheme } from "./hooks/use-theme";
import { useI18n } from "./hooks/use-i18n";
import { setAppLanguage, tr } from "./lib/app-language";
import { postApi, putApi, useApi } from "./hooks/use-api";
import { Sun, Moon } from "lucide-react";
import { House } from "lucide-react";

export type { HashRoute as Route } from "./hooks/use-hash-route";

export function deriveActiveBookId(route: HashRoute): string | undefined {
  if ("bookId" in route) return route.bookId;
  return undefined;
}

export function isBookCreateChatRoute(route: HashRoute): boolean {
  return route.page === "book-create";
}

export function deriveStartupGate(input: {
  readonly ready: boolean;
  readonly projectError: string | null;
}): "ready" | "loading" | "error" {
  if (input.ready) return "ready";
  return input.projectError ? "error" : "loading";
}

export function App() {
  const { route, setRoute } = useHashRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const sse = useSSE();
  const { theme, setTheme } = useTheme();
  const { t, lang: currentLang } = useI18n();
  const { data: project, error: projectError, refetch: refetchProject } = useApi<{ language: string; languageExplicit: boolean }>("/project");
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [ready, setReady] = useState(false);

  const isDark = theme === "dark";

  // 全局语言同步：app-language 是模块级单例，供用不了 hook 的代码（lib 纯函数、
  // store slice）读取。这里在渲染期同步赋值，让子组件在同一次渲染里调用 tr() 时
  // 就读到正确语言（只用 effect 的话，effect 要等本次渲染提交后才执行，本次渲染
  // 里的 tr() 会读到旧语言）。赋值是幂等的模块变量写入，StrictMode 重复渲染无影
  // 响；下面的 effect 在语言加载完成和切换时再设置一次，保证提交后的值也正确。
  setAppLanguage(currentLang);
  useEffect(() => {
    setAppLanguage(currentLang);
  }, [currentLang]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    if (project) {
      if (!project.languageExplicit) {
        setShowLanguageSelector(true);
      }
      setReady(true);
    }
  }, [project]);

  useSessionEvents(sse, route, setRoute);

  const nav = {
    toDashboard: () => setRoute({ page: "dashboard" }),
    toChat: () => setRoute({ page: "chat" }),
    toBook: (bookId: string) => setRoute({ page: "book", bookId }),
    toBookSettings: (bookId: string) => setRoute({ page: "book-settings", bookId }),
    toBookCreate: () => setRoute({ page: "book-create" }),
    toWork: (workId: string) => setRoute({ page: "work", workId }),
    toWorkChat: (workId: string, profileId: string) => setRoute({ page: "work-chat", workId, profileId }),
    toChapter: (bookId: string, chapterNumber: number) =>
      setRoute({ page: "chapter", bookId, chapterNumber }),
    toAnalytics: (bookId: string) => setRoute({ page: "analytics", bookId }),
    toServices: () => setRoute({ page: "services" }),
    toProjectSettings: () => setRoute({ page: "project-settings" }),
    toServiceDetail: (id: string) => setRoute({ page: "service-detail", serviceId: id }),
    toTruth: (bookId: string) => setRoute({ page: "truth", bookId }),
    toDaemon: () => setRoute({ page: "daemon" }),
    toLogs: () => setRoute({ page: "logs" }),
    toStyle: () => setRoute({ page: "style" }),
    toTranslation: () => setRoute({ page: "translation" }),
    toImport: (tab?: "chapters" | "canon" | "fanfic" | "spinoff" | "imitation") => setRoute({ page: "import", ...(tab ? { tab } : {}) }),
    toRadar: () => setRoute({ page: "radar" }),
    toDoctor: () => setRoute({ page: "doctor" }),
    toPlay: (projectId: string) => setRoute({ page: "play", projectId }),
    toFilm: (projectId: string) => setRoute({ page: "film", projectId }),
    toFlow: (projectId: string) => setRoute({ page: "flow", projectId }),
    toFilmAuthor: (projectId: string) => setRoute({ page: "film-author", projectId }),
    toFilmStudio: (projectId: string) => setRoute({ page: "film-studio", projectId }),
  };

  const activeBookId = deriveActiveBookId(route);
  const activePage =
    activeBookId
      ? `book:${activeBookId}`
      : route.page === "service-detail"
        ? "services"
        : route.page;

  const startupGate = deriveStartupGate({ ready, projectError });

  if (startupGate === "error") {
    return (
      <div className="h-full min-h-0 bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-6 space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-destructive">暂时无法打开故事创作 / Story studio unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground break-all">{projectError}</p>
          </div>
          {/* 项目配置没加载出来，语言未知，所以这屏中英双语并排展示。 */}
          <p className="text-sm text-muted-foreground">
            故事服务暂时无法连接，请检查服务是否已启动后重试。
            <br />
            The story service is unavailable. Please start it and retry.
          </p>
          <button
            type="button"
            onClick={() => refetchProject()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            重试 / Retry
          </button>
        </div>
      </div>
    );
  }

  if (startupGate === "loading") {
    return (
      <div className="h-full min-h-0 bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (showLanguageSelector) {
    return (
      <LanguageSelector
        onSelect={async (lang) => {
          await postApi("/project/language", { language: lang });
          setShowLanguageSelector(false);
          refetchProject();
        }}
      />
    );
  }

  return (
    <div className="story-workbench h-full min-h-0 bg-background text-foreground flex overflow-hidden font-sans">
      {/* Left Sidebar */}
      {menuOpen && <button aria-label="关闭作品导航" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-foreground/20 md:hidden" />}
      <div className={`${menuOpen ? "absolute inset-y-0 left-0 z-40 shadow-lg" : "hidden"} md:relative md:flex`} onClick={event => { if ((event.target as HTMLElement).closest("button")) setMenuOpen(false); }}>
        <Sidebar nav={nav} activePage={activePage} sse={sse} t={t} />
      </div>

      {/* Center Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background/30 backdrop-blur-sm">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="md:hidden" aria-label="打开作品导航" onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
            <button type="button" onClick={nav.toDashboard} className="text-sm font-medium">{tr("故事创作", "Story studio")}</button>
            <span className="hidden text-xs text-muted-foreground sm:block">{tr("从灵感到故事，再到画布", "From idea to story to canvas")}</span>
          </div>
          <button type="button" onClick={nav.toServices} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted"><Settings2 size={15} />{tr("创作设置", "Studio settings")}</button>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 relative overflow-y-auto scroll-smooth">
          <Suspense fallback={<div role="status" className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">{tr("正在加载创作工具…", "Loading creative tools…")}</div>}>
          {route.page === "dashboard" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <Dashboard nav={nav} sse={sse} theme={theme} t={t} />
            </div>
          )}
          {route.page === "work" && (
            <div className="mx-auto w-full max-w-5xl px-6 py-12 md:px-12 lg:py-16 fade-in">
              <WorkInspector workId={route.workId} onBack={nav.toDashboard} onChat={nav.toWorkChat} />
            </div>
          )}
          {route.page === "work-chat" && (
            <div className="absolute inset-0 flex min-w-0">
              <ChatPage
                activeWorkId={route.workId}
                workProfileId={route.profileId}
                mode="work"
                nav={nav}
                theme={theme}
                t={t}
                sse={sse}
              />
            </div>
          )}
          {isBookCreateChatRoute(route) && (
            <div className="absolute inset-0 flex min-w-0">
              <ChatPage
                mode="book-create"
                nav={nav}
                theme={theme}
                t={t}
                sse={sse}
              />
            </div>
          )}
          {route.page === "chat" && (
            <div className="absolute inset-0 flex min-w-0">
              <ChatPage
                mode="project-chat"
                nav={nav}
                theme={theme}
                t={t}
                sse={sse}
              />
            </div>
          )}
          {route.page === "book" && (
            <div className="absolute inset-0 flex min-w-0">
              <ChatPage
                activeBookId={route.bookId}
                mode="book"
                nav={nav}
                theme={theme}
                t={t}
                sse={sse}
              />
              <BookSidebar bookId={route.bookId} theme={theme} t={t} sse={sse} />
              <BookSidebarToggle bookId={route.bookId} theme={theme} t={t} sse={sse} />
            </div>
          )}
          {route.page === "book-settings" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <BookDetail bookId={route.bookId} nav={nav} theme={theme} t={t} sse={sse} />
            </div>
          )}
          {route.page === "chapter" && (
            <div className="mx-auto w-full max-w-[1400px] px-4 py-12 sm:px-6 lg:px-10 lg:py-16 2xl:px-12 fade-in">
              <ChapterReader bookId={route.bookId} chapterNumber={route.chapterNumber} nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "analytics" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <Analytics bookId={route.bookId} nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "services" && (
            <div className="h-full">
              <ManagedModels />
            </div>
          )}
          {route.page === "project-settings" && (
            <div className="h-full">
              <ManagedModels />
            </div>
          )}
          {route.page === "service-detail" && (
            <div className="h-full">
              <ManagedModels />
            </div>
          )}
          {route.page === "truth" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <TruthFiles bookId={route.bookId} nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "daemon" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <ManagedModels />
            </div>
          )}
          {route.page === "logs" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <LogViewer nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "style" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <StyleManager nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "translation" && (
            <div className="max-w-6xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <TranslationManager nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "import" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <ImportManager nav={nav} theme={theme} t={t} initialTab={route.tab} />
            </div>
          )}
          {route.page === "radar" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <RadarView nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "doctor" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <ManagedModels />
            </div>
          )}
          {route.page === "play" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <StoryPlayer projectId={route.projectId} nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "film" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <StoryGraphTree projectId={route.projectId} nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "film-author" && (
            <div className="absolute inset-0 flex min-w-0">
              <ChatPage
                activeBookId={route.projectId}
                mode="interactive-film-authoring"
                nav={nav}
                theme={theme}
                t={t}
                sse={sse}
              />
            </div>
          )}
          {route.page === "film-studio" && (
            <Suspense fallback={<div className="p-6 text-sm">{tr("加载创作向导…", "Loading creation wizard…")}</div>}>
              <FilmWizard projectId={route.projectId} nav={nav} theme={theme} t={t} sse={sse} />
            </Suspense>
          )}
          {route.page === "flow" && (
            <Suspense fallback={<div className="p-6 text-sm">{tr("加载流程图…", "Loading flow view…")}</div>}>
              <FlowView projectId={route.projectId} nav={nav} theme={theme} t={t} />
            </Suspense>
          )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
