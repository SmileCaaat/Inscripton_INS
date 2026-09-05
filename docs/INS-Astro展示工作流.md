# INS Astro 展示工作流

## 定位

Astro 不进入 INS 的研究数据层，也不替代资源、参考板、节点、图谱或归档。它只负责把稳定的 INS Archive 转换为可阅读、可叙事、可发布的静态展示项目。

正式数据流：

```text
INS 工作区 → 归档检查 → .insarchive → Astro 展示项目 → dist 静态站点
```

INS 同时允许从当前工作区直接创建展示项目。该入口内部仍会先执行归档检查，并生成与 `.insarchive` 相同的数据和媒体结构，因此不会形成第二套展示数据格式。

## 两种创建入口

### 基于当前归档创建

在“归档”页面选择模板后点击“基于当前归档创建”。只有归档检查没有错误且本地源文件可用时才能执行。

生成过程会：

1. 在内存中生成当前工作区的 INS Archive；
2. 计算归档包 SHA-256；
3. 把节点、资源、关系与媒体写入 Astro 项目；
4. 下载 `<工作区名称>-Exhibition.zip`。

### 选择已有 `.insarchive`

选择一个已保存的 `.insarchive`。INS 会验证 `manifest.json` 和三个核心数据文件，再生成展示项目。源归档不会被修改。

## 首批模板

- **典藏总览**：资源、节点、关系并重，适合作为项目总览或开放浏览页。
- **研究叙事**：突出节点摘要和证据链，适合作为论文伴生站或策展叙事的起点。
- **空间遗产**：空间节点、图像与三维模型优先，适合建筑、遗址与场所研究。

模板决定首屏语义、节点排序和资源优先级，但不改变归档数据。

## 展示项目结构

```text
<Project>-Exhibition/
├─ src/
│  ├─ data/archive/       # manifest、nodes、assets、relations
│  ├─ layouts/
│  ├─ lib/
│  ├─ pages/              # 首页、节点详情、资源详情
│  └─ styles/
├─ public/archive/        # text、images、models、videos、audio
├─ archive-source/        # 归档报告和校验清单
├─ exhibition.json        # 模板、源归档、SHA-256、生成时间
├─ Start-Localhost.ps1
├─ Build-Release.ps1
└─ package.json
```

展示项目覆盖图像、文献下载、视频、音频和 GLB/GLTF 三维预览。FBX、OBJ 等依赖外部纹理的模型仍应在归档前整理为 GLB，或等待 INS 文件组功能补全。

## 本地运行与发布

解压项目后：

- Windows 双击 `Start-Localhost.ps1` 启动本地预览；
- 双击 `Build-Release.ps1` 生成 `dist/`；
- `dist/` 可以复制到普通 Web 服务器、静态托管或本地局域网服务器。

这一流程不会上传 INS 工作区或源资产。只有用户主动发布 `dist/` 时，展示结果才会离开本机。

## 版本边界

当前版本生成的是完整、可编辑的 Astro 源项目，不在浏览器中直接执行 `npm install` 或 `astro build`。原因是 localhost Web 版不能在未授权的情况下写入任意本机目录或启动系统进程。Electron 版未来可以把解压、安装、预览和构建进一步自动化，但不影响当前生成格式。
