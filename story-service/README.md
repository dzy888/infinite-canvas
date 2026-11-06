# DmxVideo 故事服务

复用 InkOS 的创作引擎与原 API，供画布里的“故事创作”使用。New API 继续负责登录、渠道、模型授权、分组、价格与扣费，无需新增 New API 接口。

## 本地启动

使用 Node.js 24.8 或更高版本。故事数据复用 New API 的 PostgreSQL 数据库。在 New API 已启动的情况下：

```powershell
cd D:\dzyDemo\ai_video\infinite-canvas\story-service
npm ci
npm run dev
```

再在 `web` 目录执行 `bun install`、`bun run dev`，打开 `http://127.0.0.1:3001/stories`。保持前端、故事服务和 New API 三个进程运行。无需 Docker。

本地默认读取相邻 `new-api/.env` 的 `SQL_DSN`，也可用 `NEW_API_ENV_FILE` 指定文件，或用 `STORY_DATABASE_URL` 显式设置相同的 PostgreSQL 连接。数据库信息只在服务端使用。数据库不可用时启动失败，不回退到 SQLite。

默认故事服务地址 `127.0.0.1:3002`，New API 地址 `127.0.0.1:3000`。端口和环境变量在管理员进程配置中设置；不会向普通用户展示服务商配置。

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `NEW_API_URL` | `http://127.0.0.1:3000` | 已有 New API |
| `STORY_DATABASE_URL` | 优先读取进程 `STORY_DATABASE_URL`、`SQL_DSN`，再读取 New API 环境文件 | 与 New API 相同的 PostgreSQL 连接 URL |
| `NEW_API_ENV_FILE` | `../../new-api/.env` | 相对服务工作目录的 New API 环境文件 |
| `STORY_PORT` | `3002` | 故事服务端口 |
| `STORY_HOST` | `127.0.0.1` | 监听地址 |
| `STORY_DATA_DIR` | 相对服务工作目录的 `../data/stories` | 旧数据迁移来源及账号进程目录，必须位于 `story-service` 源码目录之外 |
| `STORY_PUBLIC_ORIGINS` | `http://127.0.0.1:3001,http://localhost:3001` | 画布公开访问地址，逗号分隔 |
| 前端进程 `STORY_URL` | `http://127.0.0.1:3002` | Vite 故事代理地址 |

先在“创作设置”选择文本模型，需要封面或分镜插图时再选择图片模型。列表复用画布的 New API 定价目录解析，只显示 InkOS 能调用的 OpenAI 兼容协议模型；模型应支持工具调用。文本支持 Chat Completions 与 Responses。管理员配置的实际上下文、分组倍率和计费规则保持由 New API 决定。

## 数据与隔离

作品、章节、会话、版本、翻译、创作事件、剧情状态和检索投影都写入 New API 当前 PostgreSQL 库的 `dmx_story` schema。文件型业务内容复用原引擎读写接口，由适配层存入数据库；原 SQLite 事件、剧情和搜索内核使用 PostgreSQL。普通用户不需要配置数据库。画布和“我的素材”仍为浏览器本地数据。

目录使用 `(user_id, parent_path, name)` 索引；事件和剧情记录使用账号、存储命名空间、作品、父记录及事件序号索引；JSON 条件与全文检索使用 GIN 索引。多文件提交、剧情批量更新、事件追加与版本恢复使用事务，追加事件锁定所属创作过程分配序号。用户进程只取得随机内部存储凭证，账号由网关绑定；不向用户进程传数据库密码。

每个账号首次访问时会从 `data/stories/<New API 用户ID>` 读取旧文件与 SQLite（只读），在事务中导入并核对文件内容、事件数据及数量，成功后记录迁移标记。数据库版本快照转换为稳定的关系记录快照，同时更新对应版本校验值，保留原版本 ID。原目录保持原样作为迁移备份；后续故事读写以 PostgreSQL 为准。遇到未知表或不一致数据会拒绝覆盖。备份故事数据时，随 New API 一起备份 PostgreSQL，并包含 `dmx_story` schema；确认备份可恢复后再自行处理旧目录。不迁移现有画布 IndexedDB 数据。

用户的登录凭据只在网关内存中使用，不写入作品。内部引擎只获得随机转发凭证；实际模型调用由网关带当前用户会话发送到已有 `/api/canvas/relay`。退出/撤销会话后 New API 会继续拒绝后续调用。浏览器文件、图片、导出及事件流也验证账号归属；服务重启后重新绑定故事会话即可继续访问已保存内容。

原版的密钥、环境导入、外部通知、检测服务和无人值守调度管理页不向普通用户开放。资料通过上传或粘贴正文导入，避免服务端代读任意网址。CLI/TUI 继续保留在独立 InkOS 仓库，不作为前台入口。

## 部署

反向代理将 `/inkos-api/`（保留路径，关闭缓冲）转给故事服务，`/api/` 继续转给 New API；两者与画布使用同一公开域名。将 `STORY_PUBLIC_ORIGINS` 设置为该域名的完整 HTTPS origin。仓库 Nginx 模板支持 `STORY_URL`。`docker-compose.local.yml` 需设置 `STORY_DATABASE_URL` 为 New API 同一 PostgreSQL 库，提供可选本地构建配置，Docker 部署尚需实际验收。

## 代码来源与验证

版本与修改点见 [vendor/UPSTREAM.md](vendor/UPSTREAM.md) 和随附 AGPL 许可证。`vendor/core`、`vendor/studio` 保留原有业务实现；前端位于 `web/src/features/stories/inkos`。`src/gateway.ts` 适配认证、模型和进程隔离，`src/storage` 适配 PostgreSQL 存储与一次性旧数据导入。

```powershell
npm test
npm run typecheck
```

普通测试使用独立临时目录和模拟上游。设置 `STORY_TEST_DATABASE_URL` 后，会在同一 PostgreSQL 服务器建立随机的隔离测试 schema，运行原始 InkOS HTTP/API、账号隔离、模型转发、旧数据只读迁移、事务回滚、并发追加、剧情状态、中文检索、历史版本校验及索引命中测试，结束后删除测试 schema 和临时目录；不会写入真实账号数据。真实渠道效果和扣费需在实际账号下验收。
