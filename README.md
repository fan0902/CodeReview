# CR

CR 是一个简洁的本地工程代码查看器。它以 macOS 应用启动本地只读服务，并在默认浏览器中提供三栏代码阅读界面。

## 功能

- 打开本地工程，查看 Python、TypeScript 和 TSX 文件。
- F12、Cmd+点击定义跳转，支持前进、后退和多标签页。
- 展示 FastAPI 与 NestJS Controller 的方法、路径、接口名称、入参、出参和静态分析诊断。
- 按类名搜索 Python/TypeScript 枚举，收藏到本地，重开恢复、失效重定位和确认删除。
- 浅色/深色主题；1024px 宽时自动收起信息栏，优先保证代码可读区域。

CR 不导入或执行被查看工程的 Python/TypeScript 代码，只做静态分析。服务仅监听 `127.0.0.1`，API 使用会话令牌和 Origin 校验。

## 使用 CR.app

1. 将 `CR.app` 复制到“应用程序”。
2. 首次打开时，如 macOS 阻止未公证应用，可在 Finder 中右键 CR →“打开”。
3. CR 会启动本地服务并在默认浏览器中打开。
4. 点击“打开工程”选择目录；之后可从“最近工程”重新打开。

枚举收藏和最近工程保存在：

`~/Library/Application Support/CR/settings.json`

退出所有 CR 页面后，本地服务在连续 15 分钟无心跳时自动退出。彻底卸载时删除 `CR.app` 和上述 `CR` 配置目录即可。

## 开发与验证

要求 Node.js 22、npm 10、Swift 6 和 macOS 13 或更高版本。

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run e2e -w apps/web
arch -arm64 swift build -c release --package-path launcher
bash scripts/build-macos-app.sh
bash scripts/smoke-macos-app.sh
```

生成物位于 `outputs/CR.app`。应用采用本地 ad-hoc 签名，未进行 Apple Developer ID 公证。
