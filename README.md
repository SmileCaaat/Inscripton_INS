<div align="center">
  <img src="./public/ins-logo.png" alt="Inscription INS Logo" width="150" />

  # Inscription · INS

  **面向数字人文研究的本地优先知识组织、参考资料管理与数字展示工具**

  `Knowledge Node` · `Relationship` · `Local Assets` · `Reference Board` · `Web3D`
</div>

---

## 项目定位

INS 希望把研究过程中分散的节点、关系、图片、文献、音视频和三维模型组织到同一个工作区中。

它不是传统文件管理器，也不是单纯的思维导图。INS 以 **Knowledge Node** 为核心：文件目录只负责管理资源，节点负责表达知识对象，关系负责连接知识，参考板负责完成研究素材的比较、拆解和推演。

应用包含两种工作状态：

- **INS Studio**：创建 Node、建立关系、导入资源、整理参考板和管理本机版本。
- **INS Explorer**：读取同一工作区，以场景、图谱、画廊和 Web3D 方式进行本地展示。

资源原文件保留在用户设备中，当前版本不要求上传服务器，也不依赖互联网才能完成研究和展示。

## 当前能力

| 模块 | 当前状态 | 主要能力 |
| --- | --- | --- |
| 工作区 | 可用 | 新建、切换、本机自动保存、手动版本快照与恢复 |
| Node | 可用 | 七类知识节点、属性编辑、多资源引用、拖入文件 |
| 图谱 | 可用 | 创建与拖动节点、滚轮缩放、关系连接、删除、复制、对齐、备注框 |
| 资源 | 可用 | 文件/目录导入、筛选、网格与列表、本机持久化、右键操作 |
| 参考板 | 可用 | 外部拖入、剪贴板粘贴、资源目录、预览、连线、切图、右键操作 |
| 三维预览 | 可用 | GLB、GLTF、FBX、OBJ、轨道控制、动画、网格与自动取景 |
| 文献与媒体 | 可用 | PDF、DOCX、表格、EPUB、音频波形、文本、图片和视频 |
| Explorer | 基础可用 | 使用工作区场景进行本地全屏展示 |
| Narrative | 暂时禁用 | 已有场景原型，完整自由编排尚未完成 |
| 专题 | 暂时禁用 | 已有数据原型，独立内容编选尚未完成 |

## 核心交互

### 图谱

- 滚轮缩放，空白区域拖动画布。
- 拖动节点改变位置，从节点连接点牵线建立关系。
- `Delete` 删除，`Ctrl+D` 复制，`Ctrl+Z / Ctrl+Y` 撤销与重做。
- `Q` 对齐选中对象，`C` 为选区创建备注框。
- 节点和画布空白处均提供应用内右键菜单。

### 资源

- 可以直接拖入文件或整个目录。
- 右键支持预览、关联 Node、转到参考板、复制、粘贴副本、重命名、下载和安全删除。
- 仍被 Node 或参考板引用的资源不会被直接删除。
- 导入的本机文件通过 IndexedDB 保存，刷新后仍可恢复预览。

### 参考板

- 可以从外部拖入资源，也可以直接粘贴剪贴板图片。
- 新内容会自动登记为工作区资源，不需要预先导入资源库。
- 节点、空白画布和底部资源目录均提供上下文右键菜单。
- 支持复制、剪切、粘贴、断开连接、删除、全选、备注框和顶部对齐。
- 图片支持宫格切分和自由画框切图，生成的切片会成为新资源。

浏览器原生右键菜单已在应用中禁用，所有右键操作均由 INS 自己接管。

## 支持的资源格式

- **图片**：PNG、JPG、JPEG、WebP、GIF、SVG 等浏览器可读取格式。
- **视频**：MP4、WebM 等浏览器可播放格式。
- **音频**：MP3、WAV、OGG、M4A、AAC、FLAC、OPUS。
- **文献**：PDF、DOCX、EPUB。
- **表格**：XLSX、XLS、XLSM、XLSB、ODS、CSV、TSV。
- **文本**：TXT、Markdown、JSON、XML、HTML、CSS、JavaScript、TypeScript。
- **三维模型**：GLB、GLTF、FBX、OBJ。

具体格式边界请查看 [未完成功能说明](./docs/未完成功能说明.md)。

## 本地运行

项目使用 Node.js `24.14.0`，版本记录在 [`.nvmrc`](./.nvmrc)。

```bash
npm install
npm run dev
```

开发界面默认运行于：

```text
http://localhost:3000
```

常用检查：

```bash
npm run typecheck
npm run lint
npm test
```

## 技术结构

- **React 19 + Vinext + Vite**：应用界面与构建。
- **XYFlow**：Knowledge Graph 与 Reference Board 画布。
- **Three.js**：三维模型加载与交互预览。
- **PDF.js / Mammoth.js / SheetJS / epub.js / wavesurfer.js**：文献与媒体预览。
- **IndexedDB + localStorage**：当前浏览器版本的本机资源和工作区状态。

主要代码：

```text
app/
├─ page.tsx                       Studio、图谱、资源与 Explorer
├─ reference-board.tsx            参考板、资源拖入与图片切图
├─ application-context-menu.tsx   应用统一右键菜单
├─ document-media-preview.tsx     文献、表格、电子书和音频预览
├─ model-preview.tsx              Three.js 三维预览
└─ local-assets.ts                本机资源 Blob 持久化
```

## 分支规划

- **`main`**：当前浏览器版稳定基线。
- **`desktop`**：Electron 桌面版开发线，从 `main` 复用界面与核心数据模型。

Desktop 版将优先解决真实文件路径、工作区落盘、原生目录选择、安装包和应用图标，详细方案见 [Desktop 桌面版规划](./docs/Desktop桌面版规划.md)。

## 文档

- [当前功能说明](./docs/当前功能说明.md)
- [未完成功能说明](./docs/未完成功能说明.md)
- [Desktop 桌面版规划](./docs/Desktop桌面版规划.md)

## 当前阶段

项目仍处于功能原型与基础工作流验证阶段。Node、图谱、资源和参考板是当前重点；Narrative 与专题入口会在数据模型和编辑体验达到可用标准后重新开放。
