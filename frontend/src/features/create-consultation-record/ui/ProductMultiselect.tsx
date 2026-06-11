import { useState } from 'react';
import { Box, Flex, Text, TextField } from '@radix-ui/themes';
import { MagnifyingGlassIcon } from '@radix-ui/react-icons';
import type { ProductCatalogItem } from '@/entities/product';
import type { ProductMultiselectProps } from '../types';
import { ToggleChip } from './ToggleChip';

export function ProductMultiselect({ products, selected, onToggle }: ProductMultiselectProps) {
  const [search, setSearch] = useState('');

  const grouped = products
    .filter(
      (p) =>
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase()),
    )
    .reduce<Record<string, ProductCatalogItem[]>>((acc, p) => {
      const key = p.category;
      return { ...acc, [key]: [...(acc[key] ?? []), p] };
    }, {});

  return (
    <Box>
      <TextField.Root
        placeholder="상품 검색…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        mb="3"
        aria-label="상품 검색"
      >
        <TextField.Slot>
          <MagnifyingGlassIcon />
        </TextField.Slot>
      </TextField.Root>
      <Flex direction="column" gap="3" className="max-h-[260px] overflow-y-auto">
        {Object.entries(grouped).map(([category, items]) => (
          <Box key={category}>
            <Text
              size="1"
              weight="bold"
              color="gray"
              className="mb-2 block uppercase tracking-[0.06em]"
            >
              {category}
            </Text>
            <Flex gap="2" wrap="wrap">
              {items.map((p) => {
                const checked = selected.has(p.id);
                return (
                  <ToggleChip key={p.id} checked={checked} onClick={() => onToggle(p.id)}>
                    <Text size="2" weight={checked ? 'medium' : 'regular'}>{p.name}</Text>
                  </ToggleChip>
                );
              })}
            </Flex>
          </Box>
        ))}
        {Object.keys(grouped).length === 0 && (
          <Text size="2" color="gray">검색 결과가 없습니다.</Text>
        )}
      </Flex>
    </Box>
  );
}
