// Server messages and emails in the app's languages. As in the app (src/i18n.ts) the Russian
// text is the key and {name} marks a placeholder. The app says which language it shows in the
// X-Lang header; anything else gets Russian.

export const serverTexts = {
  "Вход не завершён. Попробуйте ещё раз.": { en: "Sign-in was not completed. Please try again.", ro: "Autentificarea nu s-a încheiat. Încercați din nou." },
  "Код устарел. Запросите новый.": { en: "The code has expired. Ask for a new one.", ro: "Codul a expirat. Cereți unul nou." },
  "Неверный код.": { en: "Wrong code.", ro: "Cod greșit." },
  "Некорректный запрос.": { en: "Invalid request.", ro: "Cerere invalidă." },
  "Пароль должен быть не короче 8 символов.": { en: "The password must be at least 8 characters long.", ro: "Parola trebuie să aibă cel puțin 8 caractere." },
  "Пароль указан неверно.": { en: "Wrong password.", ro: "Parolă greșită." },
  "Слишком длинный пароль.": { en: "The password is too long.", ro: "Parola este prea lungă." },
  "Текущий пароль указан неверно.": { en: "The current password is wrong.", ro: "Parola actuală este greșită." },
  "Укажите корректный адрес почты.": { en: "Enter a valid email address.", ro: "Introduceți o adresă de e-mail validă." },
  "Google не подтвердил вход. Попробуйте ещё раз.": { en: "Google did not confirm the sign-in. Please try again.", ro: "Google nu a confirmat autentificarea. Încercați din nou." },
  "Войдите в аккаунт заново.": { en: "Please sign in again.", ro: "Autentificați-vă din nou." },
  "Неверная почта или пароль.": { en: "Wrong email or password.", ro: "E-mail sau parolă greșită." },
  "Подтвердите свою почту в настройках, чтобы отправлять приглашения письмом.": { en: "Confirm your email in Settings to send invitations by email.", ro: "Confirmați-vă e-mailul în Setări pentru a trimite invitații prin e-mail." },
  "Слишком много фото. Удалите старые рецепты.": { en: "Too many photos. Delete some old recipes.", ro: "Prea multe fotografii. Ștergeți câteva rețete vechi." },
  "Убирать людей из семьи может только её создатель.": { en: "Only the family's creator can remove people from it.", ro: "Doar cel care a creat familia poate elimina membri." },
  "В семье может быть не больше {max} человек.": { en: "A family can have at most {max} people.", ro: "O familie poate avea cel mult {max} persoane." },
  "Приглашение устарело. Попросите прислать новое.": { en: "The invitation has expired. Ask for a new one.", ro: "Invitația a expirat. Cereți una nouă." },
  "Список не найден. Возможно, его ещё не успели сохранить — попробуйте через пару секунд.": { en: "List not found. It may not have been saved yet — try again in a few seconds.", ro: "Lista nu a fost găsită. Poate nu a fost salvată încă — încercați din nou peste câteva secunde." },
  "Такого человека нет в семье.": { en: "This person is not in the family.", ro: "Această persoană nu este în familie." },
  "Фото не найдено.": { en: "Photo not found.", ro: "Fotografia nu a fost găsită." },
  "Этот список уже удалён.": { en: "This list has already been deleted.", ro: "Această listă a fost deja ștearsă." },
  "Аккаунт с такой почтой уже есть. Войдите в него.": { en: "An account with this email already exists. Sign in to it.", ro: "Există deja un cont cu acest e-mail. Autentificați-vă în el." },
  "Вы уже в другой семье. Сначала выйдите из неё в настройках.": { en: "You are already in another family. Leave it in Settings first.", ro: "Sunteți deja în altă familie. Ieșiți mai întâi din ea în Setări." },
  "Слишком большой запрос.": { en: "The request is too large.", ro: "Cererea este prea mare." },
  "Фото слишком большое.": { en: "The photo is too large.", ro: "Fotografia este prea mare." },
  "Можно загрузить только фото.": { en: "Only photos can be uploaded.", ro: "Se pot încărca doar fotografii." },
  "Слишком много попыток. Попробуйте снова через {minutes} мин.": { en: "Too many attempts. Try again in {minutes} min.", ro: "Prea multe încercări. Încercați din nou peste {minutes} min." },
  "Не удалось отправить письмо. Попробуйте позже.": { en: "Could not send the email. Please try later.", ro: "E-mailul nu a putut fi trimis. Încercați mai târziu." },
  "Вход через Google пока не настроен.": { en: "Google sign-in is not set up yet.", ro: "Autentificarea cu Google nu este configurată încă." },
  "Отправка писем пока не настроена.": { en: "Sending email is not set up yet.", ro: "Trimiterea e-mailurilor nu este configurată încă." },
  "Сервер занят. Попробуйте ещё раз.": { en: "The server is busy. Please try again.", ro: "Serverul este ocupat. Încercați din nou." },
  "Сервер временно недоступен. Попробуйте позже.": { en: "The server is temporarily unavailable. Please try later.", ro: "Serverul este temporar indisponibil. Încercați mai târziu." },

  // Emails.
  "Код подтверждения: {code}": { en: "Confirmation code: {code}", ro: "Cod de confirmare: {code}" },
  "Здравствуйте!\n\nВаш код для подтверждения почты в приложении «Корзина»: {code}\n\nКод действует {minutes} минут. Если вы не создавали аккаунт, просто проигнорируйте это письмо.": {
    en: "Hello!\n\nYour code to confirm your email in the Korzina app: {code}\n\nThe code is valid for {minutes} minutes. If you did not create an account, just ignore this email.",
    ro: "Bună ziua!\n\nCodul pentru confirmarea e-mailului în aplicația Korzina: {code}\n\nCodul este valabil {minutes} minute. Dacă nu ați creat un cont, ignorați acest e-mail.",
  },
  "Код для сброса пароля: {code}": { en: "Password reset code: {code}", ro: "Cod pentru resetarea parolei: {code}" },
  "Здравствуйте!\n\nКто-то запросил сброс пароля для аккаунта «Корзины» с этой почтой. Код: {code}\n\nКод действует {minutes} минут. Если это были не вы, просто проигнорируйте письмо — пароль останется прежним.": {
    en: "Hello!\n\nSomeone asked to reset the password of the Korzina account with this email. Code: {code}\n\nThe code is valid for {minutes} minutes. If it was not you, just ignore this email — the password stays the same.",
    ro: "Bună ziua!\n\nCineva a cerut resetarea parolei contului Korzina cu acest e-mail. Cod: {code}\n\nCodul este valabil {minutes} minute. Dacă nu ați fost dumneavoastră, ignorați acest e-mail — parola rămâne aceeași.",
  },
  "{from} приглашает вас в семью в «Корзине»": { en: "{from} invites you to their family in Korzina", ro: "{from} vă invită în familia sa în Korzina" },
  "Здравствуйте!\n\n{from} приглашает вас в семью в приложении «Корзина». В семье все списки покупок общие: изменения видны всем сразу.\n\nЧтобы присоединиться, откройте ссылку и войдите в аккаунт:\n{link}\n\nСсылка действует {days} дней.": {
    en: "Hello!\n\n{from} invites you to their family in the Korzina app. In a family all shopping lists are shared: everyone sees changes at once.\n\nTo join, open the link and sign in:\n{link}\n\nThe link is valid for {days} days.",
    ro: "Bună ziua!\n\n{from} vă invită în familia sa în aplicația Korzina. Într-o familie toate listele de cumpărături sunt comune: toată lumea vede modificările imediat.\n\nPentru a vă alătura, deschideți linkul și autentificați-vă:\n{link}\n\nLinkul este valabil {days} zile.",
  },
  "{from} приглашает вас в список «{list}»": { en: "{from} invites you to the list “{list}”", ro: "{from} vă invită în lista „{list}”" },
  "Здравствуйте!\n\n{from} приглашает вас вести вместе список покупок «{list}» в приложении «Корзина».\n\nЧтобы присоединиться, откройте ссылку и войдите в аккаунт:\n{link}\n\nСсылка действует {days} дней.": {
    en: "Hello!\n\n{from} invites you to keep the shopping list “{list}” together in the Korzina app.\n\nTo join, open the link and sign in:\n{link}\n\nThe link is valid for {days} days.",
    ro: "Bună ziua!\n\n{from} vă invită să țineți împreună lista de cumpărături „{list}” în aplicația Korzina.\n\nPentru a vă alătura, deschideți linkul și autentificați-vă:\n{link}\n\nLinkul este valabil {days} zile.",
  },
};

export function languageOf(request) {
  const lang = request?.headers.get("x-lang");
  return lang === "en" || lang === "ro" ? lang : "ru";
}

export function tr(lang, text, params = {}) {
  const translated = lang === "ru" ? text : (serverTexts[text]?.[lang] ?? text);
  return translated.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}
