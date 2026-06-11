import { pfetch } from '@/shared/api';
import type { ProductCatalogItem } from '../types';

export async function getProducts(): Promise<ProductCatalogItem[]> {
  return pfetch<ProductCatalogItem[]>('products');
}
