import { ArrowLeft, ArrowUpRight, Github, Globe, Linkedin, Mail, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAudio } from "../audio/AudioProvider";
import { useBento3DTilt } from "../components/Bento3DCard";
import { NoiseOverlay } from "../components/NoiseOverlay";
import { certifications, fullSkills, profile } from "../data/portfolio";
import { useLanyardPresence } from "../hooks/useLanyardPresence";
import { useLocale } from "../i18n/LocaleProvider";
import { getDiscordAvatar } from "../utils/discord";

export function AboutPage() {
  const { locale, setLocale, t } = useLocale();
  const { enabled, toggleEnabled } = useAudio();
  const { presence } = useLanyardPresence(profile.discordId);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const avatarImgRef = useRef<HTMLImageElement | null>(null);
  const tilt = useBento3DTilt();

  useEffect(() => {
    setAvatarFailed(false);
    const img = avatarImgRef.current;
    setAvatarLoaded(Boolean(img && img.complete && img.naturalWidth > 0));
  }, [presence?.discord_user?.avatar]);

  return (
    <main className="min-h-screen bg-transparent p-5 font-montserrat text-[#241333] transition-colors duration-300 dark:text-white md:p-10">
      <NoiseOverlay />
      <div className="atmosphere-grid mx-auto max-w-5xl">
        <header
          style={{ "--enter-delay": "0ms" } as CSSProperties}
          className="bento-enter mb-8 flex items-center justify-between gap-4"
        >
          <Link
            to="/"
            data-sound="card"
            className="bento-card inline-flex items-center gap-2 rounded-full bg-[#1c053a14] px-4 py-2 text-sm font-semibold text-[#5b4770] transition duration-200 hover:bg-[#1c053a24] hover:text-[#241333] dark:bg-white/5 dark:text-[#b7a9cb] dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{t("backHome")}</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-sound="filter"
              onClick={() => setLocale(locale === "es" ? "en" : "es")}
              aria-label={`${t("language")}: ${locale.toUpperCase()}`}
              className="bento-card inline-flex items-center gap-1.5 rounded-full bg-[#1c053a14] px-3 py-2 text-xs font-bold uppercase text-[#5b4770] transition duration-200 hover:bg-[#1c053a24] hover:text-[#241333] dark:bg-white/5 dark:text-[#b7a9cb] dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Globe size={14} aria-hidden="true" />
              <span>{locale.toUpperCase()}</span>
            </button>
            <button
              type="button"
              data-sound="custom"
              onClick={(event) => toggleEnabled(event.clientX)}
              aria-pressed={enabled}
              aria-label={t("soundToggleAria")}
              className="bento-card inline-flex items-center justify-center rounded-full bg-[#1c053a14] p-2 text-[#5b4770] transition duration-200 hover:bg-[#1c053a24] hover:text-[#241333] dark:bg-white/5 dark:text-[#b7a9cb] dark:hover:bg-white/10 dark:hover:text-white"
            >
              {enabled ? (
                <Volume2 size={16} aria-hidden="true" />
              ) : (
                <VolumeX size={16} aria-hidden="true" />
              )}
            </button>
            <Link
              className="ml-1 font-extrabold tracking-tight text-[#241333] dark:text-white"
              to="/"
              data-sound="card"
            >
              AA<span className="text-purple-500">.</span>
            </Link>
          </div>
        </header>

        <section
          onPointerMove={tilt.onPointerMove}
          onPointerLeave={tilt.onPointerLeave}
          style={{ "--enter-delay": "60ms" } as CSSProperties}
          className="bento-card bento-enter relative mb-5 grid gap-5 overflow-hidden rounded-3xl bg-[#1c053a9c] p-6 text-white dark:bg-[#af72ff56] md:grid-cols-[180px_1fr] md:items-center md:p-10"
        >
          <div className="about-water-wave" aria-hidden="true" />
          <div className="relative z-10 h-36 w-36 md:h-44 md:w-44">
            <div
              className="flex h-full w-full items-center justify-center rounded-3xl bg-white/10 text-4xl font-black tracking-tight text-white/60 md:text-5xl"
              aria-hidden="true"
            >
              AA
            </div>
            {presence?.discord_user && !avatarFailed && (
              <img
                ref={avatarImgRef}
                className={`absolute inset-0 h-full w-full rounded-3xl object-cover shadow-md transition-opacity duration-500 ${
                  avatarLoaded ? "opacity-100" : "opacity-0"
                }`}
                src={getDiscordAvatar(presence.discord_user, profile.discordId, 256)}
                alt={profile.name}
                decoding="async"
                onLoad={() => setAvatarLoaded(true)}
                onError={() => setAvatarFailed(true)}
              />
            )}
          </div>
          <div className="relative z-10">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-purple-200">
              {t("about")}
            </p>
            <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-5xl">
              {t("aboutHeading")}
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-white/85 md:text-base">
              {t("aboutIntro")}
            </p>
            <nav className="mt-5 flex flex-wrap gap-4" aria-label="Contacto">
              <a
                className="inline-flex items-center gap-2 text-sm font-medium text-white/90 transition hover:text-purple-200"
                href={`mailto:${profile.email}`}
                data-sound="card"
              >
                <Mail size={16} aria-hidden="true" /> {profile.email}
              </a>
              <a
                className="inline-flex items-center gap-2 text-sm font-medium text-white/90 transition hover:text-purple-200"
                href={profile.github}
                data-sound="card"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github size={16} aria-hidden="true" /> GitHub <ArrowUpRight size={13} aria-hidden="true" />
              </a>
              <a
                className="inline-flex items-center gap-2 text-sm font-medium text-white/90 transition hover:text-purple-200"
                href={profile.linkedin}
                data-sound="card"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Linkedin size={16} aria-hidden="true" /> LinkedIn <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            </nav>
          </div>
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <section
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            style={{ "--enter-delay": "140ms" } as CSSProperties}
            className="bento-card bento-enter rounded-3xl bg-[#1c053a14] p-6 dark:bg-[#af72ff24] md:p-8"
          >
            <h2 className="mb-6 text-xl font-bold">{t("experience")}</h2>
            <div className="grid gap-6">
              <article className="border-l-2 border-purple-400 pl-4">
                <p className="text-xs font-semibold text-purple-600 dark:text-purple-300">
                  2026 — {locale === "es" ? "Actualidad" : "Present"}
                </p>
                <h3 className="mt-1 font-bold">{t("tutoringRole")}</h3>
                <p className="mt-2 text-sm leading-6 text-[#685978] dark:text-[#b6a9c6]">
                  {t("tutoringDetail")}
                </p>
              </article>
              <article className="border-l-2 border-purple-400 pl-4">
                <p className="text-xs font-semibold text-purple-600 dark:text-purple-300">
                  {locale === "es" ? "Independiente" : "Independent"}
                </p>
                <h3 className="mt-1 font-bold">{t("editingRole")}</h3>
                <p className="mt-2 text-sm leading-6 text-[#685978] dark:text-[#b6a9c6]">
                  {t("editingDetail")}
                </p>
              </article>
            </div>
          </section>

          <section
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            style={{ "--enter-delay": "200ms" } as CSSProperties}
            className="bento-card bento-enter rounded-3xl bg-[#1c053a14] p-6 dark:bg-[#af72ff24] md:p-8"
          >
            <h2 className="mb-6 text-xl font-bold">{t("education")}</h2>
            <div className="border-l-2 border-purple-400 pl-4">
              <p className="text-xs font-semibold text-purple-600 dark:text-purple-300">
                2024 — {locale === "es" ? "En curso" : "Present"}
              </p>
              <h3 className="mt-1 font-bold">{t("degree")}</h3>
              <p className="mt-2 text-sm leading-6 text-[#685978] dark:text-[#b6a9c6]">
                {t("university")}
              </p>
            </div>
            <h3 className="mb-3 mt-7 font-bold">{t("coursesHeading")}</h3>
            <ul className="grid gap-2 text-sm leading-6 text-[#685978] dark:text-[#b6a9c6]">
              {certifications.map((certification) => (
                <li className="flex gap-2" key={certification}>
                  <span className="text-purple-500">•</span>
                  <span>{certification}</span>
                </li>
              ))}
            </ul>
          </section>

          <section
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            style={{ "--enter-delay": "260ms" } as CSSProperties}
            className="bento-card bento-enter rounded-3xl bg-[#ff8e3226] p-6 dark:bg-[#ffad7722] md:col-span-2 md:p-8"
          >
            <h2 className="mb-5 text-xl font-bold">{t("skillsAi")}</h2>
            <div className="flex flex-wrap gap-2">
              {fullSkills.map((skill, index) => (
                <span
                  className={
                    index < 3
                      ? "inline-flex items-center gap-1.5 rounded-full border border-[#ff8e3255] bg-[#ff8e3228] px-4 py-2 text-sm font-bold text-[#241333] dark:border-[#ffad7744] dark:bg-[#ffad7726] dark:text-white"
                      : "rounded-full border border-[#6c3fa126] bg-white/40 px-3.5 py-2 text-sm font-medium dark:border-white/10 dark:bg-white/5"
                  }
                  key={skill}
                >
                  {skill}
                  {index < 3 && (
                    <span className="rounded-full bg-[#ff8e32]/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider dark:bg-white/15">
                      AI
                    </span>
                  )}
                </span>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex justify-between py-8 text-xs text-[#756684] dark:text-[#a394b6]">
          <span>{profile.githubHandle}</span>
          <span>© {new Date().getFullYear()}</span>
        </footer>
      </div>
    </main>
  );
}
