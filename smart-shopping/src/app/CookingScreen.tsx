// Cooking mode: a recipe step by step, with a timer for every step that has one. Several timers
// can run at once (the pasta boils while the sauce simmers); each rings as a phone notification
// even when the app is closed.
import { ArrowLeftIcon, BellIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, ReaderIcon, StopIcon, TimerIcon } from "@radix-ui/react-icons";
import { MobileScroll } from "../mobile";
import { formatMinutes, stepsOf, type Recipe } from "../model";
import { formatCountdown } from "./useTimers";
import { RecipePhoto } from "./ui";
import type { ShoppingApp } from "./useShoppingApp";

export function CookingScreen({ app, recipe, stepIndex }: { app: ShoppingApp; recipe: Recipe; stepIndex: number }) {
  const { timers } = app;
  const steps = stepsOf(recipe);
  const index = Math.min(stepIndex, Math.max(0, steps.length - 1));
  const step = steps[index];
  const timer = step ? timers.forStep(recipe.id, step.id) : undefined;
  const others = timers.timers.filter((entry) => entry.recipeId === recipe.id && entry.stepId !== step?.id);
  const last = index >= steps.length - 1;
  const finish = () => {
    timers.stopRecipe(recipe.id);
    app.stopCooking();
    app.notify("Приятного аппетита!");
  };

  return (
    <>
      <MobileScroll className="app-screen">
        <main className="cooking-screen screen-content">
          <div className="list-heading-row">
            <button className="back-button" aria-label="Выйти из режима готовки" onClick={app.stopCooking}><ArrowLeftIcon /></button>
            <div className="list-heading-copy">
              <p className="eyebrow">ГОТОВИМ{steps.length ? ` · ШАГ ${index + 1} ИЗ ${steps.length}` : ""}</p>
              <h1>{recipe.name}</h1>
            </div>
          </div>
          <RecipePhoto id={recipe.photo} className="cooking-photo" />

          {!app.exactAlarms && (
            <button className="setting-row cooking-warning" onClick={() => void app.allowExactAlarms()}>
              <span className="setting-icon setting-warning"><BellIcon /></span>
              <span><b>Таймер может опоздать</b><small>Разрешите «Будильники и напоминания», чтобы сигнал звучал точно вовремя</small></span>
              <ChevronRightIcon />
            </button>
          )}

          {step ? (
            <section className="cooking-step" aria-live="polite">
              <span className="cooking-step-number">{index + 1}</span>
              <p>{step.text}</p>
              {step.minutes ? (
                timer ? (
                  <div className={`cooking-timer ${timer.rang ? "cooking-timer-done" : ""}`}>
                    <strong>{timer.rang ? "Готово!" : formatCountdown(timer.endsAt - timers.now)}</strong>
                    <div className="cooking-timer-actions">
                      <button type="button" className="chip-button" onClick={() => timers.addMinute(timer.id)}><PlusIcon /> 1 мин</button>
                      <button type="button" className="chip-button" onClick={() => timers.stop(timer.id)}><StopIcon /> {timer.rang ? "Убрать" : "Стоп"}</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="primary-button cooking-timer-start" onClick={() => void app.startStepTimer(recipe, index)}><TimerIcon /> Запустить таймер · {formatMinutes(step.minutes)}</button>
                )
              ) : null}
            </section>
          ) : (
            <section className="cooking-step"><p>В рецепте пока нет шагов. Добавьте их в карточке рецепта.</p></section>
          )}

          {others.length > 0 && (
            <section className="sheet-section">
              <p className="settings-label">ИДУТ ТАЙМЕРЫ</p>
              {others.map((entry) => {
                const at = steps.findIndex((candidate) => candidate.id === entry.stepId);
                return (
                  <button key={entry.id} className={`running-timer ${entry.rang ? "running-timer-done" : ""}`} onClick={() => at >= 0 && app.goToStep(at)}>
                    <TimerIcon /><span>Шаг {at + 1}</span><b>{entry.rang ? "Готово!" : formatCountdown(entry.endsAt - timers.now)}</b>
                  </button>
                );
              })}
            </section>
          )}

          <section className="sheet-section">
            <p className="settings-label">ВСЕ ШАГИ</p>
            <div className="cooking-steps">
              {steps.map((entry, position) => {
                const running = timers.forStep(recipe.id, entry.id);
                return (
                  <button key={entry.id} className={`cooking-step-row ${position === index ? "cooking-step-current" : ""} ${position < index ? "cooking-step-past" : ""}`} onClick={() => app.goToStep(position)}>
                    <span className="step-number">{position < index ? <CheckIcon /> : position + 1}</span>
                    <span className="cooking-step-text">{entry.text}</span>
                    {running ? <small className="cooking-step-time">{running.rang ? "готово" : formatCountdown(running.endsAt - timers.now)}</small> : entry.minutes ? <small className="cooking-step-time">{formatMinutes(entry.minutes)}</small> : null}
                  </button>
                );
              })}
            </div>
          </section>
          {recipe.ingredients.length > 0 && (
            <section className="sheet-section">
              <p className="settings-label">ИНГРЕДИЕНТЫ</p>
              <p className="cooking-ingredients"><ReaderIcon /> {recipe.ingredients.map((entry) => `${entry.name} ${entry.quantity} ${entry.unit}`.trim()).join(", ")}</p>
            </section>
          )}
          <div className="bottom-spacer" />
        </main>
      </MobileScroll>
      <nav className="cooking-nav" aria-label="Шаги рецепта">
        <button className="secondary-button" disabled={index === 0} onClick={() => app.goToStep(index - 1)}><ChevronLeftIcon /> Назад</button>
        {last
          ? <button className="primary-button" onClick={finish}><CheckIcon /> Готово</button>
          : <button className="primary-button" onClick={() => app.goToStep(index + 1)}>Дальше <ChevronRightIcon /></button>}
      </nav>
    </>
  );
}
