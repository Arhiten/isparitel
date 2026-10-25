import Link from "next/link";
import { Workbench } from "@/components/Workbench";

export default function Page() {
  return (
    <main>
      <header>
        <h1>Формы для шликерного литья</h1>
        <p>
          Изделие → гипсовая форма → силиконовый кейс → печатный блок и кожух · <Link href="/sofa">опытная серия диванов →</Link> · <Link href="/shukhlyatka">серия «Шухлятка» →</Link> · <Link href="/evaporator">шкафы испарителя →</Link>
        </p>
      </header>
      <Workbench />
    </main>
  );
}
