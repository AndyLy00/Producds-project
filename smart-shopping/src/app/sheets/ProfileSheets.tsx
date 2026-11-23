// Sheets for what belongs to the account rather than to a list: recipes, stores, categories.
import { CameraIcon, Cross2Icon, DragHandleDots2Icon, ImageIcon, PlayIcon, PlusIcon, TimerIcon, TrashIcon } from "@radix-ui/react-icons";
import { useRef, type PointerEvent } from "react";
import { KeyboardInput, KeyboardTextarea } from "../../mobile";
import { alive, formatMinutes, stepsOf, totalMinutes } from "../../model";
import { moveItem, Sortable } from "../../sortable";
import { Field, FormError, RecipePhoto, SheetClose, type SheetProps } from "../ui";

// While a field has focus the sheet is taller (src/native/index.tsx); a tap that took the focus
// away would shrink it and move the tapped button away before the click lands. The buttons
// below keep the focus instead; closing the sheet hides the keyboard anyway.
const keepFocus = (event: PointerEvent<HTMLElement>) => {
  if ((event.target as HTMLElement).closest("button")) event.preventDefault();
};

export function RecipeSheet({ app, sheet }: SheetProps<"recipe">) {
  const { recipeForm, setRecipeForm, keyboard } = app;
  const recipe = sheet.recipeId ? app.data.recipes.find((entry) => entry.id === sheet.recipeId) : undefined;
  const photoInput = useRef<HTMLInputElement | null>(null);
  const pickPhoto = () => { keyboard.hide(); photoInput.current?.click(); };
  const minutes = totalMinutes(recipeForm.steps.map((step) => ({ id: step.id, text: step.text, minutes: Number(step.minutes) || undefined })));
  return (
    <form className="sheet-form" onSubmit={app.saveRecipe}>
      <SheetClose app={app} />
      <input ref={photoInput} type="file" accept="image/*" hidden onChange={(event) => { void app.pickRecipePhoto(event.target.files?.[0]); event.target.value = ""; }} />
      {recipeForm.photo ? (
        <div className="recipe-photo-edit">
          <RecipePhoto id={recipeForm.photo} className="recipe-photo-large" fallback={<div className="recipe-photo-large recipe-photo-empty"><ImageIcon /></div>} />
          <div className="recipe-photo-actions">
            <button type="button" className="chip-button" onClick={pickPhoto}><CameraIcon /> Заменить</button>
            <button type="button" className="chip-button" onClick={app.removeRecipePhoto}><Cross2Icon /> Убрать</button>
          </div>
        </div>
      ) : (
        <button type="button" className="recipe-photo-add" disabled={app.busy} onClick={pickPhoto}><CameraIcon /> {app.busy ? "Обрабатываем фото…" : "Добавить фото блюда"}</button>
      )}
      <Field label="Название"><KeyboardInput placeholder="Например, борщ" value={recipeForm.name} onChange={(event) => { const name = event.target.value; setRecipeForm((previous) => ({ ...previous, name })); }} onBlur={() => keyboard.hide()} /></Field>
      <Field label="Ингредиенты"><KeyboardTextarea rows={5} placeholder={"Свёкла 2 шт.\nКартофель 500 г\nСметана"} value={recipeForm.ingredients} onChange={(event) => { const ingredients = event.target.value; setRecipeForm((previous) => ({ ...previous, ingredients })); }} onBlur={() => keyboard.hide()} /></Field>

      <div className="steps-heading">
        <p className="settings-label">ШАГИ ПРИГОТОВЛЕНИЯ</p>
        {minutes > 0 && <span><TimerIcon /> {formatMinutes(minutes)}</span>}
      </div>
      <p className="steps-hint">Время из текста шага («варить 10 минут») станет таймером — его можно поправить.</p>
      <Sortable
        className="step-list"
        items={recipeForm.steps}
        getKey={(step) => step.id}
        onReorder={app.moveStep}
        render={(step, handle, dragging) => {
          const index = recipeForm.steps.indexOf(step);
          return (
            <div className={`step-row ${dragging ? "order-dragging" : ""}`}>
              <span className="drag-handle" aria-label={`Перетащить шаг ${index + 1}`} {...handle}><DragHandleDots2Icon /></span>
              <span className="step-number">{index + 1}</span>
              <div className="step-fields">
                <KeyboardTextarea rows={2} aria-label={`Шаг ${index + 1}`} placeholder="Что сделать на этом шаге" value={step.text} onChange={(event) => app.editStep(step.id, { text: event.target.value })} onBlur={() => keyboard.hide()} />
                <label className="step-minutes"><TimerIcon /><KeyboardInput inputMode="numeric" aria-label={`Таймер шага ${index + 1}, минут`} placeholder="—" value={step.minutes} onChange={(event) => app.editStep(step.id, { minutes: event.target.value })} onBlur={() => keyboard.hide()} /> мин</label>
              </div>
              <button type="button" className="step-remove" aria-label={`Удалить шаг ${index + 1}`} onClick={() => app.removeStep(step.id)}><Cross2Icon /></button>
            </div>
          );
        }}
      />
      <button type="button" className="secondary-button" onPointerDown={keepFocus} onClick={app.addStep}><PlusIcon /> Добавить шаг</button>
      <FormError app={app} />
      <div className="sheet-actions" onPointerDown={keepFocus}>
        <button className="primary-button" disabled={!recipeForm.name.trim() || app.busy}>Сохранить рецепт</button>
        {recipe && stepsOf(recipe).length > 0 && <button type="button" className="secondary-button" onClick={() => app.startCooking(recipe)}><PlayIcon /> Начать готовить</button>}
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
