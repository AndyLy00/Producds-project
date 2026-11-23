// Settings: theme, account, stores and own categories.
import { BookmarkIcon, ChevronRightIcon, GlobeIcon, HomeIcon, EnvelopeClosedIcon, ExitIcon, LockClosedIcon, MixIcon, MoonIcon, PersonIcon, PlusIcon, SunIcon, TrashIcon } from "@radix-ui/react-icons";
import { API_ORIGIN } from "../api-origin";
import { alive } from "../model";
import type { ShoppingApp } from "./useShoppingApp";
import { languages, t } from "../i18n";

export function SettingsTab({ app }: { app: ShoppingApp }) {
  const { data, cloud } = app;
  const syncLabel = { idle: t("Подключение"), syncing: t("Сохранение"), synced: t("Сохранено"), error: t("Нет связи") }[cloud.status];
  const customCategories = alive(data.categories);
  return <>
    <section className="welcome-block compact-welcome"><p className="eyebrow">{t("ПЕРСОНАЛИЗАЦИЯ")}</p><h1>{t("Настройки")}</h1><p className="welcome-subtitle">{t("Подстройте приложение под себя.")}</p></section>
    <section className="settings-group"><p className="settings-label">{t("ВНЕШНИЙ ВИД")}</p><button className="setting-row" onClick={app.toggleDarkMode}><span className="setting-icon">{data.settings.darkMode ? <MoonIcon /> : <SunIcon />}</span><span><b>{data.settings.darkMode ? t("Тёмная тема") : t("Светлая тема")}</b><small>{t("Нажмите, чтобы переключить оформление")}</small></span><span className={`theme-switch ${data.settings.darkMode ? "switch-on" : ""}`}><i /></span></button></section>

    <section className="settings-group"><p className="settings-label">{t("ЯЗЫК")}</p>
      <button className="setting-row" onClick={() => app.openSheet({ kind: "language" })}><span className="setting-icon"><GlobeIcon /></span><span><b>{languages.find((entry) => entry.id === app.lang)?.name}</b><small>{t("Язык приложения")}</small></span><ChevronRightIcon /></button>
    </section>

    <section className="settings-group"><p className="settings-label">{t("АККАУНТ")}</p>
      {cloud.email ? <div className="settings-stack">
        <div className="setting-row static-row"><span className="setting-icon"><PersonIcon /></span><span><b>{cloud.email}</b><small>{t("Списки сохраняются в аккаунте")}</small></span><span className={`local-badge ${cloud.status === "error" ? "badge-warning" : ""}`}>{syncLabel}</span></div>
        {!cloud.verified && cloud.config.email && <button className="setting-row" onClick={app.startVerification}><span className="setting-icon setting-warning"><EnvelopeClosedIcon /></span><span><b>{t("Подтвердите почту")}</b><small>{t("Нужно, чтобы приглашать людей письмом")}</small></span><ChevronRightIcon /></button>}
        <button className="setting-row" onClick={app.openPasswordSheet}><span className="setting-icon"><LockClosedIcon /></span><span><b>{cloud.hasPassword ? t("Сменить пароль") : t("Задать пароль")}</b><small>{cloud.hasPassword ? t("Другие устройства выйдут из аккаунта") : t("Чтобы входить без Google")}</small></span><ChevronRightIcon /></button>
        <div className="settings-buttons">
          <button className="destructive-button" onClick={app.signOut}><ExitIcon /> {t("Выйти из аккаунта")}</button>
          <button className="destructive-button" onClick={app.openDeleteAccount}><TrashIcon /> {t("Удалить аккаунт")}</button>
        </div>
      </div> : <button className="setting-row" onClick={() => app.openAccount("login")}><span className="setting-icon"><PersonIcon /></span><span><b>{t("Войти или создать аккаунт")}</b><small>{t("Чтобы списки были на всех устройствах и их можно было вести вместе")}</small></span><ChevronRightIcon /></button>}
    </section>

    <section className="settings-group"><p className="settings-label">{t("СЕМЬЯ")}</p>
      <button className="setting-row" onClick={app.openFamily}><span className="setting-icon"><HomeIcon /></span><span><b>{cloud.family && cloud.family.members.length > 1 ? t("Семья · {length} чел.", { length: cloud.family.members.length }) : t("Семья")}</b><small>{cloud.family && cloud.family.members.length > 1 ? cloud.family.members.filter((member) => !member.you).map((member) => member.email).join(", ") : t("Пригласите близких — все списки станут общими")}</small></span><ChevronRightIcon /></button>
    </section>

    <section className="settings-group"><p className="settings-label">{t("МАГАЗИНЫ")}</p>
      <div className="settings-stack">
        {alive(data.stores).map((store) => <button className="setting-row" key={store.id} onClick={() => app.openStore(store)}><span className="setting-icon"><MixIcon /></span><span><b>{store.name}</b><small>{store.categoryOrder.slice(0, 3).map((name) => t(name)).join(" → ")}…</small></span><ChevronRightIcon /></button>)}
        <button className="setting-row" onClick={() => app.openStore()}><span className="setting-icon"><PlusIcon /></span><span><b>{t("Добавить магазин")}</b><small>{t("Порядок отделов, в котором вы их обходите")}</small></span><ChevronRightIcon /></button>
      </div>
    </section>

    <section className="settings-group"><p className="settings-label">{t("КАТЕГОРИИ")}</p>
      <button className="setting-row" onClick={app.openCategories}><span className="setting-icon"><BookmarkIcon /></span><span><b>{t("Свои категории")}</b><small>{customCategories.length ? customCategories.map((category) => category.name).join(", ") : t("Добавьте свои группы продуктов")}</small></span><ChevronRightIcon /></button>
    </section>

    <div className="settings-note">{cloud.email ? t("Списки хранятся на этом устройстве и в вашем аккаунте. Без интернета приложение продолжает работать, изменения сохранятся при следующем подключении.") : t("Сейчас покупки сохраняются только на этом устройстве. Войдите в аккаунт, чтобы они не потерялись и были доступны на других устройствах.")}</div>
    <a className="settings-link" href={`${API_ORIGIN}/privacy?lang=${app.lang}`} target="_blank" rel="noopener">{t("Политика конфиденциальности")}</a>
  </>;
}
