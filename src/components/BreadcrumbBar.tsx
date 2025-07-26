"use client";
import { usePathname } from "next/navigation";

export function BreadcrumbBar() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.map((p, i) => (
    <span key={i} className="text-gray-600">
      {i > 0 && <span className="mx-1">/</span>}
      {p.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
    </span>
  ));
  const routeMap: Record<string, { menu: string; submenu: string }> = {
    "clientes": { menu: "Contactos", submenu: "Clientes" },
    "usuarios": { menu: "Contactos", submenu: "Usuarios" },
    "articles": { menu: "Stock", submenu: "Productos" },
    "agrupadores": { menu: "Stock", submenu: "Agrupadores" },
    "movimientos-stock": { menu: "Stock", submenu: "Movimientos de stock" },
    "ventas": { menu: "Ventas", submenu: "Ventas" },
    "pagos": { menu: "Ventas", submenu: "Pagos" },
    "caja": { menu: "Tesorería", submenu: "Cajas" },
    "cuentas-corrientes": { menu: "Ventas", submenu: "Cuentas Corrientes" },
    "informes": { menu: "Informes", submenu: "Informes" },
    "dashboard": { menu: "Dashboard", submenu: "Dashboard" },
    "liquidaciones": { menu: "Sueldos", submenu: "Liquidaciones" },
    "empleados": { menu: "Sueldos", submenu: "Empleados" },
    "asistente-ai": { menu: "Faro", submenu: "Asistente IA" },
  };
  const last = parts[parts.length - 1];
  const info = routeMap[last] || null;
  return (
    <nav className="flex items-center gap-2 text-sm mb-4 pl-6">
      {info ? (
        <>
          <span className="text-gray-600">{info.menu}</span>
          <span className="mx-1 text-gray-400">&gt;</span>
          <span className="text-black font-medium">{info.submenu}</span>
        </>
      ) : (
        crumbs.length > 0 ? crumbs : <span className="text-gray-600">Inicio</span>
      )}
    </nav>
  );
} 