// src/App.tsx
import React from "react";
import { Routes, Route } from "react-router-dom";
import { HomeScreen } from "./components/HomeScreen";
import { ProjectView } from "./components/ProjectView";

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route
        path="/project/:projectId"
        element={<ProjectView />}
      />
    </Routes>
  );
};

export default App;

