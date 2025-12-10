// src/components/ProjectHeader.tsx
import React from "react";

interface Props {
  name: string;
  elevation: number;
}

export const ProjectHeader: React.FC<Props> = ({
  name,
  elevation,
}) => {
  return (
    <div className="project-header">
      <h1 className="project-title">{name}</h1>
      <div className="project-subtitle">
        Elevation: {elevation}
      </div>
    </div>
  );
};

