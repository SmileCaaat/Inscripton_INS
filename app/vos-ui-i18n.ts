"use client";

import { useEffect, type RefObject } from "react";
import type { VosUiLang } from "./vos-online-config";

const VOS_CHROME_ZH: Record<string, string> = {
  View: "视图",
  Find: "查找",
  Update: "更新",
  Visualization: "可视化",
  Items: "节点",
  Links: "连线",
  Layout: "布局",
  Clustering: "聚类",
  Scale: "缩放",
  Size: "大小",
  Color: "颜色",
  "Size variation": "大小变化",
  "Maximum label length": "标签最长字数",
  "Minimum strength": "最低连线强度",
  "Maximum links": "最多连线数",
  "Curved links": "弯连线",
  "Colored links": "彩色连线",
  "Dimming effect": "淡化未选项",
  "Gradient circles": "渐变圆点",
  "Color schemes": "配色",
  "Dark user interface": "深色界面",
  "Light user interface": "浅色界面",
  "Full screen": "全屏",
  "Exit full screen": "退出全屏",
  "Reset cluster colors": "重置聚类配色",
  "Cluster colors": "聚类配色",
  "Score colors": "分数配色",
  "Link transparency": "连线透明度",
  "Links per frame": "每帧连线数",
  "Find ": "查找 ",
  "Rotate / flip": "旋转 / 翻转",
  Rotate: "旋转",
  "Degrees to rotate": "旋转角度",
  "Flip horizontally": "水平翻转",
  "Flip vertically": "垂直翻转",
  Normalization: "归一化",
  "Normalization method": "归一化方法",
  "No normalization": "不归一化",
  "Association strength": "关联强度",
  Fractionalization: "分数化",
  "LinLog/modularity": "LinLog/模块度",
  Attraction: "吸引力",
  Repulsion: "排斥力",
  "Advanced parameters": "高级参数",
  "Update layout": "更新布局",
  Resolution: "分辨率",
  "Minimum cluster size": "最小聚类规模",
  "Merge small clusters": "合并小聚类",
  "Update clustering": "更新聚类",
  Iterations: "迭代次数",
  "Random starts": "随机起点",
  "Random seed": "随机种子",
  "Use random seed": "使用随机种子",
  "Initial step size": "初始步长",
  "Step size reduction": "步长衰减",
  "Step size convergence": "步长收敛",
  "Maximum iterations": "最大迭代",
  "Min. score": "最低分数",
  "Max. score": "最高分数",
  Open: "打开",
  Save: "保存",
  Screenshot: "截图",
  Info: "说明",
  About: "关于",
  Reset: "复位",
  "Zoom in": "放大",
  "Zoom out": "缩小",
  "Show control panel": "显示控制面板",
  "Hide control panel": "隐藏控制面板",
  "VOSviewer Online Docs": "VOSviewer Online 文档",
  "About VOSviewer Online": "关于 VOSviewer Online",
  "JSON file": "JSON 文件",
  "Map file": "地图文件",
  "Network file": "网络文件",
  "VOSviewer JSON file": "VOSviewer JSON 文件",
  "VOSviewer map and network file": "VOSviewer 地图与网络文件",
  "Select a map file and/or a network file.": "请选择地图文件和/或网络文件。",
  "Reading VOSviewer JSON data...": "正在读取 VOSviewer JSON 数据…",
  "Reading VOSviewer map data...": "正在读取 VOSviewer 地图数据…",
  "Reading VOSviewer network data...": "正在读取 VOSviewer 网络数据…",
  "Processing data...": "正在处理数据…",
  "Running layout algorithm...": "正在运行布局算法…",
  "Running clustering algorithm...": "正在运行聚类算法…",
  "Do you want to show this set of items instead of all items?":
    "是否只显示这一组节点，而不是全部节点？",
  Yes: "是",
  No: "否",
  Close: "关闭",
  Cancel: "取消",
  "File cannot be found.": "找不到文件。",
  "Re-select the file.": "请重新选择文件。",
  "No data found.": "没有数据。",
  "Invalid JSON data format.": "JSON 数据格式无效。",
};

const ATTRS = ["title", "placeholder", "aria-label"] as const;
const originals = new WeakMap<Text, string>();

function skipParent(element: Element | null) {
  if (!element) return true;
  const tag = element.tagName;
  return tag === "SCRIPT" || tag === "STYLE" || tag === "CANVAS" || tag === "TEXTAREA";
}

function translateValue(original: string, lang: VosUiLang) {
  if (lang === "en") return original;
  const trimmed = original.trim();
  const zh = VOS_CHROME_ZH[trimmed] ?? VOS_CHROME_ZH[original];
  if (zh) return original.replace(trimmed, zh);
  const prefixed = [
    ["Items", "节点"],
    ["Item", "节点"],
    ["Links", "连线"],
    ["Link", "连线"],
    ["Clusters", "聚类"],
    ["Cluster", "聚类"],
  ];
  for (const [en, label] of prefixed) {
    if (trimmed === en || trimmed.startsWith(`${en}:`) || trimmed.startsWith(`${en} `)) {
      return original.replace(en, label);
    }
  }
  return original;
}

function applyChrome(root: HTMLElement, lang: VosUiLang) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const parent = node.parentElement;
    if (!skipParent(parent) && node.nodeValue) {
      if (!originals.has(node)) originals.set(node, node.nodeValue);
      const next = translateValue(originals.get(node) ?? node.nodeValue, lang);
      if (node.nodeValue !== next) node.nodeValue = next;
    }
    current = walker.nextNode();
  }

  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    if (skipParent(element)) continue;
    for (const attr of ATTRS) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const store = `data-vos-en-${attr}`;
      if (!element.hasAttribute(store)) element.setAttribute(store, value);
      const original = element.getAttribute(store) ?? value;
      const next = translateValue(original, lang);
      if (value !== next) element.setAttribute(attr, next);
    }
  }
}

export function openVosControlPanel(root: HTMLElement) {
  const button = root.querySelector<HTMLElement>(
    '[title="Show control panel"], [title="显示控制面板"]',
  );
  button?.click();
}

export function useVosChromeLanguage(rootRef: RefObject<HTMLElement | null>, lang: VosUiLang) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let applying = false;
    const run = () => {
      if (applying) return;
      applying = true;
      applyChrome(root, lang);
      applying = false;
    };
    run();
    const observer = new MutationObserver(run);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });
    return () => observer.disconnect();
  }, [rootRef, lang]);
}
