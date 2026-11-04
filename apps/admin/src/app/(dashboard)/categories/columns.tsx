'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { AdminCategoryType } from '@repo/types'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import EditCategory from '@/components/EditCategory'
import DeleteCategory from '@/components/DeleteCategory'

export const columns: ColumnDef<AdminCategoryType>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Name
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <span className="px-4">{row.original.name}</span>,
  },
  {
    accessorKey: 'slug',
    header: 'Slug',
    cell: ({ row }) => <span className="font-mono">{row.original.slug}</span>,
  },
  {
    accessorKey: 'productCount',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Products
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="px-4">{row.original.productCount}</span>
    ),
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
      <div className="space-y-1">
        <div className="flex gap-2">
          <EditCategory category={row.original} />
          <DeleteCategory category={row.original} />
        </div>
        {row.original.productCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            Contains products. Move them before deleting.
          </p>
        ) : null}
      </div>
    ),
  },
]
