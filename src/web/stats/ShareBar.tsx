import rowStyles from "./PanelRows.module.css";

export function ShareBar({ share }: { share: number }) {
  return (
    <span className={rowStyles.track} aria-hidden="true">
      <span className={rowStyles.fill} style={{ transform: `scaleX(${share})` }} />
    </span>
  );
}
