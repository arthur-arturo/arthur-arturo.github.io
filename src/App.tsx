import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AudioProvider } from "./audio/AudioProvider";
import { AmbientScene3D } from "./components/AmbientScene3D";
import { ForegroundAtmosphere } from "./components/ForegroundAtmosphere";
import { EnvironmentProvider } from "./environment/EnvironmentProvider";
import { LocaleProvider } from "./i18n/LocaleProvider";
import { AboutPage } from "./pages/AboutPage";
import { HomePage } from "./pages/HomePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ThemeProvider } from "./theme/ThemeProvider";

export function App() {
  return (
    <LocaleProvider>
      <EnvironmentProvider>
        <ThemeProvider>
          <AudioProvider>
            <BrowserRouter>
              <AmbientScene3D />
              <div className="atmosphere-overcast-veil" aria-hidden="true" />
              <div className="relative z-10">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
              <ForegroundAtmosphere />
            </BrowserRouter>
          </AudioProvider>
        </ThemeProvider>
      </EnvironmentProvider>
    </LocaleProvider>
  );
}
