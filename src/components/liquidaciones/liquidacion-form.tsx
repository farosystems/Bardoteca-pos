"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { getEmpleados } from "@/services/empleados";
import { Empleado } from "@/types/empleado";
import { getGastosPorPeriodo } from "@/services/gastosEmpleados";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { formatCurrency } from "@/lib/utils";
import { createLiquidacion, checkExistingLiquidacion } from "@/services/liquidaciones";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getTiposGasto } from "@/services/tiposGasto";
import { createGastoEmpleado } from "@/services/gastosEmpleados";
import { getLoteAbierto } from "@/services/lotesOperaciones";
import { getCuentasTesoreria } from "@/services/cuentasTesoreria";
import { CuentaTesoreria } from "@/types/cuentaTesoreria";
import { CreateLiquidacionData } from "@/types/liquidacion";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LiquidacionForm({ onLiquidacionGuardada }: { onLiquidacionGuardada: () => void }) {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState<string>("");
  const [periodo, setPeriodo] = useState<{ desde: Date | null, hasta: Date | null }>({ desde: null, hasta: null });
  const [calculo, setCalculo] = useState<{ sueldoBase: number, adelantos: number, faltas: number, neto: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [liquidatedData, setLiquidatedData] = useState<{
    empleado: Empleado;
    desde: Date | string;
    hasta: Date | string;
    fecha_liquidacion: Date | string;
    sueldo_base: number;
    total_adelantos: number;
    total_faltas: number;
    neto_liquidado: number;
  } | null>(null);
  const [showConfirmGastoModal, setShowConfirmGastoModal] = useState(false);
  const [pendingLiquidacion, setPendingLiquidacion] = useState<{ liquidacion: CreateLiquidacionData, empleado: Empleado } | null>(null);
  const [sueldoTipoGastoId, setSueldoTipoGastoId] = useState<number | null>(null);
  const [cuentasTesoreria, setCuentasTesoreria] = useState<CuentaTesoreria[]>([]);
  const [loteAbierto, setLoteAbierto] = useState<number | null>(null);
  const [cuentaParaGasto, setCuentaParaGasto] = useState<number | null>(null);

  useEffect(() => {
    async function fetchEmpleados() {
      try {
        const data = await getEmpleados();
        setEmpleados(data);
      } catch (error) {
        console.error("Error al cargar empleados:", error);
      }
    }
    fetchEmpleados();
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
        const tiposGasto = await getTiposGasto();
        const sueldoTipo = tiposGasto.find(t => t.descripcion?.toLowerCase() === 'sueldo');
        if (sueldoTipo) {
            setSueldoTipoGastoId(sueldoTipo.id);
        }
        const ctas = await getCuentasTesoreria();
        setCuentasTesoreria(ctas);

        const lote = await getLoteAbierto();
        setLoteAbierto(lote);
    };
    fetchInitialData();
  }, []);

  const periodoFormateado = useMemo(() => {
    if (periodo.desde && periodo.hasta) {
      return `${format(periodo.desde, 'dd/MM/yyyy')} - ${format(periodo.hasta, 'dd/MM/yyyy')}`;
    }
    return "";
  }, [periodo]);

  useEffect(() => {
    if (empleadoSeleccionado) {
      const empleado = empleados.find(e => e.id === parseInt(empleadoSeleccionado));
      if (empleado) {
        const hoy = new Date();
        let desde: Date, hasta: Date;

        switch (empleado.tipo_liquidacion) {
          case 'semanal':
            desde = startOfWeek(hoy, { weekStartsOn: 1 });
            hasta = endOfWeek(hoy, { weekStartsOn: 1 });
            break;
          case 'quincenal':
            if (hoy.getDate() <= 15) {
              desde = startOfMonth(hoy);
              hasta = addDays(startOfMonth(hoy), 14);
            } else {
              desde = addDays(startOfMonth(hoy), 15);
              hasta = endOfMonth(hoy);
            }
            break;
          case 'mensual':
            desde = startOfMonth(hoy);
            hasta = endOfMonth(hoy);
            break;
          default:
            return;
        }
        setPeriodo({ desde, hasta });
        setCalculo(null);
      }
    } else {
      setPeriodo({ desde: null, hasta: null });
      setCalculo(null);
    }
  }, [empleadoSeleccionado, empleados]);

  const handleCalcular = async () => {
    if (!empleadoSeleccionado || !periodo.desde || !periodo.hasta) return;
    
    setLoading(true);
    setError(null);
    setCalculo(null);

    try {
      const empleado = empleados.find(e => e.id === parseInt(empleadoSeleccionado));
      if (!empleado) throw new Error("Empleado no encontrado");

      // 2. Traer movimientos
      const { adelantos, faltas } = await getGastosPorPeriodo(
        empleado.id,
        format(periodo.desde, 'yyyy-MM-dd'),
        format(periodo.hasta, 'yyyy-MM-dd')
      );
      
      // 3. Calcular sueldo proporcional
      let sueldoBase = 0;
      const sueldoEmpleado = empleado.sueldo ?? 0;
      switch (empleado.tipo_liquidacion) {
        case 'mensual':
          sueldoBase = sueldoEmpleado;
          break;
        case 'quincenal':
          sueldoBase = sueldoEmpleado / 2;
          break;
        case 'semanal':
          sueldoBase = sueldoEmpleado / 4;
          break;
      }

      // 4. Calcular neto
      const neto = sueldoBase - adelantos - faltas;

      setCalculo({ sueldoBase, adelantos, faltas, neto: Math.max(0, neto) });

    } catch (err) {
      setError("Error al calcular la liquidación.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLiquidar = async () => {
    if (!empleadoSeleccionado || !periodo.desde || !periodo.hasta || !calculo) return;
    
    setLoading(true);
    setError(null);

    try {
      const empleado = empleados.find(e => e.id === parseInt(empleadoSeleccionado));
      if (!empleado) throw new Error("Empleado no encontrado");

      // Validar si ya existe una liquidación para este período
      const desdeStr = format(periodo.desde, "yyyy-MM-dd");
      const hastaStr = format(periodo.hasta, "yyyy-MM-dd");
      const yaExiste = await checkExistingLiquidacion(empleado.id, desdeStr, hastaStr);
      if (yaExiste) {
        setError("Ya existe una liquidación para este empleado en el período seleccionado.");
        setShowErrorModal(true);
        setLoading(false);
        return;
      }

      const liquidacionData = {
        fk_empleado: empleado.id,
        desde: desdeStr,
        hasta: hastaStr,
        sueldo_base: calculo.sueldoBase,
        total_adelantos: calculo.adelantos,
        total_faltas: calculo.faltas,
        neto_liquidado: calculo.neto,
      };

      setCuentaParaGasto(null); // Resetear la cuenta seleccionada cada vez que se abre el modal
      setPendingLiquidacion({ liquidacion: liquidacionData, empleado });
      setShowConfirmGastoModal(true);

    } catch (err) {
      setError("Error al guardar la liquidación.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmacionFinal = async (registrarGasto: boolean) => {
    setShowConfirmGastoModal(false);
    if (!pendingLiquidacion) return;

    setLoading(true);
    setError(null);
    try {
        const { liquidacion, empleado } = pendingLiquidacion;

        await createLiquidacion(liquidacion);

        if (registrarGasto) {
            if (!loteAbierto) {
                setError("No hay un lote de caja abierto. No se puede registrar el gasto.");
                setShowErrorModal(true);
                return;
            }
            if (!cuentaParaGasto) {
                setError("Por favor, selecciona una cuenta de tesorería para registrar el gasto.");
                setShowErrorModal(true);
                return;
            }
            await createGastoEmpleado({
                fk_empleado: liquidacion.fk_empleado,
                monto: liquidacion.neto_liquidado,
                fk_tipo_gasto: sueldoTipoGastoId!,
                descripcion: `Pago de sueldo liquidado del ${format(new Date(liquidacion.desde), 'dd/MM/yy')} al ${format(new Date(liquidacion.hasta), 'dd/MM/yy')}`,
                fk_lote_operaciones: loteAbierto,
                fk_cuenta_tesoreria: cuentaParaGasto,
                fk_usuario: 1,
            });
        }
        
        setLiquidatedData({ ...liquidacion, empleado, fecha_liquidacion: new Date() });
        setShowSuccessModal(true);
        onLiquidacionGuardada(); // Para refrescar la tabla

    } catch (err) {
        setError("Error al procesar la liquidación.");
        console.error(err);
    } finally {
        setLoading(false);
        setPendingLiquidacion(null);
    }
  };
  
  const generarPDF = (data: {
    empleado: Empleado;
    desde: Date | string;
    hasta: Date | string;
    fecha_liquidacion: Date | string;
    sueldo_base: number;
    total_adelantos: number;
    total_faltas: number;
    neto_liquidado: number;
  }) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Recibo de Sueldo", 105, 20, { align: "center" });

    doc.setFontSize(12);
    doc.text(`Empleado: ${data.empleado.nombre}`, 20, 40);
    doc.text(`Período: ${format(new Date(data.desde), 'dd/MM/yyyy')} - ${format(new Date(data.hasta), 'dd/MM/yyyy')}`, 20, 50);
    doc.text(`Fecha de liquidación: ${format(new Date(data.fecha_liquidacion), 'dd/MM/yyyy')}`, 20, 60);

    autoTable(doc, {
      startY: 70,
      head: [['Concepto', 'Monto']],
      body: [
        ['Sueldo Base', formatCurrency(data.sueldo_base)],
        ['Adelantos (-)', formatCurrency(data.total_adelantos)],
        ['Faltas (-)', formatCurrency(data.total_faltas)],
      ],
      theme: 'striped',
      styles: { fontSize: 12 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      didDrawPage: (hookData) => {
        if (hookData.cursor) {
          // Total
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('Neto a Pagar:', 20, hookData.cursor.y + 10);
          doc.text(formatCurrency(data.neto_liquidado), 190, hookData.cursor.y + 10, { align: 'right' });
        }
      }
    });

    doc.save(`liquidacion_${data.empleado.nombre}_${format(new Date(data.desde), 'yyyyMMdd')}.pdf`);
  };

  return (
    <>
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Nueva Liquidación</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
          <div>
            <label className="block mb-1 font-medium">Empleado</label>
            <select 
              className="w-full border rounded px-2 py-1"
              value={empleadoSeleccionado}
              onChange={(e) => setEmpleadoSeleccionado(e.target.value)}
            >
              <option value="">Seleccionar empleado</option>
              {empleados.map((empleado) => (
                <option key={empleado.id} value={empleado.id}>
                  {empleado.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1 font-medium">Período</label>
            <input 
              type="text" 
              className="w-full border rounded px-2 py-1 bg-gray-100" 
              value={periodoFormateado}
              readOnly 
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleCalcular} disabled={loading || !empleadoSeleccionado}>
              {loading ? "Calculando..." : "Calcular"}
            </Button>
          </div>
        </div>

        {error && <div className="text-red-500 mt-4">{error}</div>}

        {calculo && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
            <h3 className="font-semibold text-md mb-3">Resumen del Cálculo</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Sueldo Base</p>
                <p className="font-bold text-lg text-green-600">{formatCurrency(calculo.sueldoBase)}</p>
              </div>
              <div>
                <p className="text-gray-500">Adelantos (-)</p>
                <p className="font-bold text-lg text-red-500">{formatCurrency(calculo.adelantos)}</p>
              </div>
              <div>
                <p className="text-gray-500">Faltas (-)</p>
                <p className="font-bold text-lg text-red-500">{formatCurrency(calculo.faltas)}</p>
              </div>
              <div>
                <p className="text-gray-500">Neto a Pagar</p>
                <p className="font-bold text-xl text-blue-600">{formatCurrency(calculo.neto)}</p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={handleLiquidar} disabled={loading}>
                Confirmar y Liquidar
              </Button>
            </div>
          </div>
        )}
      </div>

      {showErrorModal && (
        <Dialog open={showErrorModal} onOpenChange={setShowErrorModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Error de Liquidación</DialogTitle>
              <DialogDescription>
                {error}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setShowErrorModal(false)}>Cerrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showSuccessModal && liquidatedData && (
        <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Liquidación Exitosa</DialogTitle>
              <DialogDescription>
                La liquidación para {liquidatedData.empleado.nombre} ha sido registrada correctamente.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSuccessModal(false)}>Cerrar</Button>
              <Button onClick={() => generarPDF(liquidatedData)}>Descargar PDF</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de confirmación para registrar gasto */}
      <Dialog open={showConfirmGastoModal} onOpenChange={setShowConfirmGastoModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Liquidación</DialogTitle>
            <DialogDescription>
              ¿Deseas registrar el pago como un gasto? Si es así, selecciona la cuenta de tesorería.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 pt-2">
            <Label htmlFor="cuenta-gasto">Cuenta de Tesorería para el Gasto</Label>
            <Select onValueChange={(value) => setCuentaParaGasto(Number(value))}>
              <SelectTrigger id="cuenta-gasto">
                <SelectValue placeholder="Seleccionar cuenta..." />
              </SelectTrigger>
              <SelectContent>
                {cuentasTesoreria
                  .filter(ct => ct.descripcion.toLowerCase() !== 'cuenta corriente')
                  .map((ct) => (
                    <SelectItem key={ct.id} value={String(ct.id)}>
                      {ct.descripcion}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button variant="outline" onClick={() => handleConfirmacionFinal(false)} disabled={loading}>
              No, solo liquidar
            </Button>
            <Button onClick={() => handleConfirmacionFinal(true)} disabled={loading || !cuentaParaGasto || !loteAbierto}>
              {loading ? 'Procesando...' : 'Sí, liquidar y registrar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
} 