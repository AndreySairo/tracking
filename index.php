<?php /* Трекинг-дневник — одностраничное приложение. PHP отдаёт страницу; данные через api.php */ ?>
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Трекинг-дневник</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="bg"></div>

  <main class="container">
    <header class="page-head">
      <h1>Трекинг-дневник</h1>
      <p class="subtitle">показатели и зависимости — день за днём</p>
    </header>

    <!-- ШАБЛОН СОЗДАНИЯ ЗАПИСИ -->
    <section class="card template" id="template">
      <div class="template-head" id="templateHead">
        <h2>Новая запись</h2>
        <button id="toggleTemplate" class="ghost small" type="button">свернуть</button>
      </div>

      <div class="template-body" id="templateBody">
        <div class="date-row">
          <label for="recDate">Дата</label>
          <input type="date" id="recDate">
        </div>

        <!-- сюда рендерятся перетаскиваемые пункты -->
        <div id="fields" class="fields"></div>

        <div class="add-field">
          <button id="addFieldBtn" class="ghost" type="button">+ Добавить пункт</button>
          <div id="addFieldForm" class="add-field-form hidden">
            <input type="text" id="newFieldName" placeholder="Название пункта" maxlength="60">
            <select id="newFieldType">
              <option value="int">Целое число</option>
              <option value="bool">Чекбокс</option>
            </select>
            <div class="range-inputs" id="newFieldRange">
              <input type="number" id="newFieldMin" placeholder="от" value="0">
              <input type="number" id="newFieldMax" placeholder="до" value="10">
            </div>
            <div class="add-field-actions">
              <button id="createFieldBtn" class="primary small" type="button">Создать</button>
              <button id="cancelFieldBtn" class="ghost small" type="button">Отмена</button>
            </div>
          </div>
        </div>

        <button id="saveBtn" class="save" type="button" disabled>Сохранить</button>
      </div>
    </section>

    <!-- ИСТОРИЯ -->
    <section class="card history">
      <div class="history-head">
        <h2>История</h2>
        <div class="view-switch" id="viewSwitch">
          <button data-view="days" class="active" type="button">Дни</button>
          <button data-view="weeks" type="button">Недели</button>
          <button data-view="months" type="button">Месяцы</button>
        </div>
      </div>
      <div id="historyBody" class="history-body"></div>
    </section>
  </main>

  <!-- модальное подтверждение -->
  <div class="modal-overlay hidden" id="modal">
    <div class="modal">
      <p id="modalText"></p>
      <div class="modal-actions">
        <button id="modalOk" class="danger" type="button">Удалить</button>
        <button id="modalCancel" class="ghost" type="button">Отмена</button>
      </div>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
