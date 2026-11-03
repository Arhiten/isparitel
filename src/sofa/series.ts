// Опытные серии изделий: у каждой своя модель, свои коды экземпляров и своя папка данных.
// Чистый TS: описание серии нужно и странице, и серверу.

export type SeriesId = "sofa" | "shukhlyatka" | "evaporator";

/** Слово для экземпляра в трёх формах: 1 диван, 2 дивана, 5 диванов; prepPl — «во всех диванах». */
type Noun = { one: string; few: string; many: string; prepPl: string };

export type Series = {
  id: SeriesId;
  /** Код модели в номерах: ДЯ-01, ДЯ-01-Ф-017. */
  code: string;
  name: string;
  unitCount: number;
  noun: Noun;
  /** Папка данных серии (относительно корня проекта). */
  folder: string;
  /** Откуда взята модель серии — показывается в шапке страницы. */
  source: string;
  /** Что не заведено в модели и не попадает в закуп. */
  purchaseNote?: string;
  /** Чертежи серии рисуют контур отрезками и дугами (ArchiCAD), а не замкнутой полилинией. */
  dwgPieces?: boolean;
};

export const SERIES: Record<SeriesId, Series> = {
  sofa: {
    id: "sofa",
    code: "ДЯ",
    name: "Диван с ящиками",
    unitCount: 7,
    noun: { one: "диван", few: "дивана", many: "диванов", prepPl: "диванах" },
    folder: "sofa-projects",
    source: "по проекту «Фанерный каркас дивана»",
    purchaseNote: "В модели не заведены обивочные материалы и расходники: ППУ (есть отдельно в ППУ.xlsx), ткань, синтепон, скобы, подпятники, ручки ящиков. Без них закуп на серию неполный.",
  },
  shukhlyatka: {
    id: "shukhlyatka",
    code: "ШХ",
    name: "Шухлятка",
    unitCount: 1,
    noun: { one: "шухлятка", few: "шухлятки", many: "шухляток", prepPl: "шухлятках" },
    folder: "shukhlyatka-projects",
    source: "по чертежу ЧПУ «шухлятука ЧПУ.dwg»",
    purchaseNote: "Не заведён малярный скотч (клеевые места, выборки и пазы не красить). Цены ручек, шайб, клея, шпаклёвки, грунта, краски и клеевого слоя с нарезкой войлока — уточнить. Грунт и краска — на окраску всех деталей целиком.",
    dwgPieces: true,
  },
  evaporator: {
    id: "evaporator",
    code: "ШИ",
    name: "Шкаф испарителя",
    unitCount: 1,
    noun: { one: "шкаф", few: "шкафа", many: "шкафов", prepPl: "шкафах" },
    folder: "evaporator-projects",
    source: "по параметрической модели (несущий каркас 900 × 900 × 1800, по наружным кассетам 906 × 906)",
    purchaseNote: "Цены металла — ориентировочные; цены винтов и шайб EPDM не заданы. Не заведены: заземление панелей, утепление и облицовка стен, дно, крыша, дверь, вентрешётки, ригель, проушины строповки, грунт и краска, газ CO₂.",
  },
};

export const seriesOf = (id: string | null | undefined): Series => SERIES[(id ?? "sofa") as SeriesId] ?? SERIES.sofa;

/** «7 диванов», «1 шухлятка». */
export function units(s: Series, n: number) {
  const d = n % 10, h = n % 100;
  const word = d === 1 && h !== 11 ? s.noun.one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? s.noun.few : s.noun.many;
  return `${n} ${word}`;
}

export const unitCode = (s: Series, n: number) => `${s.code}-${String(n).padStart(2, "0")}`;
export const unitFolder = (s: Series, code: string) => `${code} ${s.name}`;
