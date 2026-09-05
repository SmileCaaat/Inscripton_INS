"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { parseBiblioFile } from "./biblio-import";
import { networkFromCorpus, VOS_NETWORK_KINDS, type VosNetworkKind } from "./biblio-network";
import { BiblioThemePanel } from "./biblio-theme-panel";
import { thematicEvolution } from "./biblio-themes";
import {
  loadOpenAlexKey,
  loadOpenAlexMailto,
  OPENALEX_KEY_URL,
  saveOpenAlexKey,
  saveOpenAlexMailto,
  searchOpenAlex,
} from "./biblio-openalex";
import {
  coreVenues,
  highlyCited,
  termFrequency,
  topAuthors,
  yearlyCounts,
} from "./biblio-stats";
import {
  BIBLIO_TYPE_OPTIONS,
  biblioTypeLabel,
  emptyBiblioCorpus,
  mergeBiblioRecords,
  sourceLabel,
  BIBLIO_CORPUS_LIMIT,
  type BiblioCorpus,
  type BiblioRecord,
} from "./biblio-types";

const LocalVosViewer = dynamic(
  () => import("./bibliometrics-vos-local").then((module) => module.LocalVosViewer),
  {
    ssr: false,
    loading: () => (
      <div className="studio-map-empty">
        <span>LOCAL VIEWER</span>
        <h2>正在载入本机出图</h2>
        <p>把当前题录或示例 JSON 直接喂给 VOSviewer Online 组件，数据不出主机。</p>
      </div>
    ),
  },
);

type BiblioTab = "records" | "stats" | "network" | "themes";

export function BibliometricsTrial({
  corpus,
  onCorpusChange,
  onWriteRecords,
  onArrangeGraph,
  onNotice,
}: {
  corpus: BiblioCorpus;
  onCorpusChange: (corpus: BiblioCorpus) => void;
  onWriteRecords: (records: BiblioRecord[]) => void;
  onArrangeGraph: () => void;
  onNotice: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [tab, setTab] = useState<BiblioTab>("records");
  const [search, setSearch] = useState(corpus.query ?? "Ruins of St. Paul's Macao");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [type, setType] = useState("");
  const [minCited, setMinCited] = useState("");
  const [apiKey, setApiKey] = useState(() =>
    typeof window === "undefined" ? "" : loadOpenAlexKey(),
  );
  const [mailto, setMailto] = useState(() =>
    typeof window === "undefined" ? "" : loadOpenAlexMailto(),
  );
  const [busy, setBusy] = useState<"search" | "import" | null>(null);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [networkKind, setNetworkKind] = useState<VosNetworkKind>("keywords");
  const [themePeriod, setThemePeriod] = useState(0);

  const records = corpus.records;
  const selectedRecords = records.filter((record) => selectedIds.includes(record.id));
  const writeRecords = selectedRecords.length > 0 ? selectedRecords : records;
  const evolution = useMemo(() => thematicEvolution(records), [records]);
  const periodIndex = Math.min(themePeriod, Math.max(evolution.periods.length - 1, 0));
  const network = useMemo(() => {
    if (networkKind === "theme") {
      const slice = evolution.networks[periodIndex];
      if (slice) return { data: slice, fromCorpus: true, kind: "theme" as const };
      return networkFromCorpus(evolution.periods[periodIndex]?.records ?? records, "theme");
    }
    return networkFromCorpus(records, networkKind);
  }, [records, networkKind, periodIndex, evolution]);

  const runSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("search");
    setError("");
    saveOpenAlexKey(apiKey);
    saveOpenAlexMailto(mailto);
    try {
      const result = await searchOpenAlex(
        { search, yearFrom, yearTo, type, minCited, apiKey, mailto },
        controller.signal,
      );
      const merged = mergeBiblioRecords(records, result.records);
      onCorpusChange({
        query: search.trim(),
        fetchedAt: new Date().toISOString(),
        openAlexCount: result.total,
        records: merged.records,
      });
      setTab("records");
      onNotice(
        result.total > merged.records.length
          ? `OpenAlex 命中 ${result.total} 篇，本机已取回 ${result.records.length} 篇并入工作区 ${merged.added} 篇（上限 ${BIBLIO_CORPUS_LIMIT}）。题名摘要保持原文。`
          : `OpenAlex 命中 ${result.total} 篇，已全部取回并入工作区 ${merged.added} 篇。题名摘要保持原文。`,
      );
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "检索失败。");
    } finally {
      setBusy((current) => (current === "search" ? null : current));
    }
  };

  const importFile = async (file: File) => {
    setBusy("import");
    setError("");
    try {
      const parsed = await parseBiblioFile(file);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      const merged = mergeBiblioRecords(records, parsed.records);
      onCorpusChange({
        ...corpus,
        records: merged.records,
      });
      setTab("records");
      onNotice(
        `已从 ${file.name} 读入 ${parsed.records.length} 篇，并入工作区 ${merged.added} 篇${
          merged.skipped ? `，跳过 ${merged.skipped} 篇` : ""
        }。`,
      );
    } catch {
      setError("这个文件读不出来。请换成 UTF-8 的 CSV、RIS 或 BibTeX。");
    } finally {
      setBusy((current) => (current === "import" ? null : current));
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === records.length) setSelectedIds([]);
    else setSelectedIds(records.map((record) => record.id));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <div className="studio-map-view studio-biblio-view">
      <div className="graph-intro">
        <div>
          <span>BIBLIOMETRICS</span>
          <h1>计量 · 本机检索</h1>
        </div>
        <div className="graph-intro-actions">
          <p>
            工作区 {records.length} 篇
            {corpus.openAlexCount != null
              ? records.length < corpus.openAlexCount
                ? ` · 已取回 ${records.length} / OpenAlex ${corpus.openAlexCount}`
                : ` · OpenAlex ${corpus.openAlexCount} 篇`
              : ""}
          </p>
          {(
            [
              ["records", "题录"],
              ["stats", "统计"],
              ["network", "网络图"],
              ["themes", "主题演化"],
            ] as const
          ).map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={tab === id ? "is-active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <form className="studio-biblio-search" onSubmit={runSearch}>
        <label className="studio-biblio-query">
          检索词
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="如 Ruins of St. Paul's Macao"
            aria-label="文献检索词"
          />
        </label>
        <label>
          起年
          <input
            value={yearFrom}
            onChange={(event) => setYearFrom(event.target.value)}
            inputMode="numeric"
            placeholder="不限"
            aria-label="起年"
          />
        </label>
        <label>
          迄年
          <input
            value={yearTo}
            onChange={(event) => setYearTo(event.target.value)}
            inputMode="numeric"
            placeholder="不限"
            aria-label="迄年"
          />
        </label>
        <label>
          类型
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            aria-label="文献类型"
          >
            {BIBLIO_TYPE_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          被引 ≥
          <input
            value={minCited}
            onChange={(event) => setMinCited(event.target.value)}
            inputMode="numeric"
            placeholder="0"
            aria-label="最低被引"
          />
        </label>
        <label className="studio-biblio-key">
          OpenAlex Key
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="本机填写，不进工作区"
            aria-label="OpenAlex Key"
          />
        </label>
        <label className="studio-biblio-key">
          联系邮箱
          <input
            type="email"
            autoComplete="off"
            value={mailto}
            onChange={(event) => setMailto(event.target.value)}
            placeholder="礼貌池，可空"
            aria-label="OpenAlex 联系邮箱"
          />
        </label>
        <div className="studio-biblio-search-actions">
          <button className="button-primary" type="submit" disabled={busy === "search"}>
            {busy === "search" ? "检索中…" : "检索"}
          </button>
          <a href={OPENALEX_KEY_URL} target="_blank" rel="noreferrer">
            申请 Key
          </a>
          <button
            type="button"
            disabled={busy === "import"}
            onClick={() => fileRef.current?.click()}
          >
            导入 CSV / RIS / BibTeX
          </button>
          <button
            type="button"
            disabled={writeRecords.length === 0}
            onClick={() => onWriteRecords(writeRecords)}
          >
            写入知识库
          </button>
          <button
            type="button"
            onClick={onArrangeGraph}
          >
            一键排列
          </button>
          <button
            type="button"
            disabled={records.length === 0}
            onClick={() => {
              onCorpusChange(emptyBiblioCorpus());
              setSelectedIds([]);
              setOpenId(null);
              onNotice("已清空当前工作区题录。图谱里已有的节点不会删。");
            }}
          >
            清空题录
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.ris,.bib,.txt"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
      </form>

      {error ? <p className="studio-biblio-error">{error}</p> : null}
      {records.length > 0 ? (
        <p className="studio-biblio-write-hint">
          文献进图谱是索引，不是再堆一套知识卡片。写入或「一键排列」后：人名在左、文献按年在右；点选才展开著作线。勾选则只写入所选。耦合 / 共被引 / 引文网需要参考文献；OpenAlex 检索一般自带，CSV 用「参考文献」列，RIS 用 CR。
        </p>
      ) : null}

      {tab === "records" && (
        <div className="studio-biblio-body">
          {records.length === 0 ? (
            <div className="studio-map-empty">
              <span>SEARCH WINDOW</span>
              <h2>还没有题录</h2>
              <p>
                用上方检索窗查 OpenAlex，或导入 CSV / RIS / BibTeX。结果会留在工作区，刷新后还在。
              </p>
            </div>
          ) : (
            <div className="studio-biblio-table" role="table" aria-label="题录表">
              <div className="studio-biblio-row is-head" role="row">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedIds.length === records.length}
                    onChange={toggleAll}
                    aria-label="全选题录"
                  />
                </label>
                <span>题名</span>
                <span>年份</span>
                <span>作者</span>
                <span>期刊</span>
                <span>被引</span>
                <span>来源</span>
              </div>
              {records.map((record) => (
                <div key={record.id}>
                  <div
                    className={`studio-biblio-row${openId === record.id ? " is-open" : ""}`}
                    role="row"
                    onClick={() => setOpenId((current) => (current === record.id ? null : record.id))}
                  >
                    <label
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(record.id)}
                        onChange={() => toggleOne(record.id)}
                        aria-label={`选择 ${record.title}`}
                      />
                    </label>
                    <strong>{record.title}</strong>
                    <span>{record.year ?? "—"}</span>
                    <span>{record.authors.slice(0, 3).join("; ") || "—"}</span>
                    <span>{record.venue || "—"}</span>
                    <span>{record.citedBy}</span>
                    <span>{sourceLabel(record.source)}</span>
                  </div>
                  {openId === record.id && (
                    <div className="studio-biblio-detail">
                      <p>
                        {biblioTypeLabel(record.type) || "文献"}
                        {record.doi ? ` · ${record.doi}` : ""}
                        {record.keywords.length > 0 ? ` · ${record.keywords.join(" / ")}` : ""}
                        {record.referencedWorks.length > 0
                          ? ` · 参考文献 ${record.referencedWorks.length}`
                          : ""}
                      </p>
                      <p>{record.abstract || "这条题录没有摘要。"}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "stats" && (
        <div className="studio-biblio-body studio-biblio-stats">
          <StatCard title="年度发文" rows={yearlyCounts(records)} />
          <StatCard title="高产作者" rows={topAuthors(records)} />
          <StatCard title="核心期刊" rows={coreVenues(records)} />
          <StatCard
            title="高被引"
            rows={highlyCited(records).map((record) => ({
              label: record.title,
              value: record.citedBy,
            }))}
          />
          <StatCard title="词频" rows={termFrequency(records)} />
        </div>
      )}

      {tab === "network" && (
        <div className="studio-biblio-canvas">
          <div className="studio-biblio-net-toolbar">
            <div className="studio-biblio-vos-switch" role="group" aria-label="网络类型">
              {VOS_NETWORK_KINDS.map((kind) => (
                <button
                  type="button"
                  key={kind.id}
                  className={networkKind === kind.id ? "is-active" : ""}
                  onClick={() => setNetworkKind(kind.id)}
                >
                  {kind.label}
                </button>
              ))}
            </div>
            {networkKind === "theme" && evolution.periods.length > 0 ? (
              <div className="studio-biblio-vos-switch" role="group" aria-label="主题切片时段">
                {evolution.periods.map((period, index) => (
                  <button
                    type="button"
                    key={period.label}
                    className={periodIndex === index ? "is-active" : ""}
                    onClick={() => setThemePeriod(index)}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {network.missing ? (
            <p className="studio-biblio-network-note is-inline">{network.missing}</p>
          ) : !network.fromCorpus ? (
            <p className="studio-biblio-network-note is-inline">
              当前题录还不够画这种网，先显示澳门示例网络。检索或导入之后会改用工作区数据。
            </p>
          ) : null}
          <div className="studio-biblio-canvas-stage">
            <LocalVosViewer
              key={network.data.info.title + String(network.data.network.items.length) + networkKind}
              data={network.data}
            />
          </div>
        </div>
      )}

      {tab === "themes" && (
        <div className="studio-biblio-body studio-biblio-theme-body">
          <BiblioThemePanel
            evolution={evolution}
            periodIndex={periodIndex}
            onPeriodChange={setThemePeriod}
            onOpenSlice={(index) => {
              setThemePeriod(index);
              setNetworkKind("theme");
              setTab("network");
            }}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
}) {
  return (
    <section className="studio-biblio-stat" aria-label={title}>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p>还没有可统计的题录。</p>
      ) : (
        <ol>
          {rows.map((row) => (
            <li key={`${title}-${row.label}`}>
              <em>{row.label}</em>
              <strong>{row.value}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
