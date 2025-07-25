"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Article, CreateArticleData, UpdateArticleData } from "@/types/article";
import { useAgrupadores } from "@/hooks/use-agrupadores";
import { useMarcas } from "@/hooks/use-marcas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTrialCheck } from "@/hooks/use-trial-check";
import { createMovimientoStock } from "@/services/movimientosStock";

const articleSchema = z.object({
  descripcion: z.string().min(1, "La descripción es requerida"),
  precio_unitario: z.union([z.string(), z.number()]).transform(Number).refine(val => !isNaN(val) && val >= 0, { message: "El precio debe ser mayor o igual a 0" }),
  fk_id_agrupador: z.union([z.string(), z.number()]).transform(Number).refine(val => !isNaN(val) && val >= 1, { message: "El agrupador es requerido" }),
  fk_id_marca: z.union([z.string(), z.number()]).transform(val => val === "" ? null : Number(val)).nullable(),
  fk_id_talle: z.union([z.string(), z.number()]).transform(val => val === "" ? null : Number(val)).nullable(),
  fk_id_color: z.union([z.string(), z.number()]).transform(val => val === "" ? null : Number(val)).nullable(),
  activo: z.boolean(),
  stock: z.union([z.string(), z.number()]).transform(Number).refine(val => !isNaN(val) && val >= 0, { message: "El stock debe ser mayor o igual a 0" }),
});

// type ArticleFormValues = z.infer<typeof articleSchema>;

interface ArticleFormProps {
  article?: Article;
  onSave: (data: CreateArticleData | UpdateArticleData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ArticleForm({ article, onSave, onCancel, isLoading = false }: ArticleFormProps) {
  const { agrupadores } = useAgrupadores();
  const { marcas } = useMarcas();
  const form = useForm({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      descripcion: article?.descripcion || "",
      precio_unitario: article?.precio_unitario || 0,
      fk_id_agrupador: article?.fk_id_agrupador || 1,
      fk_id_marca: article?.fk_id_marca ?? null,
      fk_id_talle: article?.fk_id_talle ?? null,
      fk_id_color: article?.fk_id_color ?? null,
      activo: article?.activo ?? true,
      stock: article?.stock ?? 0,
    },
  });

  // Estado local para el campo temporal Stock nuevo (solo en edición)
  const [stockNuevo, setStockNuevo] = React.useState(0);
  // Estado local para el campo temporal Stock a descontar (solo en edición)
  const [stockDescontar, setStockDescontar] = React.useState(0);
  React.useEffect(() => {
    if (article) {
      setStockNuevo(0); // Resetear al abrir edición
      setStockDescontar(0);
    }
  }, [article]);

  // Cuando cambia stockNuevo, sumarlo al stock en el form (solo en edición)
  React.useEffect(() => {
    if (article) {
      const stockBase = article.stock ?? 0;
      form.setValue("stock", stockBase + Number(stockNuevo || 0) - Number(stockDescontar || 0));
    }
  }, [stockNuevo, stockDescontar, article]);

  const { checkTrial } = useTrialCheck();
  const [showTrialEnded, setShowTrialEnded] = React.useState(false);

  const handleSubmit = async (values: Record<string, unknown>) => {
    const expired = await checkTrial(() => setShowTrialEnded(true));
    if (expired) return;
    // Si es edición y stockNuevo distinto de 0, registrar movimiento de stock (entrada)
    if (article && stockNuevo !== 0) {
      await createMovimientoStock({
        fk_id_orden: null,
        fk_id_articulos: article.id,
        origen: "AJUSTE",
        tipo: stockNuevo > 0 ? "entrada" : "salida",
        cantidad: Number(stockNuevo),
      });
    }
    // Si es edición y stockDescontar distinto de 0, registrar movimiento de stock (salida)
    if (article && stockDescontar !== 0) {
      await createMovimientoStock({
        fk_id_orden: null,
        fk_id_articulos: article.id,
        origen: "AJUSTE",
        tipo: "salida",
        cantidad: -Math.abs(Number(stockDescontar)),
      });
    }
    onSave({
      ...values,
      precio_unitario: Number(values.precio_unitario),
      fk_id_agrupador: Number(values.fk_id_agrupador),
      stock: Number(values.stock),
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="descripcion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción</FormLabel>
                <FormControl>
                  <Input placeholder="Ingrese la descripción del artículo" {...field} />
                </FormControl>
                <FormDescription>Descripción detallada del artículo</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="precio_unitario"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Precio Unitario</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="0.00" {...field} />
                </FormControl>
                <FormDescription>Precio unitario del artículo</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fk_id_agrupador"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Agrupador</FormLabel>
                <FormControl>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={field.value}
                    onChange={e => field.onChange(Number(e.target.value))}
                  >
                    <option value="">Seleccione un agrupador</option>
                    {agrupadores.map((agrupador) => (
                      <option key={agrupador.id} value={agrupador.id}>{agrupador.nombre}</option>
                    ))}
                  </select>
                </FormControl>
                <FormDescription>Selecciona el agrupador del artículo</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fk_id_marca"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Marca</FormLabel>
                <FormControl>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={field.value ?? ""}
                    onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Sin marca</option>
                    {marcas.map((marca) => (
                      <option key={marca.id} value={marca.id}>{marca.descripcion}</option>
                    ))}
                  </select>
                </FormControl>
                <FormDescription>Selecciona la marca del artículo</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fk_id_talle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Talle</FormLabel>
                <FormControl>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={field.value ?? ""}
                    onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Sin talle</option>
                    {/* {talles.map((talle) => (
                      <option key={talle.id} value={talle.id}>{talle.descripcion}</option>
                    ))} */}
                  </select>
                </FormControl>
                <FormDescription>Selecciona el talle del artículo</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fk_id_color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <FormControl>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={field.value ?? ""}
                    onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Sin color</option>
                    {/* {colores.map((color) => (
                      <option key={color.id} value={color.id}>{color.descripcion}</option>
                    ))} */}
                  </select>
                </FormControl>
                <FormDescription>Selecciona el color del artículo</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="activo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Activo</FormLabel>
                <FormControl>
                  <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} />
                </FormControl>
                <FormDescription>¿El artículo está activo?</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="stock"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stock</FormLabel>
                <FormControl>
                  <Input type="number" min={0} step={1} placeholder="0" {...field} readOnly={!!article} />
                </FormControl>
                <FormDescription>{article ? "Stock actual del artículo (se actualizará si usas 'Stock nuevo')" : "Stock inicial del artículo"}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {article && (
            <>
              <div>
                <label className="block mb-1 font-medium">Stock nuevo</label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                  value={stockNuevo}
                  onChange={e => setStockNuevo(Number(e.target.value))}
                />
                <div className="text-xs text-muted-foreground mt-1">Al guardar, se sumará al stock actual.</div>
              </div>
              <div>
                <label className="block mb-1 font-medium">Stock a descontar</label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                  value={stockDescontar}
                  onChange={e => setStockDescontar(Number(e.target.value))}
                />
                <div className="text-xs text-muted-foreground mt-1">Al guardar, se restará del stock actual.</div>
              </div>
            </>
          )}
        </div>
        <div className="col-span-1 md:col-span-2 flex justify-end gap-2 mt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Guardando..." : article ? "Actualizar" : "Crear"}
          </Button>
        </div>
      </form>
      <Dialog open={showTrialEnded} onOpenChange={setShowTrialEnded}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prueba gratis finalizada</DialogTitle>
            <DialogDescription>
              La prueba gratis ha finalizado. Debe abonar para continuar usando el sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setShowTrialEnded(false)}>Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Form>
  );
} 