import { SetMetadata } from '@nestjs/common';

/** Marca un endpoint come pubblico: il JWT guard globale lo salta. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
