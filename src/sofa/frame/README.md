# Копия ядра «Фанерного каркаса дивана»

`model.ts`, `calc.ts`, `nest.ts`, `export.ts` скопированы без изменений из эталонного проекта
`Desktop\Работа\Claude\.claude\worktrees\plywood-sofa-frame-c0aefd\src\app\ui\frame\`
(в `calc.ts` импорт `area` переведён на локальный `area.ts`, в `export.ts` `partsFile` и `sheetsFile` экспортируются и принимают только нужные поля расчёта, в `calc.ts` экспортирован `solidsOf`, в `model.ts` у `Part` добавлено поле `pocketsUnder` — сторона выборок на 3D для серий, у `Item` — `url`, ссылка для покупки).

Правки расчёта делаются в эталоне, сюда — копированием. Своё для серии диванов — в `src/sofa/` рядом.
