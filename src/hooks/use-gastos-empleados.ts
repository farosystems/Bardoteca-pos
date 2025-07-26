import { useEffect, useState, useCallback } from "react";
import { getGastosEmpleados, createGastoEmpleado } from "@/services/gastosEmpleados";
import { GastoEmpleado, CreateGastoEmpleadoData } from "@/types/gastoEmpleado";
import { registrarMovimientoCaja } from "@/services/detalleLotesOperaciones";
import { TipoGasto } from "@/types/tipoGasto";

export function useGastosEmpleados(tiposGasto: TipoGasto[]) {
  const [gastos, setGastos] = useState<GastoEmpleado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGastos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGastosEmpleados();
      setGastos(data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGastos();
  }, [fetchGastos]);

  const addGasto = async (data: CreateGastoEmpleadoData) => {
    setLoading(true);
    setError(null);
    try {
      const newGasto = await createGastoEmpleado(data);
      setGastos((prev) => [newGasto, ...prev]);
      // Registrar egreso en detalle_lotes_operaciones si corresponde
      const tipo = tiposGasto.find(t => t.id === data.fk_tipo_gasto);
      if (
        tipo &&
        tipo.descripcion &&
        ["adelanto", "sueldo", "otros"].includes(tipo.descripcion) &&
        data.fk_lote_operaciones &&
        data.fk_cuenta_tesoreria
      ) {
        await registrarMovimientoCaja({
          fk_id_lote: data.fk_lote_operaciones,
          fk_id_cuenta_tesoreria: data.fk_cuenta_tesoreria,
          tipo: "egreso",
          monto: data.monto,
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return { gastos, loading, error, fetchGastos, addGasto };
} 