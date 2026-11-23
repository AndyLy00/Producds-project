// Sheets for what belongs to the account rather than to a list: recipes, stores, categories.
import { Cross2Icon, DragHandleDots2Icon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { KeyboardInput, KeyboardTextarea } from "../../mobile";
import { alive } from "../../model";
import { moveItem, Sortable } from "../../sortable";
import { Field, FormError, SheetClose, type SheetProps } from "../ui";

export function RecipeSheet({ app, sheet }: SheetProps<"recipe">) {
  const { recipeForm, setRecipeForm, keyboard } = app;
  const recipe = sheet.recipeId ? app.data.recipes.find((entry) => entry.id === sheet.recipeId) : undefined;
  return (
    <form className="sheet-form" onSubmit={app.saveRecipe}>
      <SheetClose app={app} />
      <Field label="Название"><KeyboardInput placeholder="Например, борщ" value={recipeForm.name} onChange={(event) => { const name = event.target.value; setRecipeForm((previous) => ({ ...previous, name })); }} onBlur={() => keyboard.hide()} /></Field>
      <Field label="Ингредиенты"><KeyboardTextarea rows={6} placeholder={"Свёкла 2 шт.\nКартофель 500 г\nСметана"} value={recipeForm.ingredients} onChange={(event) => { const ingredients = event.target.value; setRecipeForm((previous) => ({ ...previous, ingredients })); }} onBlur={() => keyboard.hide()} /></Field>
      <Field label={<>Как готовить <span>Необязательно</span></>}><KeyboardTextarea rows={3} value={recipeForm.note} onChange={(event) => { const note = event.target.value; setRecipeForm((previous) => ({ ...previous, note })); }} onBlur={() => keyboard.hide()} /></Field>
      <div className="sheet-actions">
        <button className="primary-button" disabled={!recipeForm.name.trim()}>Сохранить рецепт</button>
        {recipe && <button type="button" className="secondary-button" onClick={() => app.addToSomeList(recipe.name, recipe.ingredients)}><PlusIcon /> Добавить ингредиенты в список</button>}
        {recipe && <button type="button" className="destructive-button" onClick={() => { app.closeSheet(); app.removeEntity("recipes", recipe.id, "Рецепт удалён"); }}><TrashIcon /> Удалить рецепт</button>}
      </div>
    </form>
  );
}

export function StoreSheet({ app, sheet }: SheetProps<"store">) {
  const { storeForm, setStoreForm } = app;
  return (
    <form className="sheet-form" onSubmit={app.saveStore}>
      <SheetClose app={app} />
      <Field label="Название"><KeyboardInput placeholder="Например, магазин у дома" value={storeForm.name} onChange={(event) => { const name = event.target.value; setStoreForm((previous) => ({ ...previous, name })); }} onBlur={() => app.keyboard.hide()} /></Field>
      <p className="settings-label">ПОРЯДОК ОТДЕЛОВ</p>
      <Sortable
        className="order-list"
        items={storeForm.order}
        getKey={(name) => name}
        onReorder={(from, to) => setStoreForm((previous) => ({ ...previous, order: moveItem(previous.order, from, to) }))}
        render={(name, handle, dragging) => <div className={`order-row ${dragging ? "order-dragging" : ""}`}><span className="drag-handle" {...handle}><DragHandleDots2Icon /></span>{name}</div>}
      />
      <div className="sheet-actions">
        <button className="primary-button" disabled={!storeForm.name.trim()}>Сохранить магазин</button>
        {sheet.storeId && <button type="button" className="destructive-button" onClick={() => { const id = sheet.storeId!; app.closeSheet(); app.removeEntity("stores", id, "Магазин удалён"); }}><TrashIcon /> Удалить магазин</button>}
      </div>
    </form>
  );
}

export function CategoriesSheet({ app }: SheetProps<"categories">) {
  return (
    <form className="sheet-form" onSubmit={app.addCategory}>
      <SheetClose app={app} />
      <div className="inline-form">
        <Field label="Новая категория"><KeyboardInput placeholder="Например, для питомца" value={app.categoryName} onChange={(event) => app.setCategoryName(event.target.value)} onBlur={() => app.keyboard.hide()} /></Field>
        <button className="secondary-button" disabled={!app.categoryName.trim()}><PlusIcon /> Добавить</button>
      </div>
      <FormError app={app} />
      <div className="chip-wrap">
        {app.categories.map((name) => {
          const custom = alive(app.data.categories).find((category) => category.name === name);
          return <span className={`chip ${custom ? "" : "chip-fixed"}`} key={name}><span>{name}</span>{custom && <button type="button" aria-label={`Удалить категорию ${name}`} onClick={() => app.removeEntity("categories", custom.id, "Категория удалена")}><Cross2Icon /></button>}</span>;
        })}
      </div>
    </form>
  );
}
