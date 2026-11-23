import { ArrowRight, ArrowUpRight, GraduationCap } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { siGithub } from "simple-icons";
import { useBento3DTilt } from "../components/Bento3DCard";
import { CelestialHud } from "../components/CelestialHud";
import { DiscordCard } from "../components/DiscordCard";
import { FocusCard } from "../components/FocusCard";
import { LanguageCard } from "../components/LanguageCard";
import { NoiseOverlay } from "../components/NoiseOverlay";
import { ScrollHorizon } from "../components/ScrollHorizon";
import { SoundCard } from "../components/SoundCard";
import { TechnologyGrid } from "../components/TechnologyGrid";
import { certifications, profile, projects } from "../data/portfolio";
import { useLanyardPresence } from "../hooks/useLanyardPresence";
import { useLocale } from "../i18n/LocaleProvider";
import { getDiscordAvatar } from "../utils/discord";

const linkedinPath =
  "M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z";
const mailPath =
  "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z";

function ExternalArrow() {
  return (
    <ArrowUpRight
      className="pointer-events-none absolute right-2.5 top-2.5 z-20 h-3 w-3 text-white/90 dark:text-[#ffffffaa] sm:right-3.5 sm:top-3.5 sm:h-4 sm:w-4 md:right-6 md:top-6 md:h-5 md:w-5"
      aria-hidden="true"
    />
  );
}

function useCountUp(target: number, durationMs = 950, delayMs = 260) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setValue(target);
      return;
    }

    let rafId = 0;
    const timeoutId = window.setTimeout(() => {
      const start = performance.now();

      const step = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(target * eased));
        if (t < 1) rafId = window.requestAnimationFrame(step);
      };

      rafId = window.requestAnimationFrame(step);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(rafId);
    };
  }, [delayMs, durationMs, target]);

  return value;
}

export function HomePage() {
  const { locale, t } = useLocale();
  const { presence, connection } = useLanyardPresence(profile.discordId);
  const discordUser = presence?.discord_user;
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const avatarImgRef = useRef<HTMLImageElement | null>(null);
  const tilt = useBento3DTilt();

  const projectCount = useCountUp(projects.length, 900, 260);
  const certCount = useCountUp(certifications.length, 950, 320);

  useEffect(() => {
    setAvatarFailed(false);
    const img = avatarImgRef.current;
    setAvatarLoaded(Boolean(img && img.complete && img.naturalWidth > 0));
  }, [discordUser?.avatar]);

  return (
    <main className="m-5 flex flex-col bg-transparent">
      <NoiseOverlay />
      <CelestialHud />

      <div className="atmosphere-grid container mx-auto my-5 grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-4 xl:px-20">
        {/* 1. Hero / About (3x2) */}
        <section
          onPointerMove={tilt.onPointerMove}
          onPointerLeave={tilt.onPointerLeave}
          style={{ "--enter-delay": "0ms" } as CSSProperties}
          className="bento-card bento-enter group relative col-span-3 aspect-square overflow-hidden rounded-3xl bg-[#1c053a9c] dark:bg-[#af72ff56] md:aspect-auto md:row-span-2"
        >
          <div className="hero-sheen-once" aria-hidden="true" />
          <div className="about-water-wave" aria-hidden="true" />
          <div className="about-water-wave-secondary" aria-hidden="true" />

          <div
            className="hero-portrait-mask pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[44%] items-center justify-end overflow-hidden bg-gradient-to-l from-purple-300/15 via-purple-400/5 to-transparent pr-8 md:flex"
            aria-hidden="true"
          >
            <span className="select-none text-[clamp(7rem,13vw,11rem)] font-black leading-none tracking-tighter text-white/10">
              AA
            </span>
          </div>
          {discordUser && !avatarFailed && (
            <img
              ref={avatarImgRef}
              alt={profile.name}
              draggable={false}
              fetchPriority="high"
              loading="eager"
              decoding="async"
              width="512"
              height="512"
              className={`hero-portrait-mask pointer-events-none absolute bottom-0 right-0 z-0 hidden h-full w-[44%] object-cover object-top transition-opacity duration-500 md:block ${
                avatarLoaded ? "opacity-100" : "opacity-0"
              }`}
              src={getDiscordAvatar(discordUser, profile.discordId, 512)}
              onLoad={() => setAvatarLoaded(true)}
              onError={() => setAvatarFailed(true)}
            />
          )}

          <div className="relative z-10 flex h-full w-full flex-col justify-end p-5 text-white md:w-[64%] md:p-8">
            <h1
              style={{ "--line-delay": "140ms" } as CSSProperties}
              className="hero-line-enter mb-3 py-0.5 text-2xl font-bold leading-tight text-white sm:text-3xl md:mb-4 md:text-3xl lg:text-4xl xl:text-[2.75rem] xl:leading-[1.12]"
            >
              <span className="hero-wave-emoji mr-2" aria-hidden="true">
                👋
              </span>
              {t("greeting")} {profile.name}
            </h1>
            <p
              style={{ "--line-delay": "250ms" } as CSSProperties}
              className="hero-line-enter text-sm leading-relaxed text-white/95 sm:text-base md:text-lg lg:text-xl xl:text-[1.42rem] xl:leading-[1.48]"
            >
              {locale === "es" ? (
                <>
                  Soy <b>desarrollador</b> y estudiante de <b>Sistemas en UADE</b>. Disfruto llevar
                  ideas a la práctica, explorar tecnologías y agentes de IA, y resolver problemas en
                  equipo.
                </>
              ) : (
                <>
                  I&apos;m a <b>developer</b> and <b>Systems student at UADE</b>. I enjoy turning
                  ideas into working software, exploring technologies and AI agents, and solving
                  problems as a team.
                </>
              )}
            </p>
          </div>
        </section>

        {/* 2. Language Switcher (1x1) */}
        <LanguageCard enterDelayMs={70} />

        {/* 3. Interactive 3D Sound Card (1x1) */}
        <SoundCard enterDelayMs={125} />

        {/* 4. LinkedIn Card (1x1) */}
        <a
          href={profile.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LinkedIn"
          data-sound="card"
          onPointerMove={tilt.onPointerMove}
          onPointerLeave={tilt.onPointerLeave}
          style={{ "--enter-delay": "160ms" } as CSSProperties}
          className="bento-card bento-card-interactive bento-enter relative col-span-1 flex h-full w-full aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-3xl bg-[#1178ff9c] text-white dark:bg-[#49a7ff56] md:aspect-auto lg:aspect-square"
        >
          <ExternalArrow />
          <svg
            className="h-10 w-10 fill-current sm:h-14 sm:w-14 md:h-20 md:w-20 lg:h-24 lg:w-24"
            viewBox="0 0 448 512"
            aria-hidden="true"
          >
            <path d={linkedinPath} />
          </svg>
        </a>

        {/* 5. Expanded Skills & AI Grid (3x1) */}
        <TechnologyGrid enterDelayMs={200} />

        {/* 6. Unified Projects Card (3x1 desktop, 3x1 mobile) */}
        <Link
          className="bento-card bento-card-interactive bento-enter group relative col-span-3 aspect-[2/1] overflow-hidden rounded-3xl md:col-span-3 md:aspect-auto md:h-full"
          to="/projects"
          data-sound="card"
          aria-label={t("projects")}
          onPointerMove={tilt.onPointerMove}
          onPointerLeave={tilt.onPointerLeave}
          style={{ "--enter-delay": "255ms" } as CSSProperties}
        >
          <div className="absolute inset-0 bg-[#1c053a9c] dark:bg-[#af72ff56]" />
          <img
            className="project-cover-image absolute inset-0 h-full w-full object-cover opacity-40"
            src="/code-wall.svg"
            alt=""
            aria-hidden="true"
          />
          <div className="relative z-10 flex h-full w-full flex-col justify-between p-4 text-white md:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-bold leading-tight sm:text-lg md:text-2xl lg:text-4xl">
                {t("projects")}
              </h2>
              <ArrowRight
                className="h-5 w-5 shrink-0 text-white/90 transition-transform duration-300 ease-in-out group-hover:translate-x-1.5 dark:text-[#ffffffaa] md:h-7 md:w-7"
                aria-hidden="true"
              />
            </div>
            <div className="flex items-end justify-between gap-4">
              <p className="max-w-[70%] text-xs leading-snug text-white/95 sm:text-sm md:text-lg lg:text-xl lg:leading-snug">
                {t("projectsDescription")}
              </p>
              <div className="shrink-0 text-right">
                <p className="text-3xl font-extrabold leading-none tracking-tight tabular-nums text-white sm:text-4xl md:text-4xl lg:text-5xl xl:text-6xl">
                  +{projectCount}
                </p>
                <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/75 sm:text-[10px]">
                  {t("projectsCompleted")}
                </p>
              </div>
            </div>
          </div>
        </Link>

        {/* 7. GitHub Card (1x1) */}
        <a
          href={profile.github}
          target="_blank"
          rel="noopener noreferrer"
          data-sound="card"
          aria-label={t("github")}
          title={t("githubDescription")}
          onPointerMove={tilt.onPointerMove}
          onPointerLeave={tilt.onPointerLeave}
          style={{ "--enter-delay": "300ms" } as CSSProperties}
          className="bento-card bento-card-interactive bento-enter group relative col-span-1 flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-3xl bg-[#0e0e14d6] text-white dark:bg-[#1a1826cc]"
        >
          <img
            className="project-cover-image pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-25 transition-opacity duration-300 group-hover:opacity-40"
            src="/github-wall.svg"
            alt=""
            aria-hidden="true"
          />
          <ExternalArrow />
          <svg
            className="relative z-10 h-10 w-10 fill-current sm:h-14 sm:w-14 md:h-20 md:w-20 lg:h-24 lg:w-24"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d={siGithub.path} />
          </svg>
        </a>

        {/* 8. Discord Card (1x1) */}
        <DiscordCard
          presence={presence}
          connection={connection}
          userId={profile.discordId}
          enterDelayMs={345}
        />

        {/* 9. Email Card (1x1) */}
        <a
          href={`mailto:${profile.email}`}
          target="_blank"
          rel="noopener noreferrer"
          data-sound="card"
          aria-label={t("email")}
          onPointerMove={tilt.onPointerMove}
          onPointerLeave={tilt.onPointerLeave}
          style={{ "--enter-delay": "385ms" } as CSSProperties}
          className="bento-card bento-card-interactive bento-enter relative col-span-1 flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-3xl bg-[#4032ff9c] text-white dark:bg-[#7785ff56]"
        >
          <ExternalArrow />
          <svg
            className="h-10 w-10 fill-current sm:h-14 sm:w-14 md:h-20 md:w-20 lg:h-24 lg:w-24"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d={mailPath} />
          </svg>
        </a>

        {/* 10. Tutor / About Card (2x1) */}
        <Link
          className="bento-card bento-card-interactive bento-enter relative col-span-2 flex h-full w-full cursor-pointer flex-col justify-between overflow-hidden rounded-3xl bg-[#000000d8] p-3.5 text-white dark:bg-[#242424c0] sm:p-5 md:col-span-2 md:aspect-auto md:p-6 lg:p-8"
          to="/about"
          data-sound="card"
          aria-label={t("tutor")}
          onPointerMove={tilt.onPointerMove}
          onPointerLeave={tilt.onPointerLeave}
          style={{ "--enter-delay": "425ms" } as CSSProperties}
        >
          <ExternalArrow />
          <div className="flex items-center pr-6">
            <GraduationCap
              className="h-6 w-6 shrink-0 text-white/95 sm:h-8 sm:w-8 md:h-10 md:w-10 lg:h-12 lg:w-12"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xs font-bold leading-tight text-white sm:text-base md:text-xl lg:text-2xl">
              {t("tutor")}
            </h2>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/80 sm:mt-1 sm:text-xs md:text-sm lg:text-base">
              {t("tutorDescription")}
            </p>
          </div>
        </Link>

        {/* 11. Certifications Stat Card (1x1) */}
        <Link
          className="bento-card bento-card-interactive bento-enter relative col-span-1 flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-3xl bg-[#2ab9adb9] p-2.5 text-white sm:p-3 md:p-4"
          to="/about"
          data-sound="card"
          aria-label={t("certifications")}
          onPointerMove={tilt.onPointerMove}
          onPointerLeave={tilt.onPointerLeave}
          style={{ "--enter-delay": "460ms" } as CSSProperties}
        >
          <ExternalArrow />
          <div className="flex flex-col items-center justify-center pt-3 text-center sm:pt-3.5 lg:pt-0">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-white/95 sm:text-[11px] md:text-xs lg:text-sm">
              {t("certificationsPrefix")}
            </p>
            <p className="my-0.5 text-3xl font-bold leading-none sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
              {certCount}
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-white/95 sm:text-[11px] md:text-xs lg:text-sm">
              {t("certificationsShort")}
            </p>
          </div>
        </Link>

        {/* 12. Systems & AI Focus Card (3x1 desktop, 3x1 mobile) */}
        <FocusCard enterDelayMs={495} />
      </div>

      <ScrollHorizon />
    </main>
  );
}
