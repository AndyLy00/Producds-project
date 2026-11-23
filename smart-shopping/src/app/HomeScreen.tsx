// The tabs shown when no list is open: lists, favorites, recipes, history and settings.
import { ArchiveIcon, BackpackIcon, CalendarIcon, ChevronRightIcon, ClockIcon, DotsHorizontalIcon, GearIcon, HomeIcon, PlusIcon, ReaderIcon, StarFilledIcon, StarIcon } from "@radix-ui/react-icons";
import { MobileScroll } from "../mobile";
import { alive, progress, toProduct } from "../model";
import { SettingsTab } from "./SettingsTab";
import { EmptyState, ListBadges, NavButton } from "./ui";
import type { ShoppingApp } from "./useShoppingApp";

function ListsTab({ app }: { app: ShoppingApp }) {
  const { activeLists } = app;
  return <>
    <section className="welcome-block">
      <p className="eyebrow">ВАШИ ПОКУПКИ</p>
      <h1>Пора за покупками?</h1>
      <p className="welcome-subtitle">Соберите всё нужное в одном месте.</p>
    </section>
    <div className="section-title-row"><h2>Мои списки <span>{activeLists.length}</span></h2><button className="text-action" onClick={app.startNewList}><PlusIcon /> Новый</button></div>
    {activeLists.length === 0 ? <EmptyState title="Пока нет списков" text="Создайте список и добавьте туда первые покупки." action={app.startNewList} /> : (
      <div className="shopping-lists">
        {activeLists.map((list, index) => {
          const { bought, total, left, percent } = progress(list);
          return (
            <div className={`list-card list-card-${index % 3}`} key={list.id}>
              <button className="list-card-main" onClick={() => app.openList(list.id)}>
                <div className="list-card-top"><span className="list-symbol">{index % 3 === 0 ? <ArchiveIcon /> : index % 3 === 1 ? <BackpackIcon /> : <CalendarIcon />}</span><span className="list-card-progress">{bought}/{total}</span></div>
                <strong>{list.name}</strong>
                <span className="list-card-meta">{total ? (left ? `${left} осталось купить` : "Всё куплено") : "Пока пусто"}</span>
                <ListBadges app={app} list={list} />
                <div className="mini-progress"><span style={{ width: `${percent}%` }} /></div>
              </button>
              <button className="list-card-menu" aria-label={`Действия со списком ${list.name}`} onClick={() => app.openSheet({ kind: "actions", listId: list.id })}><DotsHorizontalIcon /></button>
            </div>
          );
        })}
      </div>
    )}
    <button className="create-list-button" onClick={app.startNewList}><span className="create-list-icon"><PlusIcon /></span><span><b>Создать новый список</b><small>{alive(app.data.templates).length ? "С нуля или из шаблона" : "Для магазина, дома или рецепта"}</small></span><ChevronRightIcon /></button>
    {activeLists.length > 0 && <section className="home-tip"><span className="tip-mark"><StarFilledIcon /></span><p>Нажмите «⋯» на карточке, чтобы пригласить близких, поставить напоминание или выбрать магазин.</p></section>}
  </>;
}

function FavoritesTab({ app }: { app: ShoppingApp }) {
  return <>
    <section className="welcome-block compact-welcome"><p className="eyebrow">БЫСТРЫЙ ДОСТУП</p><h1>Избранное</h1><p className="welcome-subtitle">Часто покупаемые продукты.</p></section>
    {app.favorites.length ? <div className="favorite-list">{app.favorites.map((item) => (
      <div className="favorite-row" key={item.id}>
        <button className="favorite-row-main" onClick={() => app.openList(item.listId)}><span className="favorite-star"><StarFilledIcon /></span><span><b>{item.name}</b><small>{item.listName} · {item.quantity} {item.unit}</small></span></button>
        <button className="favorite-add" aria-label={`Добавить ${item.name} в список`} onClick={() => app.addToSomeList(item.name, [{ ...toProduct(item), quantity: "1" }])}><PlusIcon /></button>
      </div>
    ))}</div> : <EmptyState title="Здесь будут ваши любимые продукты" text="Нажмите на звёздочку рядом с продуктом, чтобы сохранить его." />}
  </>;
}

function RecipesTab({ app }: { app: ShoppingApp }) {
  const recipes = alive(app.data.recipes);
  return <>
    <section className="welcome-block compact-welcome"><p className="eyebrow">ГОТОВИМ ДОМА</p><h1>Рецепты</h1><p className="welcome-subtitle">Ингредиенты попадают в список одним касанием.</p></section>
    <div className="section-title-row"><h2>Мои рецепты <span>{recipes.length}</span></h2><button className="text-action" onClick={() => app.openRecipe()}><PlusIcon /> Новый</button></div>
    {recipes.length ? <div className="history-list">{recipes.map((recipe) => (
      <div className="history-row recipe-row" key={recipe.id}>
        <button className="favorite-row-main" onClick={() => app.openRecipe(recipe)}><span className="history-icon"><ReaderIcon /></span><span><b>{recipe.name}</b><small>{recipe.ingredients.map((entry) => entry.name).join(", ") || "Без ингредиентов"}</small></span></button>
        <button className="history-repeat" onClick={() => app.addToSomeList(recipe.name, recipe.ingredients)}>В список</button>
      </div>
    ))}</div> : <EmptyState title="Пока нет рецептов" text="Добавьте рецепт, чтобы потом одним касанием перенести ингредиенты в список." />}
  </>;
}

function HistoryTab({ app }: { app: ShoppingApp }) {
  return <>
    <section className="welcome-block compact-welcome"><p className="eyebrow">ЗАВЕРШЁННЫЕ ПОКУПКИ</p><h1>История</h1><p className="welcome-subtitle">Списки, которые вы завершили.</p></section>
    {app.history.length ? <div className="history-list">{app.history.map((list) => (
      <button key={list.id} className="history-row" onClick={() => app.repeatList(list)}><span className="history-icon"><ClockIcon /></span><span><b>{list.name}</b><small>{alive(list.items).length} продуктов · {new Date(list.completedAt ?? list.updatedAt).toLocaleDateString("ru-RU")}</small></span><span className="history-repeat">Повторить</span></button>
    ))}</div> : <EmptyState title="История пока пуста" text="Завершите список покупок, чтобы он появился здесь." />}
  </>;
}

export function HomeScreen({ app }: { app: ShoppingApp }) {
  const { tab, setTab } = app;
  return (
    <>
      <MobileScroll className="app-screen">
        <main className="home-screen screen-content">
          <header className="brand-header">
            <div className="brand-home"><span className="brand-mark" aria-hidden="true"><BackpackIcon /></span><span>Корзина</span></div>
            <button className="icon-button header-action" aria-label="Настройки" onClick={() => setTab("settings")}><GearIcon /></button>
          </header>
          {tab === "lists" && <ListsTab app={app} />}
          {tab === "favorites" && <FavoritesTab app={app} />}
          {tab === "recipes" && <RecipesTab app={app} />}
          {tab === "history" && <HistoryTab app={app} />}
          {tab === "settings" && <SettingsTab app={app} />}
          <div className="bottom-spacer" />
        </main>
      </MobileScroll>
      <nav className="bottom-nav" aria-label="Основная навигация">
        <NavButton active={tab === "lists"} icon={<HomeIcon />} label="Списки" onClick={() => setTab("lists")} />
        <NavButton active={tab === "favorites"} icon={<StarIcon />} label="Избранное" onClick={() => setTab("favorites")} />
        <NavButton active={tab === "recipes"} icon={<ReaderIcon />} label="Рецепты" onClick={() => setTab("recipes")} />
        <NavButton active={tab === "history"} icon={<ClockIcon />} label="История" onClick={() => setTab("history")} />
        <NavButton active={tab === "settings"} icon={<GearIcon />} label="Настройки" onClick={() => setTab("settings")} />
      </nav>
    </>
  );
}
