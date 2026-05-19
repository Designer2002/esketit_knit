-- Add sleeve_type column to projects table
ALTER TABLE projects ADD COLUMN sleeve_type TEXT DEFAULT 'raglan';
ALTER TABLE projects ADD COLUMN silhouette_type TEXT DEFAULT 'straight' 
  CHECK(silhouette_type IN ('straight', 'fitted'));