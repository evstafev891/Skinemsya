# Скинемся

Сайт для сборов денег между знакомыми. Статический, хостится на GitHub Pages, данные хранятся в Firebase (Cloud Firestore).

Страницы:

- `index.html` — мои сборы: идущие и завершённые, кнопка «Новый сбор»;
- `profile.html` — имя, телефон для СБП, банк (необязательно);
- `about.html` — о сайте;
- `collection.html?id=…` — сбор: собранная и целевая сумма, участники, QR-код для присоединения, отметка переводов, подтверждение переводов организатором.

## Как это работает

- Пользователь определяется по номеру телефона из профиля. Номер хранится в браузере. На другом устройстве достаточно ввести тот же номер, и имя со сборами подтянутся.
- Участник переводит деньги организатору по СБП в своём банке и отмечает сумму на сайте. Сумма попадает в «собрано» после подтверждения организатором.
- Номер не проверяется по СМС. Это осознанное упрощение для круга знакомых: правила Firestore проверяют формат данных, но не могут проверить, что человек действительно владеет номером. Последняя проверка — деньги в банке организатора.

## Проверить без Firebase

Пока в `js/config.js` пустой `apiKey`, сайт работает в демо-режиме: всё хранится в `localStorage` этого браузера. Чтобы посмотреть сайт локально:

```bash
python3 -m http.server 8000
# открыть http://localhost:8000
```

Открывать `index.html` двойным кликом не получится: ES-модули требуют http-сервер.

## Подключение Firebase (около 10 минут, бесплатный тариф Spark)

1. Зайдите на https://console.firebase.google.com и создайте проект. Google Analytics можно отключить.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.** Анонимный вход нужен, чтобы в базу не могли писать без загрузки сайта.
3. **Build → Firestore Database → Create database.** Выберите регион (например, `eur3` или `europe-west`) и режим *production*.
4. Во вкладке **Rules** замените содержимое на файл `firestore.rules` из репозитория и нажмите **Publish**.
5. **Project settings (шестерёнка) → General → Your apps → Web (`</>`)**: зарегистрируйте приложение без Hosting. Скопируйте объект `firebaseConfig` в `js/config.js`.
6. **Authentication → Settings → Authorized domains**: добавьте `ВАШ_ЛОГИН.github.io`.

`apiKey` в `config.js` не секрет: он только указывает, к какому проекту подключаться. Доступ ограничивают правила Firestore.

## Публикация на GitHub Pages

1. Создайте репозиторий и загрузите в его корень все файлы из этой папки, включая `.nojekyll`.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, ветка `main`, папка `/ (root)`.
3. Через минуту сайт будет доступен по адресу `https://ВАШ_ЛОГИН.github.io/ИМЯ_РЕПОЗИТОРИЯ/`.

Все ссылки на сайте относительные, поэтому он работает и из подпапки репозитория, и на собственном домене. QR-код всегда ведёт на тот адрес, с которого открыта страница.

## Структура

```
index.html, profile.html, about.html, collection.html
css/style.css
js/config.js       — настройки Firebase
js/store.js        — работа с данными (Firestore или демо-режим)
js/common.js       — профиль на устройстве, форматирование телефона и сумм
js/home.js, js/profile.js, js/collection.js — логика страниц
vendor/qrcode.js   — генератор QR-кодов (qrcode-generator 1.4.4, MIT)
firestore.rules    — правила безопасности Firestore
```

## Данные в Firestore

```
users/{телефон}                       name, phone, bank
collections/{id}                      title, description, target, collected, status (open|closed),
                                      organizerPhone, organizerName, organizerBank, participantPhones[]
collections/{id}/participants/{тел.}  name, phone, joinedAt
collections/{id}/payments/{id}        phone, name, amount, status (pending|confirmed|rejected)
```

Телефоны хранятся в виде `7XXXXXXXXXX`.
