// Settings: theme, account, stores and own categories.
import { BookmarkIcon, ChevronRightIcon, HomeIcon, EnvelopeClosedIcon, ExitIcon, LockClosedIcon, MixIcon, MoonIcon, PersonIcon, PlusIcon, SunIcon, TrashIcon } from "@radix-ui/react-icons";
import { alive } from "../model";
import type { ShoppingApp } from "./useShoppingApp";

export function SettingsTab({ app }: { app: ShoppingApp }) {
  const { data, cloud } = app;
  const syncLabel = { idle: "Подключение", syncing: "Сохранение", synced: "Сохранено", error: "Нет связи" }[cloud.status];
  const customCategories = alive(data.categories);
  return <>
    <section className="welcome-block compact-welcome"><p className="eyebrow">ПЕРСОНАЛИЗАЦИЯ</p><h1>Настройки</h1><p className="welcome-subtitle">Подстройте приложение под себя.</p></section>
    <section className="settings-group"><p className="settings-label">ВНЕШНИЙ ВИД</p><button className="setting-row" onClick={app.toggleDarkMode}><span className="setting-icon">{data.settings.darkMode ? <MoonIcon /> : <SunIcon />}</span><span><b>{data.settings.darkMode ? "Тёмная тема" : "Светлая тема"}</b><small>Нажмите, чтобы переключить оформление</small></span><span className={`theme-switch ${data.settings.darkMode ? "switch-on" : ""}`}><i /></span></button></section>

    <section className="settings-group"><p className="settings-label">АККАУНТ</p>
      {cloud.email ? <div className="settings-stack">
        <div className="setting-row static-row"><span className="setting-icon"><PersonIcon /></span><span><b>{cloud.email}</b><small>Списки сохраняются в аккаунте</small></span><span className={`local-badge ${cloud.status === "error" ? "badge-warning" : ""}`}>{syncLabel}</span></div>
        {!cloud.verified && cloud.config.email && <button className="setting-row" onClick={app.startVerification}><span className="setting-icon setting-warning"><EnvelopeClosedIcon /></span><span><b>Подтвердите почту</b><small>Нужно, чтобы приглашать людей письмом</small></span><ChevronRightIcon /></button>}
        <button className="setting-row" onClick={app.openPasswordSheet}><span className="setting-icon"><LockClosedIcon /></span><span><b>{cloud.hasPassword ? "Сменить пароль" : "Задать пароль"}</b><small>{cloud.hasPassword ? "Другие устройства выйдут из аккаунта" : "Чтобы входить без Google"}</small></span><ChevronRightIcon /></button>
        <div className="settings-buttons">
          <button className="destructive-button" onClick={app.signOut}><ExitIcon /> Выйти из аккаунта</button>
          <button className="destructive-button" onClick={app.openDeleteAccount}><TrashIcon /> Удалить аккаунт</button>
        </div>
      </div> : <button className="setting-row" onClick={() => app.openAccount("login")}><span className="setting-icon"><PersonIcon /></span><span><b>Войти или создать аккаунт</b><small>Чтобы списки были на всех устройствах и их можно было вести вместе</small></span><ChevronRightIcon /></button>}
    </section>

    <section className="settings-group"><p className="settings-label">СЕМЬЯ</p>
      <button className="setting-row" onClick={app.openFamily}><span className="setting-icon"><HomeIcon /></span><span><b>{cloud.family && cloud.family.members.length > 1 ? `Семья · ${cloud.family.members.length} чел.` : "Семья"}</b><small>{cloud.family && cloud.family.members.length > 1 ? cloud.family.members.filter((member) => !member.you).map((member) => member.email).join(", ") : "Пригласите близких — все списки станут общими"}</small></span><ChevronRightIcon /></button>
    </section>

    <section className="settings-group"><p className="settings-label">МАГАЗИНЫ</p>
      <div className="settings-stack">
        {alive(data.stores).map((store) => <button className="setting-row" key={store.id} onClick={() => app.openStore(store)}><span className="setting-icon"><MixIcon /></span><span><b>{store.name}</b><small>{store.categoryOrder.slice(0, 3).join(" → ")}…</small></span><ChevronRightIcon /></button>)}
        <button className="setting-row" onClick={() => app.openStore()}><span className="setting-icon"><PlusIcon /></span><span><b>Добавить магазин</b><small>Порядок отделов, в котором вы их обходите</small></span><ChevronRightIcon /></button>
      </div>
    </section>

    <section className="settings-group"><p className="settings-label">КАТЕГОРИИ</p>
      <button className="setting-row" onClick={app.openCategories}><span className="setting-icon"><BookmarkIcon /></span><span><b>Свои категории</b><small>{customCategories.length ? customCategories.map((category) => category.name).join(", ") : "Добавьте свои группы продуктов"}</small></span><ChevronRightIcon /></button>
    </section>

    <div className="settings-note">{cloud.email ? "Списки хранятся на этом устройстве и в вашем аккаунте. Без интернета приложение продолжает работать, изменения сохранятся при следующем подключении." : "Сейчас покупки сохраняются только на этом устройстве. Войдите в аккаунт, чтобы они не потерялись и были доступны на других устройствах."}</div>
  </>;
}
