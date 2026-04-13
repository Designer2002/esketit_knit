import { HashRouter as Router, Routes, Route } from "react-router-dom";
import "./Themes/Themes.css";
import Start from "./Start/Start";
import CreateProject from "./CreateProject/CreateProject";
import OpenProject from "./OpenProject/OpenProject";
import ProjectEditor from "./ProjectEditor/ProjectEditor";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Start />} />
        <Route path="/create_project" element={<CreateProject />} />
        <Route path="/open_project" element={<OpenProject />}/>
        <Route path="/editor/:projectId" element={<ProjectEditor />} />
      </Routes>
    </Router>
  );
}

export default App;