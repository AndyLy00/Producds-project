// The one bottom sheet of the app: its title and the content for the open Sheet.
import { BottomSheet } from "../../mobile";
import type { ShoppingApp } from "../useShoppingApp";
import { AccountSheet, DeleteAccountSheet, PasswordSheet } from "./AccountSheets";
import { FamilyJoinSheet, FamilySheet } from "./FamilySheets";
import { LanguageSheet } from "./LanguageSheet";
import { ListActionsSheet, ListNameSheet, PickListSheet, ProductSheet, ReminderSheet, ShareSheet, StorePickSheet } from "./ListSheets";
import { CategoriesSheet, RecipeSheet, StoreSheet } from "./ProfileSheets";
import { t } from "../../i18n";

function sheetMeta(app: ShoppingApp): { title: string; description?: string } {
  const { sheet } = app;
  switch (sheet?.kind) {
    case "product": return { title: sheet.itemId ? t("Изменить продукт") : t("Добавить продукт"), description: t("Количество, категория и заметка — по желанию.") };
    case "list": return { title: sheet.listId ? t("Переименовать список") : t("Новый список"), description: sheet.listId ? undefined : t("Дайте списку название или начните с шаблона.") };
    case "actions": return { title: app.sheetList?.name ?? t("Список") };
    case "share": return { title: t("Вести список вместе"), description: t("Все участники видят изменения друг друга через несколько секунд.") };
    case "reminder": return { title: t("Напоминание"), description: t("Пришлём уведомление в выбранное время.") };
    case "store-pick": return { title: t("Магазин"), description: t("Продукты будут идти в порядке отделов этого магазина.") };
    case "pick-list": return { title: t("В какой список добавить?"), description: sheet.title };
    case "recipe": return { title: sheet.recipeId ? t("Рецепт") : t("Новый рецепт"), description: t("Ингредиенты — по одному в строке, например «Мука 500 г».") };
    case "store": return { title: sheet.storeId ? t("Магазин") : t("Новый магазин"), description: t("Перетащите отделы в том порядке, в каком вы их обходите.") };
    case "categories": return { title: t("Категории"), description: t("Свои категории появятся в форме продукта и в порядке магазинов.") };
    case "account": return {
      title: { login: t("Вход в аккаунт"), register: t("Новый аккаунт"), verify: t("Подтверждение почты"), forgot: t("Восстановление пароля"), reset: t("Новый пароль") }[sheet.step],
      description: {
        login: t("Списки сохранятся в аккаунте и будут доступны на других устройствах."),
        register: t("Списки сохранятся в аккаунте и будут доступны на других устройствах."),
        verify: app.cloud.email ? t("Мы отправили шестизначный код на {email}.", { email: app.cloud.email }) : t("Мы отправили шестизначный код на вашу почту."),
        forgot: t("Пришлём на почту код для сброса пароля."),
        reset: t("Введите код из письма, отправленного на {email}, и новый пароль.", { email: app.credentials.email }),
      }[sheet.step],
    };
    case "password": return { title: app.cloud.hasPassword ? t("Сменить пароль") : t("Задать пароль"), description: t("На других устройствах нужно будет войти заново.") };
    case "delete-account": return { title: t("Удалить аккаунт"), description: t("Аккаунт и его данные на сервере удалятся. Списки на этом устройстве останутся.") };
    case "family": return { title: t("Семья"), description: t("В семье все списки общие: каждый видит и меняет их вместе с остальными.") };
    case "family-join": return { title: t("Приглашение в семью") };
    case "language": return { title: t("Язык приложения") };
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
    case "family": return <FamilySheet app={app} sheet={sheet} />;
    case "family-join": return <FamilyJoinSheet app={app} sheet={sheet} />;
    case "language": return <LanguageSheet app={app} sheet={sheet} />;
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
