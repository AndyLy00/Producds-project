// Sheets for what belongs to the account rather than to a list: recipes, stores, categories.
import { CameraIcon, Cross2Icon, DragHandleDots2Icon, ImageIcon, PlayIcon, PlusIcon, TimerIcon, TrashIcon } from "@radix-ui/react-icons";
import { useRef } from "react";
import { KeyboardInput, KeyboardTextarea } from "../../mobile";
import { alive, formatMinutes, stepsOf, totalMinutes } from "../../model";
import { moveItem, Sortable } from "../../sortable";
import { Field, FormError, keepFocus, RecipePhoto, SheetClose, type SheetProps } from "../ui";
import { t } from "../../i18n";


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
            <button type="button" className="chip-button" onClick={pickPhoto}><CameraIcon /> {t("Заменить")}</button>
            <button type="button" className="chip-button" onClick={app.removeRecipePhoto}><Cross2Icon /> {t("Убрать")}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="recipe-photo-add" disabled={app.busy} onClick={pickPhoto}><CameraIcon /> {app.busy ? t("Обрабатываем фото…") : t("Добавить фото блюда")}</button>
      )}
      <Field label={t("Название")}><KeyboardInput placeholder={t("Например, борщ")} value={recipeForm.name} onChange={(event) => { const name = event.target.value; setRecipeForm((previous) => ({ ...previous, name })); }} onBlur={() => keyboard.hide()} /></Field>
      <Field label={t("Ингредиенты")}><KeyboardTextarea rows={5} placeholder={t("Свёкла 2 шт.\nКартофель 500 г\nСметана")} value={recipeForm.ingredients} onChange={(event) => { const ingredients = event.target.value; setRecipeForm((previous) => ({ ...previous, ingredients })); }} onBlur={() => keyboard.hide()} /></Field>

      <div className="steps-heading">
        <p className="settings-label">{t("ШАГИ ПРИГОТОВЛЕНИЯ")}</p>
        {minutes > 0 && <span><TimerIcon /> {formatMinutes(minutes)}</span>}
      </div>
      <p className="steps-hint">{t("Время из текста шага («варить 10 минут») станет таймером — его можно поправить.")}</p>
      <Sortable
        className="step-list"
        items={recipeForm.steps}
        getKey={(step) => step.id}
        onReorder={app.moveStep}
        render={(step, handle, dragging) => {
          const index = recipeForm.steps.indexOf(step);
          return (
            <div className={`step-row ${dragging ? "order-dragging" : ""}`}>
              <span className="drag-handle" aria-label={t("Перетащить шаг {number}", { number: index + 1 })} {...handle}><DragHandleDots2Icon /></span>
              <span className="step-number">{index + 1}</span>
              <div className="step-fields">
                <KeyboardTextarea rows={2} aria-label={t("Шаг {number}", { number: index + 1 })} placeholder={t("Что сделать на этом шаге")} value={step.text} onChange={(event) => app.editStep(step.id, { text: event.target.value })} onBlur={() => keyboard.hide()} />
                <label className="step-minutes"><TimerIcon /><KeyboardInput inputMode="numeric" aria-label={t("Таймер шага {number}, минут", { number: index + 1 })} placeholder="—" value={step.minutes} onChange={(event) => app.editStep(step.id, { minutes: event.target.value })} onBlur={() => keyboard.hide()} /> {t("мин")}</label>
              </div>
              <button type="button" className="step-remove" aria-label={t("Удалить шаг {number}", { number: index + 1 })} onClick={() => app.removeStep(step.id)}><Cross2Icon /></button>
            </div>
          );
        }}
      />
      <button type="button" className="secondary-button" onPointerDown={keepFocus} onClick={app.addStep}><PlusIcon /> {t("Добавить шаг")}</button>
      <FormError app={app} />
      <div className="sheet-actions" onPointerDown={keepFocus}>
        <button className="primary-button" disabled={!recipeForm.name.trim() || app.busy}>{t("Сохранить рецепт")}</button>
        {recipe && stepsOf(recipe).length > 0 && <button type="button" className="secondary-button" onClick={() => app.startCooking(recipe)}><PlayIcon /> {t("Начать готовить")}</button>}
        {recipe && <button type="button" className="secondary-button" onClick={() => app.addToSomeList(recipe.name, recipe.ingredients)}><PlusIcon /> {t("Добавить ингредиенты в список")}</button>}
        {recipe && <button type="button" className="destructive-button" onClick={() => { app.closeSheet(); app.removeEntity("recipes", recipe.id, t("Рецепт удалён")); }}><TrashIcon /> {t("Удалить рецепт")}</button>}
      </div>
    </form>
  );
}

export function StoreSheet({ app, sheet }: SheetProps<"store">) {
  const { storeForm, setStoreForm } = app;
  return (
    <form className="sheet-form" onSubmit={app.saveStore}>
      <SheetClose app={app} />
      <Field label={t("Название")}><KeyboardInput placeholder={t("Например, магазин у дома")} value={storeForm.name} onChange={(event) => { const name = event.target.value; setStoreForm((previous) => ({ ...previous, name })); }} onBlur={() => app.keyboard.hide()} /></Field>
      <p className="settings-label">{t("ПОРЯДОК ОТДЕЛОВ")}</p>
      <Sortable
        className="order-list"
        items={storeForm.order}
        getKey={(name) => name}
        onReorder={(from, to) => setStoreForm((previous) => ({ ...previous, order: moveItem(previous.order, from, to) }))}
        render={(name, handle, dragging) => <div className={`order-row ${dragging ? "order-dragging" : ""}`}><span className="drag-handle" {...handle}><DragHandleDots2Icon /></span>{t(name)}</div>}
      />
      <div className="sheet-actions">
        <button className="primary-button" disabled={!storeForm.name.trim()}>{t("Сохранить магазин")}</button>
        {sheet.storeId && <button type="button" className="destructive-button" onClick={() => { const id = sheet.storeId!; app.closeSheet(); app.removeEntity("stores", id, t("Магазин удалён")); }}><TrashIcon /> {t("Удалить магазин")}</button>}
      </div>
    </form>
  );
}

export function CategoriesSheet({ app }: SheetProps<"categories">) {
  return (
    <form className="sheet-form" onSubmit={app.addCategory}>
      <SheetClose app={app} />
      <div className="inline-form">
        <Field label={t("Новая категория")}><KeyboardInput placeholder={t("Например, для питомца")} value={app.categoryName} onChange={(event) => app.setCategoryName(event.target.value)} onBlur={() => app.keyboard.hide()} /></Field>
        <button className="secondary-button" disabled={!app.categoryName.trim()}><PlusIcon /> {t("Добавить")}</button>
      </div>
      <FormError app={app} />
      <div className="chip-wrap">
        {app.categories.map((name) => {
          const custom = alive(app.data.categories).find((category) => category.name === name);
          return <span className={`chip ${custom ? "" : "chip-fixed"}`} key={name}><span>{t(name)}</span>{custom && <button type="button" aria-label={t("Удалить категорию {name}", { name })} onClick={() => app.removeEntity("categories", custom.id, t("Категория удалена"))}><Cross2Icon /></button>}</span>;
        })}
      </div>
    </form>
  );
}
