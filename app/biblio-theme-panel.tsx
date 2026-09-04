"use client";

import {
  themeQuadrantLabel,
  type ThemeCluster,
  type ThemeEvolution,
  type ThemeQuadrant,
} from "./biblio-themes";

const QUADRANT_TONE: Record<ThemeQuadrant, string> = {
  motor: "#8b3a2f",
  niche: "#3d5a40",
  emerging: "#8a7a4a",
  basic: "#3a4a6a",
};

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function BiblioThemePanel({
  evolution,
  periodIndex,
  onPeriodChange,
  onOpenSlice,
}: {
  evolution: ThemeEvolution;
  periodIndex: number;
  onPeriodChange: (index: number) => void;
  onOpenSlice: (index: number) => void;
}) {
  if (evolution.periods.length === 0) {
    return (
      <div className="studio-map-empty">
        <span>THEME EVOLUTION</span>
        <h2>还不能做主题演化</h2>
        <p>{evolution.note || "请先检索或导入带年份与关键词的题录。数据只在本机处理。"}</p>
      </div>
    );
  }

  const active = Math.min(Math.max(periodIndex, 0), evolution.periods.length - 1);
  const period = evolution.periods[active];
  const periodClusters = evolution.clusters.filter((item) => item.periodIndex === active);
  const hasSlice = Boolean(evolution.networks[active]);

  return (
    <div className="studio-biblio-theme">
      {evolution.note ? <p className="studio-biblio-theme-note">{evolution.note}</p> : null}
      <div className="studio-biblio-theme-periods" role="tablist" aria-label="时间切片">
        {evolution.periods.map((item, index) => (
          <button
            type="button"
            key={item.label}
            role="tab"
            aria-selected={index === active}
            className={index === active ? "is-active" : ""}
            onClick={() => onPeriodChange(index)}
          >
            {item.label}
            <em>{item.records.length} 篇</em>
          </button>
        ))}
        <button type="button" disabled={!hasSlice} onClick={() => onOpenSlice(active)}>
          在网络图中打开此切片
        </button>
      </div>
      <div className="studio-biblio-theme-grid">
        <section className="studio-biblio-strategy" aria-label="战略坐标图">
          <h2>战略坐标图 · {period.label}</h2>
          <p>Callon 中心度 / 密度，按该时段中位数切四象限。题名保持原文。</p>
          <StrategyChart clusters={periodClusters} />
        </section>
        <section className="studio-biblio-sankey-wrap" aria-label="主题演化">
          <h2>主题演化</h2>
          <p>相邻时段用 inclusion 指数连线，阈值 0.2。算法在 INS 内计算，不出主机。</p>
          {evolution.periods.length < 2 || evolution.flows.length === 0 ? (
            <p className="studio-biblio-theme-empty">
              {evolution.periods.length < 2
                ? "只有一个时段，还画不出演化流。"
                : "相邻时段的关键词重叠还不够画出演化流。"}
            </p>
          ) : (
            <ThemeSankey evolution={evolution} active={active} />
          )}
        </section>
      </div>
      <section className="studio-biblio-theme-list" aria-label="主题列表">
        <h2>{period.label} 的主题</h2>
        {periodClusters.length === 0 ? (
          <p>这一期关键词还不够聚类。</p>
        ) : (
          <ol>
            {periodClusters.map((cluster) => (
              <li key={cluster.id}>
                <strong style={{ color: QUADRANT_TONE[cluster.quadrant] }}>{cluster.label}</strong>
                <span>{themeQuadrantLabel(cluster.quadrant)}</span>
                <span>{cluster.documents} 篇</span>
                <em>{cluster.keywords.slice(0, 6).join(" / ")}</em>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function StrategyChart({ clusters }: { clusters: ThemeCluster[] }) {
  const width = 420;
  const height = 280;
  const pad = 36;
  if (clusters.length === 0) {
    return <p className="studio-biblio-theme-empty">这一期还没有可画的主题。</p>;
  }
  const xs = clusters.map((item) => item.centrality);
  const ys = clusters.map((item) => item.density);
  const maxX = Math.max(...xs, 1);
  const maxY = Math.max(...ys, 1);
  const midX = median(xs);
  const midY = median(ys);
  const xOf = (value: number) => pad + (value / maxX) * (width - pad * 2);
  const yOf = (value: number) => height - pad - (value / maxY) * (height - pad * 2);
  return (
    <svg className="studio-biblio-strategy-svg" viewBox={`0 0 ${width} ${height}`} role="img">
      <title>战略坐标图</title>
      <rect x="0" y="0" width={width} height={height} fill="#fbfaf6" />
      <line x1={xOf(midX)} y1={pad} x2={xOf(midX)} y2={height - pad} stroke="#d7d1c4" strokeDasharray="4 4" />
      <line x1={pad} y1={yOf(midY)} x2={width - pad} y2={yOf(midY)} stroke="#d7d1c4" strokeDasharray="4 4" />
      <text x={width - pad} y={pad - 10} textAnchor="end" fill="#8a7a4a" fontSize="10">
        电机
      </text>
      <text x={pad} y={pad - 10} fill="#3d5a40" fontSize="10">
        利基
      </text>
      <text x={width - pad} y={height - 8} textAnchor="end" fill="#3a4a6a" fontSize="10">
        基础
      </text>
      <text x={pad} y={height - 8} fill="#8a7a4a" fontSize="10">
        新兴/衰退
      </text>
      <text x={width / 2} y={height - 4} textAnchor="middle" fill="#6b6458" fontSize="9">
        中心度 →
      </text>
      <text
        x="12"
        y={height / 2}
        fill="#6b6458"
        fontSize="9"
        transform={`rotate(-90 12 ${height / 2})`}
      >
        密度 →
      </text>
      {clusters.map((cluster) => (
        <g key={cluster.id}>
          <circle
            cx={xOf(cluster.centrality)}
            cy={yOf(cluster.density)}
            r={Math.max(5, Math.min(12, 4 + cluster.keywords.length))}
            fill={QUADRANT_TONE[cluster.quadrant]}
            fillOpacity="0.85"
          />
          <title>{`${cluster.label} · ${themeQuadrantLabel(cluster.quadrant)}`}</title>
        </g>
      ))}
    </svg>
  );
}

function ThemeSankey({
  evolution,
  active,
}: {
  evolution: ThemeEvolution;
  active: number;
}) {
  const width = 720;
  const height = 280;
  const colW = 128;
  const pad = 16;
  const colGap = (width - pad * 2 - colW * evolution.periods.length) / Math.max(evolution.periods.length - 1, 1);
  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  evolution.periods.forEach((period, periodIndex) => {
    const clusters = evolution.clusters.filter((item) => item.periodIndex === periodIndex);
    const weights = clusters.map((item) => Math.max(item.documents, item.keywords.length, 1));
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;
    const usable = height - pad * 2 - Math.max(clusters.length - 1, 0) * 8;
    let y = pad;
    const x = pad + periodIndex * (colW + colGap);
    clusters.forEach((cluster, index) => {
      const h = Math.max(22, (weights[index] / total) * usable);
      boxes.set(cluster.id, { x, y, w: colW, h });
      y += h + 8;
    });
  });
  return (
    <svg className="studio-biblio-sankey" viewBox={`0 0 ${width} ${height}`} role="img">
      <title>主题演化流</title>
      {evolution.flows.map((flow) => {
        const from = boxes.get(flow.fromId);
        const to = boxes.get(flow.toId);
        if (!from || !to) return null;
        const x1 = from.x + from.w;
        const y1 = from.y + from.h / 2;
        const x2 = to.x;
        const y2 = to.y + to.h / 2;
        const mid = (x1 + x2) / 2;
        return (
          <path
            key={`${flow.fromId}-${flow.toId}`}
            d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="#8b3a2f"
            strokeOpacity={0.28 + flow.inclusion * 0.5}
            strokeWidth={Math.max(1.5, flow.inclusion * 10)}
          />
        );
      })}
      {evolution.clusters.map((cluster) => {
        const box = boxes.get(cluster.id);
        if (!box) return null;
        const selected = cluster.periodIndex === active;
        return (
          <g key={cluster.id}>
            <rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              rx="3"
              fill={selected ? "#fff" : "#f3efe6"}
              stroke={QUADRANT_TONE[cluster.quadrant]}
              strokeWidth={selected ? 1.8 : 1}
            />
            <text x={box.x + 8} y={box.y + 15} fontSize="10" fill={QUADRANT_TONE[cluster.quadrant]}>
              {cluster.label.slice(0, 18)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
