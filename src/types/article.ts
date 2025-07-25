export interface Article {
  id: number;
  descripcion: string;
  precio_unitario: number;
  fk_id_agrupador: number;
  fk_id_marca: number | null;
  activo: boolean;
  stock: number;
  agrupador_nombre?: string;
  marca_nombre?: string;
}

export interface CreateArticleData {
  descripcion: string;
  precio_unitario: number;
  fk_id_agrupador: number;
  fk_id_marca: number | null;
  fk_id_talle: number | null;
  fk_id_color: number | null;
  activo: boolean;
  stock: number;
}

export interface UpdateArticleData {
  descripcion?: string;
  precio_unitario?: number;
  fk_id_agrupador?: number;
  fk_id_marca?: number | null;
  fk_id_talle?: number | null;
  fk_id_color?: number | null;
  activo?: boolean;
  stock?: number;
} 