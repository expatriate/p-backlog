import styles from "./StatsPage.module.css";

export function UnavailableRepos({ repos }: { repos: readonly string[] }) {
  return repos.map((repo) => (
    <p key={repo} className={styles.warning} role="status">
      Нет доступа к репозиторию: {repo}. Проверьте путь в repos файла project.md и что это git-репозиторий.
    </p>
  ));
}
