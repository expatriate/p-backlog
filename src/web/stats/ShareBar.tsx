import { Meter } from "../ui/Meter";
import styles from "./ShareBar.module.css";

export function ShareBar({ share }: { share: number }) {
  return <Meter fraction={share} className={styles.share} aria-hidden="true" />;
}
