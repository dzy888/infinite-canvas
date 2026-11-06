<p align="center">
  <img src="web/public/logo.svg" width="96" alt="infinite-canvas logo">
</p>

<h1 align="center">无限画布 (infinite-canvas)</h1>

<p align="center">
  <a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
  <a href="https://render.com/deploy?repo=https://github.com/basketikun/infinite-canvas"><img src="https://img.shields.io/badge/Render-Deploy-46e3b7?style=flat-square&logo=render&logoColor=111111" alt="Deploy to Render"></a>
  <a href="https://github.com/basketikun/infinite-canvas"><img src="https://img.shields.io/github/stars/basketikun/infinite-canvas?style=flat-square&logo=github" alt="GitHub stars"></a>
  <a href="https://github.com/basketikun/infinite-canvas/tags"><img src="https://img.shields.io/github/v/tag/basketikun/infinite-canvas?style=flat-square&label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-f97316?style=flat-square" alt="License"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://reactrouter.com/"><img src="https://img.shields.io/badge/React_Router-7-ca4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router"></a>
</p>

<p align="center">
<a href="https://trendshift.io/repositories/50077?utm_source=repository-badge&amp;utm_medium=badge&amp;utm_campaign=badge-repository-50077" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/repositories/50077" alt="basketikun%2Finfinite-canvas | Trendshift" width="250" height="55"/></a>
</p>

<p align="center">
  <a href="docs/content/docs/overview/quick-start.mdx">快速开始</a> · <a href="docs/content/docs/overview/features.mdx">功能介绍</a> · <a href="docs/content/docs/overview/render.mdx">Render 部署</a> · <a href="docs/content/docs/overview/docker.mdx">Docker 部署</a> · <a href="docs/content/docs/canvas/canvas-node-manual.mdx">画布节点操作手册</a> · <a href="docs/content/docs/canvas/canvas-shortcuts.mdx">画布快捷键</a> · <a href="SECURITY.md">漏洞提交</a> · <a href="docs/content/docs/progress/todo.mdx">待办事项</a> · <a href="canvas-agent/README.md">本地 Canvas Agent</a> · <a href="plugins/infinite-canvas">Codex app 插件</a>
</p>

无限画布是一款面向图片创作的开源工作台。它把画布编排、AI 图片生成、参考图编辑、对话助手、提示词库和素材沉淀放在同一个界面里，适合用来探索视觉方案并连续迭代图片结果。

> [!CAUTION]
> 项目目前处于开发阶段，不保证历史数据兼容。各种本地存储格式都可能直接调整，欢迎关注后续更新。
>
> 如果你需要稳定维护自己的分支，建议自行 fork 后独立开发。二次开发与 PR 请保留原作者信息和前端页面标识。

## 赞助商

<table>
  <tr>
    <td width="190" align="center">
      <a href="https://kunrouai.com/?utm_source=infinite-canvas" target="_blank" rel="noopener noreferrer"><img src="assets/kunrouai.svg" width="163" alt="坤肉AI"></a>
    </td>
    <td>
      <a href="https://kunrouai.com/?utm_source=infinite-canvas" target="_blank" rel="noopener noreferrer">坤肉AI</a> 是一站式 AI 视觉创作平台，集 AI 生图、视频生成、多人协作画布及 Agent/MCP 连接于一体，适合个人创作与团队协作，同时面向企业提供源码出售及私有化部署服务，欢迎企业咨询合作！另有 <a href="https://api.kunrouai.com/?utm_source=infinite-canvas" target="_blank" rel="noopener noreferrer">API 开放平台</a>，提供丰富的 AI 模型 API 接口，支持快速接入与集成，欢迎开发者及企业对接合作！
    </td>
  </tr>
  <tr>
    <td width="190" align="center">
      <a href="https://go.apimart.ai/gh-infinite-canvas" target="_blank" rel="noopener noreferrer"><img src="assets/apimart.png" width="163" alt="APIMart"></a>
    </td>
    <td>
      感谢 <strong><a href="https://go.apimart.ai/gh-infinite-canvas" target="_blank" rel="noopener noreferrer">APIMart</a></strong> 赞助了本项目！<strong><a href="https://go.apimart.ai/gh-infinite-canvas" target="_blank" rel="noopener noreferrer">APIMart</a></strong> 是专注 AI 图片/视频生成的低价 API 平台，GPT-Image-2 低至 <strong>$0.006/张</strong>，<strong>1 美元</strong>可出图 <strong>160+ 张</strong>。图片、视频一套异步 API 通吃，提交任务拿 ID、回调取结果，跑批万张不超时、换模型不改代码。按量付费、无月费，通过 <strong><a href="https://go.apimart.ai/gh-infinite-canvas" target="_blank" rel="noopener noreferrer">此注册链接</a></strong> 注册即可开用。
    </td>
  </tr>
  <tr>
    <td width="190" align="center">
      <a href="https://www.atlascloud.ai/zh?utm_source=github&utm_medium=link&utm_campaign=infinite-canvas" target="_blank" rel="noopener noreferrer"><img src="assets/atlascloud.svg" width="163" alt="Atlas Cloud"></a>
    </td>
    <td>
      <a href="https://www.atlascloud.ai/zh?utm_source=github&utm_medium=link&utm_campaign=infinite-canvas" target="_blank" rel="noopener noreferrer">Atlas Cloud</a> is a full-modal AI inference platform that gives developers a single AI API to access video generation, image generation, and LLM APIs. Instead of managing multiple vendor integrations, you connect once and get unified access to 300+ curated models across all modalities. Check out <a href="https://www.atlascloud.ai/console/coding-plan" target="_blank" rel="noopener noreferrer">Atlas Cloud's new coding plan promotion</a> for more budget-friendly API access.
    </td>
  </tr>
  <tr>
    <td width="190" align="center">
      <a href="https://metaso.cn/minimax-h3/?s=inf" target="_blank" rel="noopener noreferrer"><img src="assets/metaso.jpg" width="163" alt="秘塔科技"></a>
    </td>
    <td>
      <strong>MiniMax H3 视频生成 API｜秘塔科技</strong> 秘塔科技提供高性价比的 MiniMax H3 视频生成服务：<strong>768P 仅 0.09 元/秒，2K 仅 0.15 元/秒</strong>。支持原生 2K、音画同步，API 兼容 <strong>OpenAI 协议</strong>，同时支持 <strong>ComfyUI</strong>，无需自行部署 GPU。 🎁 通过 <a href="https://metaso.cn/minimax-h3/?s=inf" target="_blank" rel="noopener noreferrer">无限画布专属链接注册</a>，即可领取赠送额度及专属优惠。
    </td>
  </tr>
  <tr>
    <td width="190" align="center">
      <a href="https://88api.ai/sign-up?aff=zbs9" target="_blank" rel="noopener noreferrer"><img src="assets/88api.png" height="80" alt="88API"></a>
    </td>
    <td>
      <strong>88API｜无限画布 深度优化分支</strong>
      让主流模型能力结合得更紧密，内置海量提示词、满参满血！
      🎨&nbsp;支持 GPT-Image、Gemini、Grok 等图片模型；原生 124K 全部同价！
      🎬&nbsp;支持 Seedance、H3、Kling、Wan、Grok、Veo、omni 等视频模型；
      🎙️&nbsp;支持 Whisper、TTS、STT 等语音能力。
      从文案、出图、改图，到视频生成与配音，一张画布串联完整创作链路。不只是模型聚合，更让不同模型在同一工作流中真正协同。👉&nbsp;立即体验 🎁&nbsp;通过 <a href="https://88api.ai/sign-up?aff=zbs9" target="_blank" rel="noopener noreferrer">无限画布专属链接注册</a>，即可赠送额度及专属优惠。
    </td>
  </tr>
  <tr>
    <td width="190" align="center">
      <a href="https://www.infistar.cc/register?aff=4X3V9NA9&ref_source=link" target="_blank" rel="noopener noreferrer"><img src="assets/infistar.png" width="163" alt="Infistar.ai 无限星河"></a>
    </td>
    <td>
      <strong>无限画布 × Infistar.ai 无限星河｜内置原生画布 · 全能多模态 API</strong> 💡 原生集成，即点即用： Infistar.ai 已原生上架无限画布！同时提供低至官方 1 折的稳定 API 中转服务，模型倍率与调用明细全程透明。 🎨 多模态生图/生视频： 完美适配 Seedance、FLUX、Midjourney、Sora、Runway、Luma、可灵（Kling）等顶级图片与视频大模型。 🧠 全系语言模型： 覆盖 OpenAI、Claude、Gemini、Grok、DeepSeek、Qwen、GLM 等国内外主流模型，兼容 OpenAI 标准接口。 ⚡ 动态调度： 多路供应保障高可用，拒绝断连。 🎁 专属福利： 通过 <a href="https://infistar.ai/register?aff=4X3V9NA9&ref_source=link" target="_blank" rel="noopener noreferrer">专属链接</a> 注册，立享赠送额度/专属折扣/首充权益！
    </td>
  </tr>
  <tr>
    <td width="190" align="center">
      <a href="https://www.packyapi.com/register?aff=34VV" target="_blank" rel="noopener noreferrer"><img src="assets/packycode.png" width="163" alt="PackyCode"></a>
    </td>
    <td>
      <strong>无限画布 × PackyCode｜稳定高效的 API 中转服务商</strong>
      💡&nbsp;PackyCode 是一家稳定、高效的 API 中转服务商，提供 Claude Code、Codex、Gemini 等多种中转服务，让 AI 编程成为真正的生产力工具。
      ⚡&nbsp;稳定高效： 具备自动故障转移、智能路由和无限并发等多种功能，保障调用稳定可靠。
      🎁&nbsp;专属福利： 通过 <a href="https://www.packyapi.com/register?aff=34VV" target="_blank" rel="noopener noreferrer">专属链接</a> 注册，立即开始使用！
    </td>
  </tr>
  <tr>
    <td width="190" align="center">
      <a href="https://heyroute.ai/basketikun" target="_blank" rel="noopener noreferrer"><img src="assets/heyroute.svg" width="163" alt="HeyRoute"></a>
    </td>
    <td>
      <strong>无限画布 × HeyRoute｜全能多模态 API 服务商</strong>
      💡&nbsp;HeyRoute 深度接入无限画布，将创意构思、图片生成、视频制作与内容开发融为一体，让每个灵感都能快速落地。
      🎨&nbsp;多模态创作能力： 支持 AI 生图、生视频、图像编辑及内容生成，兼容 Seedance、MiniMax-H3、Image-2、Grok Video、Flux Klein、Gemini 等主流模型。
      🧠&nbsp;丰富模型生态： 覆盖 OpenAI、Claude、Gemini、Grok、DeepSeek、Qwen、GLM 等语言模型，并兼容 OpenAI 标准接口。
      ⚡&nbsp;稳定高效调用： 支持多模型、多线路灵活调度，调用记录清晰透明，满足日常创作、应用开发与批量生产需求。
      🎁&nbsp;专属福利： 通过 <a href="https://heyroute.ai/basketikun">专属链接</a> 注册，即可领取新用户 15 美元试用额度！
    </td>
  </tr>
</table>

## 核心功能

- 无限画布：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- AI 创作：浏览器前台直连你配置的 OpenAI 兼容接口，支持文生图、图生图、参考图编辑、文本问答、音频和视频生成。
- 画布助手：围绕选中节点和上游节点对话、生图，并把结果插回画布。
- 本地 Agent：通过本机 Canvas Agent 连接 Codex / Claude Code，让 Agent 通过 MCP 操作当前画布；
- Codex App 插件：提供 Codex app 插件，安装后会自动注册 MCP 并尝试拉起本地 Agent。
- 插件系统：支持通过 URL 动态安装 / 启用 / 更新 / 卸载远程节点插件，并提供 TypeScript SDK 自行开发画布节点插件。
- 自定义接口调用：可自定义生图 / 视频接口的调用方式，灵活适配各类中转站与自建服务。
- 提示词库：内置 7 个开源提示词来源并支持自定义标准 JSON 来源，由浏览器前端直连并缓存到 IndexedDB。

完整功能说明见 [功能介绍](docs/content/docs/overview/features.mdx)。

如果你在为担心没有合适的生图API来发愁，可以查看该免费生图项目：[chatgpt2api](https://github.com/basketikun/chatgpt2api)

## 快速开始

画布、素材和生成记录保存在浏览器本地；模型目录、余额和消费记录从 New API 获取。

本分支接入 New API 账号登录：先启动并初始化 New API（默认 `http://127.0.0.1:3000`），再启动画布（默认 `http://127.0.0.1:3001`）。画布内可注册账号，并使用同一个 New API 用户名或邮箱和密码登录。登录后只需选择模型，无需填写 API Key、Base URL 或渠道。右上角头像菜单可进入账户中心、充值与订单、账号设置；余额、消费记录、模型定价、找回密码和协议页面均在画布内完成。前后端需要同时使用包含本次改动的版本，并重启服务。

### 本地开发

```bash
git clone git@github.com:basketikun/infinite-canvas.git
cd infinite-canvas
cd web
bun install
bun run dev
```

登录验证码在 New API“系统设置 → 身份验证 → 机器人保护”中选择：默认本地图形验证码，也支持配置 Site Key/Secret Key 后使用 Cloudflare Turnstile。保存后刷新登录页即可使用。

后端地址不同时，参考 `web/.env.example` 配置 `NEW_API_URL`；账号、模型和支付请求统一通过画布同源 `/api` 代理。模型广场、账户中心由画布原生展示 New API 数据，用户无需访问管理员后台。生产环境配置画布和管理后台的精确可信 Origin；New API 的“服务器地址”（ServerAddress）须设为画布公开地址，邮件重置链接和支付返回页面才能回到画布。画布支持原有 `/user/reset`、`/wallet`、`/usage-logs` 返回路径；支付商自定义返回地址也应指向画布，服务端支付回调继续指向 New API。

### Docker 运行

```bash
git clone git@github.com:basketikun/infinite-canvas.git
cd infinite-canvas
docker compose -f docker-compose.local.yml up -d --build
```

运行后访问 `http://localhost:3001`。本地构建镜像默认通过 `host.docker.internal:3000` 连接宿主机 New API；同一 Docker 网络部署时将 `NEW_API_URL` 改为后端服务地址。

HTTPS 部署时，New API 设置 `SESSION_COOKIE_SECURE=true`，并在 `SESSION_COOKIE_TRUSTED_URL` 中加入画布及控制台的精确 HTTPS Origin。账户会话使用内存访问令牌与 HttpOnly Cookie，不将登录凭据写入浏览器存储；画布、素材、媒体文件、生成记录与配置按账号隔离保存在当前浏览器；登录不提供自动云同步。旧版未归属账号的数据原样保留，不会自动分配给任一账号。

管理员在 New API 中配置：

1. 启用渠道并配置上游密钥、模型和可用分组。
2. 配置用户所属分组、可用分组、Auto 分组顺序、模型定价及分组倍率；确保账号有余额或可用套餐。启用模型广场/定价模块，画布复用其现有 `/api/pricing` 接口（也支持设置为登录后访问）。
3. 对自定义模型名，在模型元数据中声明正确的端点类型（例如 `image-generation`、`openai-video`）；Gemini 图片模型使用 Gemini 协议。无法识别的自定义模型需要先补全元数据。
4. 重启更新后的 New API，再运行画布的 `bun run dev`；访问 `http://127.0.0.1:3001`。

同一模型只展示一次：先选用户所属分组，再按后台 Auto 顺序，最后按名称排序选择其他已授权分组；不按最低价选择，也不在失败时静默切换分组。模型价格包含当前账号适用的有效分组倍率，详情展示来源提供的上下文阶梯和缓存价格；特殊动态条件按实际请求结算，最终费用由 New API 决定。需要不同定价档位由用户自行选择时，应配置不同的模型别名。

模型、分组和有效倍率直接复用 `/api/pricing`；余额复用 `/api/user/self`，日志复用 `/api/log/self`。仅 `/api/canvas/relay/*` 保留登录会话到现有中继的必要适配。请求复用 New API 的渠道选择、限流、预扣、结算及异步失败退款逻辑，不创建 API 令牌。图片、文本、音频及 OpenAI 视频协议使用现有中继；自定义视频供应商须在 New API 配置支持 `openai_video` 的任务插件或适配器。

已完成针对性接口与计费展示测试，以及独立浏览器中的模拟支付、兑换、账号设置和找回密码验收。本机 PostgreSQL、Redis 与同源后端代理已连通；真实上游生成扣费、支付到账回调、邮件投递及生产 HTTPS 仍需使用部署配置验收。

## 效果展示

<table width="100%">
  <tr>
    <td width="50%"><img src="https://i.ibb.co/TDFvGWDT/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/zVwJq3YS/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/PvY3qhhK/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/7D04LwN/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/bj30FtS5/5.png" alt="5" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/hxRvjw51/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/jkWsF8q1/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/XrnfXHx7/image.png" alt="image" border="0"></td>
  </tr>
</table>

## 联系方式

项目定制二次开发需求 / 生图 API 需求可联系。

邮箱：1844025705@qq.com · QQ：1844025705

## 赞助支持

本项目长期开放广告赞助合作，欢迎品牌 / 产品投放，你的支持是持续更新的动力！

有广告赞助意向请通过上方联系方式沟通。

## 社区支持

学 AI，上 L 站：[LinuxDO](https://linux.do/)

点击链接加入群聊【开源无限画布(2群)】：https://qm.qq.com/q/HRt2kUnYiG

## 开源协议

本项目使用 [MIT License](LICENSE)。任何人都可以免费使用、复制、修改、分发、再授权和商业使用本项目，也可以用于闭源产品。

## Star History

<a href="https://www.star-history.com/?repos=basketikun%2Finfinite-canvas&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&legend=top-left" />
 </picture>
</a>

故事创作整合版的启动、模型设置及作品数据说明见 [故事服务说明](story-service/README.md)。
