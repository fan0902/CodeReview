# CR 验收结果（2026-07-22）

环境：macOS 15.7.7，arm64，Node.js 22.14.0，Swift 6.2.3。

## 自动化结果

- `npm test`：Server 34、Web 23、Contracts 1，共 58 项通过。
- `npm run typecheck`：三个 workspace 通过。
- `npm run build`：Server、Web、Contracts 通过；Monaco 主包存在体积提示，但资源完全离线。
- `npm run e2e -w apps/web`：3 项通过，覆盖定义跳转、Controller、枚举保存/重开/删除和两种视口。
- `arch -arm64 swift build -c release --package-path launcher`：通过。
- `bash scripts/build-macos-app.sh`：通过；Info.plist、签名、内置 Node、服务、Web 与 Pyright 结构检查通过。
- `bash scripts/smoke-macos-app.sh`：通过；健康检查、工程树、路径穿越拒绝和启动复用通过。

当前 Command Line Tools SDK 未包含 `XCTest` 或 Swift `Testing` 模块，因此 Swift 启动器使用 Release 编译和打包黑盒 smoke 作为可执行门禁。

## 原始需求核对

- 本地工程打开：通过原生目录选择器及最近工程完成。
- Python/TypeScript 查看与跳转：Monaco 只读查看、F12/Cmd+点击、前进后退通过。
- Controller：FastAPI/NestJS 方法、路径、名称、入参、出参、诊断和源码定位通过。
- 枚举：输入类名搜索、同名候选、收藏、重开恢复、失效重定位和确认删除通过。
- macOS 封装：自包含、ad-hoc 签名的 `CR.app` 可启动或复用服务并打开默认浏览器。
- 简洁可读 UI：1440×900 和 1024×768 无页面横向溢出；代码区至少 560px；明暗主题已截图检查。
