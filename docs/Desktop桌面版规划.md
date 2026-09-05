# INS Desktop 桌面版规划

更新时间：2026-07-31

## 当前进展

第一版 Electron 桌面壳已经完成：

- 现有 INS Studio 界面可构建为离线 Renderer。
- Electron Main 与隔离的 Preload 已接入。
- 使用 INS Logo 作为 Windows 应用图标。
- 已生成并启动验证 Windows x64 便携试用版。
- 浏览器版构建与 localhost 开发方式保持不变。

当前试用版主要用于验证界面、图谱、参考板和各类预览在 Electron 中的运行情况。真实工作区文件 API、安装程序和代码签名仍按后续阶段推进。

### 发布签名

Windows 正式发布包使用 Electron Builder 的 SHA-256 签名配置。打包机器需要提供受信任的 `.p12` 或 `.pfx` 证书，并通过 `CSC_LINK` 与 `CSC_KEY_PASSWORD` 注入；证书不进入仓库。未提供证书时只能生成内部测试包，Windows 可能显示未知发布者提示。

## 目标

INS Desktop 将使用 Electron 为现有 INS Studio 提供桌面运行环境。桌面版不会改变“资源保留在用户本地”的原则，也不会要求把研究资料上传服务器。

`main` 分支继续作为浏览器版稳定基线，`desktop` 分支用于桌面能力开发。

## 推荐架构

### Renderer

复用现有 React 界面、图谱、参考板、文献预览和 Three.js 预览。

### Main Process

负责：

- 创建和管理应用窗口。
- 原生文件与目录选择。
- 读取、复制、移动、重命名和删除真实文件。
- 工作区文件保存与打开。
- 应用菜单、最近项目和系统通知。
- 安装包、应用图标和更新能力。

### Preload

通过受限 API 将必要的桌面能力提供给 Renderer，保持上下文隔离，不在界面中直接开放完整 Node.js 权限。

## 第一阶段：可运行桌面壳

- 建立 Electron Main 与 Preload。
- 保留浏览器版开发命令。
- 增加 Desktop 开发与构建命令。
- 使用当前 INS Logo 生成 Windows 应用图标。
- 创建 Windows x64 测试安装包。
- 确认图谱、参考板、Three.js、PDF 和音频预览在桌面窗口内正常运行。

## 第二阶段：真实工作区文件

建议引入独立的 INS 工作区目录：

```text
My Research.ins-workspace/
├─ workspace.json
├─ nodes/
├─ relations/
├─ boards/
├─ narratives/
├─ topics/
├─ assets/
└─ versions/
```

其中：

- 元数据使用可读、可版本管理的 JSON 文件。
- 大型资源文件保留在 `assets/`，或通过受控路径引用外部原文件。
- 参考板、Narrative 和专题只保存对资源 ID 的引用。
- 版本记录保存结构数据快照，不无条件复制所有大型资源。

## 第三阶段：桌面资源工作流

- 原生目录拖入和真实文件路径。
- “在文件资源管理器中显示”。
- 资源重命名、移动、复制和安全删除。
- 图片切片直接输出到用户选择的目录。
- 外部文件变化检测。
- 丢失文件重新定位。
- GLTF、OBJ、FBX 外部依赖目录解析。

## 第四阶段：协作与同步

多人协作优先采用同步盘中的工作区目录，不自行建设复杂服务器：

- OneDrive、Dropbox、坚果云或其他网盘同步目录。
- 外部修改检测。
- 冲突副本。
- 结构化记录的冲突提示与手动合并。
- 资源文件按网盘规则同步，INS 不额外上传副本。

## 打包目标

第一目标：

- Windows x64 安装包。
- Windows 便携测试版。

后续目标：

- macOS Apple Silicon。
- macOS Intel（视需求决定）。
- Linux（视展示设备需求决定）。

正式公开分发前需要配置对应平台的代码签名；内部测试包可以先不签名。

## 分支规则

- `main`：浏览器版可运行基线，只合入经过验证的通用功能。
- `desktop`：Electron 主进程、Preload、桌面文件系统和打包配置。
- 可复用的界面与数据模型优先回到 `main`，桌面专属能力保留在 `desktop`。

## 第一批验收标准

- 可以从桌面图标启动 INS。
- 无需手动启动本地开发服务器。
- 可以新建或打开本地工作区。
- 可以拖入真实目录并在重启后恢复资源。
- 可以正常预览图片、文献、音视频和三维模型。
- 可以生成 Windows 安装包。
- 浏览器版 `main` 构建不受 Desktop 代码影响。
