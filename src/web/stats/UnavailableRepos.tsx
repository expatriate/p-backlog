import { useMessages } from "../i18n";
import styles from "./StatsPage.module.css";

export function UnavailableRepos({ repos }: { repos: readonly string[] }) {
  const { stats } = useMessages();
  return repos.map((repo) => (
    <p key={repo} className={styles.warning} role="status">
      {stats.unavailableRepo(repo)}
    </p>
  ));
}
