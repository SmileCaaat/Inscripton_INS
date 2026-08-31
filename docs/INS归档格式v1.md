# INS Archive 1.0

## 定位

INS 负责数字人文资产、知识节点与关系的研究整理和开放归档；Omeka S 是可选的机构级归档目标；展示工具不属于 INS 核心。

当前产品结构：

```text
INS Studio
├─ 资源
├─ 参考板
├─ 节点
├─ 图谱
└─ 归档
```

`Narrative`、`专题`、`Explorer` 不进入后续核心功能。

## 支持的归档资源

```text
Text / Image / Model / Video / Audio
```

音频元数据可包含时长、编码、采样率、声道、创作者、来源和版权。

## 文件结构

`.insarchive` 是 ZIP 容器：

```text
project.insarchive
├─ manifest.json
├─ archive-report.json
├─ checksums.sha256
├─ README.txt
├─ data/
│  ├─ nodes.json
│  ├─ assets.json
│  └─ relations.json
├─ text/
├─ images/
├─ models/
├─ videos/
└─ audio/
```

所有 JSON 使用 UTF-8；二进制资源通过 SHA-256 校验。

## 标识符与命名

- Node、Asset、Relation 使用创建时生成并长期保持不变的 ID。
- 原始文件名保存在 `originalFilename`。
- 工作区文件名可以由用户管理。
- `archiveFilename` 只在导出时生成，不改变工作区源文件。

归档名称代码：

```text
T = Text
I = Image
M = Model
V = Video
A = Audio
```

## 三维文件组

GLB 可作为单文件归档。GLTF、FBX、OBJ 等可能依赖几何、材质或纹理文件，应按文件组保存：

```ts
type ArchiveFile = {
  path: string
  role: "primary" | "geometry" | "texture" | "material" | "sidecar"
  size: number
  sha256: string
}
```

当前 1.0 实现可归档单个主文件；遇到可能存在外部依赖的模型时必须提示警告。完整文件组登记属于后续增量实现。

## 归档检查

阻止归档的错误：

- Node 缺少标题
- 本地源文件不可用
- ID 重复
- Relation 引用不存在的 Node
- Node 引用不存在的 Asset

允许导出但需要提示的警告：

- Node 缺摘要
- Asset 缺来源或版权信息
- 孤立节点或孤立资源
- 模型可能依赖外部文件

JSON 数据可以随时导出；包含原始文件的 `.insarchive` 只有在错误清零后才能生成。

## Omeka 边界

INS 内部数据模型不绑定 Omeka。独立 Adapter 负责将 INS 字段转换为 Dublin Core、Resource Template、CSV 或 JSON-LD。第一阶段不实现 Omeka API 直连、服务器同步或 RDF 编辑。

三维模型可以使用项目自定义的 `3D Model` Resource Template，但不应宣称它是 DCMI 的标准资源类型。

## 浏览器边界

localhost 版本通过 IndexedDB 保存导入文件，并在用户授权后使用 File System Access API 连接工作区目录。浏览器不能绕过授权读取任意本地路径；缺失或失去授权的文件必须在归档检查中报告。
