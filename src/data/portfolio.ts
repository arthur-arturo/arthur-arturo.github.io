export const profile = {
  name: "Arthur Alvarez",
  role: "Desarrollador",
  location: "CABA, Argentina",
  email: "object.arthur@gmail.com",
  linkedin: "https://www.linkedin.com/in/arthurcalvarez",
  github: "https://github.com/arthur-arturo",
  githubHandle: "arthur-arturo",
  discordId: import.meta.env.VITE_DISCORD_USER_ID || "467172572312895488",
};

export type ProjectCategory = "personal" | "practice" | "experiments";
export type ProjectIcon = "map" | "film" | "audio" | "download";

export interface PortfolioProject {
  slug: string;
  title: string;
  category: ProjectCategory;
  featured?: boolean;
  icon: ProjectIcon;
  accent: string;
  image: string;
  description: { es: string; en: string };
  technologies: string[];
  repository: string;
}

export const projects: PortfolioProject[] = [
  {
    slug: "turistear",
    title: "TuristeAR",
    category: "practice",
    icon: "map",
    accent: "#43bfa1",
    image: "/projects/turistear.svg",
    featured: true,
    description: {
      es: "App móvil para explorar y personalizar itinerarios turísticos por Argentina, guardar favoritos y organizar viajes.",
      en: "A mobile app to explore and customize travel itineraries across Argentina, save favorites, and plan trips.",
    },
    technologies: ["React Native", "Expo", "TypeScript", "Supabase", "Jest"],
    repository: "https://github.com/arthur-arturo/FrontEnd_Grupo3_DesarrolloApps1",
  },
  {
    slug: "smart-media-organizer",
    title: "Smart Media Organizer",
    category: "personal",
    icon: "film",
    accent: "#f48661",
    image: "/projects/smart-media.svg",
    featured: true,
    description: {
      es: "Script con interfaz nativa para DaVinci Resolve que clasifica vídeos verticales y horizontales con un clic.",
      en: "A DaVinci Resolve script with a native interface that sorts vertical and horizontal footage in one click.",
    },
    technologies: ["Python", "DaVinci Resolve", "Scripting API"],
    repository: "https://github.com/arthur-arturo/davinci-smart-media-organizer",
  },
  {
    slug: "opena2dp",
    title: "OpenA2DP",
    category: "personal",
    icon: "audio",
    accent: "#9d7cff",
    image: "/projects/opena2dp.svg",
    featured: true,
    description: {
      es: "Proyecto open source de investigación para audio Bluetooth de alta fidelidad en Windows con baja latencia.",
      en: "An open-source research project for low-latency, high-fidelity Bluetooth audio on Windows.",
    },
    technologies: ["C++20", "Windows WASAPI", "CMake", "LDAC"],
    repository: "https://github.com/arthur-arturo/OpenA2DP",
  },
  {
    slug: "easydyt",
    title: "EasyDYT",
    category: "experiments",
    icon: "download",
    accent: "#f6c752",
    image: "/projects/easydyt.svg",
    description: {
      es: "Extensión para Chrome con cola de procesamiento y rotación de servidores de respaldo para las descargas.",
      en: "A Chrome extension with a background processing queue and automatic fallback-server rotation for downloads.",
    },
    technologies: ["JavaScript", "Manifest V3", "REST API"],
    repository: "https://github.com/arthur-arturo/EasyDYT",
  },
];

export const experience = [
  {
    title: { es: "Tutor de programación", en: "Programming Tutor" },
    period: { es: "2026 — Actualidad", en: "2026 — Present" },
    description: {
      es: "Clases de programación, orientación a objetos y estructuras de datos.",
      en: "Tutoring in programming, object-oriented design, and data structures.",
    },
  },
  {
    title: { es: "Editor de vídeo freelance", en: "Freelance Video Editor" },
    period: { es: "Independiente", en: "Independent" },
    description: {
      es: "Postproducción para clientes y contenido de redes, con DaVinci Resolve.",
      en: "Post-production for clients and social content using DaVinci Resolve.",
    },
  },
];

export const certifications = [
  "Claude Code: Desarrollo con Agentes de IA",
  "100 Days of Code: Python Pro Bootcamp",
  "The Complete Web Development Bootcamp",
  "GitHub Copilot: Productividad Aplicada al Código",
  "Bootcamp Desarrollador Java · ULP",
];

export const fullSkills = [
  "Claude Code",
  "Codex",
  "GitHub Copilot",
  "TypeScript",
  "React",
  "Python",
  "JavaScript",
  "React Native · Expo",
  "REST APIs",
  "Java · Spring Boot",
  "SQL Server · PostgreSQL",
  "C++20 · Windows WASAPI · CMake",
  "Git & GitHub",
  "Jest",
  "Supabase",
  "DaVinci Resolve Scripting API",
  "Chrome Extensions · Manifest V3",
];
