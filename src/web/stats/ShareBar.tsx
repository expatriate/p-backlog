import { Meter } from "../ui/Meter";
import rowStyles from "./PanelRows.module.css";

export function ShareBar({ share }: { share: number }) {
  return <Meter fraction={share} className={rowStyles.share} aria-hidden="true" />;
}
