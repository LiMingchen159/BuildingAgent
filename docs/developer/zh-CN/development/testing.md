# 测试与验证

[English](../../en/development/testing.md) | [开发者文档首页](../README.md) | [配置与本地运行](configuration.md) | [排障和已知契约差距](troubleshooting.md)

> 产品代码基线：`main@af44ff15`；S9 文档分支基线：`df2dea95`，二者的产品代码相同，分支差异仅为文档/图形。状态：workspace 测试、类型检查、构建和 smoke runner 入口为 **已实现**，但 S9 实测只有 Web、typecheck 与 build 通过；API、CLI 和 smoke 均保留已复现失败，因此整体回归不是绿色。测试发现/fixture 隔离为 **部分实现**；仓库级 CI、lint、coverage、浏览器 E2E 及文档链接检查器为 **规划中**。

## 1. 状态与代码基线

根 [`package.json`](../../../../package.json) 通过 npm workspaces 组织 API、CLI 和 Web。三个 workspace 都提供 `test`、`typecheck` 与 `build`；根脚本另外提供测试分派和 smoke。当前 `.github` 只有 issue/PR 模板，没有 workflow，因此这些命令是本地门禁，不是已有 CI 的状态检查。

| 门禁 | 当前状态 | 事实边界 |
| --- | --- | --- |
| API Vitest | **部分实现 / 本次失败** | `--dir src` 收集 53 个文件、402 项；受控 fixture 环境中 399 通过、3 失败。原始 clean checkout 因两个硬编码文件假设另有 2 项失败。 |
| CLI Vitest | **部分实现 / 本次失败** | 串行收集 3 个文件、9 项，8 通过、1 失败；并行还可能争用共享 SQLite。显式 mock 不会消除该失败。 |
| Web Vitest | **已实现 / 本次通过** | Vite config 已将发现范围限制在 `src/**/*.test.ts(x)`；正确命令收集 9 个文件、77 项并全部通过。额外传 `--dir src` 会得到 0 collected/exit 1。 |
| workspace typecheck / build | **已实现 / 本次通过** | 三个 workspace 均通过；Web build 报告 863.30 kB chunk warning。它们不执行 lint、coverage 或浏览器验收。 |
| 本地 smoke | **部分实现 / 本次失败** | 显式 mock 时完成 build、health、登录、项目与管理链路，但最终 assistant 文本断言失败；不是生产探测或完整 E2E。 |
| 测试与 fixture 隔离 | **部分实现** | API 有硬编码 KB/PNG fixture 假设；`projectFeedback.test.ts` 会在默认项目 repository 下创建/删除 fixture；CLI 并行可触发 SQLite lock。 |
| 文档、Draw.io 与秘密门禁 | **部分实现** | M011 以只读命令和人工复核执行；仓库没有可复用的链接/双语/图形/秘密扫描脚本。 |
| CI、lint、coverage、浏览器 E2E | **规划中** | `package.json` 没有相应脚本，仓库也没有 GitHub Actions workflow；不能把缺少门禁解释为通过。 |

## 2. 功能目的及边界

本页定义开发者和 PR 审查者可重复执行的最小验证序列，并明确每个结果属于哪个 commit、工作树和测试集合。它用于发现文档改动是否意外改变产品回归结果，也用于避免把旧分支、未跟踪构建备份或现场数据混入测试。

本页不负责：

- 证明全部产品行为、性能、安全性、可访问性或现场 BMS/FDD 正确；
- 把单元/集成测试升级为真实浏览器、真实 provider、真实 collector 或现场 commissioning；
- 修复失败测试、Vitest include/exclude、fixture 隔离、缺失 CI 或 bundle warning；
- 把未合并 M007 候选的 FDD 结果记到产品 `main`；
- 仅凭进程退出码隐藏失败、跳过、warning、测试收集路径或运行环境。

## 3. 用户入口和关键源码入口

先在基于所核对 commit 的干净 worktree 中按 lockfile 安装依赖，再从仓库根目录执行。推荐的源码定向回归命令是：

```bash
npm --workspace @building-agent/api exec -- vitest run --dir src
npm --workspace @building-agent/cli exec -- vitest run --dir src --no-file-parallelism
npm --workspace @building-agent/web exec -- vitest run
npm run typecheck
npm run build
BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke
```

| 入口 | 行为 | 关键定义 |
| --- | --- | --- |
| API `vitest run --dir src` | 把无本地 Vitest config 的 API 发现根限定到 `src`。正式复现还应使用一次性 `BUILDING_AGENT_DATA_DIR`。 | [API package](../../../../apps/api/package.json) |
| CLI `vitest run --dir src --no-file-parallelism` | 限定源码发现根，并串行运行文件以避免本次实测已出现的共享 SQLite `database is locked`。串行只提高可复现性，不豁免断言失败。 | [CLI package](../../../../apps/cli/package.json) |
| Web `vitest run` | 直接使用 Vite config 中已有的 `src/**/*.test.ts(x)` include。**不要**追加 `--dir src`；该组合实测为 0 collected/exit 1。 | [Web package](../../../../apps/web/package.json)、[Vite 配置](../../../../apps/web/vite.config.ts) |
| `npm test` | [`run-tests.cjs`](../../../../scripts/run-tests.cjs) 无定向参数时依次调用所有 workspace 的默认 `vitest run`。 | [根 package](../../../../package.json)、[测试分派器](../../../../scripts/run-tests.cjs) |
| `npm test -- apps/api/src/<file>.test.ts` | 根分派器按路径前缀只运行对应 workspace 的指定文件，适合失败复现。 | [测试分派器](../../../../scripts/run-tests.cjs) |
| `npm run typecheck` | 对每个有脚本的 workspace 运行 `tsc --noEmit`。 | 三个 workspace package 与各自 `tsconfig.json` |
| `npm run build` | 编译 API/CLI；Web 先 typecheck，再 Vite 打包并修正产物读取权限。 | 三个 workspace package、[Vite 配置](../../../../apps/web/vite.config.ts) |
| `BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke` | 显式选择 mock，构建、探测或启动本地 API/Web，再用隔离 CLI home 执行跨表面流程；当前仍在最终文本断言失败。 | [`smoke-local.cjs`](../../../../scripts/smoke-local.cjs) |

Web 的 [`vite.config.ts`](../../../../apps/web/vite.config.ts) 明确把测试限制为 `src/**/*.test.ts(x)` 并使用 `jsdom` 与 jest-dom setup。API 和 CLI 没有仓库内 Vitest 配置，所以它们显式使用 `--dir src`；Web 必须保留其默认 config 发现方式。CLI 另加串行选项，是因为本次并行执行出现过 SQLite lock，而不是为了改变测试语义。

根 `npm test` 只允许在同时满足“没有真实本地 KB/repository 数据”和“没有 `dist.predeploy-*` / `dist.prehotfix-*` 备份目录”的干净环境运行；它还不会自动加入 CLI 串行开关。因此日常与里程碑回归应使用上面的三个 workspace-specific 命令，不能用根命令替代本页基线。

## 4. 正常验证流

1. 从准备验证的完整 SHA 建立独立 worktree，记录 `git rev-parse HEAD`、Node/npm 版本、操作系统与时区；确认没有借用原业务工作树的修改、真实 KB/repository 数据或 `dist.pre*` 备份目录。
2. 使用 `package-lock.json` 安装一致依赖，先记录 `git status --short`。被忽略文件不会出现在普通 status 中，因此还要单独检查本地数据根和备份构建目录。
3. 按 API → CLI → Web 顺序运行各自的推荐命令：API/CLI 用 `--dir src`，CLI 再用 `--no-file-parallelism`，Web 使用 Vite config 的默认 include。分别保存收集数、通过/失败/跳过数、失败测试全名和退出码；不要只保留一个汇总数字。
4. 运行根 `typecheck` 和 `build`。构建 warning 应单独登记；“退出码为 0”不等于没有 warning。
5. 在专用本地端口运行 smoke。确认目标 URL 是临时/本地实例，而不是共享或生产服务；记录脚本是复用了已运行服务还是自行启动子进程。
6. 执行双语文件镜像、语言切换、相对链接/图片/源码路径、两次点击可达性、Draw.io 重导出、嵌入 XML、可读性、秘密扫描、`git diff --check` 和变更范围门禁。
7. 将结果与同一产品代码基线的干净 `main` 比较。`df2dea95` 相对 `main@af44ff15` 只有文档/图形差异；本次 API 3 项、CLI 1 项和 smoke 1 个终态失败属于已复现基线，不应描述为 M011 新失败，也不能描述为通过。失败集合必须记录测试全名和 fixture/provider 条件。
8. 最后再次检查 diff，确保回归产生的 `dist`、`apps/data`、项目 repository、日志或临时凭据没有进入提交。

M011 没有新增文档验证脚本，所以上述文档检查在本 PR 中仍是一次性只读检查和人工审查。未来若将其自动化，应把同一判定固化为版本化脚本和 CI，而不是依赖某次 PR 日志。

## 5. 数据、状态及持久化

| 产物或状态 | 生命周期与风险 |
| --- | --- |
| Vitest stdout/stderr | 仅存在于终端或外部日志；仓库没有 coverage reporter 或测试结果归档。记录时要包含命令、SHA 和环境。 |
| `apps/*/dist` | `npm run build` 生成的可重建产物，通常由 `.gitignore` 忽略；不是源码，也不应作为测试发现根。 |
| `dist.predeploy-*` / `dist.prehotfix-*` | 本地未跟踪备份；M011 前置分析观察到根 `npm test` 会误收集其中测试。正式门禁使用 workspace-specific 发现方式：API/CLI 用 `--dir src`，Web 使用 Vite include。 |
| API 测试项目数据 | 一次性 `BUILDING_AGENT_DATA_DIR` 隔离写入。原始 clean checkout 缺少测试硬编码的 `project_mortar` `bldg40.ttl` 与 repository PNG，得到 397/402；把仓库内公开 Turtle/PNG fixture 复制为预期名称后，相关 2 项定向复跑为 2/2，完整套件变为 399/402。这个补齐是测试环境适配，不是产品数据。 |
| API feedback fixture | [`projectFeedback.test.ts`](../../../../apps/api/src/projectFeedback.test.ts) 使用固定 `project_element` / `project_demo` 和 [`repoRootForProject`](../../../../apps/api/src/agent/knowledgeBase.ts)，会创建脚本并递归删除 `project_demo/repository/feedback_tools`；不得让它落到真实数据根。 |
| CLI SQLite 状态 | 多个测试文件并行启动 server 时，本次实测曾出现 `database is locked`；正式结果使用 `--no-file-parallelism` 稳定复现 8/9，而不是把 lock 当作业务断言结果。 |
| Smoke CLI 状态 | smoke 用临时 `BUILDING_AGENT_CLI_HOME` 保存 token/项目选择，并在退出时删除；输出会脱敏 fixture password 和 Bearer token。 |
| Smoke API 状态 | 新启动 API 可写本地 `apps/data/store.json`；若 health probe 发现已有服务，smoke 会复用它并执行登录、项目选择和 Chat 写入。不要对含真实用户数据的实例运行。 |
| 文档与图形结果 | Markdown、`.drawio` 和 `.drawio.svg` 是本里程碑唯一权威交付；临时 PNG、重导出副本和验证日志不提交。 |

“干净 worktree”不仅指 tracked diff 为空，还指测试目标中没有真实本地 KB/repository 数据和旧构建备份。若不能保证这一点，应停止并改用隔离 worktree/数据根，不能通过清理真实目录来制造干净状态。

## 6. 权限与项目隔离

单元测试中的 seed token、示例邮箱和项目 id 只用于 fixture，不能复用生产凭据。测试日志、失败快照和 PR 正文不得包含真实 API key、Bearer token、BMS 密码、私有 collector 地址或用户文档内容。

API 测试必须把持久化根指向临时位置，或在确认没有真实项目数据的独立 worktree 执行。尤其不能在已有 `data/project_demo/repository/feedback_tools` 时运行当前 `projectFeedback` fixture，因为它会删除同名目录。新测试应使用唯一临时目录并在自己创建的边界内清理。

Smoke 接受 `SMOKE_API_URL` 和 `SMOKE_WEB_URL`，且会复用健康的现有服务；这些变量扩大了目标范围，却不会增加授权。操作者必须核对主机、端口和数据集，只能指向为测试准备的本地实例。Smoke 中服务端仍执行真实 membership/project selection，但这不授权对共享环境写入 fixture Chat。

文档验证只允许读取源码和受控附件摘要。秘密扫描命中时先确认内容是否为公开 fixture；真实秘密必须从工作树和历史中按安全流程移除，而不是在文档中列出其值。

## 7. 错误、降级及外部依赖

| 情况 | 判定与处置 |
| --- | --- |
| Vitest 未收集预期文件 | 失败；先核对 workspace cwd、文件名和 config，不能记作“0 项通过”。Web 追加 `--dir src` 已实测为 0 collected/exit 1，正确做法是移除该参数。 |
| API 缺少硬编码 fixture | 原始 clean checkout 会多出 2 项 Chat 失败；只可从 tracked public fixture 补入一次性隔离根并单独证明 2/2，不能复制真实 KB/用户文件，也不能把 fixture gap 算作产品通过。 |
| API 保留 3 项失败 | 记录下列精确全名；文档分支没有业务代码变化，因此不在 M011 修复，也不能用“399 通过”掩盖。 |
| CLI 并行 SQLite lock | 用 `--no-file-parallelism` 稳定复现；这是共享状态隔离缺口。串行后的 1 项 Chat 失败仍必须保留。 |
| CLI provider 差异 | 无 provider 时同一 Chat case 收到 502；显式 mock 时仍为 8/9，因为响应 `fallbackUsed: true`，测试期待 `false`。两种模式都不是绿色基线。 |
| Web/typecheck/build | 本次均通过；Web build 的 863.30 kB chunk 是 warning，不能写成全无告警。 |
| Smoke 最终断言 | 显式 mock 已完成 build/health/login/session/projects/use/registry/management/chat，但固定 unavailable 文本不回显输入，最终 assistant text assertion 失败并 exit 1。前序阶段通过不等于 smoke 通过。 |
| Smoke 端口占用 | 脚本会先 probe 并可能复用服务；若服务不是隔离 fixture，应中止，不能把“可达”当作正确目标。 |
| Provider、collector、网络或系统工具不可用 | 单元测试应使用 mock/stub；显式 mock 仍须满足测试/Smoke 契约，不能因其是本地 provider 而豁免断言。真实外部依赖不可用也不能改写为通过。 |
| Draw.io 重导出有差异 | 先区分工具生成的非确定 id 与内容变化，再使用约定的 draw.io 31.1.8 导出/规范化流程核对；不能只检查 SVG 是否存在。 |
| 文档链接、镜像、秘密或 scope 门禁失败 | PR 失败；修正文档后重新运行。M011 不修改业务代码来绕过文档门禁。 |

受控 fixture 完整 API 运行在 53 个文件、402 项中稳定复现以下 3 项失败：

- `projectGrounding > builds a stream activity payload for retrieved site rules`
- `projectRules > backfills legacy running rule with trigger topics`
- `fetchEnteliLiveValue > reads WCC_1_Chilled_Water_Temp when catalog and enteliWEB are reachable`

它们与 M011 前置工作线观察到的三类失败相同；这里的价值是已在产品 `main@af44ff15` 等价代码上重新得到精确集合。该集合是已知基线，不是永续白名单：后续业务修复后应要求全绿，而不是继续允许失败。

CLI 串行留下的完整测试名为 `authenticated cli commands > logs in, persists auth, selects a project, and reuses it for chat in fresh invocations`：无 provider 时 Chat 调用以 502 提前失败；显式 mock 时走到 metadata 断言并因 `fallbackUsed` 不符失败。Smoke 的最终失败对应 runner 的 “Chat command did not include the assistant response” 断言。

## 8. 扩展方法

新增测试时把文件放在对应 `src` 模块旁，使用 `.test.ts` / `.test.tsx`，并同时覆盖成功、拒绝、项目越权、malformed input、外部依赖失败和秘密不泄漏。Web 测试要满足现有 Vite include，不要再叠加 `--dir`；API/CLI 在未来独立 issue 中应增加明确 include/exclude，消除对调用方传 `--dir src` 的依赖。

任何写文件的 fixture 都应使用 `mkdtemp` 或等价临时根，把环境变量显式传入被测 server/store，并只删除测试自己创建的精确目录。把当前硬编码的 `bldg40.ttl`/PNG 前置条件改成测试内自建 fixture；避免固定 `project_demo` 指向默认仓库根。CLI server/store 也应按文件隔离 SQLite，而不是永久依赖串行运行；cleanup 失败要报告，不能扩大删除范围。

新增根门禁时保持职责可组合：测试、typecheck、build、smoke、lint、coverage、E2E 和文档检查分别可运行，再由 CI 编排。CI 应固定 Node/npm、安装方式和 timeout，上传结构化测试结果，但对 token、环境变量和日志进行脱敏。新增 workflow、依赖、脚本或业务修复不属于 M011，应另开 issue。

调试失败时先最小化到单文件，例如：

```bash
npm --workspace @building-agent/api exec -- vitest run src/projectFeedback.test.ts
```

随后在同一环境重跑对应的完整 workspace 门禁，避免“单测通过”掩盖顺序、共享状态或收集范围问题。Smoke/provider 修复还应同时验证无 provider、显式 mock 和允许 fallback 三种契约，使 runner 断言与实际 assistant 文本/metadata 一致。

## 9. 对应测试与本次结果

API 测试覆盖 Fastify 路由、鉴权、Chat/Agent、BMS、Derived Metrics、Dashboard、Memory/Grounding、Repository 与 Reports；CLI 测试覆盖配置、命令和 placeholder registry；Web 测试使用 jsdom 覆盖 API client、工作区交互和主要页面组件。具体入口可从三个 workspace 的 `src/**/*.test.*` 追踪。

S9 实测环境为 Node.js `v20.20.2`、npm `10.8.2`、Linux `6.8.0-53-generic` x86_64、`Asia/Shanghai`（CST），执行日期 `2026-08-28`；代码回归开始时的干净 worktree HEAD 为 `df2dea95e0eb79f467d506c7f9866a56a83fccad`。

<!-- M011-S9-REGRESSION-RESULTS:START -->
<!-- 代码回归已按 root 实测回填；最终提交前只回填后三项文档门禁，不得把 API/CLI/smoke 的既有失败改写为通过。 -->

| 门禁 | 执行入口 | 结果 | 备注 |
| --- | --- | --- | --- |
| API source-only | `npm --workspace @building-agent/api exec -- vitest run --dir src` | **失败：399/402 通过** | 53 files：50 passed、3 failed；使用一次性隔离数据根和受控 public fixtures。原始 clean checkout 为 397/402、5 failed；额外 2 项在补 fixture 后定向 2/2 通过。精确 3 项见第 7 节。 |
| CLI source-only（串行） | `npm --workspace @building-agent/cli exec -- vitest run --dir src --no-file-parallelism` | **失败：8/9 通过** | 3 files；无 provider 时 Chat 收到 502。显式 mock 复跑仍为 8/9，因响应 `fallbackUsed: true` 而测试期待 `false`；初始并行运行另出现 SQLite lock。 |
| Web source-only | `npm --workspace @building-agent/web exec -- vitest run` | **通过：77/77** | 9 files 全部通过；jsdom 不是浏览器 E2E。追加 `--dir src` 实测 0 collected/exit 1，不能使用。 |
| Typecheck | `npm run typecheck` | **通过** | API、CLI、Web 三个 workspace 全部通过。 |
| Build | `npm run build` | **通过，有 warning** | 三个 workspace 全部构建；Web 报告 863.30 kB chunk 超过 500 kB。 |
| Local smoke | `BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke` | **失败：exit 1** | build/health/login/session/projects/use/registry/management/chat 均完成；mock 固定 unavailable 文本未回显输入，最终 assistant text assertion 失败。 |
| 双语、链接、可达性与源码路径 | PR 一次性只读检查 | **通过** | 中英文各 25 页且相对文件列表一致；51 个 Markdown 共 0 个断链、0 个缺失互链、0 个不可达或超过两次点击页面；22 个候选提交源码对象均存在。 |
| Draw.io 源/嵌入 XML/重导出/可读性 | draw.io 31.1.8 + 人工复核 | **通过：6/6** | 6 组源/SVG 均含嵌入 XML；重新导出并规范化生成 ID 后逐字节 0 差异，切片审校已完成可读性复核。 |
| 秘密、diff 与文件范围 | 只读扫描 + `git diff --check` | **通过** | 凭据特征扫描 0 命中；`git diff --check` 通过；S9 仅改 README、6 个开发页与 6 个功能页中的验证命令，无业务代码 diff。 |

<!-- M011-S9-REGRESSION-RESULTS:END -->

API 的受控 fixture 运行使用一次性 `BUILDING_AGENT_DATA_DIR`，并从仓库 tracked public fixture 补入测试硬编码期待的 `bldg40.ttl` 与 `bldg40_RM1013_zone_air_temp_last_year.png` 名称。这个步骤解释 clean checkout 的额外两项失败，但不会改变上面仍存在的三项产品断言失败。CLI 的稳定结果来自串行运行；并行出现的 lock 和串行留下的 Chat 断言是两个不同问题。Smoke 的前序阶段完成也不能覆盖最终非零退出。

M011 前置分析在未合并 M007 候选工作线上运行过六个 FDD 定向文件，历史记录为 **52 项全部通过**。产品 `main@af44ff15` 没有 `apps/api/src/fdd/**` producer、catalog/evaluator/deployability/Task 代码或对应专用测试；它只有 Reports 对外部 `fdd_rule` evidence 的消费契约测试。因此 S9 不在 `main` 上伪造“FDD 52 项跳过/通过”，也不把候选数字加入上表的产品总数。完整证据边界见[验证和样本溯源](../fdd/verification-provenance.md)。

## 10. 已知限制及关联文档

- 仓库没有 GitHub Actions workflow；本页命令不会自动成为 required check。
- 没有统一 lint、coverage、浏览器 E2E、性能、可访问性、文档链接或秘密扫描脚本；未运行的维度必须标为未验证。
- API/CLI 的默认 Vitest 发现边界未固定在配置中；它们依赖显式 `--dir src`，而 Web 必须使用已有 Vite include。根 `npm test` 在含 `dist.pre*` 的脏工作树不可信，也没有 CLI 串行保护。
- API clean checkout 缺测试硬编码的 `bldg40.ttl`/PNG 前置条件；受控补齐后仍有 3 项断言失败。`projectFeedback` fixture 还可能写入/删除默认项目 repository。
- CLI 没有绿色基线：串行时 8/9，并行还可能 SQLite lock；无 provider 与显式 mock 暴露同一 Chat case 的不同契约失败。
- Smoke 是本地跨表面检查，会写入测试 Chat 状态，也可能复用已有健康服务；本次显式 mock 在最终 assistant 文本断言失败，因此不能列为通过。
- jsdom Web 测试不验证真实浏览器布局、SSE/WS 网络栈、下载、麦克风或屏幕阅读器行为。
- FDD 52 项只属于未合并候选历史；产品 main 的 FDD producer/runtime 仍不存在。
- 构建通过但实测有 863.30 kB Web chunk warning；M011 只记录，不调整拆包或依赖。

继续阅读[配置与本地运行](configuration.md)、[排障和已知契约差距](troubleshooting.md)、[当前实现架构](../architecture/current-architecture.md)、[CLI](../features/cli.md)和[验证和样本溯源](../fdd/verification-provenance.md)。
