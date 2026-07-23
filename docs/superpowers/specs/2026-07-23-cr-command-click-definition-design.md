# CR Command+Click 定义跳转设计

## 目标

修复 Monaco 定义 Provider 在用户仅按住 Command 并悬停符号时就触发导航的问题。定义跳转必须由明确操作触发：`Command + 鼠标左键点击` 或 `F12`。

## 根因

当前 Definition Provider 的 `provideDefinition` 在 Monaco 查询定义时直接调用 CR 的 `onNavigate`。Monaco 为显示 Command 悬停链接会预先查询定义，因此一次本应只用于视觉提示的查询产生了页面导航副作用。

## 交互约束

- 单独按住 Command 或 Command 悬停符号：不请求定义，不跳转。
- 普通鼠标单击：只执行 Monaco 默认的光标定位和选区行为。
- `Command + 鼠标左键点击` 有效代码位置：调用现有定义接口；存在目标时通过 `onNavigate` 打开目标，并写入 CR 的导航历史。
- `F12`：继续对当前光标位置执行同一套定义跳转。
- macOS 后退保持 `Command + -`，前进保持 `Command + Shift + -`。
- 右键、中键、没有代码位置的点击均不触发定义查询。

## 实现边界

`CodeViewer` 不再通过带副作用的 Monaco Definition Provider 执行导航。它注册 Monaco 鼠标按下监听器，只在浏览器事件同时满足 `metaKey`、鼠标左键和有效编辑器位置时调用现有 `openDefinition`。`F12` 继续复用 `openDefinition`，服务端定义解析、文件标签、导航历史和错误处理保持不变。

本次不新增 Command 悬停下划线或 Peek Definition，也不改变 Windows/Linux 快捷键，因为 CR 当前交付目标是 macOS App。

## 生命周期与清理

Definition Provider 的 disposable 替换为鼠标监听 disposable。组件卸载或编辑器重挂载时必须释放旧监听器，避免重复请求和陈旧 `location` 闭包。

## 测试

组件测试覆盖：

- 仅 Command 状态不产生定义请求。
- 普通左键点击不产生定义请求。
- Command+左键点击使用点击位置请求定义并导航。
- 右键或缺少编辑器位置不产生定义请求。
- F12 继续使用当前光标位置导航。
- 后退和前进命令仍注册为 `Command + -`、`Command + Shift + -`。

真实浏览器测试使用 mixed fixture 打开 TypeScript 文件，按住 Meta 后点击符号并确认跳到定义；同时保留现有 F12 跳转覆盖。

## 验收标准

在打包后的 CR.app 中，按住 Command 并移动鼠标不会切换文件；只有 Command+左键点击符号或按 F12 才会跳到定义。跳转后 `Command + -` 可以回到上一位置，`Command + Shift + -` 可以前进，其他现有代码阅读能力不变。
