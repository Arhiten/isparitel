import Link from "next/link";
import { SERIES, units } from "@/sofa/series";
import SofaApp from "@/sofa/SofaApp";

const series = SERIES.shukhlyatka;

export const metadata = { title: `Опытная серия: ${series.name.toLowerCase()}` };

export default function Page() {
  return (
    <main className="sofa">
      <header>
        <h1>Опытная серия · {series.name}</h1>
        <p>
          {units(series, series.unitCount)} {series.source} · <Link href="/sofa">серия диванов →</Link> · <Link href="/">формы для литья →</Link>
        </p>
      </header>
      <SofaApp series={series.id} />
    </main>
  );
}
