import { useMessages } from "../i18n";
import { Notice } from "../ui/Notice";
import layout from "./StatsLayout.module.css";

export function UnavailableRepos({ repos }: { repos: readonly string[] }) {
  const { stats } = useMessages();
  return repos.map((repo) => (
    <Notice key={repo} className={layout.warning} role="status">
      {stats.unavailableRepo(repo)}
    </Notice>
  ));
}
