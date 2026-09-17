import { Route, Routes } from "react-router";
import { AppLayout } from "../layout/AppLayout";
import { TaskListPage } from "../list/TaskListPage";
import { useLiveUpdates } from "./queries";

export function App() {
  useLiveUpdates();
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<TaskListPage />} />
        <Route path="new" element={<TaskListPage />} />
        <Route path="t/:taskId" element={<TaskListPage />} />
        <Route path="p/:projectId" element={<TaskListPage />} />
        <Route path="p/:projectId/new" element={<TaskListPage />} />
        <Route path="p/:projectId/t/:taskId" element={<TaskListPage />} />
      </Route>
    </Routes>
  );
}
