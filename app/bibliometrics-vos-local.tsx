"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./react-vos-compat";
import { VOSviewerOnline } from "vosviewer-online";
import { LOCAL_VOS_NETWORK } from "./vos-sample-network";
import {
  localizeVosNetwork,
  loadVosUiLang,
  saveVosUiLang,
  scoreKeysOf,
  vosColorIndex,
  VOS_CITE_SCORE,
  VOS_FULL_PARAMETERS,
  VOS_YEAR_SCORE,
  type VosColorMode,
  type VosNetworkPayload,
  type VosUiLang,
} from "./vos-online-config";
import { openVosControlPanel, useVosChromeLanguage } from "./vos-ui-i18n";

class VosErrorBoundary extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: "" };

  static getDerivedStateFromError(error: Error) {
    return {
      message: error.message || "VOSviewer Online 在当前环境未能启动",
    };
  }

  render() {
    if (this.state.message) {
      return (
        <div className="studio-map-empty">
          <span>LOCAL VIEWER</span>
          <h2>本机组件这次没跑起来</h2>
          <p>数据仍在工作区里，没有离开这台机器。请看下方报错后再试一次。</p>
          <p className="studio-biblio-error">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function LocalVosViewer({
  data = LOCAL_VOS_NETWORK,
}: {
  data?: VosNetworkPayload;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [lang, setLang] = useState<VosUiLang>("zh");
  const [colorMode, setColorMode] = useState<VosColorMode>("cluster");

  useEffect(() => {
    setLang(loadVosUiLang());
  }, []);

  const scoreKeys = scoreKeysOf(data);
  const hasYear = scoreKeys.includes(VOS_YEAR_SCORE);
  const hasCites = scoreKeys.includes(VOS_CITE_SCORE);
  const localized = useMemo(() => localizeVosNetwork(data, lang), [data, lang]);
  const parameters = useMemo(
    () => ({
      ...VOS_FULL_PARAMETERS,
      item_color: vosColorIndex(data, colorMode),
    }),
    [data, colorMode],
  );

  useVosChromeLanguage(rootRef, lang);

  useEffect(() => {
    if (colorMode === "year" && !hasYear) setColorMode("cluster");
    if (colorMode === "cites" && !hasCites) setColorMode("cluster");
  }, [colorMode, hasYear, hasCites]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const timer = window.setTimeout(() => openVosControlPanel(root), 480);
    return () => window.clearTimeout(timer);
  }, [localized.info.title, lang, colorMode, data.network.items.length]);

  const switchLang = (next: VosUiLang) => {
    setLang(next);
    saveVosUiLang(next);
  };

  return (
    <VosErrorBoundary>
      <div className="studio-biblio-vos-shell">
        <div className="studio-biblio-vos-bar">
          <span>VOSviewer Online · 完整界面</span>
          <div className="studio-biblio-vos-switch" role="group" aria-label="界面语言">
            <button
              type="button"
              className={lang === "zh" ? "is-active" : ""}
              onClick={() => switchLang("zh")}
            >
              中文
            </button>
            <button
              type="button"
              className={lang === "en" ? "is-active" : ""}
              onClick={() => switchLang("en")}
            >
              English
            </button>
          </div>
          <div className="studio-biblio-vos-switch" role="group" aria-label="着色方式">
            <button
              type="button"
              className={colorMode === "cluster" ? "is-active" : ""}
              onClick={() => setColorMode("cluster")}
            >
              聚类着色
            </button>
            {hasYear ? (
              <button
                type="button"
                className={colorMode === "year" ? "is-active" : ""}
                onClick={() => setColorMode("year")}
              >
                年份着色
              </button>
            ) : null}
            {hasCites ? (
              <button
                type="button"
                className={colorMode === "cites" ? "is-active" : ""}
                onClick={() => setColorMode("cites")}
              >
                被引着色
              </button>
            ) : null}
          </div>
        </div>
        <div className="studio-biblio-vos" ref={rootRef}>
          <VOSviewerOnline
            key={`${localized.info.title}-${lang}-${colorMode}-${data.network.items.length}`}
            data={localized}
            parameters={parameters}
          />
        </div>
      </div>
    </VosErrorBoundary>
  );
}
