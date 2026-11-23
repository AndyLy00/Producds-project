// The tabs shown when no list is open: lists, favorites, recipes, history and settings.
import { ArchiveIcon, BackpackIcon, CalendarIcon, ChevronRightIcon, ClockIcon, DotsHorizontalIcon, GearIcon, HomeIcon, PlayIcon, PlusIcon, ReaderIcon, StarFilledIcon, StarIcon } from "@radix-ui/react-icons";
import type { CSSProperties } from "react";
import { useAdBanner } from "../ads";
import { MobileScroll } from "../mobile";
import { alive, formatMinutes, progress, stepsOf, toProduct, totalMinutes } from "../model";
import { SettingsTab } from "./SettingsTab";
import { EmptyState, ListBadges, NavButton, RecipePhoto } from "./ui";
import type { ShoppingApp } from "./useShoppingApp";
import { locale, t } from "../i18n";

function ListsTab({ app }: { app: ShoppingApp }) {
  const { activeLists } = app;
  return <>
    <section className="welcome-block">
      <p className="eyebrow">{t("ВАШИ ПОКУПКИ")}</p>
      <h1>{t("Пора за покупками?")}</h1>
      <p className="welcome-subtitle">{t("Соберите всё нужное в одном месте.")}</p>
    </section>
    <div className="section-title-row"><h2>{t("Мои списки")} <span>{activeLists.length}</span></h2><button className="text-action" onClick={app.startNewList}><PlusIcon /> {t("Новый")}</button></div>
    {activeLists.length === 0 ? <EmptyState title={t("Пока нет списков")} text={t("Создайте список и добавьте туда первые покупки.")} action={app.startNewList} /> : (
      <div className="shopping-lists">
        {activeLists.map((list, index) => {
          const { bought, total, left, percent } = progress(list);
          return (
            <div className={`list-card list-card-${index % 3}`} key={list.id}>
              <button className="list-card-main" onClick={() => app.openList(list.id)}>
                <div className="list-card-top"><span className="list-symbol">{index % 3 === 0 ? <ArchiveIcon /> : index % 3 === 1 ? <BackpackIcon /> : <CalendarIcon />}</span><span className="list-card-progress">{bought}/{total}</span></div>
                <strong>{list.name}</strong>
                <span className="list-card-meta">{total ? (left ? t("{left} осталось купить", { left }) : t("Всё куплено")) : t("Пока пусто")}</span>
                <ListBadges app={app} list={list} />
                <div className="mini-progress"><span style={{ width: `${percent}%` }} /></div>
              </button>
              <button className="list-card-menu" aria-label={t("Действия со списком {name}", { name: list.name })} onClick={() => app.openSheet({ kind: "actions", listId: list.id })}><DotsHorizontalIcon /></button>
            </div>
          );
        })}
      </div>
    )}
    <button className="create-list-button" onClick={app.startNewList}><span className="create-list-icon"><PlusIcon /></span><span><b>{t("Создать новый список")}</b><small>{alive(app.data.templates).length ? t("С нуля или из шаблона") : t("Для магазина, дома или рецепта")}</small></span><ChevronRightIcon /></button>
    {activeLists.length > 0 && <section className="home-tip"><span className="tip-mark"><StarFilledIcon /></span><p>{t("Нажмите «⋯» на карточке, чтобы пригласить близких, поставить напоминание или выбрать магазин.")}</p></section>}
  </>;
}

function FavoritesTab({ app }: { app: ShoppingApp }) {
  return <>
    <section className="welcome-block compact-welcome"><p className="eyebrow">{t("БЫСТРЫЙ ДОСТУП")}</p><h1>{t("Избранное")}</h1><p className="welcome-subtitle">{t("Часто покупаемые продукты.")}</p></section>
    {app.favorites.length ? <div className="favorite-list">{app.favorites.map((item) => (
      <div className="favorite-row" key={item.id}>
        <button className="favorite-row-main" onClick={() => app.openList(item.listId)}><span className="favorite-star"><StarFilledIcon /></span><span><b>{item.name}</b><small>{item.listName} · {item.quantity} {t(item.unit)}</small></span></button>
        <button className="favorite-add" aria-label={t("Добавить {name} в список", { name: item.name })} onClick={() => app.addToSomeList(item.name, [{ ...toProduct(item), quantity: "1" }])}><PlusIcon /></button>
      </div>
    ))}</div> : <EmptyState title={t("Здесь будут ваши любимые продукты")} text={t("Нажмите на звёздочку рядом с продуктом, чтобы сохранить его.")} />}
  </>;
}

function RecipesTab({ app }: { app: ShoppingApp }) {
  const recipes = alive(app.data.recipes);
  return <>
    <section className="welcome-block compact-welcome"><p className="eyebrow">{t("ГОТОВИМ ДОМА")}</p><h1>{t("Рецепты")}</h1><p className="welcome-subtitle">{t("Ингредиенты попадают в список одним касанием.")}</p></section>
    <div className="section-title-row"><h2>{t("Мои рецепты")} <span>{recipes.length}</span></h2><button className="text-action" onClick={() => app.openRecipe()}><PlusIcon /> {t("Новый")}</button></div>
    {recipes.length ? <div className="history-list">{recipes.map((recipe) => {
      const steps = stepsOf(recipe);
      const minutes = totalMinutes(steps);
      const details = [recipe.ingredients.map((entry) => entry.name).join(", ") || t("Без ингредиентов"), steps.length ? t("{length} шаг.", { length: steps.length }) : "", minutes ? formatMinutes(minutes) : ""].filter(Boolean).join(" · ");
      return (
        <div className="history-row recipe-row" key={recipe.id}>
          <button className="favorite-row-main" onClick={() => app.openRecipe(recipe)}><RecipePhoto id={recipe.photo} className="recipe-thumb" fallback={<span className="history-icon"><ReaderIcon /></span>} /><span><b>{recipe.name}</b><small>{details}</small></span></button>
          {steps.length > 0 && <button className="recipe-cook" aria-label={t("Готовить {name}", { name: recipe.name })} onClick={() => app.startCooking(recipe)}><PlayIcon /></button>}
          <button className="history-repeat" onClick={() => app.addToSomeList(recipe.name, recipe.ingredients)}>{t("В список")}</button>
        </div>
      );
    })}</div> : <EmptyState title={t("Пока нет рецептов")} text={t("Добавьте рецепт, чтобы потом одним касанием перенести ингредиенты в список.")} />}
  </>;
}

function HistoryTab({ app }: { app: ShoppingApp }) {
  return <>
    <section className="welcome-block compact-welcome"><p className="eyebrow">{t("ЗАВЕРШЁННЫЕ ПОКУПКИ")}</p><h1>{t("История")}</h1><p className="welcome-subtitle">{t("Списки, которые вы завершили.")}</p></section>
    {app.history.length ? <div className="history-list">{app.history.map((list) => (
      <button key={list.id} className="history-row" onClick={() => app.repeatList(list)}><span className="history-icon"><ClockIcon /></span><span><b>{list.name}</b><small>{t("Продуктов: {count}", { count: alive(list.items).length })} · {new Date(list.completedAt ?? list.updatedAt).toLocaleDateString(locale())}</small></span><span className="history-repeat">{t("Повторить")}</span></button>
    ))}</div> : <EmptyState title={t("История пока пуста")} text={t("Завершите список покупок, чтобы он появился здесь.")} />}
  </>;
}

export function HomeScreen({ app }: { app: ShoppingApp }) {
  const { tab, setTab } = app;
  // The Android app's ad banner sits above the navigation; a sheet hides it (src/ads.ts).
  const adHeight = useAdBanner(app.sheet === null);
  return (
    <>
      <MobileScroll className="app-screen">
        <main className="home-screen screen-content" style={{ "--ad-height": `${adHeight}px` } as CSSProperties}>
          <header className="brand-header">
            <div className="brand-home"><span className="brand-mark" aria-hidden="true"><BackpackIcon /></span><span>{t("Корзина")}</span></div>
            <button className="icon-button header-action" aria-label={t("Настройки")} onClick={() => setTab("settings")}><GearIcon /></button>
          </header>
          {tab === "lists" && <ListsTab app={app} />}
          {tab === "favorites" && <FavoritesTab app={app} />}
          {tab === "recipes" && <RecipesTab app={app} />}
          {tab === "history" && <HistoryTab app={app} />}
          {tab === "settings" && <SettingsTab app={app} />}
          <div className="bottom-spacer" />
        </main>
      </MobileScroll>
      <nav className="bottom-nav" aria-label={t("Основная навигация")}>
        <NavButton active={tab === "lists"} icon={<HomeIcon />} label={t("Списки")} onClick={() => setTab("lists")} />
        <NavButton active={tab === "favorites"} icon={<StarIcon />} label={t("Избранное")} onClick={() => setTab("favorites")} />
        <NavButton active={tab === "recipes"} icon={<ReaderIcon />} label={t("Рецепты")} onClick={() => setTab("recipes")} />
        <NavButton active={tab === "history"} icon={<ClockIcon />} label={t("История")} onClick={() => setTab("history")} />
        <NavButton active={tab === "settings"} icon={<GearIcon />} label={t("Настройки")} onClick={() => setTab("settings")} />
      </nav>
    </>
  );
}
