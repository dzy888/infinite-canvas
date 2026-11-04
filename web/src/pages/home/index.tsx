import { ArrowDown, ArrowRight, ArrowUpRight, ImagePlus, Maximize2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { App, Button, Image } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import styles from "./home.module.css";

const tools = [
    { slug: "canvas", icon: Maximize2 },
    { slug: "image", icon: ImagePlus },
    { slug: "video", icon: Video },
] as const;

export default function IndexPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);

    useEffect(() => {
        void fetchPrompts({ pageSize: 12 })
            .then((data) => setPromptShowcase(data.items))
            .catch((error) => message.error(error instanceof Error ? error.message : i18n.t("home.promptError")));
    }, [message]);

    return (
        <main className={styles.page}>
            <section className={styles.hero} aria-labelledby="home-title">
                <div className={styles.grid} aria-hidden="true" />
                <div className={styles.radar} aria-hidden="true">
                    <div className={styles.radarSweep} />
                    <div className={styles.radarCore}>
                        <img src="/dmxcode-logo.png" alt="" />
                    </div>
                    <i />
                    <i />
                    <i />
                    <i />
                </div>
                <div className={styles.wrap}>
                    <div className={styles.heroContent}>
                        <p className={styles.kicker}>
                            <span />
                            DMXCODE / CREATIVE WORKSPACE
                        </p>
                        <h1 id="home-title" className={styles.title}>
                            {t("home.headline")}
                            <br />
                            <span>{t("home.headlineAccent")}</span>
                            <span className={styles.period}>.</span>
                        </h1>
                        <div className={styles.heroBottom}>
                            <p className={styles.lead}>{t("home.lead")}</p>
                            <div className={styles.actions}>
                                <Button type="primary" size="large" onClick={() => navigate("/canvas")} icon={<ArrowUpRight size={18} />} iconPlacement="end">
                                    {t("home.openCanvas")}
                                </Button>
                                <Button size="large" onClick={() => navigate("/image")} icon={<ArrowRight size={18} />} iconPlacement="end">
                                    {t("home.createImage")}
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className={styles.heroFoot}>
                        <span>
                            <i />
                            {t("home.workspaceLabel")}
                        </span>
                        <a href="#creative-tools">
                            {t("home.explore")}
                            <ArrowDown size={14} />
                        </a>
                    </div>
                </div>
            </section>
            <section id="creative-tools" className={`${styles.wrap} ${styles.tools}`} aria-labelledby="tools-title">
                <div className={styles.sectionHead}>
                    <div>
                        <p className={styles.kicker}>
                            <span />
                            {t("home.toolsLabel")}
                        </p>
                        <h2 id="tools-title">
                            {t("home.toolsTitle")}
                            <br />
                            <span>{t("home.toolsSubtitle")}</span>
                        </h2>
                    </div>
                    <p className={styles.sectionNote}>{t("home.toolsNote")}</p>
                </div>
                <div className={styles.toolList}>
                    {tools.map(({ slug, icon: Icon }, index) => (
                        <Link key={slug} to={`/${slug}`} className={styles.tool}>
                            <span className={styles.index}>0{index + 1}</span>
                            <div className={styles.toolCopy}>
                                <h3>{t(`home.tools.${slug}.title`)}</h3>
                                <p>{t(`home.tools.${slug}.description`)}</p>
                            </div>
                            <div className={styles.toolVisual} aria-hidden="true">
                                <Icon strokeWidth={1} />
                                <span />
                                <span />
                            </div>
                            <ArrowUpRight className={styles.toolArrow} size={24} strokeWidth={1.5} />
                        </Link>
                    ))}
                </div>
            </section>
            {promptShowcase.length > 0 ? (
                <section className={`${styles.wrap} ${styles.showcase}`} aria-labelledby="showcase-title">
                    <div className={styles.sectionHead}>
                        <div>
                            <p className={styles.kicker}>
                                <span />
                                {t("home.showcaseLabel")}
                            </p>
                            <h2 id="showcase-title">{t("home.showcaseTitle")}</h2>
                        </div>
                        <Link to="/prompts" className={styles.textLink}>
                            {t("home.viewPrompts")}
                            <ArrowUpRight size={18} />
                        </Link>
                    </div>
                    <div className={styles.showcaseGrid}>
                        {promptShowcase.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                className={styles.prompt}
                                onClick={() => {
                                    setPreviewIndex(index);
                                    setPreviewOpen(true);
                                }}
                            >
                                <div className={styles.promptImage}>
                                    <img src={item.coverUrl} alt={item.title} loading="lazy" />
                                </div>
                                <span>
                                    {item.title}
                                    <ArrowUpRight size={16} />
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            ) : null}
            <section className={styles.start} aria-labelledby="start-title">
                <div className={styles.wrap}>
                    <div className={styles.startCopy}>
                        <p className={styles.kicker}>
                            <span />
                            MAKE ROOM FOR IDEAS
                        </p>
                        <h2 id="start-title">
                            {t("home.startTitle")}
                            <br />
                            {t("home.startSubtitle")}
                        </h2>
                        <p>{t("home.startDescription")}</p>
                        <Button size="large" onClick={() => navigate("/config")} icon={<ArrowUpRight size={18} />} iconPlacement="end">
                            {t("home.configure")}
                        </Button>
                    </div>
                    <div className={styles.startMark} aria-hidden="true">
                        <img src="/dmxcode-logo.png" alt="" />
                        <span>DMXCODE</span>
                        <small>IMAGINE. CONNECT. CREATE.</small>
                    </div>
                </div>
            </section>
            <footer className={`${styles.wrap} ${styles.footer}`}>
                <Link to="/" className={styles.footerBrand}>
                    <img src="/dmxcode-logo.png" alt="" />
                    Dmxcode
                </Link>
                <span>
                    {t("home.credit")}{" "}
                    <a href="https://github.com/basketikun/infinite-canvas" target="_blank" rel="noopener noreferrer">
                        Infinite Canvas ↗
                    </a>
                </span>
                <Link to="/config">
                    {t("navigation.config")}
                    <ArrowUpRight size={14} />
                </Link>
            </footer>
            <Image.PreviewGroup preview={{ open: previewOpen, current: previewIndex, onOpenChange: setPreviewOpen, onChange: setPreviewIndex }}>
                <div className="hidden">
                    {promptShowcase.map((item) => (
                        <Image key={item.id} src={item.coverUrl} alt={item.title} />
                    ))}
                </div>
            </Image.PreviewGroup>
        </main>
    );
}
