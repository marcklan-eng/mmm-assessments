// Small server-rendered SVG charts (no chart library). Native tooltips via <title>.
type Pt = { label: string; value: number | null };

const W = 560;
const H = 200;
const PAD = { l: 36, r: 12, t: 12, b: 28 };

function xBand(n: number) {
  const inner = W - PAD.l - PAD.r;
  return { step: inner / Math.max(n, 1), inner };
}

function labelEvery(n: number) {
  return Math.max(1, Math.ceil(n / 8));
}

export function BarChart({ data, unit }: { data: Pt[]; unit: string }) {
  if (!data.length) return <Empty />;
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  const niceMax = Math.ceil(max / 5) * 5 || 5;
  const { step } = xBand(data.length);
  const bw = Math.max(4, Math.min(36, step - 6));
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / niceMax);
  const every = labelEvery(data.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Bar chart, ${unit} per week`}>
      {[0, niceMax / 2, niceMax].map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={PAD.l - 6} y={y(t) + 4} className="tick" textAnchor="end">{t}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const v = d.value ?? 0;
        const x = PAD.l + i * step + (step - bw) / 2;
        const top = y(v);
        const h = Math.max(0, H - PAD.b - top);
        const r = Math.min(4, h, bw / 2);
        return (
          <g key={i}>
            <rect x={PAD.l + i * step} y={PAD.t} width={step} height={H - PAD.t - PAD.b} fill="transparent">
              <title>{`Week of ${d.label}: ${v} ${unit}`}</title>
            </rect>
            {h > 0 && (
              <path
                d={`M${x},${H - PAD.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - PAD.b} Z`}
                fill="var(--series-1)"
                pointerEvents="none"
              />
            )}
            {i % every === 0 && <text x={x + bw / 2} y={H - 8} className="tick" textAnchor="middle">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({ series, refLine }: { series: { name: string; color: string; data: Pt[] }[]; refLine?: { value: number; label: string } }) {
  const n = series[0]?.data.length ?? 0;
  if (!n) return <Empty />;
  const { step } = xBand(n);
  const x = (i: number) => PAD.l + i * step + step / 2;
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / 100);
  const every = labelEvery(n);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Line chart, percent per week">
      {[0, 50, 100].map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={PAD.l - 6} y={y(t) + 4} className="tick" textAnchor="end">{t}%</text>
        </g>
      ))}
      {refLine && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(refLine.value)} y2={y(refLine.value)} className="ref" />
          <text x={W - PAD.r} y={y(refLine.value) - 5} className="tick" textAnchor="end">{refLine.label}</text>
        </g>
      )}
      {series.map((s) => {
        const pts = s.data.map((d, i) => (d.value == null ? null : [x(i), y(d.value)] as const));
        let path = "";
        let pen = false;
        pts.forEach((p) => {
          if (!p) { pen = false; return; }
          path += `${pen ? "L" : "M"}${p[0]},${p[1]} `;
          pen = true;
        });
        return (
          <g key={s.name}>
            <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) =>
              p ? (
                <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2}>
                  <title>{`${s.name}, week of ${s.data[i].label}: ${Math.round(s.data[i].value!)}%`}</title>
                </circle>
              ) : null,
            )}
          </g>
        );
      })}
      {series[0].data.map((d, i) => (i % every === 0 ? <text key={i} x={x(i)} y={H - 8} className="tick" textAnchor="middle">{d.label}</text> : null))}
    </svg>
  );
}

export function Legend({ items }: { items: { name: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.name}>
          <svg width="18" height="10" aria-hidden>
            <line x1="1" x2="17" y1="5" y2="5" stroke={i.color} strokeWidth={i.dashed ? 1.5 : 2.5} strokeDasharray={i.dashed ? "3 3" : undefined} strokeLinecap="round" />
          </svg>
          {i.name}
        </span>
      ))}
    </div>
  );
}

function Empty() {
  return <div className="chart-empty">No completed attempts in this range yet.</div>;
}

export function Meter({ value, tone }: { value: number; tone?: "bad" | "neutral" }) {
  return (
    <div className="meter" aria-hidden>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone === "bad" ? "var(--bad)" : "var(--series-1)" }} />
    </div>
  );
}
