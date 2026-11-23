import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useEnvironment } from "../environment/EnvironmentProvider";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { environment } = useEnvironment();
  const theme: Theme = environment.isDay ? "light" : "dark";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#09030e" : "#f7efff",
    );
  }, [theme]);

  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
