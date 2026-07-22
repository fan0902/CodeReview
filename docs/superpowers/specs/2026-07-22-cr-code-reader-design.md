# CR 工程代码查看器设计规格

## 1. 产品目标

CR 是一个面向 macOS 的只读工程代码查看器。用户通过 `CR.app` 启动本地服务，应用随后在默认浏览器中打开。首版聚焦快速理解 Python 和 TypeScript 工程，不提供编辑、执行代码、Git 操作或远程同步。

首版必须满足：

1. 打开本地工程并浏览 Python、TypeScript 和 TSX 文件。
2. 提供代码高亮、文件内定位、符号定义跳转和跳转历史返回/前进。
3. 自动展示 FastAPI 与 NestJS Controller 接口，包括接口名称、HTTP 方法、完整路径、说明、入参和出参。
4. 用户可按类名搜索枚举，选择准确符号后保存；再次打开同一工程时自动展示；支持删除本地收藏。
5. 以名为 CR 的 macOS App 封装启动器，在浏览器中打开界面。
6. UI 简洁、层级清晰、代码阅读优先。

## 2. 明确边界

### 2.1 首版包含

- Python：`.py`。
- TypeScript：`.ts`、`.tsx`；`.d.ts` 在文件树中可见并可手动打开，但不参与 Controller 与枚举扫描。
- Controller：FastAPI、NestJS。
- 枚举：Python `enum.Enum`/`IntEnum`/`StrEnum` 子类；TypeScript `enum` 与 `const enum`。
- 跳转：当前工程内的定义跳转、后退和前进。
- 工程配置：最近打开工程及每个工程的枚举收藏。
- macOS：Apple Silicon 为首要交付目标；构建过程保留生成通用二进制或 Intel 包的扩展点。

### 2.2 首版不包含

- 编辑、保存或格式化源代码。
- 查找全部引用、重命名、调试或运行工程。
- Flask、Django、Express 等其他 Controller 框架。
- 动态执行源码以推断路由、类型或枚举值。
- 云端同步、账号体系、插件系统和多人协作。

## 3. 技术方案

采用“本地服务 + 浏览器 UI + macOS 启动器”结构。

### 3.1 macOS 启动器

`CR.app` 内包含一个轻量原生启动器、Node.js 运行时、构建后的服务代码和前端静态资源。

启动顺序：

1. 检查 CR 服务是否已经运行并且属于当前用户。
2. 未运行时选择空闲的本机端口并启动服务。
3. 等待 `/api/health` 返回就绪状态。
4. 用系统默认浏览器打开带一次性会话令牌的本地 URL。
5. 重复打开 `CR.app` 时复用现有服务并重新聚焦浏览器页面。

服务只监听 `127.0.0.1`。启动器维护 PID、端口和令牌信息；过期状态在启动时清理。页面通过心跳报告活跃状态，无活跃页面 15 分钟后服务自动退出；用户再次启动时重新创建。

### 3.2 本地服务

本地服务使用 TypeScript/Node.js，实现以下边界清晰的模块：

- `project-service`：选择、打开和关闭工程，校验所有文件路径都位于工程根目录内。
- `file-service`：生成过滤后的文件树并按需读取文本文件。
- `index-service`：扫描支持的源码并维护符号、Controller 和枚举索引。
- `navigation-service`：使用 TypeScript Language Service 和 Pyright 提供定义定位；统一转换为项目相对路径、行号和列号。
- `controller-service`：从语法树和类型信息生成统一的接口模型。
- `enum-service`：搜索枚举、解析成员并维护收藏状态。
- `settings-service`：原子读写本地 JSON 配置并处理损坏配置。
- `http-service`：提供受会话令牌保护的本地 API 和前端静态资源。

索引器不得执行被查看工程的代码。所有分析均基于源文本、AST 和语言服务。

### 3.3 浏览器 UI

浏览器端使用 React、TypeScript 和 Monaco Editor。状态按“当前工程、打开文件、跳转历史、信息面板、索引状态”拆分，所有文件内容由本地 API 按需加载。

## 4. 界面与交互

### 4.1 整体布局

界面采用三栏结构：

- 左栏：工程文件树。
- 中栏：代码阅读区。
- 右栏：Controller 与 Enums 信息面板。

顶部工具栏只保留工程名称、打开工程、全局文件搜索和索引状态。三栏之间可以拖动调整宽度；右栏可以折叠。代码区在任何常见窗口宽度下都占据最大可用空间。

### 4.2 视觉原则

- 默认使用明亮、中性的浅色主题，并提供跟随系统的深色适配。
- 使用系统 UI 字体；代码、类型、路径和枚举值使用等宽字体。
- 不使用大面积渐变、阴影堆叠、装饰性插画或冗余图标。
- HTTP 方法使用低饱和度状态色，同时始终显示文本，不能只依赖颜色表达。
- 正文、次要信息、不可用状态形成清晰对比，满足基本键盘焦点和对比度要求。

### 4.3 文件与代码浏览

- “打开工程”调用本地原生目录选择器；用户取消时保持当前工程不变。
- 文件树默认忽略 `.git`、`node_modules`、`.venv`、`venv`、`dist`、`build`、`coverage`、缓存目录及常见生成目录。
- 点击支持文件会在中栏打开标签页；标签页可关闭，但不会修改文件。
- `Cmd+P` 打开文件快速搜索。
- `Cmd+Click` 或 `F12` 跳到定义；`Ctrl+-` 和 `Ctrl+Shift+-` 分别后退与前进。
- 跳转目标打开在现有标签页模型中，并滚动、聚焦到准确行列。

### 4.4 Controller 面板

Controller 按源文件和 Controller 类/路由组分组。每个接口显示：

- HTTP 方法。
- 完整路径。
- 接口名称：优先使用显式摘要或说明，其次使用函数/方法名。
- 描述：FastAPI `summary`/`description` 或 NestJS Swagger 装饰器信息；没有则隐藏该行。
- 入参：名称、来源、类型、是否必填、默认值或 DTO 类型。
- 出参：响应模型或返回类型；无法静态确定时明确显示“未声明”。
- 源码位置。

点击接口或源码位置会在代码区定位。面板支持按路径、方法名和 HTTP 方法过滤。

FastAPI 路径由 router 前缀与路由装饰器路径拼接。NestJS 路径由 `@Controller()` 前缀与方法装饰器路径拼接。静态无法解析的表达式保留源码片段并标记为“动态值”，不能伪造确定结果。

### 4.5 枚举面板

枚举添加流程：

1. 用户输入类名或部分名称。
2. 服务返回匹配的枚举候选，显示语言、完整符号名和项目相对路径。
3. 用户选择一个候选并保存。
4. 面板立即展示枚举成员名称、值及可选注释。

收藏记录只保存项目标识、相对路径、符号名和语言，不缓存成员结果。每次打开工程或源码变更后重新解析，确保展示源码现状。

用户可删除任意收藏。删除只影响 CR 配置，不触碰源文件。文件被删除、枚举被重命名或解析失败时，卡片显示失效原因，并提供“重新定位”和“删除”操作。

## 5. 数据模型

统一 Controller 模型：

```ts
interface ControllerEndpoint {
  id: string;
  framework: "fastapi" | "nestjs";
  method: string;
  path: string;
  name: string;
  description?: string;
  parameters: Array<{
    name: string;
    source: "path" | "query" | "header" | "cookie" | "body" | "unknown";
    type: string;
    required: boolean;
    defaultValue?: string;
  }>;
  response: { type: string; statusCode?: number };
  location: SourceLocation;
  diagnostics: string[];
}
```

枚举收藏模型：

```ts
interface EnumBookmark {
  id: string;
  projectId: string;
  relativePath: string;
  symbolName: string;
  language: "python" | "typescript";
  createdAt: string;
}
```

`projectId` 使用规范化绝对路径的哈希生成，配置本身仍保存最近工程的可读路径。配置文件位于 `~/Library/Application Support/CR/settings.json`，写入时采用临时文件加原子替换，避免异常退出导致半写入。

## 6. API 与数据流

核心本地 API：

- `GET /api/health`：启动状态和版本。
- `POST /api/projects/select`：调用目录选择器并打开工程。
- `POST /api/projects/open`：重新打开已授权的最近工程。
- `GET /api/project/tree`：读取过滤后的文件树。
- `GET /api/files/content?path=`：读取工程内文本文件。
- `POST /api/navigation/definition`：查询定义位置。
- `GET /api/controllers`：读取 Controller 索引，可按条件过滤。
- `GET /api/enums/search?q=`：搜索枚举候选。
- `GET /api/enums/bookmarks`：解析并返回当前工程收藏。
- `POST /api/enums/bookmarks`：新增收藏。
- `DELETE /api/enums/bookmarks/:id`：删除收藏。
- `GET /api/index/status`：读取索引进度和诊断。

打开工程时先返回根信息和初始文件树，随后在后台增量索引。UI 可以立即浏览文件，并在 Controller/Enums 面板显示索引进度。源码变更通过文件监听器触发受控防抖的增量更新；监听失败时提供手动刷新。

## 7. 安全与错误处理

- 所有文件 API 都以规范化工程根目录为边界，拒绝绝对路径、符号链接逃逸和 `..` 路径穿越。
- 服务只监听回环地址，并要求启动器生成至少 256 位熵的会话令牌；页面首次加载后把令牌写入 `sessionStorage` 并立即从地址栏移除；服务拒绝不受信任的 Origin。
- 单个可预览文本文件上限为 5 MiB；二进制、不可解码或超限文件显示说明而不是强行渲染。
- 无权限目录、文件读取失败、解析失败和语言服务未就绪均返回结构化错误码及用户可理解的信息。
- 单个文件解析失败不能阻断整个工程索引；错误记录到诊断列表。
- 配置损坏时备份原文件并恢复空配置，不能静默覆盖。
- Controller 和类型无法静态确定时展示“不确定/未声明”，不把猜测包装为事实。

## 8. 性能约束

- 验收基准工程定义为 20,000 个受支持源码文件、总代码量不超过 500 MiB，并位于本机 SSD。
- 在验收基准工程中，初始两层文件树应在 2 秒内可用，不等待完整索引。
- 文件内容按需加载，不把整个工程发送到浏览器。
- 大目录扫描遵循忽略规则并支持取消旧索引任务。
- 在验收基准工程中，完整初次索引目标为 30 秒内完成；索引期间必须持续报告进度并保持文件浏览可用。
- 已索引且不超过 1 MiB 的文件，从点击到代码出现的 P95 小于 300 毫秒；定义跳转的 P95 小于 800 毫秒。
- 文件监听事件合并处理，避免保存操作产生重复全量扫描。

## 9. 测试与验收

### 9.1 自动化测试

- 路径边界与符号链接逃逸单元测试。
- 文件树过滤、文本检测和大小限制单元测试。
- FastAPI 解析器测试：前缀、常见参数来源、Pydantic 请求体、响应模型和动态表达式。
- NestJS 解析器测试：Controller 前缀、方法装饰器、DTO、参数装饰器和 Promise 返回类型。
- Python/TypeScript 枚举搜索与成员解析测试。
- 枚举收藏新增、重开恢复、源码刷新、失效和删除测试。
- TypeScript 与 Python 定义跳转、无结果和历史回退测试。
- 配置原子写入和损坏恢复测试。
- 前端文件浏览、Controller 过滤、枚举添加/删除和错误状态组件测试。
- 示例工程端到端测试：打开工程、查看两种语言、跳转、查看 Controller、收藏枚举、重启后恢复、删除收藏。

### 9.2 macOS 包验收

- 双击 `CR.app` 可启动服务并在默认浏览器打开。
- 首次启动、重复启动、服务残留、端口占用和异常退出均有确定行为。
- App 不依赖用户预装 Node.js 或 Python。
- 在浏览器页面无法通过构造路径读取工程外文件。
- 删除 CR 本地配置后可恢复全新状态，不影响任何被查看工程。

### 9.3 需求完成证据

- Python/TS 查看与跳转：通过示例工程端到端录屏或自动化浏览器测试及导航 API 测试证明。
- Controller 信息：通过 FastAPI、NestJS 固定样例的解析快照与 UI 端到端测试证明。
- 枚举配置、本地恢复和删除：通过重启跨会话端到端测试及配置文件断言证明。
- macOS App 和浏览器启动：通过构建产物、签名前本地启动验证和进程/URL 检查证明。
- UI 简洁与可读：通过桌面宽度与窄窗口截图检查、键盘流程和对比度检查证明。

## 10. 交付物

- CR 前端源码与测试。
- CR 本地服务源码与测试。
- FastAPI/NestJS/Python enum/TypeScript enum 示例工程。
- macOS `CR.app` 构建脚本和可运行产物。
- 本地开发、构建、测试和安装说明。
- 完成验收所需的命令输出与视觉检查结果。
