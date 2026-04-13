-- Add sleeve_type column to projects table
ALTER TABLE projects ADD COLUMN sleeve_type TEXT DEFAULT 'raglan';
