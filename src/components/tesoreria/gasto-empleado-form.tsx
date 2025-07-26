"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getEmpleados } from "@/services/empleados";
import { getCuentasTesoreria } from "@/services/cuentasTesoreria";
import { getUsuarios } from "@/services/usuarios";
import { getLoteAbierto } from "@/services/lotesOperaciones";
import { getTiposGasto } from "@/services/tiposGasto";
import { getTotalAdelantosEnPeriodo } from "@/services/gastosEmpleados";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { TipoGasto } from "@/types/tipoGasto";
import { Empleado } from "@/types/empleado";
import { CuentaTesoreria } from "@/types/cuentaTesoreria";
import { CreateGastoEmpleadoData } from "@/types/gastoEmpleado";
import { Usuario } from "@/types/usuario";
import { createDetalleLoteOperacion } from "@/services/detalleLotesOperaciones";
import { useUser } from "@clerk/nextjs";

function formatNumberWithCommas(value: string): string {
  if (!value) return "";
  const parts = value.replace(/[^\d.,]/g, "").split(",");
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimalPart = parts[1] ? "," + parts[1] : "";
  return integerPart + decimalPart;
}

interface GastoEmpleadoFormProps {
  onSubmit: (data: CreateGastoEmpleadoData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function GastoEmpleadoForm({ onSubmit, onCancel, isLoading = false }: GastoEmpleadoFormProps) {
  const { user } = useUser();
  const [form, setForm] = useState<any>({
    monto: 0,
    fk_lote_operaciones: null,
    fk_tipo_gasto: null,
    fk_empleado: null,
    fk_cuenta_tesoreria: null,
    fk_usuario: null,
    descripcion: "",
  });
  const [montoFormateado, setMontoFormateado] = useState("");
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [cuentasTesoreria, setCuentasTesoreria] = useState<CuentaTesoreria[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [tiposGasto, setTiposGasto] = useState<TipoGasto[]>([]);
  const [lote, setLote] = useState<number | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [errorModal, setErrorModal] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [topeRestante, setTopeRestante] = useState<number | null>(null);

  const selectedTipoGasto = tiposGasto.find(t => t.id === form.fk_tipo_gasto);
  const isEmpleadoRequired = selectedTipoGasto?.obliga_empleado ?? false;

  useEffect(() => {
    async function fetchData() {
      try {
        setLoadingData(true);
        const [emps, ctas, loteId, tipos] = await Promise.all([
          getEmpleados(),
          getCuentasTesoreria(),
          getLoteAbierto(),
          getTiposGasto(),
        ]);
        setEmpleados(emps);
        setCuentasTesoreria(ctas);
        setLote(loteId);
        setTiposGasto(tipos);
        setForm((prev: typeof form) => ({ ...prev, fk_lote_operaciones: loteId }));
      } finally {
        setLoadingData(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    getCuentasTesoreria().then(setCuentasTesoreria);
    getUsuarios().then(setUsuarios);
  }, []);

  // Calcula el tope de adelanto restante
  useEffect(() => {
    const calcularTope = async () => {
      const adelantoTipo = tiposGasto.find(t => t.descripcion?.toLowerCase() === 'adelanto');
      if (
        form.fk_empleado &&
        adelantoTipo &&
        form.fk_tipo_gasto === adelantoTipo.id
      ) {
        const empleado = empleados.find(e => e.id === form.fk_empleado);
        if (empleado && empleado.sueldo && empleado.tope_adelanto) {
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
          }
          
          const adelantosPrevios = await getTotalAdelantosEnPeriodo(
            empleado.id,
            format(desde, "yyyy-MM-dd"),
            format(hasta, "yyyy-MM-dd"),
            adelantoTipo.id
          );
          
          const topeMaximo = empleado.sueldo * (empleado.tope_adelanto / 100);
          setTopeRestante(topeMaximo - adelantosPrevios);
        }
      } else {
        setTopeRestante(null);
      }
    };

    calcularTope();
  }, [form.fk_empleado, form.fk_tipo_gasto, empleados, tiposGasto]);

  // Filtrar usuarios para mostrar solo el logueado
  const usuarioLogueado = usuarios.find(u => u.email === user?.emailAddresses?.[0]?.emailAddress);

  // Formateo en tiempo real del campo monto
  const handleMontoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\./g, "").replace(/,/g, ".");
    const numeric = parseFloat(raw);
    setForm((prev: typeof form) => ({ ...prev, monto: isNaN(numeric) ? 0 : numeric }));
    setMontoFormateado(formatNumberWithCommas(e.target.value));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev: typeof form) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: keyof CreateGastoEmpleadoData, value: string) => {
    setForm((prev: typeof form) => ({ ...prev, [name]: value ? parseInt(value, 10) : undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (topeRestante !== null && form.monto && form.monto > topeRestante) {
      setErrorModal({ open: true, message: `El monto del adelanto no puede superar el tope restante de ${formatNumberWithCommas(topeRestante.toFixed(2))}` });
      return;
    }
    if (!form.fk_tipo_gasto) {
      setErrorModal({ open: true, message: "Debe seleccionar un tipo de gasto." });
      return;
    }
    if (isEmpleadoRequired && !form.fk_empleado) {
      setErrorModal({ open: true, message: "El campo empleado es obligatorio para este tipo de gasto." });
      return;
    }
    await onSubmit(form as CreateGastoEmpleadoData);
    // Si el tipo de gasto afecta caja y NO es adelanto, registrar egreso en detalle_lotes_operaciones
    const tipoGasto = tiposGasto.find((t: TipoGasto) => t.id === form.fk_tipo_gasto);
    if (tipoGasto && tipoGasto.afecta_caja && tipoGasto.descripcion?.toLowerCase() !== 'adelanto') {
      await createDetalleLoteOperacion({
        fk_id_lote: lote!,
        fk_id_cuenta_tesoreria: form.fk_cuenta_tesoreria,
        tipo: 'egreso',
        monto: form.monto,
      });
    }
  };

  useEffect(() => {
    // Sincroniza el formateo si monto cambia desde otro lado
    if (form.monto !== undefined && form.monto !== null) {
      setMontoFormateado(formatNumberWithCommas(String(form.monto)));
    }
  }, [form.monto]);

  if (loadingData) return <p>Cargando...</p>;

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block mb-1 font-medium">Lote abierto</label>
            <Input value={lote || "-"} readOnly className="bg-gray-100 cursor-not-allowed font-bold text-lg" />
          </div>
          <div>
            <label className="block mb-1 font-medium">Tipo de Gasto *</label>
            <Select onValueChange={(value) => handleSelectChange('fk_tipo_gasto', value)} value={String(form.fk_tipo_gasto || "")}> 
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un tipo" />
              </SelectTrigger>
              <SelectContent>
                {tiposGasto.map((t: TipoGasto) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.descripcion || "Sin descripción"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block mb-1 font-medium">Empleado {isEmpleadoRequired && "*"}</label>
            <Select onValueChange={(value) => handleSelectChange('fk_empleado', value)} value={String(form.fk_empleado || "")} disabled={!isEmpleadoRequired}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un empleado" />
              </SelectTrigger>
              <SelectContent>
                {empleados.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.nombre} {e.apellido}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block mb-1 font-medium">Monto *</label>
            <Input
              type="text"
              name="monto"
              value={montoFormateado}
              onChange={handleMontoChange}
              required
              inputMode="decimal"
              autoComplete="off"
              placeholder="$ 0,00"
            />
          </div>
        </div>

        <div>
          <label className="block mb-1 font-medium">Cuenta Tesorería *</label>
          <Select
            value={form.fk_cuenta_tesoreria ? String(form.fk_cuenta_tesoreria) : ""}
            onValueChange={(value) => {
               setForm((prev: typeof form) => ({ ...prev, fk_cuenta_tesoreria: Number(value) }));
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar cuenta" />
            </SelectTrigger>
            <SelectContent>
              {cuentasTesoreria
                .filter(ct => ct.descripcion.toLowerCase() !== 'cuenta corriente')
                .map((ct: CuentaTesoreria) => (
                  <SelectItem key={ct.id} value={String(ct.id)}>{ct.descripcion}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block mb-1 font-medium">Usuario *</label>
           <Select
               value={form.fk_usuario ? String(form.fk_usuario) : ""}
               onValueChange={(value) => {
                   setForm((prev: typeof form) => ({ ...prev, fk_usuario: Number(value) }));
               }}
           >
               <SelectTrigger className="w-full">
                   <SelectValue placeholder="Seleccionar usuario" />
               </SelectTrigger>
               <SelectContent>
                   {usuarioLogueado && (
                       <SelectItem key={usuarioLogueado.id} value={String(usuarioLogueado.id)}>{usuarioLogueado.nombre}</SelectItem>
                   )}
               </SelectContent>
           </Select>
        </div>

        <div>
          <label className="block mb-1 font-medium">Descripción</label>
          <Textarea
            name="descripcion"
            value={form.descripcion || ""}
            onChange={handleInputChange}
            className="min-h-[100px] md:min-h-[140px] text-base"
            placeholder="Detalle del gasto..."
          />
        </div>

        {topeRestante !== null && (
          <div className="text-sm text-blue-600 font-semibold mt-1">
            Tope de adelanto restante para este período: ${formatNumberWithCommas(topeRestante.toFixed(2))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Guardando..." : "Guardar Gasto"}
          </Button>
        </div>
      </form>
      
      <Dialog open={errorModal.open} onOpenChange={(open) => setErrorModal({ ...errorModal, open })}>
        <DialogContent preventOutsideClose>
          <DialogHeader>
            <DialogTitle>Error de Validación</DialogTitle>
            <DialogDescription>{errorModal.message}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setErrorModal({ open: false, message: "" })}>Aceptar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
} 