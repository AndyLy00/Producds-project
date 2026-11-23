// The one bottom sheet of the app: its title and the content for the open Sheet.
import { BottomSheet } from "../../mobile";
import type { ShoppingApp } from "../useShoppingApp";
import { AccountSheet, DeleteAccountSheet, PasswordSheet } from "./AccountSheets";
import { ListActionsSheet, ListNameSheet, PickListSheet, ProductSheet, ReminderSheet, ShareSheet, StorePickSheet } from "./ListSheets";
import { CategoriesSheet, RecipeSheet, StoreSheet } from "./ProfileSheets";

function sheetMeta(app: ShoppingApp): { title: string; description?: string } {
  const { sheet } = app;
  switch (sheet?.kind) {
    case "product": return { title: sheet.itemId ? "Изменить продукт" : "Добавить продукт", description: "Количество, категория и заметка — по желанию." };
    case "list": return { title: sheet.listId ? "Переименовать список" : "Новый список", description: sheet.listId ? undefined : "Дайте списку название или начните с шаблона." };
    case "actions": return { title: app.sheetList?.name ?? "Список" };
    case "share": return { title: "Вести список вместе", description: "Все участники видят изменения друг друга через несколько секунд." };
    case "reminder": return { title: "Напоминание", description: "Пришлём уведомление в выбранное время." };
    case "store-pick": return { title: "Магазин", description: "Продукты будут идти в порядке отделов этого магазина." };
    case "pick-list": return { title: "В какой список добавить?", description: sheet.title };
    case "recipe": return { title: sheet.recipeId ? "Рецепт" : "Новый рецепт", description: "Ингредиенты — по одному в строке, например «Мука 500 г»." };
    case "store": return { title: sheet.storeId ? "Магазин" : "Новый магазин", description: "Перетащите отделы в том порядке, в каком вы их обходите." };
    case "categories": return { title: "Категории", description: "Свои категории появятся в форме продукта и в порядке магазинов." };
    case "account": return {
      title: { login: "Вход в аккаунт", register: "Новый аккаунт", verify: "Подтверждение почты", forgot: "Восстановление пароля", reset: "Новый пароль" }[sheet.step],
      description: {
        login: "Списки сохранятся в аккаунте и будут доступны на других устройствах.",
        register: "Списки сохранятся в аккаунте и будут доступны на других устройствах.",
        verify: `Мы отправили шестизначный код на ${app.cloud.email ?? "вашу почту"}.`,
        forgot: "Пришлём на почту код для сброса пароля.",
        reset: `Введите код из письма, отправленного на ${app.credentials.email}, и новый пароль.`,
      }[sheet.step],
    };
    case "password": return { title: app.cloud.hasPassword ? "Сменить пароль" : "Задать пароль", description: "На других устройствах нужно будет войти заново." };
    case "delete-account": return { title: "Удалить аккаунт", description: "Аккаунт и его данные на сервере удалятся. Списки на этом устройстве останутся." };
    default: return { title: "" };
  }
}

function SheetContent({ app }: { app: ShoppingApp }) {
  const { sheet } = app;
  switch (sheet?.kind) {
    case "product": return <ProductSheet app={app} sheet={sheet} />;
    case "list": return <ListNameSheet app={app} sheet={sheet} />;
    case "actions": return <ListActionsSheet app={app} sheet={sheet} />;
    case "share": return <ShareSheet app={app} sheet={sheet} />;
    case "reminder": return <ReminderSheet app={app} sheet={sheet} />;
    case "store-pick": return <StorePickSheet app={app} sheet={sheet} />;
    case "pick-list": return <PickListSheet app={app} sheet={sheet} />;
    case "recipe": return <RecipeSheet app={app} sheet={sheet} />;
    case "store": return <StoreSheet app={app} sheet={sheet} />;
    case "categories": return <CategoriesSheet app={app} sheet={sheet} />;
    case "account": return <AccountSheet app={app} sheet={sheet} />;
    case "password": return <PasswordSheet app={app} sheet={sheet} />;
    case "delete-account": return <DeleteAccountSheet app={app} sheet={sheet} />;
    default: return null;
  }
}

export function AppSheet({ app }: { app: ShoppingApp }) {
  const { title, description } = sheetMeta(app);
  return (
    <BottomSheet open={app.sheet !== null} onOpenChange={(open) => { if (!open) app.closeSheet(); }} title={title} description={description} snap={0.84}>
      <SheetContent app={app} />
    </BottomSheet>
  );
}
