# Google Play: Корзина / Korzina

Всё для страницы приложения в Play Console. Картинки делает `node scripts/store-assets.mjs` (после `npm run build:web`); App Bundle (`.aab`) собирает GitHub при каждом изменении в `main` — Actions → «Android build» → нужный запуск → Artifacts → `korzina-play-<номер>`.

## Основное

| Поле | Значение |
| --- | --- |
| Название пакета | `io.github.andyly00.korzina` |
| Категория | Покупки (Shopping) |
| Есть реклама | **Да** (Google AdMob) |
| Политика конфиденциальности | https://korzina-peach.vercel.app/privacy |
| Удаление аккаунта (ссылка) | https://korzina-peach.vercel.app/privacy#delete |
| Сайт | https://korzina-peach.vercel.app |
| Иконка | `icon-512.png` |
| Обложка (1024×500) | `ru/feature-graphic.png`, `en/…`, `ro/…` |
| Скриншоты телефона (1080×2160) | `ru/1-lists.png` … `5-family.png`, так же для `en` и `ro` |

## Тексты

### Русский (ru-RU)

**Название (до 30):** Корзина — список покупок

**Краткое описание (до 80):** Списки покупок, рецепты с таймерами и общие списки для всей семьи.

**Полное описание:**

Корзина — простой список покупок, который всегда под рукой.

• Быстро добавляйте продукты: приложение само подскажет категорию и то, что вы покупали раньше.
• Отмечайте купленное одним касанием — продукты сгруппированы по отделам магазина.
• Ведите списки вместе: пригласите семью, и все списки станут общими. Изменения видны всем через несколько секунд.
• Рецепты с фото и пошаговым приготовлением. Время из текста шага («варить 10 минут») само становится таймером, а когда шаг готов, придёт уведомление — даже если приложение закрыто.
• Ингредиенты рецепта попадают в список одним касанием.
• Примерные цены Linella у продуктов и сумма всего списка.
• Напоминания, история покупок, шаблоны, свои категории и порядок отделов для любимого магазина.
• Работает без интернета, синхронизируется, когда связь появится.
• Русский, английский и румынский языки, светлая и тёмная тема.

Аккаунт не обязателен: без него списки хранятся только на телефоне.

### English (en-US)

**Title:** Korzina — Shopping List

**Short description:** Shopping lists, recipes with timers and shared lists for the whole family.

**Full description:**

Korzina is a simple shopping list that is always at hand.

• Add products fast: the app suggests the category and what you bought before.
• Tick off what you bought with one tap — products are grouped by store aisle.
• Shop together: invite your family and all lists become shared. Everyone sees changes within seconds.
• Recipes with photos and step-by-step cooking. A time in a step ("boil 10 minutes") becomes a timer, and you get a notification when the step is done — even with the app closed.
• Move a recipe's ingredients to a list with one tap.
• Approximate Linella prices for products and a total for the whole list.
• Reminders, shopping history, templates, your own categories and aisle order for your favourite store.
• Works offline and syncs when you are back online.
• Russian, English and Romanian, light and dark theme.

No account needed: without one, your lists stay on your phone.

### Română (ro)

**Titlu:** Korzina — listă de cumpărături

**Descriere scurtă:** Liste de cumpărături, rețete cu cronometre și liste comune pentru familie.

**Descriere completă:**

Korzina este o listă de cumpărături simplă, mereu la îndemână.

• Adăugați produse rapid: aplicația sugerează categoria și ce ați cumpărat înainte.
• Bifați ce ați cumpărat dintr-o atingere — produsele sunt grupate pe raioane.
• Cumpărați împreună: invitați-vă familia și toate listele devin comune. Toți văd modificările în câteva secunde.
• Rețete cu fotografii și pași de preparare. Timpul din textul unui pas („fierbeți 10 minute”) devine cronometru, iar când pasul e gata primiți o notificare — chiar și cu aplicația închisă.
• Mutați ingredientele unei rețete într-o listă dintr-o atingere.
• Prețuri aproximative Linella pentru produse și totalul întregii liste.
• Mementouri, istoric, șabloane, categorii proprii și ordinea raioanelor pentru magazinul preferat.
• Funcționează fără internet și se sincronizează când revine conexiunea.
• Rusă, engleză și română, temă luminoasă și întunecată.

Contul nu este obligatoriu: fără el, listele rămân doar pe telefon.

## Безопасность данных (Data safety)

Ответы, которые соответствуют коду (сверено с `api/` и `src/ads.ts`):

- **Собирает ли приложение данные:** да. **Шифруются при передаче:** да (HTTPS). **Можно запросить удаление:** да (в приложении и по ссылке выше).
- **Личная информация → Адрес электронной почты:** собирается; цель — управление аккаунтом; не передаётся третьим лицам; необязательно (только с аккаунтом).
- **Фото и видео → Фото:** собираются; функциональность приложения (фото рецептов); необязательно.
- **Контент приложения → Другой контент:** списки покупок и рецепты; функциональность приложения; необязательно (только с аккаунтом).
- **Идентификаторы устройства → Рекламный идентификатор (Device or other IDs):** собирается и **передаётся** (Google AdMob); цели — реклама, аналитика рекламы, предотвращение мошенничества.
- **Сведения о приложении и его работе → Диагностика / Взаимодействие:** собирается SDK Google Mobile Ads; реклама и аналитика рекламы.
- **Push-уведомления (Firebase Cloud Messaging):** токен устройства хранится на нашем сервере с аккаунтом — в «Идентификаторы устройства» добавить цель «Функции приложения». Google получает токен как поставщик услуги (это не «передача» по правилам Play).
- **Местоположение:** не собирается (AdMob определяет примерную страну по IP — указывается как часть данных SDK по рекомендациям Google: «Примерное местоположение», реклама).

Перед заполнением сверьтесь с актуальной справкой Google о данных, которые собирает Google Mobile Ads SDK.

## Остальные анкеты

- **Целевая аудитория:** 18+ (или 13+, без ориентации на детей). Приложение не для детей — это важно для рекламы.
- **Возрастной рейтинг (IARC):** категория «Утилиты, продуктивность, связь и прочее»; насилия, азартных игр, контента для взрослых нет; пользователи могут общаться друг с другом — **нет** (общие списки только между приглашёнными, без переписки); есть покупки в приложении — нет.
- **Реклама:** «Да, в приложении есть реклама».
- **Новостное приложение:** нет. **Медицинское:** нет. **Финансовое:** нет.
- **Доступ к приложению:** часть функций требует входа — укажите тестовый аккаунт для проверки Google (создайте отдельный, не личный).
- **Разрешения:** уведомления (напоминания и таймеры), точные будильники `SCHEDULE_EXACT_ALARM` (таймеры готовки; пользователь включает сам), интернет, рекламный идентификатор `AD_ID` (реклама).

## Порядок для нового личного аккаунта

Google требует от личных аккаунтов, созданных после ноября 2023 года, **закрытое тестирование: не меньше 12 тестировщиков в течение 14 дней** перед выпуском в рабочую версию. Порядок:

1. Пройти проверку личности и подтвердить телефон (Play Console → Главная).
2. Создать приложение, заполнить анкеты выше, загрузить картинки и тексты.
3. Тестирование → Закрытое тестирование: загрузить `.aab`, добавить 12+ тестировщиков (их почты Google), отправить на проверку.
4. Через 14 дней — подать заявку на рабочую версию.

## Реклама AdMob

- Приложение в AdMob: **Korzina** (Android), App ID `ca-app-pub-2589308283162300~1362357470`, баннер «Home banner» `ca-app-pub-2589308283162300/5102612732`. Они записаны в переменные репозитория `ADMOB_APP_ID` и `ADMOB_BANNER_ID`.
- Окно согласия для ЕЭЗ, Великобритании и Швейцарии («Korzina GDPR consent», английский, русский, румынский, с кнопкой «Не соглашаться») опубликовано в AdMob → Конфиденциальность и сообщения. Отозвать согласие можно в приложении: Настройки → Реклама.
- **Настоящая реклама — только в сборке для Google Play.** APK на GitHub без рекламы: его ставит себе разработчик, а AdMob блокирует аккаунты за показы и клики владельца.
- Посмотреть рекламу самому: Actions → «Android build» → Run workflow → галочка «Test build» → в готовом запуске Artifacts → `korzina-test-ads-<номер>` (APK с тестовыми объявлениями Google, никуда не публикуется).
- После публикации в Play: в AdMob → Приложения → Korzina → «Связать с магазином», чтобы AdMob проверил приложение и снял ограничение на показ.

## Push-уведомления (Firebase)

- Проект Firebase → Android-приложение `io.github.andyly00.korzina` → `google-services.json` в секрет репозитория `GOOGLE_SERVICES_JSON` (файл целиком или в base64). Без секрета сборка идёт без push.
- Сервисный аккаунт Firebase (Настройки проекта → Сервисные аккаунты → «Создать закрытый ключ») → JSON в переменную Vercel `FIREBASE_SERVICE_ACCOUNT`. Без неё сервер ничего не отправляет.
- Что приходит: «Вас просят сходить в магазин» (тому, кого отправили со списком) и «Покупки сделаны» (тому, кто отправил). Код: `api/_news.js`, `api/_push.js`, `src/push.ts`.
