/** Изображение в формате ImageData (RGBA, 8 бит). Работает и в браузере, и в Node. */
export interface ImageLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** Точка профиля: r — радиус от оси, z — высота от дна. Всё в миллиметрах. */
export interface ProfilePoint {
  r: number;
  z: number;
}

/** Треугольная сетка. positions: x,y,z подряд; indices: по 3 индекса на треугольник. */
export interface Mesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
