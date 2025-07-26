"use client";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import React, { useEffect, useState, useCallback } from "react";
import { getCajas } from "@/services/cajas";
import { Caja } from "@/types/caja";
import { format } from "date-fns";
import { createLoteOperacion } from "@/services/lotesOperaciones";
import { createDetalleLoteOperacion } from "@/services/detalleLotesOperaciones";
import { LotesOperacionesContent } from "@/components/lotes-operaciones-content";
import { getLoteCajaAbiertaPorUsuario, cerrarLoteApertura } from "@/services/lotesOperaciones";
import { getDetalleLotesOperaciones } from "@/services/detalleLotesOperaciones";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FileText, Box, X as CloseIcon } from "lucide-react";
import { getCuentasTesoreria } from "@/services/cuentasTesoreria";
import { getOrdenesVenta } from "@/services/ordenesVenta";
import { getOrdenesVentaMediosPago } from "@/services/ordenesVentaMediosPago";
import { CuentaTesoreria } from "@/types/cuentaTesoreria";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getLotesOperaciones } from "@/services/lotesOperaciones";
import { getUsuarios } from "@/services/usuarios";
import { Usuario } from "@/types/usuario";
import { OrdenVenta } from "@/types/ordenVenta";
import { OrdenVentaMediosPago } from "@/types/ordenVenta";
import { getTiposComprobantes } from "@/services/tiposComprobantes";
import { TipoComprobante } from "@/types/tipoComprobante";
import { formatCurrency, DEFAULT_CURRENCY, DEFAULT_LOCALE } from "@/lib/utils";
import { BreadcrumbBar } from "@/components/BreadcrumbBar";
import { getClientes } from "@/services/clientes";
import { getPagosCuentaCorriente } from "@/services/pagosCuentaCorriente";
import { LoteOperacion } from "@/types/loteOperacion";

interface AperturaCaja {
  caja: string;
  saldoInicial: string;
  fechaApertura: string;
  horaApertura: string;
  fechaCierre: string | null;
  horaCierre: string | null;
  id_lote?: number;
  fk_id_usuario?: number;
}



export default function CajaPage() {
  const { isSignedIn, user } = useUser();
  const router = useRouter();

  // TODOS los hooks deben ir aquí
  const [cajaSeleccionada, setCajaSeleccionada] = useState("");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [cajaAbierta, setCajaAbierta] = useState<string | null>(null);
  const [aperturaError, setAperturaError] = useState<string | null>(null);
  const [observacionesApertura, setObservacionesApertura] = useState("");
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [historial] = useState<AperturaCaja[]>([]);
  const [aperturaActual, setAperturaActual] = useState<AperturaCaja | null>(null);
  const [refreshLotes, setRefreshLotes] = useState(0);
  const [showCierreModal, setShowCierreModal] = useState(false);
  const [resumen, setResumen] = useState<{ cuenta: string, ingresos: number, egresos: number }[]>([]);
  const [loadingCierre] = useState(false);
  const [cuentasTesoreria, setCuentasTesoreria] = useState<CuentaTesoreria[]>([]);
  const [toast, setToast] = useState<{ show: boolean, message: string }>({ show: false, message: "" });
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<string>("");
  const [showTrialEnded, setShowTrialEnded] = useState(false);
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [usuarioDB, setUsuarioDB] = useState<Usuario | null>(null);

  // Loader global
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  // Modificar fetchCajaAbierta para que el supervisor pueda ver la caja abierta de cualquier usuario seleccionado
  const fetchCajaAbierta = useCallback(async (usuarioId?: number) => {
    // Si es supervisor y hay un usuario seleccionado, usar ese id; si no, usar el propio
    let idToUse = usuarioId;
    if (usuarioDB?.rol === "supervisor" && usuarioSeleccionado) {
      idToUse = Number(usuarioSeleccionado);
    }
    if (!idToUse) {
      setCajaAbierta(null);
      setAperturaActual(null);
      return;
    }
    const lote = await getLoteCajaAbiertaPorUsuario(idToUse);
    if (lote) {
      setCajaAbierta(lote.fk_id_caja);
      setAperturaActual({
        caja: cajas.find(c => c.id === lote.fk_id_caja)?.descripcion || lote.fk_id_caja,
        saldoInicial: lote.saldo_inicial?.toString() || '',
        fechaApertura: lote.fecha_apertura?.slice(0, 10),
        horaApertura: lote.hora_apertura,
        fechaCierre: null,
        horaCierre: null,
        id_lote: lote.id_lote,
        fk_id_usuario: lote.fk_id_usuario,
      });
    } else {
      setCajaAbierta(null);
      setAperturaActual(null);
    }
  }, [usuarioDB, usuarioSeleccionado, cajas]);

  // Cambiar useEffect para que el array de dependencias esté vacío:
  useEffect(() => {
    fetchCajas();
    getCuentasTesoreria().then(setCuentasTesoreria);
    getUsuarios().then(us => {
      setUsuarios(us);
      if (user?.emailAddresses?.[0]?.emailAddress) {
        const actual = us.find(u => u.email === user.emailAddresses[0].emailAddress);
        setUsuarioActual(actual || null);
        setUsuarioDB(actual || null);
        if (actual) setUsuarioSeleccionado(actual.id.toString());
        // Solo llamar a fetchCajaAbierta cuando usuarioActual esté definido
        if (actual) fetchCajaAbierta(actual.id);
      }
    });
  }, [user]);

  // Al cargar usuarios, si es supervisor y no hay usuario seleccionado, seleccionar el primero y mostrar su caja abierta
  React.useEffect(() => {
    if (usuarioDB?.rol === "supervisor" && usuarios.length > 0 && !usuarioSeleccionado) {
      setUsuarioSeleccionado(usuarios[0].id.toString());
      fetchCajaAbierta(Number(usuarios[0].id));
    }
  }, [usuarioDB, usuarios, usuarioSeleccionado, fetchCajaAbierta]);

  // Refrescar caja abierta al cambiar usuarioSeleccionado si es supervisor
  React.useEffect(() => {
    if (usuarioDB?.rol === "supervisor" && usuarioSeleccionado) {
      fetchCajaAbierta(Number(usuarioSeleccionado));
    }
  }, [usuarioSeleccionado, usuarioDB, fetchCajaAbierta]);

  // Estado para el lote abierto global (para supervisor)
  const [loteAbiertoGlobal, setLoteAbiertoGlobal] = useState<LoteOperacion | null>(null);

  // Al cargar, si el usuario es supervisor, buscar cualquier caja abierta
  React.useEffect(() => {
    async function fetchLoteAbiertoGlobal() {
      if (usuarioDB?.rol === "supervisor") {
        const lotes = await getLotesOperaciones();
        const abierto = lotes.find(l => l.abierto);
        setLoteAbiertoGlobal(abierto || null);
      }
    }
    fetchLoteAbiertoGlobal();
  }, [usuarioDB, refreshLotes]);

  const fetchCajas = async () => {
    try {
      const data = await getCajas();
      setCajas(data);
    } catch {
      // setCrudError("Error al cargar cajas");
    } finally {
      // setLoading(false);
    }
  };

  if (!isSignedIn) {
    return (
      <div className="flex flex-col justify-center items-center h-screen text-muted-foreground gap-4">
        <span>Debes iniciar sesión para ver la caja.</span>
        <Button onClick={() => router.push("/sign-in")}>Iniciar Sesión</Button>
      </div>
    );
  }
  // Formulario de apertura de caja (simulado)
  // const [cajaSeleccionada, setCajaSeleccionada] = useState("");
  // const [saldoInicial, setSaldoInicial] = useState("");
  // const [cajaAbierta, setCajaAbierta] = useState<string | null>(null);
  // const [aperturaError, setAperturaError] = useState<string | null>(null);
  // const [observacionesApertura, setObservacionesApertura] = useState("");

  // CRUD de cajas de turno
  // const [cajas, setCajas] = useState<Caja[]>([]);
  // const [loading, setLoading] = useState(false);
  // const [crudError, setCrudError] = useState<string | null>(null);
  // const [editCaja, setEditCaja] = useState<Caja | null>(null);
  // const [descripcion, setDescripcion] = useState("");
  // const [turno, setTurno] = useState("");

  // Simulación de historial de aperturas/cierres
  // const [historial] = useState<AperturaCaja[]>([]);
  // const [aperturaActual, setAperturaActual] = useState<AperturaCaja | null>(null);

  // Ref para refrescar lotes
  // const [refreshLotes, setRefreshLotes] = useState(0);

  // const [showCierreModal, setShowCierreModal] = useState(false);
  // const [movimientos, setMovimientos] = useState<DetalleLoteOperacion[]>([]);
  // const [resumen, setResumen] = useState<{ cuenta: string, ingresos: number, egresos: number }[]>([]);
  // const [loadingCierre, setLoadingCierre] = useState(false);
  // const [cuentasTesoreria, setCuentasTesoreria] = useState<CuentaTesoreria[]>([]);
  // const [toast, setToast] = useState<{ show: boolean, message: string }>({ show: false, message: "" });
  // const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  // const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<string>("");
  // const [showTrialEnded, setShowTrialEnded] = useState(false);

  // --- Apertura de caja (simulado, en el futuro irá a otra tabla) ---
  const handleAbrirCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    setAperturaError(null);
    setLoading(true);
    setLoadingMessage("Abriendo caja, por favor espera...");
    // Validar prueba gratis
    try {
      const usuarios = await getUsuarios();
      const usuario = usuarios.find(u => u.id === parseInt(usuarioSeleccionado, 10));
      if (usuario && usuario.prueba_gratis) {
        const creado = new Date(usuario.creado_el);
        const hoy = new Date();
        const diffMs = hoy.getTime() - creado.getTime();
        const diffDias = 15 - Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDias <= 0) {
          setShowTrialEnded(true);
          setLoading(false);
          setLoadingMessage("");
          return;
        }
      }
    } catch {}
    if (!cajaSeleccionada || !saldoInicial || !usuarioSeleccionado) {
      setAperturaError("Selecciona una caja, usuario y saldo inicial");
      setLoading(false);
      setLoadingMessage("");
      return;
    }
    if (cajaAbierta) {
      setAperturaError("Ya hay una caja abierta. Cierra la caja antes de abrir otra.");
      setLoading(false);
      setLoadingMessage("");
      return;
    }
    const now = new Date();
    const hoy = format(now, "yyyy-MM-dd");
    try {
      // Buscar la caja por id
      const cajaObj = cajas.find(c => c.id === Number(cajaSeleccionada));
      if (!cajaObj) throw new Error("Caja no encontrada");
      // Crear lote de apertura
      const lote = await createLoteOperacion({
        fk_id_usuario: parseInt(usuarioSeleccionado, 10),
        fk_id_caja: cajaObj.id,
        abierto: true,
        tipo_lote: "apertura",
        fecha_apertura: hoy,
        hora_apertura: format(now, "HH:mm"),
        fecha_cierre: null, // <-- Debe ser null al abrir
        hora_cierre: null,
        observaciones: observacionesApertura || null,
        saldo_inicial: parseFloat(saldoInicial), // Agregar saldo inicial
      });
      // Crear detalle del lote
      await createDetalleLoteOperacion({
        fk_id_lote: lote.id_lote,
        fk_id_cuenta_tesoreria: 1, // cuenta prueba
        tipo: 'ingreso',
        monto: parseFloat(saldoInicial),
      });
      // Actualiza el frontend inmediatamente
      setCajaAbierta(cajaSeleccionada);
      setAperturaActual({
        caja: cajaSeleccionada,
        saldoInicial,
        fechaApertura: hoy,
        horaApertura: format(now, "HH:mm"),
        fechaCierre: null,
        horaCierre: null,
        id_lote: lote.id_lote,
        fk_id_usuario: parseInt(usuarioSeleccionado, 10),
      });
      setCajaSeleccionada("");
      setSaldoInicial("");
      setUsuarioSeleccionado("");
      setObservacionesApertura("");
      setRefreshLotes(x => x + 1);
      showToast("Caja abierta correctamente");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
    // Refresca datos secundarios si es necesario
    // await fetchCajaAbierta();
  };

  async function handleCerrarCaja() {
    setLoading(true);
    setLoadingMessage("Cerrando caja y calculando movimientos...");
    if (!aperturaActual || !aperturaActual.id_lote) return;
    // Traer todos los movimientos reales del lote
    const movimientos = await getDetalleLotesOperaciones(aperturaActual.id_lote);
    // Traer todas las cuentas de tesorería
    const cuentasTesoreria = await getCuentasTesoreria();
    // Sumar ingresos y egresos por cuenta SOLO de movimientos
    const resumenPorCuenta: Record<number, { cuenta: string, ingresos: number, egresos: number }> = {};
    for (const cuenta of cuentasTesoreria) {
      resumenPorCuenta[cuenta.id] = { cuenta: cuenta.descripcion, ingresos: 0, egresos: 0 };
    }
    for (const mov of movimientos) {
      if (resumenPorCuenta[mov.fk_id_cuenta_tesoreria]) {
        if (mov.tipo === 'ingreso') {
          resumenPorCuenta[mov.fk_id_cuenta_tesoreria].ingresos += Math.abs(mov.monto);
        } else if (mov.tipo === 'egreso') {
          resumenPorCuenta[mov.fk_id_cuenta_tesoreria].egresos += Math.abs(mov.monto);
        }
      }
    }
    const resumenFinal = Object.values(resumenPorCuenta);
    setResumen(resumenFinal);
    setShowCierreModal(true);
    setLoading(false);
    setLoadingMessage("");
  }

  async function confirmarCierreCaja() {
    setShowCierreModal(false);
    if (!aperturaActual || !aperturaActual.id_lote) return;
    setLoading(true);
    setLoadingMessage("Confirmando cierre de caja...");
    const now = new Date();
    const hoyCierre = format(now, "yyyy-MM-dd");
    try {
      // 1. Actualiza el registro en la base de datos
      await cerrarLoteApertura(aperturaActual.id_lote, hoyCierre, format(now, "HH:mm"));
      // 2. Actualiza el estado del frontend inmediatamente
      setCajaAbierta(null);
      setAperturaActual(null);
      setRefreshLotes(x => x + 1);
      showToast("Cierre de caja confirmado");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
    // 3. (Opcional) Calcula movimientos o genera PDF en segundo plano si es necesario
    // calcularMovimientosYGenerarPDF();
  }

  async function generarPDFCierreCaja() {
    const doc = new jsPDF();
    // Encabezado compacto
    // Título grande
    doc.setFontSize(20);
    doc.text("CIERRE DE CAJA", 105, 20, { align: "center" });
    // Datos de caja en dos columnas, fuente pequeña
    doc.setFontSize(9);
    let yDatos = 30;
    doc.text(`Caja: ${cajaAbierta || aperturaActual?.caja || "N/A"}`, 20, yDatos);
    doc.text(`Saldo inicial: ${formatCurrency(parseFloat(aperturaActual?.saldoInicial || '0'), DEFAULT_CURRENCY, DEFAULT_LOCALE)}`, 120, yDatos);
    yDatos += 6;
    doc.text(`Fecha apertura: ${aperturaActual?.fechaApertura || "N/A"}`, 20, yDatos);
    doc.text(`Hora apertura: ${aperturaActual?.horaApertura || "N/A"}`, 120, yDatos);
    yDatos += 6;
    doc.text(`Fecha cierre: ${format(new Date(), "yyyy-MM-dd")}`, 20, yDatos);
    doc.text(`Hora cierre: ${format(new Date(), "HH:mm")}`, 120, yDatos);
    yDatos += 10;
    // --- Bloque resumen de ventas y notas de crédito ---
    doc.setFontSize(10);
    // Obtener catálogos necesarios
    const clientesArr = await getClientes();
    const usuariosArr = await getUsuarios();
    const tiposComprobantes = await getTiposComprobantes();
    // Definir ventasLote antes de usarla en el resumen de ventas
    let ventasLote: OrdenVenta[] = [];
    if (aperturaActual && aperturaActual.id_lote) {
      const [ventas] = await Promise.all([
        getOrdenesVenta(),
        // ...otros fetch si necesitas
      ]);
      ventasLote = ventas.filter((v: OrdenVenta) => v.fk_id_lote === aperturaActual.id_lote);
    }
    if (ventasLote && ventasLote.length > 0) {
      const totalVentas = ventasLote.filter((v: OrdenVenta) => v.fk_id_tipo_comprobante !== 2).reduce((sum: number, v: OrdenVenta) => sum + v.total, 0);
      const totalNotasCredito = ventasLote.filter((v: OrdenVenta) => v.fk_id_tipo_comprobante === 2).reduce((sum: number, v: OrdenVenta) => sum + Math.abs(v.total), 0);
      const ingresoNeto = totalVentas - totalNotasCredito;
      doc.text(`Total ventas: ${formatCurrency(totalVentas, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`, 20, yDatos);
      doc.text(`Notas de crédito: ${formatCurrency(totalNotasCredito, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`, 80, yDatos);
      doc.text(`Ingreso neto: ${formatCurrency(ingresoNeto, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`, 140, yDatos);
      yDatos += 8;
    }
    // Tabla de cuentas tesorería
    const tableData = resumen.map(r => [
      r.cuenta,
      `${formatCurrency(r.ingresos, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`,
      `${formatCurrency(r.egresos, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`
    ]);
    autoTable(doc, {
      startY: yDatos + 2,
      head: [["Cuenta Tesorería", "Total Ingresos", "Total Egresos"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: [66, 139, 202],
        textColor: 255,
        fontStyle: "bold"
      },
      styles: {
        fontSize: 9
      },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" }
      }
    });
    const afterTablesY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8 : yDatos + 20;
    // Totales alineados a la derecha
    let afterTotalesY = afterTablesY + 28;
    // Tabla de pagos
    const pagosCuentaCorriente = await getPagosCuentaCorriente();
    const pagosLote = pagosCuentaCorriente.filter(p => p.fk_id_lote === aperturaActual?.id_lote);
    const totalPagos = pagosLote.reduce((sum, p) => sum + p.monto, 0);
    if (pagosLote.length > 0) {
      doc.setFontSize(11);
      doc.text("Pagos de cuentas corrientes", 20, afterTotalesY);
      autoTable(doc, {
        startY: afterTotalesY + 3,
        head: [["ID", "Fecha", "Cliente", "Cuenta Tesorería", "Monto"]],
        body: pagosLote.map(pago => {
          const cuentaTesoreria = cuentasTesoreria.find(ct => ct.id === pago.fk_id_cuenta_tesoreria);
          let clienteNombre = "-";
          const cuentaCorriente = clientesArr.find(c => c.id === pago.fk_id_cuenta_corriente);
          if (cuentaCorriente) clienteNombre = cuentaCorriente.razon_social || "-";
          return [
            pago.id.toString(),
            new Date(pago.creado_el).toLocaleString(),
            clienteNombre,
            cuentaTesoreria?.descripcion || "-",
            formatCurrency(pago.monto, DEFAULT_CURRENCY, DEFAULT_LOCALE)
          ];
        }),
        theme: "grid",
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontStyle: "bold"
        },
        styles: {
          fontSize: 9
        }
      });
      const pagosFinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Total de pagos: ${formatCurrency(totalPagos, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`, 150, pagosFinalY, { align: "right" });
      afterTotalesY = pagosFinalY + 8;
    }
    // Nota aclaratoria al final
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.setFont("helvetica", "normal");
    doc.text("Nota: Los ingresos de 'CUENTA CORRIENTE' son informativos y no se suman al total de ingresos de caja. Ese total se reparte en los otros medios de pago a medida que el cliente paga su deuda.", 20, afterTotalesY, { maxWidth: 170 });
    doc.setTextColor(0);
    // --- Tabla de órdenes de venta del lote ---
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY : yDatos + 20;
    if (ventasLote && ventasLote.length > 0) {
      const resumenY2 = finalY + 55;
      doc.setFontSize(14);
      doc.text("Órdenes de venta del lote", 20, resumenY2);
      doc.setFontSize(10);
      const ordenesHead = [
        "ID", "Fecha", "Total", "Subtotal", "Cliente", "Doc", "Usuario", "Comprobante", "Medios de pago"
      ];
      const ordenesBody: string[][] = [];
      for (const orden of ventasLote) {
        const clienteObj = clientesArr.find((c: unknown) => (c as any).id === orden.fk_id_entidades);
        const usuarioObj = usuariosArr.find((u: Usuario) => u.id === orden.fk_id_usuario);
        const tipoCompObj = tiposComprobantes.find((t: TipoComprobante) => t.id === orden.fk_id_tipo_comprobante);
        const medios: OrdenVentaMediosPago[] = await getOrdenesVentaMediosPago(orden.id);
        const mediosStr = medios.map((m) => {
          const cuenta = cuentasTesoreria.find((ct: CuentaTesoreria) => ct.id === m.fk_id_cuenta_tesoreria);
          return cuenta ? `${cuenta.descripcion}: ${formatCurrency(m.monto_pagado, DEFAULT_CURRENCY, DEFAULT_LOCALE)}` : `${formatCurrency(m.monto_pagado, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`;
        }).join(" | ");
        ordenesBody.push([
          orden.id.toString(),
          orden.fecha?.slice(0, 16) || "",
          `${formatCurrency(orden.total, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`,
          `${formatCurrency(orden.subtotal, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`,
          clienteObj?.razon_social || "-",
          clienteObj?.tipo_doc?.toUpperCase() || "-",
          usuarioObj?.nombre || "",
          tipoCompObj?.descripcion || "",
          mediosStr
        ]);
      }
      autoTable(doc, {
        startY: resumenY2 + 8,
        head: [ordenesHead],
        body: ordenesBody,
        theme: "grid",
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontStyle: "bold"
        },
        styles: {
          fontSize: 8
        }
      });
    }

    
    // Pie de página
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generado el ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 20, 280);
    // Totales al final, alineados a la izquierda y centrados respecto a la hoja
    const pageWidth = doc.internal.pageSize.getWidth();
    const totalIngresosSinCuentaCorriente = resumen
      .filter(r => r.cuenta.toUpperCase() !== "CUENTA CORRIENTE")
      .reduce((sum, r) => sum + r.ingresos, 0);
    const totalEgresosSinCuentaCorriente = resumen
      .filter(r => r.cuenta.toUpperCase() !== "CUENTA CORRIENTE")
      .reduce((sum, r) => sum + r.egresos, 0);
    // const saldoFinal = totalIngresosSinCuentaCorriente - totalEgresosSinCuentaCorriente;
    const yTotales = 265;
    const totalesText = [
      `Saldo inicial: ${formatCurrency(Number(saldoInicial), DEFAULT_CURRENCY, DEFAULT_LOCALE)}`,
      `Total Ingresos: ${formatCurrency(totalIngresosSinCuentaCorriente, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`,
      `Total Egresos: ${formatCurrency(totalEgresosSinCuentaCorriente, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`,
      `Saldo Final: ${formatCurrency(totalIngresosSinCuentaCorriente - totalEgresosSinCuentaCorriente, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`
    ];
    totalesText.forEach((line, idx) => {
      doc.text(line, pageWidth / 2, yTotales + idx * 7, { align: "center" });
    });
    // Descargar el PDF
    const fileName = `cierre_caja_${format(new Date(), "yyyy-MM-dd_HH-mm")}.pdf`;
    doc.save(fileName);
  }

  // Imprimir cierre de caja para cualquier lote
  async function imprimirCierreDeLote(id_lote: number) {
    const lotes = await getLotesOperaciones();
    const lote = lotes.find(l => l.id_lote === id_lote);
    if (!lote) return;
    // Buscar caja
    const caja = cajas.find(c => c.id === lote.fk_id_caja);
    // Buscar movimientos
    const movimientos = await getDetalleLotesOperaciones(id_lote);
    // Buscar ventas y medios de pago
    const ventas = await getOrdenesVenta();
    const ventasLote = ventas.filter(v => v.fk_id_lote === id_lote);
    // Obtener catálogos para joins
    const [cuentasTesoreria, usuariosArr, tiposComprobantes] = await Promise.all([
      getCuentasTesoreria(),
      getUsuarios(),
      getTiposComprobantes(),
    ]);
    
    // Sumar ingresos y egresos por cuenta (movimientos + ventas)
    const resumenPorCuenta: Record<number, { cuenta: string, ingresos: number, egresos: number }> = {};
    for (const cuenta of cuentasTesoreria) {
      resumenPorCuenta[cuenta.id] = { cuenta: cuenta.descripcion, ingresos: 0, egresos: 0 };
    }
    
    // Procesar movimientos del lote
    for (const mov of movimientos) {
      if (resumenPorCuenta[mov.fk_id_cuenta_tesoreria]) {
        if (mov.tipo === 'ingreso') {
          resumenPorCuenta[mov.fk_id_cuenta_tesoreria].ingresos += Math.abs(mov.monto);
        } else if (mov.tipo === 'egreso') {
          resumenPorCuenta[mov.fk_id_cuenta_tesoreria].egresos += Math.abs(mov.monto);
        }
      }
    }
    
    // Procesar ventas del lote
    const mediosPorVenta = await Promise.all(
      ventasLote.map(venta => getOrdenesVentaMediosPago(venta.id))
    );
    ventasLote.forEach((venta, i) => {
      const medios = mediosPorVenta[i];
      for (const m of medios) {
        if (resumenPorCuenta[m.fk_id_cuenta_tesoreria]) {
          if (venta.fk_id_tipo_comprobante === 2) {
            resumenPorCuenta[m.fk_id_cuenta_tesoreria].ingresos -= m.monto_pagado;
          } else {
            resumenPorCuenta[m.fk_id_cuenta_tesoreria].ingresos += m.monto_pagado;
          }
        }
      }
    });
    
    const resumenFinal = Object.values(resumenPorCuenta);
    
    // PDF
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("CIERRE DE CAJA", 105, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text(`Caja: ${caja?.descripcion || lote.fk_id_caja}` , 20, 35);
    doc.text(`Saldo inicial: ${formatCurrency(parseFloat(lote.saldo_inicial?.toString() || '0'), DEFAULT_CURRENCY, DEFAULT_LOCALE)}`, 20, 45);
    doc.text(`Fecha de apertura: ${lote.fecha_apertura?.slice(0, 10) || "N/A"}`, 20, 55);
    doc.text(`Hora de apertura: ${lote.hora_apertura || "N/A"}`, 20, 65);
    doc.text(`Fecha de cierre: ${lote.fecha_cierre?.slice(0, 10) || "N/A"}`, 20, 75);
    doc.text(`Hora de cierre: ${lote.hora_cierre || "N/A"}`, 20, 85);
    
    const tableData = resumenFinal.map(r => [
      r.cuenta,
      `${formatCurrency(r.ingresos, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`,
      `${formatCurrency(r.egresos, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`
    ]);
    
    autoTable(doc, {
      startY: 100,
      head: [["Cuenta Tesorería", "Total Ingresos", "Total Egresos"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: [66, 139, 202],
        textColor: 255,
        fontStyle: "bold"
      },
      styles: {
        fontSize: 10
      },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" }
      }
    });
    
    const totalIngresos = resumenFinal.reduce((sum, r) => sum + r.ingresos, 0);
    const totalEgresos = resumenFinal.reduce((sum, r) => sum + r.egresos, 0);
    const saldoInicial = parseFloat(lote.saldo_inicial?.toString() || '0');
    const saldoFinal = totalIngresos - totalEgresos;
    
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Saldo inicial: ${formatCurrency(saldoInicial, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`, 20, finalY);
    doc.text(`Total Ingresos: ${formatCurrency(totalIngresos, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`, 20, finalY + 10);
    doc.text(`Total Egresos: ${formatCurrency(totalEgresos, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`, 20, finalY + 20);
    doc.text(`Saldo Final: ${formatCurrency(saldoFinal, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`, 20, finalY + 30);
    
    // Resumen de órdenes de venta
    if (ventasLote && ventasLote.length > 0) {
      const resumenY2 = finalY + 40;
      doc.setFontSize(14);
      doc.text("Órdenes de venta del lote", 20, resumenY2);
      doc.setFontSize(10);
      
      const ordenesHead = [
        "ID", "Fecha", "Total", "Subtotal", "Cliente", "Doc", "Usuario", "Comprobante", "Medios de pago"
      ];
      const ordenesBody: string[][] = [];
      
      for (const orden of ventasLote) {
        const usuarioObj = usuariosArr.find((u: Usuario) => u.id === orden.fk_id_usuario);
        const tipoCompObj = tiposComprobantes.find((t: TipoComprobante) => t.id === orden.fk_id_tipo_comprobante);
        const medios: OrdenVentaMediosPago[] = await getOrdenesVentaMediosPago(orden.id);
        const mediosStr = medios.map((m) => {
          const cuenta = cuentasTesoreria.find((ct: CuentaTesoreria) => ct.id === m.fk_id_cuenta_tesoreria);
          return cuenta ? `${cuenta.descripcion}: ${formatCurrency(m.monto_pagado, DEFAULT_CURRENCY, DEFAULT_LOCALE)}` : `${formatCurrency(m.monto_pagado, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`;
        }).join(" | ");
        
        ordenesBody.push([
          orden.id.toString(),
          orden.fecha?.slice(0, 16) || "",
          `${formatCurrency(orden.total, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`,
          `${formatCurrency(orden.subtotal, DEFAULT_CURRENCY, DEFAULT_LOCALE)}`,
          "-",
          "-",
          usuarioObj?.nombre || "",
          tipoCompObj?.descripcion || "",
          mediosStr
        ]);
      }
      
      autoTable(doc, {
        startY: resumenY2 + 8,
        head: [ordenesHead],
        body: ordenesBody,
        theme: "grid",
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontStyle: "bold"
        },
        styles: {
          fontSize: 8
        }
      });
    }
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generado el ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 20, 280);
    const fileName = `cierre_caja_lote_${id_lote}_${format(new Date(), "yyyy-MM-dd_HH-mm")}.pdf`;
    doc.save(fileName);
  }

  // Animación de presión y hover para botones
  const pressClass = "active:scale-95 transition-transform duration-100 hover:scale-105 hover:shadow-lg";

  // Mostrar toast de éxito
  function showToast(message: string) {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 2500);
  }

  // Calcular el total de ingresos sin cuenta corriente para el modal de cierre
  const totalIngresosSinCuentaCorriente = resumen
    .filter(r => r.cuenta.toUpperCase() !== "CUENTA CORRIENTE")
    .reduce((sum, r) => sum + r.ingresos, 0);

  // Definir totalEgresosSinCuentaCorriente antes de imprimir los totales
  // const totalEgresosSinCuentaCorriente = resumen
  //   .filter(r => r.cuenta.toUpperCase() !== "CUENTA CORRIENTE")
  //   .reduce((sum, r) => sum + r.egresos, 0);

  // Definir saldoFinal antes de imprimir los totales
  // const saldoFinal = totalIngresosSinCuentaCorriente - totalEgresosSinCuentaCorriente;

  return (
    <div className="w-full px-8 mt-6">
      <div className="flex flex-col items-start">
        <BreadcrumbBar />
        <div className="flex items-center gap-3 mb-4 pl-6">
          <Box className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">Gestión de Caja</h1>
        </div>
      </div>
      <div className="rounded-lg border bg-card p-6 mb-8">
        <h2 className="text-lg font-semibold mb-2">Apertura de caja</h2>
        {usuarioDB?.rol === "supervisor" && loteAbiertoGlobal ? (
          <div className="flex items-center gap-6 p-4 bg-green-50 border border-green-200 rounded-lg shadow-sm">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Box className="w-6 h-6 text-green-600" />
                <span className="text-green-700 font-semibold text-lg">
                  Caja abierta: 
                  <span className="font-bold">{(() => {
                    const cajaObj = cajas.find((c: Caja) => c.id === Number(loteAbiertoGlobal.fk_id_caja));
                    return cajaObj?.descripcion || loteAbiertoGlobal.fk_id_caja;
                  })()}</span>
                </span>
              </div>
              <span className="text-xs text-green-800">Abierta por: {usuarios.find(u => u.id === loteAbiertoGlobal.fk_id_usuario)?.nombre || "-"}</span>
            </div>
          </div>
        ) : cajaAbierta ? (
          <div className="flex items-center gap-6 p-4 bg-green-50 border border-green-200 rounded-lg shadow-sm">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Box className="w-6 h-6 text-green-600" />
                <span className="text-green-700 font-semibold text-lg">
                  Caja abierta: 
                  <span className="font-bold">
                    {(() => {
                      if (aperturaActual && aperturaActual.id_lote && cajaAbierta) {
                        const cajaObj = cajas.find((c: Caja) => c.id === Number(cajaAbierta));
                        return cajaObj?.descripcion || aperturaActual.caja || cajaAbierta;
                      }
                      return aperturaActual?.caja || cajaAbierta;
                    })()}
                  </span>
                </span>
              </div>
              {aperturaActual?.fk_id_usuario && (
                <span className="text-xs text-green-800">Abierta por: {usuarios.find(u => u.id === aperturaActual.fk_id_usuario)?.nombre || "-"}</span>
              )}
            </div>
            {/* Solo mostrar botón de cierre si el usuario es supervisor o el que abrió la caja */}
            {(usuarioDB?.rol === "supervisor" || aperturaActual?.fk_id_usuario === usuarioActual?.id) && (
              <button
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg shadow transition-all duration-150 active:scale-95"
                onClick={handleCerrarCaja}
                disabled={loadingCierre}
              >
                <CloseIcon className="w-4 h-4" />
                Cerrar caja
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleAbrirCaja} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block mb-1 font-medium">Caja</label>
              <select
                className="w-full border rounded px-2 py-1"
                value={cajaSeleccionada}
                onChange={e => setCajaSeleccionada(e.target.value)}
                required
              >
                <option value="">Seleccionar caja</option>
                {cajas.map((caja) => (
                  <option key={caja.id} value={caja.id}>{caja.descripcion}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 font-medium">Saldo inicial</label>
              <input
                type="number"
                className="w-full border rounded px-2 py-1"
                value={saldoInicial}
                onChange={e => setSaldoInicial(e.target.value)}
                required
                min={0}
                step="0.01"
              />
              {saldoInicial !== "" && (
                <div className="text-xs text-gray-500 mt-1">
                  {formatCurrency(Number(saldoInicial), DEFAULT_CURRENCY, DEFAULT_LOCALE)}
                </div>
              )}
            </div>
            {/* Usuario */}
            <div>
              <label className="block mb-1 font-medium">Usuario</label>
              <select
                className="w-full border rounded px-2 py-1"
                value={usuarioSeleccionado}
                onChange={e => setUsuarioSeleccionado(e.target.value)}
              >
                {usuarioDB?.rol === "cobrador"
                  ? usuarioActual && (
                      <option key={usuarioActual.id} value={usuarioActual.id.toString()}>{usuarioActual.nombre}</option>
                    )
                  : usuarios.map((usuario) => (
                      <option key={usuario.id} value={usuario.id.toString()}>{usuario.nombre}</option>
                    ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className={`bg-blue-600 text-white px-4 py-2 rounded ${pressClass}`}
              >
                Abrir caja
              </button>
            </div>
            <div className="md:col-span-3">
              <label className="block mb-1 font-medium">Observaciones</label>
              <textarea
                className="w-full border rounded px-2 py-1 min-h-[60px]"
                value={observacionesApertura}
                onChange={e => setObservacionesApertura(e.target.value)}
                placeholder="Observaciones de apertura (opcional)"
                maxLength={500}
              />
            </div>
            {aperturaError && <div className="col-span-3 text-red-600 text-sm">{aperturaError}</div>}
          </form>
        )}
        {/* Historial de aperturas/cierres */}
        {historial.length > 0 && (
          <div className="mt-8">
            <h3 className="text-md font-semibold mb-2">Historial de aperturas/cierres</h3>
            <table className="min-w-full text-sm border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-2 py-1">Caja</th>
                  <th className="px-2 py-1">Saldo inicial</th>
                  <th className="px-2 py-1">Fecha apertura</th>
                  <th className="px-2 py-1">Hora apertura</th>
                  <th className="px-2 py-1">Fecha cierre</th>
                  <th className="px-2 py-1">Hora cierre</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1">{h.caja}</td>
                    <td className="px-2 py-1">{h.saldoInicial}</td>
                    <td className="px-2 py-1">{h.fechaApertura}</td>
                    <td className="px-2 py-1">{h.horaApertura}</td>
                    <td className="px-2 py-1">{h.fechaCierre}</td>
                    <td className="px-2 py-1">{h.horaCierre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <LotesOperacionesContent key={refreshLotes} onImprimirCierre={imprimirCierreDeLote} />
      {showCierreModal && (
        <Dialog open={showCierreModal} onOpenChange={setShowCierreModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Resumen de movimientos del día</DialogTitle>
              <DialogDescription>
                A continuación se listan los ingresos y egresos por tipo de cuenta de tesorería.
              </DialogDescription>
            </DialogHeader>
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <div className="text-sm font-medium">Saldo inicial: {formatCurrency(parseFloat(aperturaActual?.saldoInicial || '0'), DEFAULT_CURRENCY, DEFAULT_LOCALE)}</div>
            </div>
            <table className="min-w-full text-sm border mb-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-2 py-1">Cuenta Tesorería</th>
                  <th className="px-2 py-1">Total Ingresos</th>
                  <th className="px-2 py-1">Total Egresos</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1">{r.cuenta}</td>
                    <td className="px-2 py-1">{formatCurrency(r.ingresos, DEFAULT_CURRENCY, DEFAULT_LOCALE)}</td>
                    <td className="px-2 py-1">{formatCurrency(r.egresos, DEFAULT_CURRENCY, DEFAULT_LOCALE)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mb-2 text-right font-semibold">
              Total ingresos (sin cuenta corriente): {formatCurrency(totalIngresosSinCuentaCorriente, DEFAULT_CURRENCY, DEFAULT_LOCALE)}
            </div>
            <div className="mb-4 text-xs text-gray-600">
              Nota: Los ingresos de &quot;CUENTA CORRIENTE&quot; son informativos y no se suman al total de ingresos de caja. Ese total se reparte en los otros medios de pago a medida que el cliente paga su deuda.
            </div>
            <div className="flex justify-end gap-2">
              <button className={`bg-gray-300 px-4 py-2 rounded ${pressClass}`} onClick={() => setShowCierreModal(false)}>Cancelar</button>
              <button className={`bg-blue-600 text-white px-4 py-2 rounded ${pressClass}`} onClick={confirmarCierreCaja}>Confirmar cierre</button>
              <button className={`bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 ${pressClass}`} onClick={generarPDFCierreCaja}>
                <FileText className="h-4 w-4" />
                Imprimir PDF
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {showTrialEnded && (
        <Dialog open={showTrialEnded} onOpenChange={setShowTrialEnded}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Prueba gratis finalizada</DialogTitle>
              <DialogDescription>
                La prueba gratis ha finalizado. Debe abonar para continuar usando el sistema.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end mt-4">
              <button className="px-4 py-2 bg-gray-200 rounded" onClick={() => setShowTrialEnded(false)}>Cerrar</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {toast.show && (
        <div className="fixed top-6 right-6 z-50 bg-green-600 text-white px-6 py-3 rounded shadow-lg animate-fade-in">
          {toast.message}
        </div>
      )}
      {/* Loader modal global */}
      {loading && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 flex flex-col items-center gap-4 shadow-lg">
            <span className="text-[#00adde] font-bold text-lg">{loadingMessage}</span>
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-[#00adde] border-solid"></div>
          </div>
        </div>
      )}
    </div>
  );
} 