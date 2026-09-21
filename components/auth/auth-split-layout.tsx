import Image from "next/image";

interface AuthSplitLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout compartido de las pantallas de acceso (/login):
 * imagen a la izquierda (~60% desktop, ~50% tablet, oculta en mobile) +
 * panel blanco a la derecha con el contenido de auth. Los formularios y la
 * lógica de cada pantalla son independientes — esto solo resuelve la
 * estructura visual y el responsive.
 */
export function AuthSplitLayout({ children }: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-white md:h-screen md:flex-row md:overflow-hidden">
      <div className="relative hidden shrink-0 md:block md:w-1/2 lg:w-[60%]">
        <Image
          src="/brand/perhaps-img-back.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 60vw, 50vw"
          className="object-cover object-center"
        />
      </div>
      {/* items-center + overflow-y-auto centra horizontalmente y permite scroll
          si el contenido no entra; el centrado vertical va en el hijo via
          my-auto (no justify-center acá) para que, si desborda, el scroll
          revele el contenido desde arriba en vez de recortarlo por los dos
          lados (limitación conocida de centrar con flexbox + overflow). */}
      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-10 sm:px-10 md:w-1/2 md:px-12 lg:w-[40%]">
        <div className="my-auto w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  );
}
