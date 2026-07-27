# Inscription（INS）

面向数字人文研究的本地优先知识组织与数字叙事工具。

INS 使用同一个应用提供两种运行状态：

- **Studio**：创建 Knowledge Node、建立 Relationship、导入数字资源、管理 Narrative 与版本。
- **Explorer**：在全屏或展览环境中，以专题、场景、图谱、画廊和 Web3D 方式展示同一工作区。

## 当前原型

第一版交互原型包含：

- 七类核心知识节点与可扩展节点结构
- 节点图谱和一等关系数据
- 节点属性与关系检查器
- 可拖入文件或目录的资源画廊
- 图片、文献、视频和三维资源预览骨架
- Narrative 场景编排
- Studio / Explorer 即时切换
- 专题组织与示例展示

示例内容使用“大三巴高地数字铭印研究”。

## 本地运行

项目需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

开发服务默认运行于 `http://localhost:3000`。

## 数据方向

INS Workspace 将采用本地或网盘同步文件夹。节点、关系、Narrative 和资源索引按独立记录保存，资源文件复制进入 Workspace；Explorer 直接读取同一份工作区数据，不依赖互联网服务器。
