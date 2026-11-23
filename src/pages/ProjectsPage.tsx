import { ArrowLeft, ExternalLink, Github, Star, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAudio } from "../audio/AudioProvider";
import { useBento3DTilt } from "../components/Bento3DCard";
import { NoiseOverlay } from "../components/NoiseOverlay";
import { profile, projects, type PortfolioProject, type ProjectCategory } from "../data/portfolio";
import { useLanyardPresence } from "../hooks/useLanyardPresence";
import { useLocale } from "../i18n/LocaleProvider";
import { getDiscordAvatar } from "../utils/discord";

type ProjectFilter = "all" | ProjectCategory | "recommended";

const filters: ProjectFilter[] = ["all", "personal", "practice", "experiments", "recommended"];

const categoryColors: Record<ProjectCategory, string> = {
  personal: "bg-[#5183B4aa]",
  practice: "bg-[#51B489aa]",
  experiments: "bg-[#51B4B3aa]",
};

function isProjectFilter(value: ProjectFilter, project: PortfolioProject) {
  if (value === "all") return true;
  if (value === "recommended") return Boolean(project.featured);
  return project.category === value;
}

function ProjectCard({
  project,
  onOpen,
  index,
}: {
  project: PortfolioProject;
  index: number;
  onOpen: (project: PortfolioProject, clientX?: number) => void;
}) {
  const { locale, t } = useLocale();
  const tilt = useBento3DTilt();
  const categoryColor = project.featured ? "bg-[#DDB71Aaa]" : categoryColors[project.category];

  return (
    <button
      type="button"
      data-sound="custom"
      onClick={(event) => onOpen(project, event.clientX)}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      style={{ "--enter-delay": `${130 + index * 60}ms` } as CSSProperties}
      className={`bento-card bento-card-interactive bento-enter project-card group relative col-span-3 flex aspect-square cursor-pointer flex-col justify-between overflow-hidden rounded-3xl text-left shadow-xl md:col-span-1 ${categoryColor}`}
      aria-label={`${t("openProject")}: ${project.title}`}
    >
      <img
        className="project-cover-image absolute bottom-0 left-[2.5%] h-1/2 w-[95%] rounded-t-3xl object-cover md:left-0 md:h-full md:w-full"
        src={project.image}
        alt=""
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/30 to-black/65" />
      <div className="relative z-10 flex h-full w-full flex-col justify-between p-5 md:p-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-white/90">
            <span className="text-xs font-semibold uppercase tracking-wide">{t(project.category)}</span>
            {project.featured && <Star size={14} fill="currentColor" aria-label={t("featured")} />}
          </div>
          <h2 className="text-lg font-bold leading-snug text-white md:text-2xl">{project.title}</h2>
          <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-white/90 sm:text-sm md:text-base">
            {project.description[locale]}
          </p>
        </div>

        <div className="flex w-full flex-wrap gap-1.5">
          {project.technologies.slice(0, 3).map((technology) => (
            <span
              className="shrink-0 rounded-3xl bg-[#000000aa] px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm sm:px-3 sm:py-1.5 sm:text-xs"
              key={technology}
            >
              {technology}
            </span>
          ))}
        </div>
      </div>
      <span className="absolute bottom-4 right-4 z-10 text-xs font-bold text-white/75 md:hidden">
        0{index + 1}
      </span>
    </button>
  );
}

function ProjectModal({
  project,
  onClose,
}: {
  project: PortfolioProject;
  onClose: (clientX?: number) => void;
}) {
  const { locale, t } = useLocale();
  const categoryColor = project.featured ? "bg-[#DDB71Aaa]" : categoryColors[project.category];

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[1100] flex items-center justify-center p-4"
      role="presentation"
      data-sound="custom"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose(event.clientX);
      }}
    >
      <section
        className={`relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-3 md:p-4 ${categoryColor}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
      >
        <div className="relative rounded-3xl bg-[#f8efff] p-5 text-[#241333] dark:bg-[#09030e] dark:text-white md:p-8">
          <button
            className="absolute right-5 top-5 z-20 rounded-full p-2 text-current transition hover:bg-black/10 dark:hover:bg-white/10 md:right-7 md:top-7"
            type="button"
            data-sound="custom"
            onClick={(event) => onClose(event.clientX)}
            aria-label="Close project"
          >
            <X size={26} />
          </button>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-300">
            {t(project.category)}
          </p>
          <h2 className="mb-3 pr-12 text-2xl font-bold md:text-4xl" id="project-modal-title">
            {project.title}
          </h2>
          <p className="mb-6 text-base leading-7 text-[#4c3b5e] dark:text-white/85 md:text-lg">
            {project.description[locale]}
          </p>
          <img
            className="mb-6 max-h-80 w-full rounded-3xl object-cover"
            src={project.image}
            alt={`${project.title} preview`}
          />
          <div className="mb-7 flex flex-wrap gap-2">
            {project.technologies.map((technology) => (
              <span
                className="rounded-3xl bg-black/10 px-3 py-1.5 text-xs font-medium dark:bg-white/10 sm:text-sm"
                key={technology}
              >
                {technology}
              </span>
            ))}
          </div>
          <a
            className="inline-flex items-center gap-2 font-semibold transition hover:text-purple-600 dark:hover:text-purple-300"
            href={project.repository}
            data-sound="card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github size={18} /> {t("openRepository")} <ExternalLink size={15} />
          </a>
        </div>
      </section>
    </div>
  );
}

export function ProjectsPage() {
  const { locale, t } = useLocale();
  const { playModal } = useAudio();
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [selectedProject, setSelectedProject] = useState<PortfolioProject | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const avatarImgRef = useRef<HTMLImageElement | null>(null);
  const { presence } = useLanyardPresence(profile.discordId);
  const tilt = useBento3DTilt();
  const visibleProjects = projects.filter((project) => isProjectFilter(filter, project));

  const openProjectModal = (project: PortfolioProject, clientX?: number) => {
    playModal("open", clientX);
    setSelectedProject(project);
  };

  const closeProjectModal = (clientX?: number) => {
    playModal("close", clientX);
    setSelectedProject(null);
  };

  useEffect(() => {
    setAvatarFailed(false);
    const img = avatarImgRef.current;
    setAvatarLoaded(Boolean(img && img.complete && img.naturalWidth > 0));
  }, [presence?.discord_user?.avatar]);

  return (
    <main className="m-5 flex min-h-[calc(100vh-2.5rem)] flex-col overflow-hidden bg-transparent">
      <NoiseOverlay />
      <div className="atmosphere-grid container mx-auto my-5 grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-4 xl:px-20">
        <header
          onPointerMove={tilt.onPointerMove}
          onPointerLeave={tilt.onPointerLeave}
          style={{ "--enter-delay": "0ms" } as CSSProperties}
          className="bento-card bento-enter relative col-span-3 flex min-h-[124px] items-center justify-between overflow-hidden rounded-3xl bg-[#1c053a9c] dark:bg-[#af72ff56] md:col-span-4 md:min-h-[176px]"
        >
          <div className="about-water-wave" aria-hidden="true" />
          <h1 className="relative z-10 ml-5 flex items-center gap-3 text-2xl font-bold uppercase text-white sm:text-4xl md:ml-8 md:gap-5 md:text-6xl lg:text-7xl">
            <Link
              to="/"
              data-sound="card"
              aria-label={t("backHome")}
              className="inline-flex items-center justify-center rounded-full p-1 transition-transform duration-200 hover:-translate-x-1"
            >
              <ArrowLeft className="h-6 w-6 sm:h-9 sm:w-9 md:h-12 md:w-12" aria-hidden="true" />
            </Link>
            <span>{t("projectsHeading")}</span>
            <span className="tabular-nums text-white/25">{visibleProjects.length}</span>
          </h1>

          <div className="hero-portrait-mask pointer-events-none relative flex h-full w-28 items-center justify-end pr-6 text-white/15 md:w-48 md:pr-8">
            <span className="select-none text-5xl font-black leading-none md:text-8xl" aria-hidden="true">
              AA
            </span>
            {presence?.discord_user && !avatarFailed && (
              <img
                ref={avatarImgRef}
                className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ${
                  avatarLoaded ? "opacity-100" : "opacity-0"
                }`}
                src={getDiscordAvatar(presence.discord_user, profile.discordId, 256)}
                alt={profile.name}
                draggable={false}
                decoding="async"
                onLoad={() => setAvatarLoaded(true)}
                onError={() => setAvatarFailed(true)}
              />
            )}
          </div>
        </header>

        <nav
          style={{ "--enter-delay": "70ms" } as CSSProperties}
          className="bento-card bento-enter relative col-span-3 h-14 overflow-hidden rounded-3xl bg-[#1c053a9c] dark:bg-[#af72ff56] md:col-span-4 md:h-16"
          aria-label={locale === "es" ? "Filtrar proyectos" : "Filter projects"}
        >
          <div className="no-scrollbar flex h-full flex-row items-center justify-start overflow-x-auto overflow-y-hidden px-3 md:justify-center">
            {filters.map((value) => (
              <button
                className={`relative flex h-full shrink-0 items-center justify-center px-2.5 text-xs font-bold uppercase transition duration-300 sm:px-3.5 sm:text-sm md:px-3.5 md:text-base lg:px-5 lg:text-xl ${
                  filter === value ? "text-white" : "text-[#ffffff6c] hover:text-[#ffffffb2]"
                }`}
                type="button"
                data-sound="filter"
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {filter === value && (
                  <span
                    className="pointer-events-none absolute -bottom-2.5 text-3xl transition-colors duration-500"
                    style={{ color: "var(--env-bg)" }}
                    aria-hidden="true"
                  >
                    <svg className="h-[1em] w-[1em] fill-current" viewBox="0 0 1024 1024">
                      <path d="M858.9 689 530.5 308.2c-9.4-10.9-27.5-10.9-37 0L165.1 689c-12.2 14.2-1.2 35 18.5 35h656.8c19.7 0 30.7-20.8 18.5-35z" />
                    </svg>
                  </span>
                )}
                <span className="flex items-start gap-1">
                  <span>{t(value)}</span>
                  {value === "recommended" && (
                    <Star className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden="true" />
                  )}
                </span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      <div className="atmosphere-grid container mx-auto mb-5 grid grid-cols-3 gap-2 md:grid-cols-3 md:gap-4 xl:px-20">
        {visibleProjects.map((project, index) => (
          <ProjectCard key={project.slug} project={project} index={index} onOpen={openProjectModal} />
        ))}
      </div>

      {selectedProject && (
        <ProjectModal project={selectedProject} onClose={closeProjectModal} />
      )}
    </main>
  );
}
