import type { MemorySample } from "../../core/stats/types";
import { useMemorySamples } from "../app/queries";
import { formatMb } from "./cost-format";
import { Panel } from "./Panel";
import styles from "./MemoryChart.module.css";

const WIDTH = 360;
const HEIGHT = 48;

export function MemoryPanel() {
  const memory = useMemorySamples();
  const samples = memory.data?.samples ?? [];
  return (
    <Panel title="Память сервера">
      <p className={styles.muted}>После перезапуска сервера история начинается заново</p>
      <MemoryLine samples={samples} />
    </Panel>
  );
}

function MemoryLine({ samples }: { samples: MemorySample[] }) {
  const current = samples.at(-1)?.rssMb ?? null;
  const max = samples.length === 0 ? null : Math.max(...samples.map((sample) => sample.rssMb));
  const summary = `сейчас ${formatMb(current)}, максимум за час ${formatMb(max)}`;
  const slot = WIDTH / Math.max(samples.length - 1, 1);
  const peak = Math.max(1, ...samples.map((sample) => sample.rssMb));
  const points = samples.map((sample, index) => `${index * slot},${HEIGHT - (sample.rssMb / peak) * (HEIGHT - 4) - 2}`).join(" ");
  return (
    <figure className={styles.chart}>
      <div role="img" aria-label={summary}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className={styles.line} aria-hidden="true">
          <polyline points={points} className={styles.open} />
        </svg>
      </div>
    </figure>
  );
}
