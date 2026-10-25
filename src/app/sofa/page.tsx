import Link from "next/link";
import { SERIES } from "@/sofa/series";
import SofaApp from "@/sofa/SofaApp";

const series = SERIES.sofa;

export const metadata = { title: "Опытная серия: диван с ящиками" };

export default function Page() {
  return (
    <main className="sofa">
      <header>
        <h1>Опытная серия · {series.name}</h1>
        <p>
          {series.unitCount} опытных моделей {series.source} · <Link href="/shukhlyatka">серия «Шухлятка» →</Link> · <Link href="/">формы для литья →</Link>
        </p>
      </header>
      <SofaApp series={series.id} />
    </main>
  );
}
